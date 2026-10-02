import { PNG } from 'pngjs';
import { decodeBC7Block } from './bc7';

export interface DDSInfo { width: number; height: number; format: string; mipmaps: number }
const MAX_PIXELS = 16_777_216;
export const SUPPORTED_DDS_FORMATS = new Set(['DXT1', 'DXT3', 'DXT5', 'RGB24', 'RGB32', 'BC7_UNORM', 'BC7_UNORM_SRGB']);

export function readDDSInfo(data: Buffer): DDSInfo {
  if (data.length < 128 || data.toString('ascii', 0, 4) !== 'DDS ' || data.readUInt32LE(4) !== 124 || data.readUInt32LE(76) !== 32)
    throw new Error('Invalid DDS header');
  const height = data.readUInt32LE(12), width = data.readUInt32LE(16);
  if (!width || !height || width * height > MAX_PIXELS) throw new Error('DDS dimensions are invalid or exceed the 16 MP preview limit');
  const flags = data.readUInt32LE(80);
  let format = flags & 4 ? data.toString('ascii', 84, 88).replace(/\0/g, '') : `RGB${data.readUInt32LE(88)}`;
  if (format === 'DX10') {
    if (data.length < 148) throw new Error('Truncated DDS DX10 header');
    const dxgiFormat = data.readUInt32LE(128);
    format = dxgiFormat === 98 ? 'BC7_UNORM' : dxgiFormat === 99 ? 'BC7_UNORM_SRGB' : `DXGI ${dxgiFormat}`;
  }
  return { width, height, format, mipmaps: Math.max(1, data.readUInt32LE(28)) };
}

function rgb565(color: number): number[] {
  return [Math.round(((color >> 11) & 31) * 255 / 31), Math.round(((color >> 5) & 63) * 255 / 63), Math.round((color & 31) * 255 / 31), 255];
}

/** Decode the first surface/mip of DXT1 / DXT3 / DXT5, RGB, or DX10 BC7 DDS. */
export function decodeDDS(data: Buffer): Buffer {
  const { width, height, format } = readDDSInfo(data);
  const png = new PNG({ width, height });
  if (format === 'BC7_UNORM' || format === 'BC7_UNORM_SRGB') {
    if (data.readUInt32LE(132) !== 3 || data.readUInt32LE(140) === 0) throw new Error('BC7 previews require a valid 2D DDS texture');
    const blocksX = Math.ceil(width / 4), blocksY = Math.ceil(height / 4);
    if (data.length < 148 + blocksX * blocksY * 16) throw new Error('Truncated DDS pixel data');
    for (let by = 0; by < blocksY; by++) for (let bx = 0; bx < blocksX; bx++) {
      const block = decodeBC7Block(data, 148 + (by * blocksX + bx) * 16);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const px = bx * 4 + x, py = by * 4 + y;
        if (px >= width || py >= height) continue;
        const input = (y * 4 + x) * 4, output = (py * width + px) * 4;
        block.copy(png.data, output, input, input + 4);
      }
    }
  } else if (['DXT1', 'DXT3', 'DXT5'].includes(format)) {
    const blockSize = format === 'DXT1' ? 8 : 16;
    const blocksX = Math.ceil(width / 4), blocksY = Math.ceil(height / 4);
    if (data.length < 128 + blocksX * blocksY * blockSize) throw new Error('Truncated DDS pixel data');
    for (let by = 0; by < blocksY; by++) for (let bx = 0; bx < blocksX; bx++) {
      const base = 128 + (by * blocksX + bx) * blockSize;
      const colorsOffset = base + (format === 'DXT1' ? 0 : 8);
      const c0 = data.readUInt16LE(colorsOffset), c1 = data.readUInt16LE(colorsOffset + 2);
      const colors = [rgb565(c0), rgb565(c1)];
      const interpolate = (a: number, b: number, div: number) => [0, 1, 2].map(i => Math.round((colors[0][i] * a + colors[1][i] * b) / div)).concat(255);
      if (c0 > c1 || format !== 'DXT1') colors.push(interpolate(2, 1, 3), interpolate(1, 2, 3));
      else colors.push(interpolate(1, 1, 2), [0, 0, 0, 0]);
      const indices = data.readUInt32LE(colorsOffset + 4);
      const alphas: number[] = [];
      let alphaBits = 0n;
      if (format === 'DXT5') {
        alphas.push(data[base], data[base + 1]);
        if (alphas[0] > alphas[1]) for (let i = 1; i <= 6; i++) alphas.push(Math.floor(((7 - i) * alphas[0] + i * alphas[1]) / 7));
        else { for (let i = 1; i <= 4; i++) alphas.push(Math.floor(((5 - i) * alphas[0] + i * alphas[1]) / 5)); alphas.push(0, 255); }
        for (let i = 0; i < 6; i++) alphaBits |= BigInt(data[base + 2 + i]) << BigInt(i * 8);
      }
      for (let p = 0; p < 16; p++) {
        const x = bx * 4 + p % 4, y = by * 4 + Math.floor(p / 4);
        if (x >= width || y >= height) continue;
        const color = colors[(indices >>> (p * 2)) & 3];
        const out = (y * width + x) * 4;
        png.data[out] = color[0]; png.data[out + 1] = color[1]; png.data[out + 2] = color[2];
        png.data[out + 3] = format === 'DXT3' ? ((data[base + Math.floor(p / 2)] >> ((p % 2) * 4)) & 15) * 17
          : format === 'DXT5' ? alphas[Number((alphaBits >> BigInt(p * 3)) & 7n)] : color[3];
      }
    }
  } else if (format === 'RGB24' || format === 'RGB32') {
    const bpp = data.readUInt32LE(88) / 8;
    const masks = [92, 96, 100, 104].map(offset => data.readUInt32LE(offset));
    const pitch = data.readUInt32LE(8) & 8 ? data.readUInt32LE(20) : width * bpp;
    if (pitch < width * bpp || data.length < 128 + pitch * height) throw new Error('Truncated DDS pixel data');
    const channel = (pixel: number, mask: number, fallback: number) => {
      if (!mask) return fallback;
      let shift = 0; while (((mask >>> shift) & 1) === 0 && shift < 32) shift++;
      const max = mask >>> shift;
      return Math.round(((pixel & mask) >>> shift) * 255 / max);
    };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = 128 + y * pitch + x * bpp;
      const pixel = bpp === 4 ? data.readUInt32LE(offset) : data.readUIntLE(offset, 3);
      const out = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) png.data[out + c] = channel(pixel, masks[c], c === 3 ? 255 : 0);
    }
  } else throw new Error(`Preview unavailable for ${format}. DXT1, DXT3, DXT5, RGB and BC7 DDS are supported.`);
  return PNG.sync.write(png);
}
