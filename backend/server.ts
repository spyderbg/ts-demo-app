import Fastify from 'fastify';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { Library, AppError, safePath } from './library';
import { embeddedFiles } from './embedded';
import packageInfo from '../package.json';
import { PageLifetime } from './page-lifetime';
import { desktopCommand } from './platform';

export async function openOnDesktop(target: string) {
  const { command, args, env } = desktopCommand(target);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true, env });
    child.once('error', () => reject(new AppError('A desktop file manager is not available. You can copy the folder path instead.', 503)));
    child.once('exit', code => code === 0 ? resolve() : reject(new AppError('Could not open the folder in your desktop session. You can copy the path instead.', 503)));
  });
}
export function createServer(library: Library, options: { dev?: boolean; opener?: (path: string) => Promise<void>; onShutdown?: () => void; pageCloseGraceMs?: number } = {}) {
  // Close browser sockets promptly; the onClose hook waits for file operations.
  const app = Fastify({ logger: false, bodyLimit: 128 * 1024, forceCloseConnections: true });
  const token = randomBytes(32).toString('hex');
  const lifetime = new PageLifetime(() => options.onShutdown?.(), options.pageCloseGraceMs);
  app.addHook('preClose', async () => lifetime.dispose());
  app.addHook('onClose', async () => library.waitForIdle());
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(request.hostname)) throw new AppError('Invalid local host', 403);
    if (request.url.startsWith('/api/')) {
      if (request.headers['sec-fetch-site'] === 'cross-site') throw new AppError('Cross-site requests are not allowed', 403);
      if (!['GET', 'HEAD'].includes(request.method) && request.headers['x-gda-token'] !== token) throw new AppError('Invalid session. Reload the application.', 403);
    }
  });
  app.setErrorHandler<Error & { statusCode?: number }>((error, _request, reply) => {
    const status = error instanceof AppError ? error.statusCode : error.statusCode || 500;
    if (status >= 500) console.error(error.message);
    reply.code(status).send({ error: status >= 500 && !(error instanceof AppError) ? 'The operation could not be completed. Check folder permissions and try again.' : error.message });
  });
  app.get('/api/session', async (_request, reply) => {
    reply.header('Set-Cookie', `gda-session=${token}; HttpOnly; SameSite=Strict; Path=/api/lifecycle`);
    return { token, version: packageInfo.version, autoShutdownOnClose: !!options.onShutdown };
  });
  app.get('/api/lifecycle', async (request, reply) => {
    if (!options.onShutdown) throw new AppError('Automatic shutdown is unavailable in this session', 503);
    const authenticated = request.headers.cookie?.split(';').some(cookie => cookie.trim() === `gda-session=${token}`);
    if (!authenticated) throw new AppError('Invalid lifecycle session', 403);
    reply.hijack();
    lifetime.connect(reply.raw);
  });
  app.post('/api/shutdown', async () => {
    if (!options.onShutdown) throw new AppError('Shutdown is unavailable in this session', 503);
    setTimeout(() => options.onShutdown!(), 150);
    return { stopping: true };
  });
  app.get('/api/health', async () => ({ app: 'gda-sync', ready: true, version: packageInfo.version, openPages: lifetime.count }));
  app.get('/api/library', async () => library.scan());
  app.post('/api/scan', async () => library.rescan());
  app.post<{ Body: { ids: string[] } }>('/api/sync', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['ids'], properties: { ids: { type: 'array', minItems: 1, maxItems: 10000, items: { type: 'string', maxLength: 4096 } } } } },
  }, async request => library.sync(request.body.ids));
  app.put<{ Body: { name: string; source: string; destination: string } }>('/api/settings', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['name', 'source', 'destination'], properties: { name: { type: 'string', maxLength: 80 }, source: { type: 'string', maxLength: 4096 }, destination: { type: 'string', maxLength: 4096 } } } },
  }, async request => library.updateConfig(request.body));
  app.get<{ Params: { id: string } }>('/api/assets/:id/preview', async (request, reply) => {
    const asset = await library.getAsset(request.params.id);
    const { data, mime } = await library.preview(asset);
    reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
    return reply.type(mime).send(data);
  });
  app.post<{ Body: { folder: 'source' | 'destination'; assetId?: string } }>('/api/open-folder', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['folder'], properties: { folder: { type: 'string', enum: ['source', 'destination'] }, assetId: { type: 'string', maxLength: 4096 } } } },
  }, async request => {
    const { folder, assetId } = request.body;
    let target = folder === 'source' ? library.config.source : library.config.destination;
    if (assetId) {
      const asset = await library.getAsset(assetId);
      target = path.dirname(await safePath(target, asset.path));
    }
    await (options.opener || openOnDesktop)(target);
    return { opened: true };
  });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'Endpoint not found' });
    if (options.dev) return reply.type('text/html').send('<p>Development UI: <a href="http://127.0.0.1:5176">Open GDA Sync</a></p>');
    const file = embeddedFiles[request.url.split('?')[0]] || (!path.extname(request.url) ? embeddedFiles['/index.html'] : undefined);
    if (!file) return reply.code(404).send({ error: 'File not found' });
    reply.header('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'");
    return reply.type(file.mime).send(Buffer.from(file.base64, 'base64'));
  });
  app.get('/', async (_request, reply) => {
    if (options.dev) return reply.redirect('http://127.0.0.1:5176');
    const file = embeddedFiles['/index.html'];
    if (!file) throw new AppError('Frontend is not built. Run npm run build.', 503);
    reply.header('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'");
    return reply.type('text/html').send(Buffer.from(file.base64, 'base64'));
  });
  return app;
}
