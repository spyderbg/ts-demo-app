import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { createBC7DDS } from '../tests/fixtures/bc7-dds';
import packageInfo from '../package.json';

const target = process.argv[2] || (process.platform === 'win32' ? 'windows' : 'linux');
if (!['linux', 'windows'].includes(target)) throw new Error('Usage: tsx scripts/test-package.ts [linux|windows]');
if (target === 'linux' && process.platform !== 'linux') throw new Error('Test the Linux package on Linux.');
const useWine = target === 'windows' && process.platform === 'linux';
if (useWine) execFileSync('wine', ['--version'], { stdio: 'ignore' });
const root = await mkdtemp(path.join(tmpdir(), 'gda-package-'));
const socket = createServer();
await new Promise<void>(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = (socket.address() as { port: number }).port;
await new Promise<void>(resolve => socket.close(() => resolve()));
const binary = path.resolve(target === 'windows' ? 'dist/gda-sync.exe' : 'dist/gda-sync');
const localAppData = path.join(root, 'AppData', 'Local');
const xdgData = path.join(root, 'data');
let dataHome = target === 'windows' ? path.join(localAppData, 'GDA Sync') : path.join(xdgData, 'gda-sync');
const windowsPath = (file: string) => useWine ? `Z:${file.split('/').join('\\')}` : file;
const wineEnv = { WINEPREFIX: path.join(root, 'wine'), WINEARCH: 'win64', WINEDEBUG: '-all', WINEDLLOVERRIDES: 'mscoree,mshtml=' };
const env = {
  ...process.env, ...(useWine ? wineEnv : {}),
  PORT: String(port), GDA_SYNC_HOME: '', LOCALAPPDATA: windowsPath(localAppData), XDG_DATA_HOME: xdgData,
};
// Node on Windows cannot use the Unix socket handles backing child-process pipes in Wine.
const logPath = path.join(root, 'backend.log');
const log = openSync(logPath, 'w');
const child = spawn(useWine ? 'wine' : binary, useWine ? [binary, '--no-open'] : ['--no-open'], {
  env, stdio: ['ignore', log, log], windowsHide: true,
});
closeSync(log);
const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
  child.once('exit', (code, signal) => resolve({ code, signal })); child.once('error', reject);
});
const url = `http://127.0.0.1:${port}`;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline) {
    const health = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(500) }).then(r => r.json()).catch(() => null);
    if (health?.ready) { assert.equal(health.version, packageInfo.version); ready = true; break; }
    if (child.exitCode !== null) throw new Error(await readFile(logPath, 'utf8'));
    await delay(100);
  }
  assert.ok(ready, `Packaged app did not start:\n${await readFile(logPath, 'utf8')}`);
  const initial = await (await fetch(`${url}/api/library`)).json();
  assert.equal(initial.assets.length, 18); assert.equal(initial.warnings.length, 0);
  assert.equal(initial.assets.filter((a: { type: string; preview: boolean }) => a.type === 'model' && a.preview).length, 5);
  // Wine supplies its own LocalAppData inside the isolated C: drive.
  if (useWine) {
    const windowsHome = path.win32.resolve(initial.config.source, '..', '..');
    assert.match(windowsHome, /\\AppData\\Local\\GDA Sync$/i);
    dataHome = execFileSync('winepath', ['-u', windowsHome], { env: { ...process.env, ...wineEnv }, encoding: 'utf8' }).trim();
    assert.ok(dataHome.startsWith(root + path.sep), 'Wine data stays inside the test directory');
  }
  const saved = JSON.parse(await readFile(path.join(dataHome, 'workspace.json'), 'utf8'));
  assert.equal(saved.source, useWine ? initial.config.source : path.join(dataHome, 'demo', 'source'));
  const changed = initial.assets.find((a: { status: string }) => a.status === 'modified');
  const previous = await readFile(path.join(dataHome, 'demo', 'gda', changed.path));

  const input = createBC7DDS(136, 134);
  const relative = 'textures/forest/k_active_en.dds';
  await writeFile(path.join(dataHome, 'demo', 'source', relative), input);
  const library = await (await fetch(`${url}/api/library`)).json();
  const asset = library.assets.find((a: { name: string }) => a.name === 'k_active_en.dds');
  assert.ok(asset.preview); assert.equal(asset.dimensions.format, 'BC7_UNORM');
  const preview = await fetch(`${url}/api/assets/${asset.id}/preview`);
  assert.equal(preview.status, 200);
  const png = PNG.sync.read(Buffer.from(await preview.arrayBuffer()));
  assert.equal(png.width, 136); assert.equal(png.height, 134);
  assert.deepEqual([...png.data.subarray(0, 4)], [255, 0, 0, 255]);
  const model = library.assets.find((a: { type: string }) => a.type === 'model');
  assert.equal((await fetch(`${url}/api/assets/${model.id}/preview`)).status, 200);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url);
  await expect(page.locator('.asset-card')).toHaveCount(19);
  await expect.poll(async () => (await (await fetch(`${url}/api/health`)).json()).openPages).toBe(1);
  await page.getByRole('textbox', { name: 'Search assets' }).fill('k_active_en.dds');
  await page.getByRole('button', { name: 'Inspect k_active_en.dds', exact: true }).click();
  await expect.poll(() => page.locator('.inspector img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(136);

  const { token } = await (await fetch(`${url}/api/session`)).json();
  const response = await fetch(`${url}/api/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-gda-token': token },
    body: JSON.stringify({ ids: library.assets.filter((a: { status: string }) => a.status !== 'synced').map((a: { id: string }) => a.id) }),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.copied.length, 9); assert.equal(result.failures.length, 0);
  assert.ok(result.library.assets.every((a: { status: string }) => a.status === 'synced'));
  assert.deepEqual(await readFile(path.join(dataHome, 'demo', 'source', relative)), input);
  assert.deepEqual(await readFile(path.join(dataHome, 'demo', 'gda', relative)), input);
  const operation = (await readdir(path.join(dataHome, 'backups')))[0];
  assert.deepEqual(await readFile(path.join(dataHome, 'backups', operation, changed.path)), previous);
  assert.equal(JSON.parse(await readFile(path.join(dataHome, 'activity.json'), 'utf8'))[0].action, 'sync');

  await page.reload();
  await expect(page.locator('.asset-card')).toHaveCount(19);
  await delay(2_200);
  assert.equal((await (await fetch(`${url}/api/health`)).json()).openPages, 1);
  const start = Date.now();
  await page.close();
  const stopped = await Promise.race([exited, delay(5_000, undefined, { ref: false }).then(() => { throw new Error('Backend did not exit after page close'); })]);
  assert.equal(stopped.code, 0); assert.equal(stopped.signal, null);
  console.log(JSON.stringify({ target, runtime: useWine ? 'Wine' : 'native', version: packageInfo.version, assets: 19, synced: 9, modelPreviews: true, bc7Preview: true, savedSettings: true, backups: true, survivedRefresh: true, exitCode: stopped.code, shutdownAfterPageCloseMs: Date.now() - start }));
} finally {
  await browser?.close();
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  if (useWine) {
    const cleanup = spawnSync('wineserver', ['-k'], { env: { ...process.env, ...wineEnv }, stdio: 'ignore' });
    if (cleanup.error) throw cleanup.error;
    // Wine returns 1 when the isolated server has already exited.
    assert.ok(cleanup.status === 0 || cleanup.status === 1, 'Could not stop the isolated Wine server');
  }
  await exited.catch(() => {});
  await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
