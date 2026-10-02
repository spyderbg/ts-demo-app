#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
app_dir="${XDG_DATA_HOME:-$HOME/.local/share}/gda-sync-app"
applications_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
if [[ ! -x "$project_dir/dist/gda-sync" ]]; then
  echo 'Build the standalone application first: npm run package' >&2
  exit 1
fi
mkdir -p "$app_dir" "$applications_dir" "$HOME/.local/bin"
cp "$project_dir/dist/gda-sync" "$app_dir/gda-sync"
cp "$project_dir/frontend/public/favicon.svg" "$app_dir/icon.svg"
ln -sfn "$app_dir/gda-sync" "$HOME/.local/bin/gda-sync"
cat > "$applications_dir/gda-sync.desktop" <<DESKTOP
[Desktop Entry]
Version=1.0
Type=Application
Name=GDA Sync
Comment=Your studio asset workspace
Exec="$app_dir/gda-sync"
Icon=$app_dir/icon.svg
Terminal=false
Categories=Graphics;Utility;
StartupNotify=false
DESKTOP
chmod +x "$app_dir/gda-sync"
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$applications_dir"
fi
printf 'Installed GDA Sync in the application menu.\nLaunch with: %s\n' "$HOME/.local/bin/gda-sync"
