#!/usr/bin/env bash
# Launches the newest Playwright Chromium for VS Code frontend debugging.
# We avoid the system Firefox here: it is installed as a snap, and the snap
# sandbox ignores -profile/--profile and has a private /tmp, which breaks the
# VS Code debug adapter's temporary profile.
set -euo pipefail

root="${MS_PLAYWRIGHT_DIR:-$HOME/.cache/ms-playwright}"
chrome="$(ls -d "$root"/chromium-*/chrome-linux64/chrome 2>/dev/null | sort -V | tail -n1 || true)"

if [ -z "$chrome" ]; then
	printf 'Playwright Chromium not found under %s.\nRun: npx playwright install chromium\n' "$root" >&2
	exit 1
fi

exec "$chrome" "$@"
