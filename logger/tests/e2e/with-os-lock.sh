#!/usr/bin/env bash
# Fail-closed loopback-only network namespace for WebKit.
# The Actions runner stays on the host network. Only this process tree moves.
#
#   bash logger/tests/e2e/with-os-lock.sh npm run pw:smoke
#
# If the namespace cannot be created, loopback cannot be brought up, or an
# external TCP connect succeeds, this exits before the command runs.
set -euo pipefail

if [[ "${INSIGHT_NETNS:-}" != "1" ]]; then
  if [[ $# -lt 1 ]]; then
    echo "usage: with-os-lock.sh command [args...]" >&2
    exit 1
  fi
  if ! command -v unshare >/dev/null 2>&1; then
    echo "OS network lock unavailable: unshare is not installed. Refusing to run unprotected." >&2
    exit 1
  fi
  if ! command -v sudo >/dev/null 2>&1 || ! sudo -n true >/dev/null 2>&1; then
    echo "OS network lock unavailable: passwordless sudo is required for unshare --net. Refusing to run unprotected." >&2
    exit 1
  fi
  if ! sudo -n unshare --net true; then
    echo "OS network lock unavailable: sudo unshare --net failed. Refusing to run unprotected." >&2
    exit 1
  fi
  workdir=$PWD
  script=$0
  # sudo's secure_path drops the caller PATH, which hides node. Put it back
  # inside the namespace; HOME is already preserved for the browser cache.
  exec sudo --preserve-env env INSIGHT_NETNS=1 "PATH=$PATH" unshare --net \
    bash -c 'cd "$1" && shift && exec bash "$@"' bash "$workdir" "$script" "$@"
fi

if [[ -z "${SUDO_UID:-}" || -z "${SUDO_GID:-}" ]]; then
  echo "OS network lock unavailable: entered the namespace without sudo credentials. Refusing to run unprotected." >&2
  exit 1
fi
if ! command -v setpriv >/dev/null 2>&1; then
  echo "OS network lock unavailable: setpriv is not installed, so the tests cannot drop root. Refusing to run unprotected." >&2
  exit 1
fi

python3 - <<'PY'
import fcntl, socket, struct, sys

def ifaces():
    names = []
    lines = open("/proc/net/dev", encoding="utf-8").read().splitlines()[2:]
    for line in lines:
        line = line.strip()
        if not line:
            continue
        names.append(line.split(":", 1)[0])
    return names

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
name = b"lo" + b"\x00" * 14
SIOCGIFFLAGS, SIOCSIFFLAGS, IFF_UP = 0x8913, 0x8914, 0x1
buf = struct.pack("16s16s", name, b"\x00" * 16)
res = fcntl.ioctl(sock.fileno(), SIOCGIFFLAGS, buf)
flags = struct.unpack_from("H", res, 16)[0]
if not (flags & IFF_UP):
    updated = bytearray(res)
    struct.pack_into("H", updated, 16, flags | IFF_UP)
    fcntl.ioctl(sock.fileno(), SIOCSIFFLAGS, bytes(updated))

names = ifaces()
if names != ["lo"]:
    sys.stderr.write("OS network lock failed: expected only loopback, found %s\n" % ", ".join(names))
    sys.exit(1)

probe = socket.socket()
probe.settimeout(3)
try:
    probe.connect(("1.1.1.1", 443))
except OSError as err:
    print("OS lock active: connect to 1.1.1.1:443 failed (%s %s)" % (err.errno, err.strerror), flush=True)
else:
    sys.stderr.write("OS network lock failed open: connected to 1.1.1.1:443\n")
    sys.exit(1)
finally:
    probe.close()

local = socket.socket()
try:
    local.bind(("127.0.0.1", 0))
except OSError as err:
    sys.stderr.write("OS network lock failed: loopback is not usable (%s)\n" % err)
    sys.exit(1)
finally:
    local.close()
print("OS lock active: only loopback is present", flush=True)
PY

exec setpriv --reuid="$SUDO_UID" --regid="$SUDO_GID" --init-groups --inh-caps=-all "$@"
