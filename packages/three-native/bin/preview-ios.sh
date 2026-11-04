#!/bin/bash
set -euo pipefail
simulator="${1:?Pass a simulator UDID}"
port="${2:-8087}"
cleanup() { npx --yes serve-sim@0.1.49 --kill "$simulator" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM HUP
cleanup
npx --yes serve-sim@0.1.49 --port "$port" --fit --panes none "$simulator"
