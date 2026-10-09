import { execFileSync } from 'node:child_process';
import { copyFile, chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inject } from 'postject';
import { packageTargets, stripWindowsSignature, windowsRuntime } from './packaging';

const targets = packageTargets(process.argv.slice(2));
await mkdir('dist', { recursive: true });
await mkdir('build', { recursive: true });
await writeFile('build/sea-config.json', JSON.stringify({ main: 'build/server.cjs', output: 'build/gda-sync.blob', disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false }));
execFileSync(process.execPath, ['--experimental-sea-config', 'build/sea-config.json'], { stdio: 'inherit' });
const blob = await readFile('build/gda-sync.blob');
for (const target of targets) {
  const binary = path.resolve(target === 'windows' ? 'dist/gda-sync.exe' : 'dist/gda-sync');
  const temporary = path.resolve(`dist/.gda-sync-${process.pid}${target === 'windows' ? '.exe' : ''}`);
  try {
    if (target === 'windows') await writeFile(temporary, stripWindowsSignature(await readFile(await windowsRuntime())));
    else { await copyFile(process.execPath, temporary); await chmod(temporary, 0o755); }
    await inject(temporary, 'NODE_SEA_BLOB', blob, { sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2' });
    await rename(temporary, binary);
  } finally { await unlink(temporary).catch(() => {}); }
  console.log(`Standalone ${target}-${target === 'windows' ? 'x64' : process.arch} application → ${binary}`);
}
