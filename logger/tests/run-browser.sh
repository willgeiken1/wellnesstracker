#!/usr/bin/env bash
# Serves logger/ and runs the Playwright harnesses that need that static app.
# sw-mix.mjs starts its own mode-flip server and does not use BASE.
#
#   npm ci
#   npx playwright install chromium   # when system Chrome is not installed
#   ARTIFACTS_DIR=/tmp/browser-artifacts bash logger/tests/run-browser.sh
#
# CI sets ARTIFACTS_DIR to a writable temp dir and HOME_MIGRATE_PG=0.
# review-sync.mjs uses two origins of this same tree (the old client is in-page).
# review-unit.mjs is plain Node and is not part of this browser run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export BASE="${BASE:-http://127.0.0.1:8765}"
export ARTIFACTS_DIR="${ARTIFACTS_DIR:-${TMPDIR:-/tmp}/wellness-browser-artifacts}"
mkdir -p "$ARTIFACTS_DIR"

# package.json is "type": "module". These lookups are CommonJS on purpose.
if [[ -z "${PLAYWRIGHT_PATH:-}" ]]; then
  PLAYWRIGHT_PATH="$(node --input-type=commonjs -e "process.stdout.write(require.resolve('playwright'))")"
  export PLAYWRIGHT_PATH
fi

if [[ -z "${CHROME_PATH:-}" ]]; then
  if [[ -x /usr/local/bin/google-chrome ]]; then
    CHROME_PATH=/usr/local/bin/google-chrome
  elif [[ -x /usr/bin/google-chrome ]]; then
    CHROME_PATH=/usr/bin/google-chrome
  elif [[ -x /usr/bin/google-chrome-stable ]]; then
    CHROME_PATH=/usr/bin/google-chrome-stable
  else
    CHROME_PATH="$(node --input-type=commonjs -e "const {chromium}=require('playwright'); process.stdout.write(chromium.executablePath())")"
  fi
  export CHROME_PATH
fi

PORT="$(node -e "const u=new URL(process.env.BASE); process.stdout.write(String(u.port||'80'))")"
STARTED=0
SERVER_PID=""
OLD_STARTED=0
OLD_PID=""

cleanup() {
  if [[ "$STARTED" == 1 && -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [[ "$OLD_STARTED" == 1 && -n "$OLD_PID" ]]; then
    kill "$OLD_PID" 2>/dev/null || true
    wait "$OLD_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if curl -sf -o /dev/null --max-time 2 "$BASE/index.html"; then
  echo "using existing server at $BASE"
else
  echo "starting static server at $BASE"
  python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT/logger" >"$ARTIFACTS_DIR/static-server.log" 2>&1 &
  SERVER_PID=$!
  STARTED=1
  ready=0
  for _ in $(seq 1 50); do
    if curl -sf -o /dev/null --max-time 1 "$BASE/index.html"; then
      ready=1
      break
    fi
    sleep 0.2
  done
  if [[ "$ready" != 1 ]]; then
    echo "static server did not start" >&2
    cat "$ARTIFACTS_DIR/static-server.log" >&2 || true
    exit 1
  fi
fi

echo "PLAYWRIGHT_PATH=$PLAYWRIGHT_PATH"
echo "CHROME_PATH=$CHROME_PATH"
echo "ARTIFACTS_DIR=$ARTIFACTS_DIR"
echo "HOME_MIGRATE_PG=${HOME_MIGRATE_PG:-<unset, skip SQL if notes_merge is down>}"

harnesses=(
  logger/tests/brief-widget.mjs
  logger/tests/form-contrast.mjs
  logger/tests/home-editor.mjs
  logger/tests/machine-notes.mjs
  logger/tests/rapid-swipe.mjs
  logger/tests/tabs-qa.mjs
  logger/tests/home-migrate.mjs
  logger/tests/sw-mix.mjs
)

for file in "${harnesses[@]}"; do
  echo "=== $file ==="
  node "$file"
done

OLD_PORT="${OLD_PORT:-8766}"
export NEW="${NEW:-$BASE}"
export OLD="${OLD:-http://127.0.0.1:${OLD_PORT}}"
if ! curl -sf -o /dev/null --max-time 2 "$OLD/index.html"; then
  echo "starting second origin at $OLD"
  python3 -m http.server "$OLD_PORT" --bind 127.0.0.1 --directory "$ROOT/logger" >"$ARTIFACTS_DIR/static-server-old.log" 2>&1 &
  OLD_PID=$!
  OLD_STARTED=1
  ready=0
  for _ in $(seq 1 50); do
    if curl -sf -o /dev/null --max-time 1 "$OLD/index.html"; then
      ready=1
      break
    fi
    sleep 0.2
  done
  if [[ "$ready" != 1 ]]; then
    echo "second origin did not start" >&2
    cat "$ARTIFACTS_DIR/static-server-old.log" >&2 || true
    kill "$OLD_PID" 2>/dev/null || true
    exit 1
  fi
fi
echo "=== logger/tests/review-sync.mjs ($NEW and $OLD) ==="
node logger/tests/review-sync.mjs
