#!/usr/bin/env bash
set -euo pipefail

# Tauri's AppImage bundler caches AppRun with mode 770 and copies it into the
# image as AppRun.wrapped. Preseed the same cache with a world-executable copy.
cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/tauri"
apprun="$cache_dir/AppRun-x86_64"

mkdir -p "$cache_dir"
if [[ ! -f "$apprun" ]]; then
  tmp=$(mktemp "$cache_dir/.AppRun-x86_64.XXXXXX")
  trap 'rm -f "$tmp"' EXIT
  curl --fail --location --silent --show-error \
    'https://github.com/tauri-apps/binary-releases/releases/download/apprun-old/AppRun-x86_64' \
    --output "$tmp"
  mv "$tmp" "$apprun"
fi

chmod 755 "$apprun"
