/*!
 * BC7 decoder and partition tables adapted from bcdec by Sergii Kudlai.
 * https://github.com/iOrange/bcdec (MIT).
 *
 * Copyright (c) 2022 Sergii Kudlai
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to do
 * so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// Two-subset tables followed by three-subset tables. Bit 7 marks fix-up pixels.
const PARTITIONS: readonly (readonly number[])[] = [
  [128, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 129],
  [128, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 129],
  [128, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 129],
  [128, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 129],
  [128, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 129],
  [128, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 129],
  [128, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 129],
  [128, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 129],
  [128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 129],
  [128, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 129],
  [128, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 129],
  [128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 129],
  [128, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 129],
  [128, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 129],
  [128, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 129],
  [128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 129],
  [128, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 129],
  [128, 1, 129, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  [128, 0, 0, 0, 0, 0, 0, 0, 129, 0, 0, 0, 1, 1, 1, 0],
  [128, 1, 129, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0],
  [128, 0, 129, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  [128, 0, 0, 0, 1, 0, 0, 0, 129, 1, 0, 0, 1, 1, 1, 0],
  [128, 0, 0, 0, 0, 0, 0, 0, 129, 0, 0, 0, 1, 1, 0, 0],
  [128, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 129],
  [128, 0, 129, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
  [128, 0, 0, 0, 1, 0, 0, 0, 129, 0, 0, 0, 1, 1, 0, 0],
  [128, 1, 129, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0],
  [128, 0, 129, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0],
  [128, 0, 0, 1, 0, 1, 1, 1, 129, 1, 1, 0, 1, 0, 0, 0],
  [128, 0, 0, 0, 1, 1, 1, 1, 129, 1, 1, 1, 0, 0, 0, 0],
  [128, 1, 129, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0],
  [128, 0, 129, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0],
  [128, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 129],
  [128, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 129],
  [128, 1, 0, 1, 1, 0, 129, 0, 0, 1, 0, 1, 1, 0, 1, 0],
  [128, 0, 1, 1, 0, 0, 1, 1, 129, 1, 0, 0, 1, 1, 0, 0],
  [128, 0, 129, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0],
  [128, 1, 0, 1, 0, 1, 0, 1, 129, 0, 1, 0, 1, 0, 1, 0],
  [128, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 129],
  [128, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 129],
  [128, 1, 129, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 0],
  [128, 0, 0, 1, 0, 0, 1, 1, 129, 1, 0, 0, 1, 0, 0, 0],
  [128, 0, 129, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0],
  [128, 0, 129, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 0],
  [128, 1, 129, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0],
  [128, 0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 129],
  [128, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 129],
  [128, 0, 0, 0, 0, 1, 129, 0, 0, 1, 1, 0, 0, 0, 0, 0],
  [128, 1, 0, 0, 1, 1, 129, 0, 0, 1, 0, 0, 0, 0, 0, 0],
  [128, 0, 129, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0],
  [128, 0, 0, 0, 0, 0, 129, 0, 0, 1, 1, 1, 0, 0, 1, 0],
  [128, 0, 0, 0, 0, 1, 0, 0, 129, 1, 1, 0, 0, 1, 0, 0],
  [128, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 129],
  [128, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 129],
  [128, 1, 129, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0],
  [128, 0, 129, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 0],
  [128, 1, 1, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 129],
  [128, 1, 1, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0, 129],
  [128, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 129],
  [128, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 129],
  [128, 0, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 129],
  [128, 0, 129, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  [128, 0, 129, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0],
  [128, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 129],
  [128, 0, 1, 129, 0, 0, 1, 1, 0, 2, 2, 1, 2, 2, 2, 130],
  [128, 0, 0, 129, 0, 0, 1, 1, 130, 2, 1, 1, 2, 2, 2, 1],
  [128, 0, 0, 0, 2, 0, 0, 1, 130, 2, 1, 1, 2, 2, 1, 129],
  [128, 2, 2, 130, 0, 0, 2, 2, 0, 0, 1, 1, 0, 1, 1, 129],
  [128, 0, 0, 0, 0, 0, 0, 0, 129, 1, 2, 2, 1, 1, 2, 130],
  [128, 0, 1, 129, 0, 0, 1, 1, 0, 0, 2, 2, 0, 0, 2, 130],
  [128, 0, 2, 130, 0, 0, 2, 2, 1, 1, 1, 1, 1, 1, 1, 129],
  [128, 0, 1, 1, 0, 0, 1, 1, 130, 2, 1, 1, 2, 2, 1, 129],
  [128, 0, 0, 0, 0, 0, 0, 0, 129, 1, 1, 1, 2, 2, 2, 130],
  [128, 0, 0, 0, 1, 1, 1, 1, 129, 1, 1, 1, 2, 2, 2, 130],
  [128, 0, 0, 0, 1, 1, 129, 1, 2, 2, 2, 2, 2, 2, 2, 130],
  [128, 0, 1, 2, 0, 0, 129, 2, 0, 0, 1, 2, 0, 0, 1, 130],
  [128, 1, 1, 2, 0, 1, 129, 2, 0, 1, 1, 2, 0, 1, 1, 130],
  [128, 1, 2, 2, 0, 129, 2, 2, 0, 1, 2, 2, 0, 1, 2, 130],
  [128, 0, 1, 129, 0, 1, 1, 2, 1, 1, 2, 2, 1, 2, 2, 130],
  [128, 0, 1, 129, 2, 0, 0, 1, 130, 2, 0, 0, 2, 2, 2, 0],
  [128, 0, 0, 129, 0, 0, 1, 1, 0, 1, 1, 2, 1, 1, 2, 130],
  [128, 1, 1, 129, 0, 0, 1, 1, 130, 0, 0, 1, 2, 2, 0, 0],
  [128, 0, 0, 0, 1, 1, 2, 2, 129, 1, 2, 2, 1, 1, 2, 130],
  [128, 0, 2, 130, 0, 0, 2, 2, 0, 0, 2, 2, 1, 1, 1, 129],
  [128, 1, 1, 129, 0, 1, 1, 1, 0, 2, 2, 2, 0, 2, 2, 130],
  [128, 0, 0, 129, 0, 0, 0, 1, 130, 2, 2, 1, 2, 2, 2, 1],
  [128, 0, 0, 0, 0, 0, 129, 1, 0, 1, 2, 2, 0, 1, 2, 130],
  [128, 0, 0, 0, 1, 1, 0, 0, 130, 2, 129, 0, 2, 2, 1, 0],
  [128, 1, 2, 130, 0, 129, 2, 2, 0, 0, 1, 1, 0, 0, 0, 0],
  [128, 0, 1, 2, 0, 0, 1, 2, 129, 1, 2, 2, 2, 2, 2, 130],
  [128, 1, 1, 0, 1, 2, 130, 1, 129, 2, 2, 1, 0, 1, 1, 0],
  [128, 0, 0, 0, 0, 1, 129, 0, 1, 2, 130, 1, 1, 2, 2, 1],
  [128, 0, 2, 2, 1, 1, 0, 2, 129, 1, 0, 2, 0, 0, 2, 130],
  [128, 1, 1, 0, 0, 129, 1, 0, 2, 0, 0, 2, 2, 2, 2, 130],
  [128, 0, 1, 1, 0, 1, 2, 2, 0, 1, 130, 2, 0, 0, 1, 129],
  [128, 0, 0, 0, 2, 0, 0, 0, 130, 2, 1, 1, 2, 2, 2, 129],
  [128, 0, 0, 0, 0, 0, 0, 2, 129, 1, 2, 2, 1, 2, 2, 130],
  [128, 2, 2, 130, 0, 0, 2, 2, 0, 0, 1, 2, 0, 0, 1, 129],
  [128, 0, 1, 129, 0, 0, 1, 2, 0, 0, 2, 2, 0, 2, 2, 130],
  [128, 1, 2, 0, 0, 129, 2, 0, 0, 1, 130, 0, 0, 1, 2, 0],
  [128, 0, 0, 0, 1, 1, 129, 1, 2, 2, 130, 2, 0, 0, 0, 0],
  [128, 1, 2, 0, 1, 2, 0, 1, 130, 0, 129, 2, 0, 1, 2, 0],
  [128, 1, 2, 0, 2, 0, 1, 2, 129, 130, 0, 1, 0, 1, 2, 0],
  [128, 0, 1, 1, 2, 2, 0, 0, 1, 1, 130, 2, 0, 0, 1, 129],
  [128, 0, 1, 1, 1, 1, 130, 2, 2, 2, 0, 0, 0, 0, 1, 129],
  [128, 1, 0, 129, 0, 1, 0, 1, 2, 2, 2, 2, 2, 2, 2, 130],
  [128, 0, 0, 0, 0, 0, 0, 0, 130, 1, 2, 1, 2, 1, 2, 129],
  [128, 0, 2, 2, 1, 129, 2, 2, 0, 0, 2, 2, 1, 1, 2, 130],
  [128, 0, 2, 130, 0, 0, 1, 1, 0, 0, 2, 2, 0, 0, 1, 129],
  [128, 2, 2, 0, 1, 2, 130, 1, 0, 2, 2, 0, 1, 2, 2, 129],
  [128, 1, 0, 1, 2, 2, 130, 2, 2, 2, 2, 2, 0, 1, 0, 129],
  [128, 0, 0, 0, 2, 1, 2, 1, 130, 1, 2, 1, 2, 1, 2, 129],
  [128, 1, 0, 129, 0, 1, 0, 1, 0, 1, 0, 1, 2, 2, 2, 130],
  [128, 2, 2, 130, 0, 1, 1, 1, 0, 2, 2, 2, 0, 1, 1, 129],
  [128, 0, 0, 2, 1, 129, 1, 2, 0, 0, 0, 2, 1, 1, 1, 130],
  [128, 0, 0, 0, 2, 129, 1, 2, 2, 1, 1, 2, 2, 1, 1, 130],
  [128, 2, 2, 2, 0, 129, 1, 1, 0, 1, 1, 1, 0, 2, 2, 130],
  [128, 0, 0, 2, 1, 1, 1, 2, 129, 1, 1, 2, 0, 0, 0, 130],
  [128, 1, 1, 0, 0, 129, 1, 0, 0, 1, 1, 0, 2, 2, 2, 130],
  [128, 0, 0, 0, 0, 0, 0, 0, 2, 1, 129, 2, 2, 1, 1, 130],
  [128, 1, 1, 0, 0, 129, 1, 0, 2, 2, 2, 2, 2, 2, 2, 130],
  [128, 0, 2, 2, 0, 0, 1, 1, 0, 0, 129, 1, 0, 0, 2, 130],
  [128, 0, 2, 2, 1, 1, 2, 2, 129, 1, 2, 2, 0, 0, 2, 130],
  [128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 129, 1, 130],
  [128, 0, 0, 130, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 129],
  [128, 2, 2, 2, 1, 2, 2, 2, 0, 2, 2, 2, 129, 2, 2, 130],
  [128, 1, 0, 129, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 130],
  [128, 1, 1, 129, 2, 0, 1, 1, 130, 2, 0, 1, 2, 2, 2, 0],
];

const COLOR_BITS = [4, 6, 5, 7, 5, 7, 7, 5];
const ALPHA_BITS = [0, 0, 0, 0, 6, 8, 7, 5];
const HAS_P_BITS = 0b11001011;
const WEIGHTS: Record<number, readonly number[]> = {
  2: [0, 21, 43, 64],
  3: [0, 9, 18, 27, 37, 46, 55, 64],
  4: [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64],
};

/** Decode one 128-bit BC7 block into 16 row-major RGBA pixels. All eight modes. */
export function decodeBC7Block(data: Buffer, offset = 0): Buffer {
  if (offset < 0 || offset + 16 > data.length) throw new Error('Truncated BC7 block');
  const pixels = Buffer.alloc(64);
  let cursor = 0;
  const read = (count: number): number => {
    if (cursor + count > 128) throw new Error('Invalid BC7 block');
    let value = 0, written = 0;
    while (written < count) {
      const shift = cursor & 7;
      const length = Math.min(count - written, 8 - shift);
      value |= ((data[offset + (cursor >> 3)] >> shift) & ((1 << length) - 1)) << written;
      cursor += length; written += length;
    }
    return value;
  };
  let mode = 0;
  while (mode < 8 && read(1) === 0) mode++;
  // Reserved mode must decode to transparent black, as specified by Direct3D.
  if (mode === 8) return pixels;

  const subsets = mode === 0 || mode === 2 ? 3 : [1, 3, 7].includes(mode) ? 2 : 1;
  const partition = subsets > 1 ? read(mode === 0 ? 4 : 6) : 0;
  const rotation = mode === 4 || mode === 5 ? read(2) : 0;
  const indexSelection = mode === 4 ? read(1) : 0;
  const endpoints = Array.from({ length: subsets * 2 }, () => [0, 0, 0, 0]);
  for (let channel = 0; channel < 3; channel++) {
    for (const endpoint of endpoints) endpoint[channel] = read(COLOR_BITS[mode]);
  }
  if (ALPHA_BITS[mode]) for (const endpoint of endpoints) endpoint[3] = read(ALPHA_BITS[mode]);

  const pBits = (HAS_P_BITS >> mode) & 1;
  if (pBits) {
    for (const endpoint of endpoints) for (let channel = 0; channel < 4; channel++) endpoint[channel] <<= 1;
    if (mode === 1) {
      // Mode 1 shares one P-bit between both endpoints of each subset.
      for (let subset = 0; subset < subsets; subset++) {
        const bit = read(1);
        for (let end = 0; end < 2; end++) for (let channel = 0; channel < 3; channel++) endpoints[subset * 2 + end][channel] |= bit;
      }
    } else {
      for (const endpoint of endpoints) {
        const bit = read(1);
        for (let channel = 0; channel < 4; channel++) endpoint[channel] |= bit;
      }
    }
  }
  for (const endpoint of endpoints) {
    for (let channel = 0; channel < 4; channel++) {
      if (channel === 3 && !ALPHA_BITS[mode]) { endpoint[channel] = 255; continue; }
      const precision = (channel === 3 ? ALPHA_BITS[mode] : COLOR_BITS[mode]) + pBits;
      const expanded = endpoint[channel] << (8 - precision);
      endpoint[channel] = expanded | (expanded >> precision);
    }
  }

  const indexBits = mode === 0 || mode === 1 ? 3 : mode === 6 ? 4 : 2;
  const secondaryBits = mode === 4 ? 3 : mode === 5 ? 2 : 0;
  const partitionPixel = (pixel: number) => subsets === 1 ? (pixel === 0 ? 128 : 0) : PARTITIONS[(subsets - 2) * 64 + partition][pixel];
  const indices = Array.from({ length: 16 }, (_, pixel) => read(indexBits - (partitionPixel(pixel) & 128 ? 1 : 0)));
  const interpolate = (start: number, end: number, index: number, bits: number) => {
    const weight = WEIGHTS[bits][index];
    return ((64 - weight) * start + weight * end + 32) >> 6;
  };
  for (let pixel = 0; pixel < 16; pixel++) {
    const subset = partitionPixel(pixel) & 3;
    const start = endpoints[subset * 2], end = endpoints[subset * 2 + 1];
    const secondary = secondaryBits ? read(secondaryBits - (pixel === 0 ? 1 : 0)) : indices[pixel];
    for (let channel = 0; channel < 4; channel++) {
      const useSecondary = secondaryBits > 0 && (channel === 3 ? !indexSelection : !!indexSelection);
      pixels[pixel * 4 + channel] = interpolate(start[channel], end[channel], useSecondary ? secondary : indices[pixel], useSecondary ? secondaryBits : indexBits);
    }
    if (rotation) {
      const color = pixel * 4 + rotation - 1, alpha = pixel * 4 + 3;
      [pixels[color], pixels[alpha]] = [pixels[alpha], pixels[color]];
    }
  }
  return pixels;
}
