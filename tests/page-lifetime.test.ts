import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Library } from '../backend/library';
import { createServer } from '../backend/server';

async function waitFor(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 2_000;
  while (!await check()) {
    assert.ok(Date.now() < deadline, 'Expected lifecycle state within two seconds');
    await delay(10);
  }
}

async function fixture(t: TestContext, graceMs = 100) {
  const root = await mkdtemp(path.join(tmpdir(), 'gda-lifetime-'));
  const library = new Library(root); await library.init();
  let shutdowns = 0, closed = false;
  let closing: Promise<void> | undefined;
  const app = createServer(library, {
    dev: true, pageCloseGraceMs: graceMs,
    onShutdown: () => {
      shutdowns++;
      closing = app.close().then(() => { closed = true; });
    },
  });
  const url = await app.listen({ port: 0, host: '127.0.0.1' });
  const session = await fetch(`${url}/api/session`);
  const cookie = session.headers.get('set-cookie')!.split(';')[0];
  const { token, autoShutdownOnClose } = await session.json();
  assert.equal(autoShutdownOnClose, true);
  assert.match(session.headers.get('set-cookie')!, /HttpOnly; SameSite=Strict; Path=\/api\/lifecycle/);
  const controllers: AbortController[] = [];
  t.after(async () => {
    for (const controller of controllers) controller.abort();
    await app.close();
    await rm(root, { recursive: true, force: true });
  });
  const connect = async () => {
    const controller = new AbortController(); controllers.push(controller);
    const response = await fetch(`${url}/api/lifecycle`, { headers: { cookie }, signal: controller.signal });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type')!, /text\/event-stream/);
    const reader = response.body!.getReader();
    const first = await reader.read();
    assert.match(Buffer.from(first.value!).toString(), /event: connected/);
    return { close: () => controller.abort(), reader };
  };
  const pages = async () => (await (await fetch(`${url}/api/health`)).json()).openPages as number;
  return { app, library, url, token, cookie, connect, pages,
    get shutdowns() { return shutdowns; }, get closed() { return closed; }, get closing() { return closing; } };
}

test('lifecycle is authenticated and waits for the first page before scheduling shutdown', async t => {
  const f = await fixture(t);
  const requests: Record<string, string>[] = [{}, { cookie: 'gda-session=wrong' }, { cookie: f.cookie, 'sec-fetch-site': 'cross-site' }];
  for (const headers of requests) {
    const response = await fetch(`${f.url}/api/lifecycle`, { headers });
    assert.equal(response.status, 403);
    await response.json();
  }
  await delay(150);
  assert.equal(await f.pages(), 0);
  assert.equal(f.shutdowns, 0);
});

test('closing one page keeps the backend alive; closing the last page shuts it down once', async t => {
  const f = await fixture(t);
  const first = await f.connect(), second = await f.connect();
  assert.equal(await f.pages(), 2);
  first.close();
  await waitFor(async () => await f.pages() === 1);
  await delay(150);
  assert.equal(f.shutdowns, 0);
  second.close();
  await waitFor(() => f.closed);
  assert.equal(f.shutdowns, 1);
});

test('a page reconnecting during the refresh grace period cancels shutdown', async t => {
  const f = await fixture(t, 400);
  const first = await f.connect(); first.close();
  await waitFor(async () => await f.pages() === 0);
  const refreshed = await f.connect();
  await delay(450);
  assert.equal(f.shutdowns, 0);
  assert.equal(await f.pages(), 1);
  refreshed.close();
  await waitFor(() => f.closed);
  assert.equal(f.shutdowns, 1);
});

test('manual server shutdown finishes open event streams without hanging', async t => {
  const f = await fixture(t);
  const page = await f.connect();
  await f.app.close();
  assert.equal((await page.reader.read()).done, true);
  await delay(150);
  assert.equal(f.shutdowns, 0);
});

test('shutdown waits for an active file copy even when its browser request disconnects', async t => {
  const f = await fixture(t);
  const asset = (await f.library.scan()).assets.find(a => a.status === 'new')!;
  const original = await readFile(path.join(f.library.config.source, asset.path));
  const page = await f.connect();
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const scan = f.library.scan.bind(f.library);
  t.mock.method(f.library, 'scan', async () => { await blocked; return scan(); });
  const controller = new AbortController();
  const request = fetch(`${f.url}/api/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-gda-token': f.token },
    body: JSON.stringify({ ids: [asset.id] }), signal: controller.signal,
  }).catch(error => error);
  try {
    await waitFor(() => f.library.busy);
    controller.abort(); await request;
    page.close();
    await waitFor(() => f.shutdowns === 1);
    await delay(50);
    assert.equal(f.closed, false, 'An aborted request must not interrupt the copy');
  } finally { controller.abort(); release(); }
  await f.closing;
  assert.equal(f.closed, true);
  assert.deepEqual(await readFile(path.join(f.library.config.destination, asset.path)), original);
});
