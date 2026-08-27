#!/usr/bin/env bash
#
# Downloads the static ffmpeg and ffprobe builds that ship inside the app.
#
# Tauri resolves a sidecar by appending the Rust target triple to the name
# declared in `bundle.externalBin`, so the files on disk must be named
# `ffmpeg-aarch64-apple-darwin` and so on. A missing suffix fails the build
# with a very unhelpful error, which is the main reason this script exists.
#
# Safe to re-run: binaries that are already present and valid are left alone.

set -euo pipefail

# ffmpeg-static publishes plain, per-architecture macOS binaries under stable
# release URLs. These builds are configured with --enable-gpl --enable-libx264,
# which is what the app needs and also why the bundle is GPL. See README.md.
RELEASE="b6.1.1"
BASE_URL="https://github.com/eugeneware/ffmpeg-static/releases/download/${RELEASE}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${REPO_ROOT}/src-tauri/binaries"

# tool:arch:target-triple
TARGETS=(
  "ffmpeg:arm64:aarch64-apple-darwin"
  "ffprobe:arm64:aarch64-apple-darwin"
  "ffmpeg:x64:x86_64-apple-darwin"
  "ffprobe:x64:x86_64-apple-darwin"
)

HOST_ARCH="$(uname -m)"   # arm64 or x86_64

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
info()  { printf '  %s\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[33m!\033[0m %s\n' "$*"; }
fail()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# Is this binary built for the machine we are running on?
is_native() {
  case "$1" in
    arm64) [ "$HOST_ARCH" = "arm64" ] ;;
    x64)   [ "$HOST_ARCH" = "x86_64" ] ;;
    *)     return 1 ;;
  esac
}

# The Mach-O architecture we expect to find inside the file.
macho_arch_for() {
  case "$1" in
    arm64) echo "arm64" ;;
    x64)   echo "x86_64" ;;
  esac
}

# A binary counts as valid when it is executable, is a Mach-O for the right
# architecture, and — when it can run on this machine — actually runs.
verify() {
  local path="$1" arch="$2" tool="$3"
  local expected
  expected="$(macho_arch_for "$arch")"

  [ -x "$path" ] || return 1

  if command -v lipo >/dev/null 2>&1; then
    lipo -archs "$path" 2>/dev/null | tr ' ' '\n' | grep -qx "$expected" || return 1
  fi

  if is_native "$arch"; then
    "$path" -version >/dev/null 2>&1 || return 1
  fi

  return 0
}

bold "Fetching ffmpeg sidecars (${RELEASE}) into src-tauri/binaries"
mkdir -p "$DEST"

command -v curl >/dev/null 2>&1 || fail "curl is required but was not found."

downloaded=0
skipped=0

for entry in "${TARGETS[@]}"; do
  IFS=":" read -r tool arch triple <<< "$entry"
  target="${DEST}/${tool}-${triple}"

  if verify "$target" "$arch" "$tool"; then
    ok "${tool}-${triple} already present"
    skipped=$((skipped + 1))
    continue
  fi

  [ -e "$target" ] && warn "${tool}-${triple} present but invalid — re-downloading"

  url="${BASE_URL}/${tool}-darwin-${arch}.gz"
  info "downloading ${tool}-${triple}"

  tmp="${target}.download"
  rm -f "$tmp" "$tmp.gz"

  curl --fail --location --progress-bar --output "$tmp.gz" "$url" \
    || fail "Download failed: $url"

  gunzip -c "$tmp.gz" > "$tmp" || fail "Could not unpack ${tool}-darwin-${arch}.gz"
  rm -f "$tmp.gz"
  chmod +x "$tmp"

  # macOS quarantines anything downloaded; strip it so the binary can run.
  xattr -d com.apple.quarantine "$tmp" >/dev/null 2>&1 || true

  mv "$tmp" "$target"

  verify "$target" "$arch" "$tool" \
    || fail "${tool}-${triple} downloaded but does not execute. Delete it and re-run."

  ok "${tool}-${triple}"
  downloaded=$((downloaded + 1))
done

echo
bold "Verifying"

native_triple="aarch64-apple-darwin"
[ "$HOST_ARCH" = "x86_64" ] && native_triple="x86_64-apple-darwin"

native_ffmpeg="${DEST}/ffmpeg-${native_triple}"
version_line="$("$native_ffmpeg" -version 2>/dev/null | head -n 1)" \
  || fail "ffmpeg-${native_triple} would not run."
ok "$version_line"

# libx264 is non-negotiable: it is the only video encoder the app ever uses.
if "$native_ffmpeg" -version 2>/dev/null | grep -q -- "--enable-libx264"; then
  ok "libx264 available"
else
  fail "This ffmpeg build has no libx264. The app cannot encode without it."
fi

probe_line="$("${DEST}/ffprobe-${native_triple}" -version 2>/dev/null | head -n 1)" \
  || fail "ffprobe-${native_triple} would not run."
ok "$probe_line"

if ! is_native arm64 && ! is_native x64; then
  warn "Unknown host architecture ${HOST_ARCH}; only file checks were performed."
fi

foreign_triple="x86_64-apple-darwin"
[ "$HOST_ARCH" = "x86_64" ] && foreign_triple="aarch64-apple-darwin"
info "${foreign_triple} binaries were checked with lipo only — they cannot run on this machine."

echo
bold "Done — ${downloaded} downloaded, ${skipped} already present."
