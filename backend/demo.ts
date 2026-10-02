import { mkdir, writeFile, copyFile, utimes } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import type { WorkspaceConfig } from './types';

// Deterministic, original demo artwork. No downloaded assets or remote services.
function noise(x: number, y: number, seed: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return v - Math.floor(v);
}
export function texture(kind: string, size = 512): PNG {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = x / size, ny = y / size;
    const n = noise(x, y, 4), broad = Math.sin(nx * 22 + Math.sin(ny * 15) * 3) * Math.cos(ny * 19 + nx * 4);
    let rgb: number[];
    if (kind === 'moss') {
      const v = broad * 30 + n * 36;
      rgb = [45 + v * .6, 61 + v, 31 + v * .35];
    } else if (kind === 'bark') {
      const stripe = Math.pow(Math.abs(Math.sin(nx * 110 + Math.sin(ny * 14) * 2 + n * .6)), 4);
      rgb = [72 + stripe * 53 + n * 25, 49 + stripe * 34 + n * 22, 31 + stripe * 22 + n * 15];
    } else if (kind === 'stone' || kind === 'concrete') {
      const v = (kind === 'stone' ? 93 : 137) + broad * 23 + n * 36;
      rgb = [v * 1.05, v, v * .89];
    } else if (kind === 'sand') {
      const v = Math.sin(ny * 55 + Math.sin(nx * 8) * 2) * 12 + n * 20;
      rgb = [191 + v, 168 + v, 122 + v];
    } else if (kind === 'leaf') {
      const stripe = Math.abs(Math.sin((nx + ny) * 65)) * 25;
      rgb = [34 + broad * 10 + n * 12, 79 + stripe + n * 17, 40 + broad * 6 + n * 9];
    } else if (kind === 'normal') {
      rgb = [128 + Math.sin(nx * 35 + ny * 11) * 50, 128 + Math.cos(ny * 40 + nx * 6) * 45, 230 + n * 25];
    } else {
      const v = broad * 22 + n * 25;
      rgb = [70 + v, 66 + v * .9, 49 + v * .7];
    }
    const i = (y * size + x) * 4;
    png.data[i] = rgb[0]; png.data[i + 1] = rgb[1]; png.data[i + 2] = rgb[2]; png.data[i + 3] = 255;
  }
  return png;
}
export function toDDS(png: PNG): Buffer {
  const header = Buffer.alloc(128);
  header.write('DDS '); header.writeUInt32LE(124, 4); header.writeUInt32LE(0x100f, 8);
  header.writeUInt32LE(png.height, 12); header.writeUInt32LE(png.width, 16); header.writeUInt32LE(png.width * 4, 20);
  header.writeUInt32LE(1, 28); header.writeUInt32LE(32, 76); header.writeUInt32LE(0x41, 80); header.writeUInt32LE(32, 88);
  header.writeUInt32LE(0xff, 92); header.writeUInt32LE(0xff00, 96); header.writeUInt32LE(0xff0000, 100); header.writeUInt32LE(0xff000000, 104);
  header.writeUInt32LE(0x1000, 108);
  return Buffer.concat([header, png.data]);
}
function modelArt(kind: string): string {
  const start = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360"><defs><radialGradient id="bg"><stop stop-color="#ebeee7"/><stop offset="1" stop-color="#d8ded4"/></radialGradient><filter id="blur"><feGaussianBlur stdDeviation="8"/></filter></defs><rect width="480" height="360" fill="url(#bg)"/><ellipse cx="240" cy="279" rx="115" ry="18" fill="#364635" opacity=".18" filter="url(#blur)"/>';
  let shape = '';
  if (kind === 'crate') {
    shape = '<path d="M139 119 239 66 347 119 244 174Z" fill="#b0a283"/><path d="M139 119 244 174 244 282 139 224Z" fill="#817357"/><path d="M244 174 347 119 347 225 244 282Z" fill="#625b49"/><g fill="none" stroke="#4c4537" stroke-width="3" opacity=".6"><path d="M160 131v104m27-89v104m28-89v103m48-101v105m28-119v104m27-117v104M143 149l100 54 100-54M142 199l102 54 99-54"/></g><path d="m144 124 99 53v20l-99-53Zm0 80 99 54v19l-99-54Z" fill="#b8a281"/><path d="m249 177 94-50v18l-94 50Zm0 82 94-51v18l-94 50Z" fill="#8e8064"/><path d="m156 153 71 78v26l-71-78Z" fill="#a79372"/>';
  } else if (kind === 'rock') {
    shape = '<path d="m125 212 24-84 79-42 73 15 62 70-13 77-122 34Z" fill="#777e71"/><path d="m149 128 79-42 30 95-60 32Z" fill="#aab09f"/><path d="m228 86 73 15 15 67-58 13Z" fill="#919988"/><path d="m301 101 62 70-47-3Z" fill="#808a79"/><path d="m125 212 24-84 49 85 30 69Z" fill="#89927f"/><path d="m198 213 60-32 58-13-18 77-70 37Z" fill="#737d6a"/><path d="m316 168 47 3-13 77-52-3Z" fill="#606c5a"/><path d="m149 128 49 85 30-127m-30 127 60-32 58-13m-88 114 70-37" stroke="#c3c9b5" stroke-width="1" opacity=".35" fill="none"/>';
  } else if (kind === 'fern') {
    shape = '<path d="M236 276q7-111-4-190m7 173q-31-97-85-118m86 122q31-94 90-115" fill="none" stroke="#50613d" stroke-width="4"/>';
    for (let i = 0; i < 9; i++) {
      const y = 109 + i * 16, w = 13 + i * 4;
      shape += `<path d="M235 ${y + 14}q-${w + 20}-${w + 3}-${w + 15}-${w + 17}q${w + 5}-1 ${w + 15} ${w + 17}m0 0q${w + 22}-${w + 10} ${w + 17}-${w + 22}q-${w + 10} 3-${w + 17} ${w + 22}" fill="${i % 2 ? '#627e47' : '#7d9659'}"/>`;
    }
    shape += '<path d="M236 276q-54-33-77-89 44 15 77 89m0 0q56-43 79-89-53 23-79 89" fill="#728a50"/>';
  } else {
    shape = '<path d="m161 247 25-110 122-19 22 106-71 55Z" fill="#a4ad97"/><path d="m161 247 98 32-21-104-52-38Z" fill="#88947c"/><path d="m186 137 52 38 70-57Z" fill="#c2c8b7"/><path d="m238 175 21 104 71-55-22-106Z" fill="#6b795f"/>';
  }
  return start + shape + '</svg>';
}
const entries = [
  ['textures/forest/moss_ground_albedo.png', 'moss', 'new'],
  ['textures/forest/moss_ground_normal.dds', 'normal', 'new'],
  ['models/props/wooden_crate.obj', 'crate', 'modified'],
  ['textures/forest/oak_bark_albedo.png', 'bark', 'synced'],
  ['models/rocks/forest_rock_01.obj', 'rock', 'synced'],
  ['textures/rocks/limestone_albedo.png', 'stone', 'new'],
  ['models/foliage/fern_cluster.obj', 'fern', 'synced'],
  ['textures/forest/fern_leaf_albedo.png', 'leaf', 'synced'],
  ['textures/terrain/river_sand_albedo.png', 'sand', 'modified'],
  ['textures/rocks/limestone_normal.dds', 'normal', 'synced'],
  ['materials/forest_floor.mat', 'moss', 'new'],
  ['models/rocks/forest_rock_02.obj', 'rock', 'synced'],
  ['textures/props/weathered_concrete.png', 'concrete', 'synced'],
  ['materials/oak_bark.mat', 'bark', 'synced'],
  ['textures/terrain/forest_soil_albedo.dds', 'soil', 'modified'],
  ['models/props/stone_marker.obj', 'marker', 'synced'],
  ['materials/river_sand.mat', 'sand', 'synced'],
  ['audio/forest_ambience.wav', 'audio', 'new'],
] as const;

export async function seedDemo(home: string): Promise<WorkspaceConfig> {
  const source = path.join(home, 'demo', 'source'), destination = path.join(home, 'demo', 'gda');
  await mkdir(path.join(source, '.previews'), { recursive: true }); await mkdir(destination, { recursive: true });
  for (const [relative, kind, status] of entries) {
    const file = path.join(source, relative);
    await mkdir(path.dirname(file), { recursive: true });
    let data: Buffer;
    if (relative.endsWith('.png')) data = PNG.sync.write(texture(kind));
    else if (relative.endsWith('.dds')) data = toDDS(texture(kind));
    else if (relative.endsWith('.obj')) {
      data = Buffer.from(`# GDA Sync demo ${kind}\no ${kind}\nv -1 0 -1\nv 1 0 -1\nv 1 0 1\nv -1 0 1\nv -1 2 -1\nv 1 2 -1\nv 1 2 1\nv -1 2 1\nf 1 2 3 4\nf 5 8 7 6\nf 1 5 6 2\nf 2 6 7 3\nf 3 7 8 4\nf 4 8 5 1\n`);
      await writeFile(path.join(source, '.previews', Buffer.from(relative).toString('base64url') + '.svg'), modelArt(kind));
    } else if (kind === 'audio') {
      const samples = 22050 * 3; data = Buffer.alloc(44 + samples * 2);
      data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
      data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(22050, 24); data.writeUInt32LE(44100, 28);
      data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(samples * 2, 40);
      for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round((noise(i, 0, 7) - .5) * 1300 * Math.sin(Math.PI * i / samples)), 44 + i * 2);
    } else data = Buffer.from(JSON.stringify({ name: path.basename(relative, '.mat'), shader: 'standard', roughness: .85, metallic: 0, texture: kind }, null, 2));
    await writeFile(file, data);
    const when = new Date(Date.now() - (entries.findIndex(e => e[0] === relative) + 1) * 3_600_000);
    await utimes(file, when, when);
    if (status !== 'new') {
      const target = path.join(destination, relative); await mkdir(path.dirname(target), { recursive: true });
      if (status === 'synced') await copyFile(file, target);
      else await writeFile(target, Buffer.from('Previous demo version\n'));
    }
  }
  return { name: 'Verdant', source, destination, demo: true };
}
