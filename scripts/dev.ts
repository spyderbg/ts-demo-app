import { spawn } from 'node:child_process';
import { createServer } from 'vite';
const vite = await createServer(); await vite.listen();
const backend = spawn(process.execPath, ['--import', 'tsx', 'backend/main.ts'], {
  stdio: 'inherit', env: { ...process.env, GDA_SYNC_DEV: '1' },
});
vite.printUrls();
let closing = false;
async function close() { if (closing) return; closing = true; backend.kill('SIGTERM'); await vite.close(); }
process.on('SIGINT', close); process.on('SIGTERM', close);
backend.on('exit', async code => { await close(); process.exitCode = code || 0; });
