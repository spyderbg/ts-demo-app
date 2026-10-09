import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type PackageTarget = 'linux' | 'windows';
export function packageTargets(args: string[], platform = process.platform): PackageTarget[] {
  let targets: PackageTarget[];
  if (args.length === 0) targets = platform === 'linux' ? ['linux', 'windows'] : ['windows'];
  else if (args.length === 2 && args[0] === '--target' && ['linux', 'windows', 'all'].includes(args[1])) {
    targets = args[1] === 'all' ? ['linux', 'windows'] : [args[1] as PackageTarget];
  } else throw new Error('Usage: tsx scripts/package.ts [--target linux|windows|all]');
  if (!['linux', 'win32'].includes(platform)) throw new Error('Run packaging on Linux or Windows.');
  if (targets.includes('linux') && platform !== 'linux') throw new Error('Build the Linux executable on Linux. Use --target windows on Windows.');
  return targets;
}

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');
async function download(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Could not download ${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** A SEA blob and its target Node runtime must have the same Node version. */
export async function windowsRuntime() {
  if (process.platform === 'win32' && process.arch === 'x64') return process.execPath;
  const release = `https://nodejs.org/download/release/${process.version}`;
  const runtimeName = 'win-x64/node.exe';
  const cache = path.resolve('build', 'runtimes', process.version);
  const runtime = path.join(cache, runtimeName);
  await mkdir(path.dirname(runtime), { recursive: true });
  const sumsPath = path.join(cache, 'SHASUMS256.txt');
  const sums = await readFile(sumsPath).catch(() => download(`${release}/SHASUMS256.txt`));
  const expected = sums.toString().split('\n').map(line => line.trim().split(/\s+/)).find(([, name]) => name === runtimeName)?.[0];
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) throw new Error(`No official checksum for ${process.version} ${runtimeName}`);
  const cached = await readFile(runtime).catch(() => null);
  if (cached && sha256(cached) === expected) return runtime;
  console.log(`Downloading verified Windows x64 Node ${process.version} runtime…`);
  const data = await download(`${release}/${runtimeName}`);
  if (sha256(data) !== expected) throw new Error('Windows Node runtime checksum does not match the official release.');
  const temporary = `${runtime}.${process.pid}.tmp`;
  await writeFile(temporary, data);
  await rename(temporary, runtime);
  await writeFile(sumsPath, sums);
  return runtime;
}

/** Remove Node's Authenticode signature before changing its PE resources. */
export function stripWindowsSignature(input: Buffer): Buffer {
  if (input.length < 64 || input.toString('ascii', 0, 2) !== 'MZ') throw new Error('Expected a Windows PE executable');
  const pe = input.readUInt32LE(0x3c);
  if (pe + 24 > input.length || input.toString('ascii', pe, pe + 4) !== 'PE\0\0') throw new Error('Invalid Windows PE header');
  const optional = pe + 24;
  const optionalSize = input.readUInt16LE(pe + 20);
  if (optional + optionalSize > input.length || optionalSize < 2) throw new Error('Invalid Windows optional header');
  const magic = input.readUInt16LE(optional);
  if (![0x10b, 0x20b].includes(magic)) throw new Error('Unsupported Windows PE format');
  const security = optional + (magic === 0x20b ? 112 : 96) + 4 * 8;
  if (security + 8 > optional + optionalSize) throw new Error('Missing Windows security directory');
  const offset = input.readUInt32LE(security), size = input.readUInt32LE(security + 4);
  if (offset === 0 && size === 0) return input;
  if (offset < optional + optionalSize || size === 0 || offset + size > input.length) throw new Error('Invalid Windows certificate table');
  const output = Buffer.from(offset + size === input.length ? input.subarray(0, offset) : input);
  output.writeUInt32LE(0, security); output.writeUInt32LE(0, security + 4);
  return output;
}
