#!/usr/bin/env bash
# App Store screenshots for Insight: the six 6.9-inch shots (1320 x 2868) on the iOS Simulator,
# with the example account and made-up sample data. Nothing real is shown and nothing is signed in.
#
# Run from native/:  scripts/app-store-screenshots.sh
# It boots the simulator, sets light mode and a 9:41 status bar, builds and opens the development build,
# fills the sample data, then walks through the six screens. At each one it says what to tap, waits for
# Return, saves the shot and checks its size. Files are named in App Store Connect's upload order.
# OUT=<folder> changes where they go (default ~/Desktop/insight-screenshots). SKIP_BUILD=1 reuses the build.
set -euo pipefail

OUT="${OUT:-$HOME/Desktop/insight-screenshots}"
WANT="1320x2868"
METRO="http://127.0.0.1:8081"
cd "$(dirname "$0")/.."
mkdir -p "$OUT"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ask() { printf '\n%s\nPress Return when ready. ' "$1"; read -r _; }

# A 6.9-inch iPhone simulator, newest first.
udid=""
for name in "iPhone 17 Pro Max" "iPhone 16 Pro Max"; do
  udid=$(xcrun simctl list devices available | grep -E "^[[:space:]]+${name} \(" | head -1 \
    | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/' || true)
  [ -n "$udid" ] && { device="$name"; break; }
done
if [ -z "$udid" ]; then
  echo "No iPhone 17 Pro Max or 16 Pro Max simulator. Add one in Xcode > Window > Devices and Simulators." >&2
  exit 1
fi

say "1/4  Starting the $device simulator"
xcrun simctl bootstatus "$udid" -b >/dev/null
open -a Simulator --args -CurrentDeviceUDID "$udid"
xcrun simctl ui "$udid" appearance light
xcrun simctl status_bar "$udid" override --time 9:41 --batteryState charged --batteryLevel 100 \
  --cellularMode active --cellularBars 4 --wifiBars 3 --dataNetwork wifi

if [ "${SKIP_BUILD:-}" != "1" ]; then
  say "2/4  Building the development build (the first build takes a while)"
  npx expo run:ios --device "$udid" --no-bundler
fi

metro_pid=""
if ! curl -fs "$METRO/status" 2>/dev/null | grep -q running; then
  say "     Starting the dev server (log: $OUT/metro.log)"
  CI=1 npx expo start --dev-client --port 8081 >"$OUT/metro.log" 2>&1 &
  metro_pid=$!
  trap '[ -n "$metro_pid" ] && kill "$metro_pid" 2>/dev/null || true' EXIT
  for _ in $(seq 1 90); do curl -fs "$METRO/status" 2>/dev/null | grep -q running && break; sleep 2; done
  curl -fs "$METRO/status" 2>/dev/null | grep -q running || { echo "Dev server didn't start; see $OUT/metro.log" >&2; exit 1; }
fi
xcrun simctl openurl "$udid" "exp+insight-daily://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"

say "3/4  Sample data"
ask "In the simulator, wait for Insight to open, then tap \"Look around first\". Don't sign in."
xcrun simctl openurl "$udid" "insight://dev/sample-data"
ask "Apple Health, once per simulator (skip if you did it before):
  - Open the simulator's Health app. For each of the last 7 days add Steps (6,000 to 10,500)
    and Sleep (about 7 to 8 hours a night).
  - Back in Insight: Settings > Health & devices > Connect Apple Health, and allow steps and sleep.
  - If a floating developer tools button or a yellow warning shows, hide it
    (Ctrl+Cmd+Z opens the developer menu)."

shot() {
  local file="$OUT/insight-$1.png" w h
  ask "$2"
  xcrun simctl io "$udid" screenshot "$file" >/dev/null
  w=$(sips -g pixelWidth "$file" | awk '/pixelWidth/ {print $2}')
  h=$(sips -g pixelHeight "$file" | awk '/pixelHeight/ {print $2}')
  if [ "${w}x${h}" = "$WANT" ]; then echo "  saved $(basename "$file") (${w}x${h})"
  else echo "  saved $(basename "$file"), but it is ${w}x${h}, not $WANT" >&2; fi
}

say "4/4  The six shots (taken in this order so the logger's extra set doesn't change the others)"
shot 01-home-map     "Home map: Home tab, scrolled to the top, today's contour map with the week of small maps under it."
shot 03-food         "Food: Food tab > log food > Barcode. Type the barcode of a plain, unbranded product (like plain Greek
yogurt), tap look up, add one serving, then go back to the Food tab with the item and kcal left showing."
shot 04-body-map     "Body map: Insights tab > Muscles."
shot 05-insight-score "Insight Score: tap the Insight Score tile on Home. Training, food and recovery all need a number."
shot 06-apple-health "Apple Health: Home > Edit, add the Steps and Sleep duration tiles next to Today's workout and Food,
with all four on screen."
shot 02-logger       "Logger: Workouts tab > start Push day. Enter Bench Press set 1 as 185 lb x 8, tap it done, and
wait until the rest timer shows about 1:30 left."

xcrun simctl status_bar "$udid" clear
say "Done. The six shots are in $OUT, numbered in upload order."
echo "Before uploading: 9:41 and full battery, no developer warnings, no AI summaries, no Routines tab,"
echo "no Oura or Fitbit tiles, no sign-in or email, and nothing real on screen."
open "$OUT"
