import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { applicationDataHome, desktopCommand } from '../backend/platform';
import { assetId } from '../backend/library';
import { packageTargets, stripWindowsSignature } from '../scripts/packaging';

test('Windows stores app data in LocalAppData and honors an explicit workspace override', () => {
  assert.equal(applicationDataHome('win32', { LOCALAPPDATA: 'C:\\Users\\Artist\\AppData\\Local', XDG_DATA_HOME: '/linux/data' }, 'C:\\Users\\Artist'), 'C:\\Users\\Artist\\AppData\\Local\\GDA Sync');
  assert.equal(applicationDataHome('win32', {}, 'C:\\Users\\Artist'), 'C:\\Users\\Artist\\AppData\\Local\\GDA Sync');
  assert.equal(applicationDataHome('win32', { GDA_SYNC_HOME: 'D:\\Studio Assets\\GDA', LOCALAPPDATA: 'C:\\unused' }), 'D:\\Studio Assets\\GDA');
  assert.equal(applicationDataHome('linux', {}, '/home/artist'), '/home/artist/.local/share/gda-sync');
  assert.equal(applicationDataHome('linux', { XDG_DATA_HOME: '/data/apps' }), '/data/apps/gda-sync');
});

test('Windows opening passes paths and URLs literally rather than inserting them in shell code', () => {
  for (const target of ['C:\\Studio & Game\\Artist\'s Assets', 'C:\\Assets\\$() ` % ! #', 'http://127.0.0.1:3456/?a=1&b=2']) {
    const command = desktopCommand(target, 'win32');
    assert.equal(command.command, 'powershell.exe');
    assert.equal(command.env.GDA_SYNC_OPEN_TARGET, target);
    assert.ok(command.args.includes('-NonInteractive'));
    assert.ok(command.args.every(arg => !arg.includes(target)));
  }
  assert.deepEqual(desktopCommand('/studio/assets', 'linux').args, ['/studio/assets']);
});

test('native folder separators produce the same asset ID as the portable demo preview filename', () => {
  const portable = 'models/props/wooden_crate.obj';
  assert.equal(assetId(path.join('models', 'props', 'wooden_crate.obj')), Buffer.from(portable).toString('base64url'));
});

test('packaging builds both targets on Linux and the Windows executable on Windows', () => {
  assert.deepEqual(packageTargets([], 'linux'), ['linux', 'windows']);
  assert.deepEqual(packageTargets([], 'win32'), ['windows']);
  assert.deepEqual(packageTargets(['--target', 'windows'], 'linux'), ['windows']);
  assert.deepEqual(packageTargets(['--target', 'linux'], 'linux'), ['linux']);
  assert.throws(() => packageTargets(['--target', 'unknown']), /Usage/);
  assert.throws(() => packageTargets(['--target', 'linux'], 'win32'), /on Linux/);
  assert.throws(() => packageTargets([], 'darwin'), /Linux or Windows/);
});

function signedPE(magic = 0x20b, trailer = false) {
  const binary = Buffer.alloc(trailer ? 580 : 576, 0x5a);
  binary.write('MZ'); binary.writeUInt32LE(64, 0x3c); binary.write('PE\0\0', 64);
  binary.writeUInt16LE(240, 84); binary.writeUInt16LE(magic, 88);
  const security = 88 + (magic === 0x20b ? 112 : 96) + 32;
  binary.writeUInt32LE(512, security); binary.writeUInt32LE(64, security + 4);
  return { binary, security };
}
test('PE signing metadata is removed without changing executable data or truncating unrelated trailing bytes', () => {
  for (const magic of [0x10b, 0x20b]) {
    const { binary, security } = signedPE(magic);
    const output = stripWindowsSignature(binary);
    assert.equal(output.length, 512);
    assert.equal(output.readBigUInt64LE(security), 0n);
    assert.deepEqual(output.subarray(security + 8), binary.subarray(security + 8, 512));
    assert.equal(binary.readUInt32LE(security), 512, 'The cached signed runtime stays intact');
  }
  const { binary, security } = signedPE(0x20b, true);
  const output = stripWindowsSignature(binary);
  assert.equal(output.length, binary.length);
  assert.deepEqual(output.subarray(security + 8), binary.subarray(security + 8));
});
test('malformed PE inputs are rejected before an executable can be published', () => {
  assert.throws(() => stripWindowsSignature(Buffer.alloc(1)), /PE executable/);
  const { binary, security } = signedPE();
  binary.writeUInt32LE(9999, security);
  assert.throws(() => stripWindowsSignature(binary), /certificate table/);
  binary.writeUInt32LE(binary.length, 0x3c);
  assert.throws(() => stripWindowsSignature(binary), /PE header/);
});
