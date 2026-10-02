/** Synthetic solid-red mode-5 BC7 DDS; no user assets are bundled into tests. */
export function createBC7DDS(width = 4, height = 4, dxgiFormat = 98): Buffer {
  const block = Buffer.alloc(16);
  let cursor = 0;
  const write = (value: number, count: number) => {
    for (let bit = 0; bit < count; bit++, cursor++) block[cursor >> 3] |= ((value >> bit) & 1) << (cursor & 7);
  };
  write(1 << 5, 6); write(0, 2); // Mode 5, no channel rotation.
  for (const channel of [127, 0, 0]) { write(channel, 7); write(channel, 7); }
  write(255, 8); write(255, 8); // Opaque alpha at both endpoints.
  // Both index planes are zero. Each first-pixel fix-up uses one fewer bit.
  for (let plane = 0; plane < 2; plane++) for (let pixel = 0; pixel < 16; pixel++) write(0, pixel === 0 ? 1 : 2);
  if (cursor !== 128) throw new Error('Invalid synthetic BC7 fixture');
  const header = Buffer.alloc(148);
  header.write('DDS '); header.writeUInt32LE(124, 4); header.writeUInt32LE(0x81007, 8);
  header.writeUInt32LE(height, 12); header.writeUInt32LE(width, 16);
  const count = Math.ceil(width / 4) * Math.ceil(height / 4);
  header.writeUInt32LE(count * 16, 20); header.writeUInt32LE(1, 28);
  header.writeUInt32LE(32, 76); header.writeUInt32LE(4, 80); header.write('DX10', 84);
  header.writeUInt32LE(0x1000, 108); header.writeUInt32LE(dxgiFormat, 128);
  header.writeUInt32LE(3, 132); header.writeUInt32LE(1, 140);
  return Buffer.concat([header, ...Array.from({ length: count }, () => block)]);
}
