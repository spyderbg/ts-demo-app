import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const home = await mkdtemp(path.join(tmpdir(), 'gda-e2e-'));
const child = spawn(process.execPath, ['build/server.cjs', '--no-open'], { stdio: 'inherit', env: { ...process.env, PORT: '3467', GDA_SYNC_HOME: home } });
const stop = () => child.kill('SIGTERM');
process.on('SIGTERM', stop); process.on('SIGINT', stop);
child.on('exit', async code => { await rm(home, { recursive: true, force: true }); process.exitCode = code || 0; });
