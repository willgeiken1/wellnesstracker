#!/usr/bin/env bash
# Serves logger/ and runs the Playwright harnesses that need that static app.
# sw-mix.mjs starts its own mode-flip server and does not use BASE.
#
#   npm ci
#   npx playwright install chromium   # when system Chrome is not installed
#   ARTIFACTS_DIR=/tmp/browser-artifacts bash logger/tests/run-browser.sh
#
# CI sets ARTIFACTS_DIR to a writable temp dir and HOME_MIGRATE_PG=0.
# INSIGHT_TEST_PORT pins the primary port. The default is a free port.
# This script always starts its own servers. It never reuses whatever is
# already listening (that may be a different app's preview).
# review-sync.mjs uses two origins of this same tree (the old client is in-page).
# review-unit.mjs is plain Node and is not part of this browser run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

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

# Exit 0 when 127.0.0.1:port is already bound, 1 when it is free.
port_is_taken() {
  node -e '
    const net = require("net");
    const port = Number(process.argv[1]);
    const server = net.createServer();
    server.once("error", () => process.exit(0));
    server.listen(port, "127.0.0.1", () => server.close(() => process.exit(1)));
  ' "$1"
}

free_port() {
  node -e 'const s=require("net").createServer(); s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port)); s.close();});'
}

port_from_url() {
  node -e 'const u=new URL(process.argv[1]); process.stdout.write(u.port || (u.protocol==="https:"?"443":"80"))' "$1"
}

assert_insight() {
  node --input-type=module -e '
    import { assertInsight } from "./logger/tests/e2e/fixtures/assert-insight.mjs";
    await assertInsight(process.argv[1]);
  ' "$1"
}

# Always bind a server we started. Never curl an existing listener and proceed.
start_static() {
  local port="$1"
  local logfile="$2"
  local label="$3"
  local -n pid_ref="$4"
  if port_is_taken "$port"; then
    echo "Port ${port} is already in use. Refusing to reuse that server — it may be a different app. Unset INSIGHT_TEST_PORT to pick a free port." >&2
    exit 1
  fi
  local url="http://127.0.0.1:${port}"
  echo "starting ${label} at ${url}"
  python3 -m http.server "$port" --bind 127.0.0.1 --directory "$ROOT/logger" >"$logfile" 2>&1 &
  pid_ref=$!
  local ready=0
  for _ in $(seq 1 50); do
    if curl -sf -o /dev/null --max-time 1 "${url}/index.html"; then
      ready=1
      break
    fi
    if ! kill -0 "$pid_ref" 2>/dev/null; then
      break
    fi
    sleep 0.2
  done
  if [[ "$ready" != 1 ]]; then
    echo "${label} did not start on port ${port}" >&2
    cat "$logfile" >&2 || true
    exit 1
  fi
  assert_insight "$url"
  echo "confirmed Insight at ${url}"
}

if [[ -n "${INSIGHT_TEST_PORT:-}" ]]; then
  PORT="$INSIGHT_TEST_PORT"
elif [[ -n "${BASE:-}" ]]; then
  PORT="$(port_from_url "$BASE")"
else
  PORT="$(free_port)"
fi
export BASE="http://127.0.0.1:${PORT}"

SERVER_PID=""
OLD_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [[ -n "$OLD_PID" ]]; then
    kill "$OLD_PID" 2>/dev/null || true
    wait "$OLD_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

start_static "$PORT" "$ARTIFACTS_DIR/static-server.log" "Insight" SERVER_PID

echo "PLAYWRIGHT_PATH=$PLAYWRIGHT_PATH"
echo "CHROME_PATH=$CHROME_PATH"
echo "ARTIFACTS_DIR=$ARTIFACTS_DIR"
echo "HOME_MIGRATE_PG=${HOME_MIGRATE_PG:-<unset, skip SQL if notes_merge is down>}"

# touch-qol writes shots under SHOTS_DIR. CI sets SHOTS=0 and has no /workspace tree.
if [[ "${SHOTS:-1}" == "0" && -z "${SHOTS_DIR:-}" ]]; then
  export SHOTS_DIR="${ARTIFACTS_DIR}/touch-qol"
fi

harnesses=(
  logger/tests/brief-widget.mjs
  logger/tests/form-contrast.mjs
  logger/tests/home-editor.mjs
  logger/tests/machine-notes.mjs
  logger/tests/rapid-swipe.mjs
  logger/tests/tabs-qa.mjs
  logger/tests/touch-qol.mjs
  logger/tests/home-migrate.mjs
  logger/tests/sw-mix.mjs
)

for file in "${harnesses[@]}"; do
  echo "=== $file ==="
  node "$file"
done

if [[ -n "${OLD:-}" ]]; then
  OLD_PORT="$(port_from_url "$OLD")"
else
  OLD_PORT="$(free_port)"
fi
export NEW="${NEW:-$BASE}"
export OLD="http://127.0.0.1:${OLD_PORT}"
start_static "$OLD_PORT" "$ARTIFACTS_DIR/static-server-old.log" "Insight (second origin)" OLD_PID
echo "=== logger/tests/review-sync.mjs ($NEW and $OLD) ==="
node logger/tests/review-sync.mjs

echo "=== pw:smoke ==="
# Smoke starts its own server. Do not hand it the harness port.
env -u INSIGHT_TEST_PORT -u PW_PORT npm run pw:smoke
