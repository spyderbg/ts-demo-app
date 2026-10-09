import path from 'node:path';
import { Library } from './library';
import { createServer, openOnDesktop } from './server';
import { applicationDataHome } from './platform';

async function main() {
  const args = process.argv.slice(2);
  const dataHome = applicationDataHome();
  const port = Number(process.env.PORT || 5175);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
  const dev = process.env.GDA_SYNC_DEV === '1';
  const shouldOpen = !args.includes('--no-open') && process.env.GDA_SYNC_NO_OPEN !== '1';
  const url = dev ? 'http://127.0.0.1:5176' : `http://127.0.0.1:${port}`;
  const library = new Library(path.resolve(dataHome)); await library.init();
  const app = createServer(library, { dev, onShutdown: () => void close() });
  try { await app.listen({ port, host: '127.0.0.1' }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
    const existing = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) }).then(r => r.json()).catch(() => null);
    if (existing?.app !== 'gda-sync') throw new Error(`Port ${port} is in use by another application. Set PORT to choose another port.`);
    if (shouldOpen) await openOnDesktop(url);
    console.log(`GDA Sync is already running at ${url}`);
    await app.close(); return;
  }
  console.log(`GDA Sync is ready at ${url}\nWorkspace: ${dataHome}`);
  if (shouldOpen) openOnDesktop(url).catch(error => console.log(`${error.message}\nOpen ${url} in your browser.`));
  let closing = false;
  const close = async () => { if (closing) return; closing = true; await app.close(); process.exit(0); };
  process.on('SIGINT', close); process.on('SIGTERM', close);
}
main().catch(error => { console.error(`GDA Sync: ${error.message}`); process.exitCode = 1; });
