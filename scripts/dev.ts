import { spawn } from 'node:child_process';
import { createServer } from 'vite';
const vite = await createServer({ server: { open: process.env.GDA_SYNC_NO_OPEN !== '1' } }); await vite.listen();
const backend = spawn(process.execPath, ['--watch', '--watch-preserve-output', '--import', 'tsx', 'backend/main.ts'], {
  stdio: 'inherit', env: { ...process.env, GDA_SYNC_DEV: '1', GDA_SYNC_NO_OPEN: '1' },
});
vite.printUrls();
let closing = false;
async function close() { if (closing) return; closing = true; backend.kill('SIGTERM'); await vite.close(); }
process.on('SIGINT', close); process.on('SIGTERM', close);
backend.on('exit', async code => { await close(); process.exitCode = code || 0; });
