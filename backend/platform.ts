import { homedir } from 'node:os';
import path from 'node:path';

export function applicationDataHome(platform = process.platform, env = process.env, home = homedir()) {
  if (env.GDA_SYNC_HOME) return env.GDA_SYNC_HOME;
  if (platform === 'win32') return path.win32.join(env.LOCALAPPDATA || path.win32.join(home, 'AppData', 'Local'), 'GDA Sync');
  return path.posix.join(env.XDG_DATA_HOME || path.posix.join(home, '.local', 'share'), 'gda-sync');
}

export function desktopCommand(target: string, platform = process.platform) {
  if (platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $env:GDA_SYNC_OPEN_TARGET -ErrorAction Stop'],
      env: { ...process.env, GDA_SYNC_OPEN_TARGET: target },
    };
  }
  return { command: platform === 'darwin' ? 'open' : 'xdg-open', args: [target], env: process.env };
}
