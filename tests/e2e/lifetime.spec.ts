import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test as base, expect } from '@playwright/test';

type Backend = { url: string; child: ChildProcess; exited: Promise<number | null> };
const test = base.extend<{ backend: Backend; stopOnPageClose: boolean | 'default' }>({
  stopOnPageClose: [true, { option: true }],
  backend: async ({ stopOnPageClose }, use) => {
    const socket = createServer();
    await new Promise<void>(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = (socket.address() as { port: number }).port;
    await new Promise<void>(resolve => socket.close(() => resolve()));
    const home = await mkdtemp(path.join(tmpdir(), 'gda-lifetime-e2e-'));
    const args = ['build/server.cjs', '--no-open'];
    if (stopOnPageClose !== 'default') args.push(`--stop-on-page-close=${stopOnPageClose}`);
    const child = spawn(process.execPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(port), GDA_SYNC_HOME: home },
    });
    const exited = new Promise<number | null>(resolve => child.once('exit', resolve));
    let output = '';
    child.stdout!.on('data', data => { output += data; });
    child.stderr!.on('data', data => { output += data; });
    const url = `http://127.0.0.1:${port}`;
    try {
      await expect.poll(async () => {
        if (child.exitCode !== null) throw new Error(output);
        return fetch(`${url}/api/health`).then(r => r.ok).catch(() => false);
      }, { timeout: 10_000 }).toBe(true);
      await use({ url, child, exited });
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      await exited;
      await rm(home, { recursive: true, force: true });
    }
  },
});

async function pages(backend: Backend) {
  return (await (await fetch(`${backend.url}/api/health`)).json()).openPages as number;
}

for (const stopOnPageClose of ['default', false] as const) {
  test.describe(`page-close shutdown ${stopOnPageClose === 'default' ? 'build default' : 'disabled by launch parameter'}`, () => {
    test.use({ stopOnPageClose });
    test('closing the page keeps the backend running', async ({ page, backend }) => {
      await page.goto(backend.url);
      const session = await (await fetch(`${backend.url}/api/session`)).json();
      expect(session.autoShutdownOnClose).toBe(false);
      await page.close();
      await delay(2_200);
      expect(backend.child.exitCode).toBeNull();
      expect(await pages(backend)).toBe(0);
    });
  });
}

test('refresh and another open tab keep the backend alive; closing the last tab exits the process', async ({ page, context, backend }) => {
  // A --no-open launch waits for its first page rather than immediately quitting.
  await delay(2_200);
  expect(await pages(backend)).toBe(0);
  await page.goto(backend.url);
  await expect.poll(() => pages(backend)).toBe(1);
  await page.reload();
  await expect.poll(() => pages(backend)).toBe(1);
  await delay(2_200);
  expect(await pages(backend)).toBe(1);

  const other = await context.newPage();
  await other.goto(backend.url);
  await expect.poll(() => pages(backend)).toBe(2);
  await other.close();
  await expect.poll(() => pages(backend)).toBe(1);
  const unrelated = await context.newPage();
  await unrelated.goto('about:blank'); await unrelated.bringToFront();
  await delay(2_200);
  expect(await pages(backend)).toBe(1);
  await page.close();
  await expect.poll(() => backend.child.exitCode, { timeout: 5_000 }).toBe(0);
  expect(await backend.exited).toBe(0);
  await unrelated.close();
});

test('restoring a page reconnects, and navigating away from the last app page exits the process', async ({ page, backend }) => {
  await page.goto(backend.url);
  await expect.poll(() => pages(backend)).toBe(1);
  // Exercise the pagehide/pageshow lifecycle used when restoring a cached page.
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await expect.poll(() => pages(backend)).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect.poll(() => pages(backend)).toBe(1);
  await delay(2_200);
  expect(await pages(backend)).toBe(1);
  await page.goto('about:blank');
  await expect.poll(() => backend.child.exitCode, { timeout: 5_000 }).toBe(0);
  expect(await backend.exited).toBe(0);
});
