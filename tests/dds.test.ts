import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { decodeDDS, readDDSInfo } from '../backend/dds';
import { createHash } from 'node:crypto';
import { decodeBC7Block } from '../backend/bc7';
import conformance from './fixtures/bc7-conformance.json';
import { createBC7DDS } from './fixtures/bc7-dds';
import { toDDS } from '../backend/demo';
function blockDDS(format: string) {
  const data = Buffer.alloc(format === 'DXT1' ? 136 : 144);
  data.write('DDS '); data.writeUInt32LE(124, 4); data.writeUInt32LE(4, 12); data.writeUInt32LE(4, 16);
  data.writeUInt32LE(32, 76); data.writeUInt32LE(4, 80); data.write(format, 84);
  const colorOffset = format === 'DXT1' ? 128 : 136;
  data.writeUInt16LE(0xf800, colorOffset); data.writeUInt16LE(0x07e0, colorOffset + 2);
  return data;
}
test('RGB DDS preserves RGBA channels and dimensions', () => {
  const png = new PNG({ width: 2, height: 1 }); png.data.set([12, 34, 56, 78, 200, 100, 50, 255]);
  const dds = toDDS(png); assert.deepEqual(readDDSInfo(dds), { width: 2, height: 1, mipmaps: 1, format: 'RGB32' });
  assert.deepEqual(PNG.sync.read(decodeDDS(dds)).data, png.data);
});
test('DXT1 color interpolation and transparent fourth color', () => {
  const dds = blockDDS('DXT1'); dds.writeUInt32LE(0xe4, 132);
  const pixels = PNG.sync.read(decodeDDS(dds)).data;
  assert.deepEqual([...pixels.subarray(0, 4)], [255, 0, 0, 255]);
  assert.deepEqual([...pixels.subarray(4, 8)], [0, 255, 0, 255]);
  assert.deepEqual([...pixels.subarray(8, 12)], [170, 85, 0, 255]);
  dds.writeUInt16LE(0, 128); dds.writeUInt16LE(0xffff, 130); dds.writeUInt32LE(3, 132);
  assert.equal(PNG.sync.read(decodeDDS(dds)).data[3], 0);
});
test('DXT3 explicit alpha and DXT5 interpolated alpha are decoded', () => {
  const dxt3 = blockDDS('DXT3'); dxt3.fill(0x88, 128, 136);
  assert.deepEqual([...PNG.sync.read(decodeDDS(dxt3)).data.subarray(0, 4)], [255, 0, 0, 136]);
  const dxt5 = blockDDS('DXT5'); dxt5[128] = 255; dxt5[129] = 0; dxt5[130] = 2;
  assert.equal(PNG.sync.read(decodeDDS(dxt5)).data[3], 218);
  dxt5[128] = 0; dxt5[129] = 255; dxt5[130] = 7;
  assert.equal(PNG.sync.read(decodeDDS(dxt5)).data[3], 255);
});
test('invalid, truncated, excessive and unsupported DDS fail with useful errors', () => {
  assert.throws(() => readDDSInfo(Buffer.alloc(10)), /Invalid DDS/);
  assert.throws(() => decodeDDS(blockDDS('DXT1').subarray(0, 132)), /Truncated/);
  const huge = blockDDS('DXT1'); huge.writeUInt32LE(65535, 12); huge.writeUInt32LE(65535, 16);
  assert.throws(() => readDDSInfo(huge), /16 MP/);
  assert.throws(() => decodeDDS(blockDDS('DX10')), /Truncated DDS DX10 header/);
  assert.throws(() => decodeDDS(createBC7DDS(4, 4, 95)), /Preview unavailable for DXGI 95/);
});

for (const vector of conformance.vectors) {
  test(`BC7 mode ${vector.mode} matches bcdec reference across partitions and channel rotations`, () => {
    const input = Buffer.from(vector.blocks, 'base64');
    const decoded = [];
    for (let offset = 0; offset < input.length; offset += 16) decoded.push(decodeBC7Block(input, offset));
    assert.equal(createHash('sha256').update(Buffer.concat(decoded)).digest('hex'), vector.rgbaSha256);
  });
}
test('DX10 BC7 previews use the extended-header offset, preserve color, and crop edge blocks', () => {
  for (const format of [98, 99]) {
    const data = createBC7DDS(136, 134, format);
    assert.deepEqual(readDDSInfo(data), { width: 136, height: 134, format: format === 98 ? 'BC7_UNORM' : 'BC7_UNORM_SRGB', mipmaps: 1 });
    const png = PNG.sync.read(decodeDDS(data));
    assert.equal(png.width, 136); assert.equal(png.height, 134);
    for (let pixel = 0; pixel < png.data.length; pixel += 4) assert.deepEqual([...png.data.subarray(pixel, pixel + 4)], [255, 0, 0, 255]);
  }
});
test('BC7 rejects truncated headers, truncated blocks and invalid 2D resource metadata', () => {
  const data = createBC7DDS();
  assert.throws(() => readDDSInfo(data.subarray(0, 147)), /Truncated DDS DX10 header/);
  assert.throws(() => decodeDDS(data.subarray(0, data.length - 1)), /Truncated DDS pixel data/);
  assert.throws(() => decodeBC7Block(Buffer.alloc(15)), /Truncated BC7 block/);
  data.writeUInt32LE(4, 132);
  assert.throws(() => decodeDDS(data), /valid 2D DDS/);
  assert.deepEqual(decodeBC7Block(Buffer.alloc(16)), Buffer.alloc(64));
});
