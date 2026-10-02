import { execFileSync } from 'node:child_process';
import { copyFile, chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inject } from 'postject';

if (process.platform !== 'linux') throw new Error('This desktop package targets Linux. Run the packaging command on Linux.');
await mkdir('dist', { recursive: true });
const binary = path.resolve('dist/gda-sync');
const temporary = path.resolve(`dist/.gda-sync-${process.pid}`);
await writeFile('build/sea-config.json', JSON.stringify({ main: 'build/server.cjs', output: 'build/gda-sync.blob', disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false }));
execFileSync(process.execPath, ['--experimental-sea-config', 'build/sea-config.json'], { stdio: 'inherit' });
try {
  await copyFile(process.execPath, temporary); await chmod(temporary, 0o755);
  await inject(temporary, 'NODE_SEA_BLOB', await readFile('build/gda-sync.blob'), { sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2' });
  await rename(temporary, binary);
} finally { await unlink(temporary).catch(() => {}); }
console.log(`Standalone ${process.platform}-${process.arch} application → ${binary}`);
