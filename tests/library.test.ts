import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { PNG } from 'pngjs';
import { createBC7DDS } from './fixtures/bc7-dds';
import { Library, safePath } from '../backend/library';
import { createServer } from '../backend/server';

async function fixture(t: { after: (callback: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gda-unit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const library = new Library(path.join(root, 'app')); await library.init();
  return { root, library };
}
test('demo has real assets and identifies new, modified, and matching files', async t => {
  const { library } = await fixture(t); const data = await library.scan();
  assert.equal(data.assets.length, 18); assert.equal(data.warnings.length, 0);
  assert.equal(data.assets.filter(a => a.status === 'new').length, 5);
  assert.equal(data.assets.filter(a => a.status === 'modified').length, 3);
  assert.equal(data.assets.filter(a => a.status === 'synced').length, 10);
  const dds = data.assets.find(a => a.extension === 'dds')!;
  assert.equal(dds.dimensions?.width, 512);
  const preview = await library.preview(dds); assert.equal(preview.mime, 'image/png'); assert.equal(preview.data.toString('ascii', 1, 4), 'PNG');
});
test('sync copies originals, keeps folder structure, and backs up replaced GDA files', async t => {
  const { library } = await fixture(t); const data = await library.scan();
  const pending = data.assets.filter(a => a.status !== 'synced');
  const changed = pending.find(a => a.status === 'modified')!;
  const previous = await readFile(path.join(library.config.destination, changed.path));
  const original = await readFile(path.join(library.config.source, changed.path));
  const result = await library.sync(pending.map(a => a.id));
  assert.equal(result.failures.length, 0); assert.equal(result.copied.length, 8);
  assert.ok(result.library.assets.every(a => a.status === 'synced'));
  assert.deepEqual(await readFile(path.join(library.config.source, changed.path)), original);
  assert.deepEqual(await readFile(path.join(library.config.destination, changed.path)), original);
  const operation = (await readdir(path.join(library.home, 'backups')))[0];
  assert.deepEqual(await readFile(path.join(library.home, 'backups', operation, changed.path)), previous);
  assert.equal((await library.sync(pending.map(a => a.id))).copied.length, 0);
  const restored = new Library(library.home); await restored.init();
  assert.equal(restored.activity.filter(a => a.action === 'sync').length, 1);
});
test('equal-sized files with different contents are modified', async t => {
  const { library } = await fixture(t);
  await writeFile(path.join(library.config.source, 'equal.txt'), 'alpha');
  await writeFile(path.join(library.config.destination, 'equal.txt'), 'bravo');
  assert.equal((await library.scan()).assets.find(a => a.name === 'equal.txt')?.status, 'modified');
});
test('path traversal and symbolic links cannot escape source or destination', async t => {
  const { library, root } = await fixture(t);
  await assert.rejects(safePath(library.config.source, '../outside.txt'), /Invalid asset path/);
  await assert.rejects(safePath(library.config.source, root), /Invalid asset path/);
  await symlink(root, path.join(library.config.source, 'escape'));
  await assert.rejects(safePath(library.config.source, 'escape/secret'), /Symbolic links/);
  assert.ok((await library.scan()).warnings.some(w => w.includes('Skipped symbolic link')));
  await symlink(root, path.join(library.config.destination, 'linked-folder'));
  await assert.rejects(safePath(library.config.destination, 'linked-folder/surprise.txt', true), /Symbolic links/);
});
test('invalid workspace connections are rejected and valid connections persist', async t => {
  const { root, library } = await fixture(t);
  await assert.rejects(library.updateConfig({ name: 'Test', source: 'relative', destination: '/tmp' }), /absolute/);
  await assert.rejects(library.updateConfig({ name: 'Test', source: library.config.source, destination: library.config.source }), /separate/);
  const nested = path.join(library.config.source, 'nested'); await mkdir(nested);
  await assert.rejects(library.updateConfig({ name: 'Test', source: library.config.source, destination: nested }), /nesting/);
  await assert.rejects(library.updateConfig({ name: 'Test', source: '/does-not-exist', destination: root }), /must exist/);
  const source = path.join(root, 'real-source'), destination = path.join(root, 'real-gda');
  await mkdir(source); await mkdir(destination); await writeFile(path.join(source, 'asset.txt'), 'hello');
  const data = await library.updateConfig({ name: 'Real project', source, destination });
  assert.equal(data.assets.length, 1); assert.equal(data.config.demo, false);
  const again = new Library(library.home); await again.init(); assert.equal(again.config.name, 'Real project');
});
test('API validates payloads, rejects foreign requests and requires session token for writes', async t => {
  const { library } = await fixture(t); let opened = '';
  const app = createServer(library, { dev: true, opener: async p => { opened = p; } }); t.after(() => app.close());
  assert.equal((await app.inject({ method: 'GET', url: '/api/health' })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/api/library', headers: { host: 'attacker.example' } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'GET', url: '/api/session', headers: { 'sec-fetch-site': 'cross-site' } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/api/scan' })).statusCode, 403);
  const token = (await app.inject({ method: 'GET', url: '/api/session' })).json().token;
  const headers = { 'x-gda-token': token };
  assert.equal((await app.inject({ method: 'POST', url: '/api/sync', headers, payload: { ids: [] } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/api/open-folder', headers, payload: { folder: 'source' } })).statusCode, 200);
  assert.equal(opened, library.config.source);
  const data = (await app.inject({ method: 'POST', url: '/api/scan', headers })).json();
  assert.equal(data.assets.length, 18);
  const dds = data.assets.find((a: { extension: string }) => a.extension === 'dds');
  const preview = await app.inject({ method: 'GET', url: `/api/assets/${dds.id}/preview` });
  assert.equal(preview.statusCode, 200); assert.equal(preview.headers['content-type'], 'image/png');
  assert.equal((await app.inject({ method: 'GET', url: '/api/assets/missing/preview' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: '/api/sync', headers, payload: { ids: ['missing'] } })).statusCode, 400);
});

test('scanner reads the DX10 extension and the API serves BC7 previews without modifying the DDS', async t => {
  const { library } = await fixture(t);
  const input = createBC7DDS(136, 134);
  const file = path.join(library.config.source, 'textures/forest/k_active_en.dds');
  await writeFile(file, input);
  const app = createServer(library, { dev: true }); t.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/api/library' });
  const asset = response.json().assets.find((a: { name: string }) => a.name === 'k_active_en.dds');
  assert.ok(asset); assert.equal(asset.preview, true); assert.equal(asset.dimensions.format, 'BC7_UNORM');
  const preview = await app.inject({ method: 'GET', url: `/api/assets/${asset.id}/preview` });
  assert.equal(preview.statusCode, 200); assert.equal(preview.headers['content-type'], 'image/png');
  const png = PNG.sync.read(preview.rawPayload); assert.equal(png.width, 136); assert.equal(png.height, 134);
  assert.deepEqual([...png.data.subarray(0, 4)], [255, 0, 0, 255]);
  assert.deepEqual(await readFile(file), input);
});
