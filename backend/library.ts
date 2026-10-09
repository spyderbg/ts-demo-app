import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import { access, copyFile, lstat, mkdir, open, readFile, readdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readDDSInfo, decodeDDS, SUPPORTED_DDS_FORMATS } from './dds';
import { seedDemo } from './demo';
import type { Activity, Asset, AssetType, LibraryResponse, WorkspaceConfig } from './types';

export class AppError extends Error {
  constructor(message: string, public statusCode = 400) { super(message); }
}
const errorCode = (error: unknown) => (error as NodeJS.ErrnoException).code;
export const assetId = (relative: string) => Buffer.from(relative.split(path.sep).join('/')).toString('base64url');
const contained = (root: string, file: string) => {
  const relative = path.relative(root, file);
  return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep);
};
async function hash(file: string): Promise<string> {
  const result = createHash('sha256');
  for await (const chunk of createReadStream(file)) result.update(chunk);
  return result.digest('hex');
}
export async function safePath(root: string, relative: string, createParents = false): Promise<string> {
  const target = path.resolve(root, relative);
  if (!relative || path.isAbsolute(relative) || !contained(root, target) || target === root) throw new AppError('Invalid asset path');
  let current = root;
  const parts = path.relative(root, target).split(path.sep);
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new AppError('Symbolic links are not supported');
      if (i < parts.length - 1 && !info.isDirectory()) throw new AppError('An asset parent is not a folder');
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
      if (createParents && i < parts.length - 1) await mkdir(current);
    }
  }
  return target;
}
function typeFor(ext: string): AssetType {
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'dds', 'tga', 'bmp', 'exr', 'tif', 'tiff'].includes(ext)) return 'texture';
  if (['obj', 'fbx', 'glb', 'gltf', 'blend'].includes(ext)) return 'model';
  if (['mat', 'mtl', 'material'].includes(ext)) return 'material';
  if (['wav', 'ogg', 'mp3', 'flac'].includes(ext)) return 'audio';
  return 'other';
}
export class Library {
  config!: WorkspaceConfig;
  activity: Activity[] = [];
  busy = false;
  private idle: Promise<void> = Promise.resolve();
  private previewCache = new Map<string, Buffer>();
  private scannedAssets: Asset[] | null = null;
  constructor(public home: string) {}
  async init() {
    await mkdir(this.home, { recursive: true });
    try { this.config = JSON.parse(await readFile(path.join(this.home, 'workspace.json'), 'utf8')); }
    catch (error) {
      if (errorCode(error) !== 'ENOENT') throw new Error('Could not read workspace.json. Fix the configuration before starting.');
      this.config = await seedDemo(this.home); await this.saveConfig();
    }
    // Resolve roots once; nested symbolic links are deliberately skipped.
    this.config.source = await realpath(this.config.source);
    this.config.destination = await realpath(this.config.destination);
    try { this.activity = JSON.parse(await readFile(path.join(this.home, 'activity.json'), 'utf8')); }
    catch (error) { if (errorCode(error) !== 'ENOENT') throw error; }
  }
  private async writeJSON(name: string, data: unknown) {
    const temp = path.join(this.home, `.${name}-${randomUUID()}`);
    await writeFile(temp, JSON.stringify(data, null, 2)); await rename(temp, path.join(this.home, name));
  }
  private saveConfig() { return this.writeJSON('workspace.json', this.config); }
  private async record(action: Activity['action'], message: string, files: string[] = [], bytes?: number) {
    this.activity.unshift({ id: randomUUID(), date: new Date().toISOString(), action, message, files, bytes });
    this.activity = this.activity.slice(0, 100); await this.writeJSON('activity.json', this.activity);
  }
  async scan(): Promise<LibraryResponse> {
    const config = { ...this.config };
    const assets: Asset[] = [], warnings: string[] = [];
    const walk = async (folder: string) => {
      const entries = await readdir(path.join(config.source, folder), { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const relative = path.join(folder, entry.name);
        if (entry.isSymbolicLink()) { warnings.push(`Skipped symbolic link: ${relative}`); continue; }
        if (entry.isDirectory()) { await walk(relative); continue; }
        if (!entry.isFile()) continue;
        if (assets.length >= 10_000) throw new AppError('This demo supports up to 10,000 files per workspace');
        try {
          const file = await safePath(config.source, relative), info = await stat(file);
          const extension = path.extname(relative).slice(1).toLowerCase();
          const target = await safePath(config.destination, relative);
          let status: Asset['status'] = 'new';
          try {
            const destinationInfo = await stat(target);
            if (!destinationInfo.isFile()) throw new AppError('The destination is not a regular file');
            status = info.size === destinationInfo.size && await hash(file) === await hash(target) ? 'synced' : 'modified';
          } catch (error) { if (errorCode(error) !== 'ENOENT') throw error; }
          const asset: Asset = {
            id: assetId(relative), name: entry.name, path: relative.split(path.sep).join('/'), folder: folder.split(path.sep).join('/') || 'Root',
            extension, type: typeFor(extension), status, size: info.size, modifiedAt: info.mtime.toISOString(),
            preview: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'bmp'].includes(extension),
          };
          if (extension === 'dds' || extension === 'png') {
            const handle = await open(file, 'r'); const header = Buffer.alloc(148);
            let bytesRead: number;
            try { ({ bytesRead } = await handle.read(header, 0, header.length, 0)); } finally { await handle.close(); }
            try {
              if (extension === 'dds') {
                asset.dimensions = readDDSInfo(header.subarray(0, bytesRead));
                asset.preview = SUPPORTED_DDS_FORMATS.has(asset.dimensions.format);
                if (!asset.preview) asset.previewError = `Preview unavailable for ${asset.dimensions.format}. The original file can still be synced.`;
              } else if (header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
                asset.dimensions = { width: header.readUInt32BE(16), height: header.readUInt32BE(20), format: 'RGBA' };
              }
            } catch (error) { asset.preview = false; asset.previewError = (error as Error).message; }
          }
          if (config.demo && asset.type === 'model') {
            try { await access(path.join(config.source, '.previews', asset.id + '.svg')); asset.preview = true; } catch { /* generic model icon */ }
          }
          assets.push(asset);
        } catch (error) { warnings.push(`${relative}: ${(error as Error).message}`); }
      }
    };
    await walk('');
    // Give the demo an intentional order; real workspaces are sorted by recent changes.
    assets.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    this.scannedAssets = assets;
    return { assets, config, activity: this.activity, scannedAt: new Date().toISOString(), warnings, backupPath: path.join(this.home, 'backups') };
  }
  async rescan() {
    return this.exclusive(async () => {
      const result = await this.scan(); await this.record('scan', `Scanned ${result.assets.length} assets`);
      return { ...result, activity: this.activity };
    });
  }
  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy) throw new AppError('Another workspace operation is in progress. Try again shortly.', 409);
    this.busy = true;
    let finished!: () => void;
    this.idle = new Promise<void>(resolve => { finished = resolve; });
    try { return await operation(); } finally { this.busy = false; finished(); }
  }
  // An HTTP request can disconnect while its file operation is still running.
  waitForIdle() { return this.idle; }
  async updateConfig(input: { name: string; source: string; destination: string }) {
    return this.exclusive(async () => {
      if (!input.name.trim() || input.name.length > 80) throw new AppError('Enter a project name of 1–80 characters');
      if (!path.isAbsolute(input.source) || !path.isAbsolute(input.destination)) throw new AppError('Use absolute folder paths');
      let source: string, destination: string;
      try { source = await realpath(input.source); destination = await realpath(input.destination); }
      catch { throw new AppError('Both folders must exist before you connect them'); }
      if (!(await stat(source)).isDirectory() || !(await stat(destination)).isDirectory()) throw new AppError('Both paths must be folders');
      if (contained(source, destination) || contained(destination, source)) throw new AppError('Source and GDA folders must be separate, without nesting');
      if (contained(source, this.home) || contained(destination, this.home)) throw new AppError('Choose folders outside the application data directory’s parents');
      try { await access(source, constants.R_OK); await access(destination, constants.W_OK); }
      catch { throw new AppError('The source must be readable and the GDA folder must be writable'); }
      const demo = source === this.config.source && destination === this.config.destination && this.config.demo;
      const previous = this.config;
      this.config = { name: input.name.trim(), source, destination, demo };
      try { await this.saveConfig(); } catch (error) { this.config = previous; throw error; }
      this.previewCache.clear(); this.scannedAssets = null; await this.record('settings', `Connected ${this.config.name} workspace`);
      return this.scan();
    });
  }
  async sync(ids: string[]) {
    return this.exclusive(async () => {
      const assets = (await this.scan()).assets;
      const wanted = [...new Set(ids)];
      const lookup = new Map(assets.map(a => [a.id, a]));
      if (wanted.some(id => !lookup.has(id))) throw new AppError('An asset no longer exists. Rescan your library and try again.');
      const operationId = randomUUID();
      const copied: string[] = [], failures: { name: string; message: string }[] = [];
      let bytes = 0;
      for (const id of wanted) {
        const asset = lookup.get(id)!;
        if (asset.status === 'synced') continue;
        let temporary: string | undefined;
        try {
          const source = await safePath(this.config.source, asset.path);
          const target = await safePath(this.config.destination, asset.path, true);
          const originalHash = await hash(source);
          temporary = path.join(path.dirname(target), `.gda-sync-${randomUUID()}.tmp`);
          await copyFile(source, temporary, constants.COPYFILE_EXCL);
          if (await hash(temporary) !== originalHash || await hash(source) !== originalHash) throw new AppError('Source changed while copying. Please retry.');
          // Check again immediately before replacing. Existing GDA files have a recoverable backup.
          await safePath(this.config.destination, asset.path);
          try {
            const info = await lstat(target);
            if (!info.isFile()) throw new AppError('The destination is not a regular file');
            const backup = path.join(this.home, 'backups', operationId, asset.path);
            await mkdir(path.dirname(backup), { recursive: true }); await copyFile(target, backup, constants.COPYFILE_EXCL);
          } catch (error) { if (errorCode(error) !== 'ENOENT') throw error; }
          await rename(temporary, target); temporary = undefined; copied.push(asset.path); bytes += asset.size;
        } catch (error) { failures.push({ name: asset.name, message: (error as Error).message }); }
        finally { if (temporary) await unlink(temporary).catch(() => {}); }
      }
      if (copied.length) await this.record('sync', `Synced ${copied.length} asset${copied.length === 1 ? '' : 's'} to GDA`, copied, bytes);
      return { copied, failures, bytes, library: await this.scan() };
    });
  }
  async getAsset(id: string): Promise<Asset> {
    const asset = (this.scannedAssets || (await this.scan()).assets).find(a => a.id === id);
    if (!asset) throw new AppError('Asset not found', 404);
    return asset;
  }
  async preview(asset: Asset): Promise<{ data: Buffer; mime: string }> {
    if (!asset.preview) throw new AppError(asset.previewError || 'No image preview for this asset', 415);
    if (asset.type === 'model' && this.config.demo) {
      return { data: await readFile(path.join(this.config.source, '.previews', asset.id + '.svg')), mime: 'image/svg+xml' };
    }
    const file = await safePath(this.config.source, asset.path);
    if ((await stat(file)).size > 64 * 1024 * 1024) throw new AppError('Preview is limited to files smaller than 64 MB', 413);
    if (asset.extension === 'dds') {
      const key = `${file}:${asset.modifiedAt}:${asset.size}`;
      let data = this.previewCache.get(key);
      if (!data) {
        try { data = decodeDDS(await readFile(file)); }
        catch (error) { throw new AppError((error as Error).message, 415); }
        if (this.previewCache.size >= 16) this.previewCache.delete(this.previewCache.keys().next().value!);
        this.previewCache.set(key, data);
      }
      return { data, mime: 'image/png' };
    }
    const mime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' };
    return { data: await readFile(file), mime: mime[asset.extension] || 'application/octet-stream' };
  }
}
