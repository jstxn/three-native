#!/bin/bash
set -euo pipefail
simulator="${1:?Pass the Simulator UDID from xcrun simctl list devices available}"
cleanup() { npx --yes serve-sim@0.1.49 --kill "$simulator" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM HUP
cleanup
npx --yes serve-sim@0.1.49 --port 8087 --fit --panes none "$simulator"
