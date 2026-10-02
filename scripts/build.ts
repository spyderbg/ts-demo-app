import { build as viteBuild } from 'vite';
import { build } from 'esbuild';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

await viteBuild();
const files: Record<string, { mime: string; base64: string }> = {};
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
async function walk(folder: string) {
  for (const entry of await readdir(path.join('build/frontend', folder), { withFileTypes: true })) {
    const relative = path.join(folder, entry.name);
    if (entry.isDirectory()) await walk(relative);
    else files['/' + relative.split(path.sep).join('/')] = { mime: mime[path.extname(relative)] || 'application/octet-stream', base64: (await readFile(path.join('build/frontend', relative))).toString('base64') };
  }
}
await walk(''); await mkdir('build', { recursive: true });
await writeFile('build/embedded.ts', `export const embeddedFiles = ${JSON.stringify(files)};\n`);
await build({
  entryPoints: ['backend/main.ts'], outfile: 'build/server.cjs', bundle: true, platform: 'node', target: 'node22', format: 'cjs',
  plugins: [{ name: 'embedded-frontend', setup(builder) { builder.onResolve({ filter: /^\.\/embedded$/ }, () => ({ path: path.resolve('build/embedded.ts') })); } }],
});
console.log('Built frontend and backend → build/server.cjs');
