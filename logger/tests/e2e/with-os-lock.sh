#!/usr/bin/env bash
# Fail-closed loopback-only network namespace for WebKit.
# The Actions runner stays on the host network. Only this process tree moves.
#
#   bash logger/tests/e2e/with-os-lock.sh npm run pw:smoke
#
# If the namespace cannot be created, loopback cannot be brought up, or an
# external TCP connect succeeds, this exits before the command runs.
set -euo pipefail
# A caller can export a hostile IFS. Reset it before any word splitting.
IFS=$' \t\n'

# sudo-rs ignores a bare --preserve-env. Re-apply only what the smoke run
# needs. LD_PRELOAD, LD_LIBRARY_PATH, BASH_ENV, ENV, IFS, SHELLOPTS, and
# BASH_FUNC_* must not cross the boundary. Neither may SUDO_*: sudo sets
# those, and a caller's SUDO_UID=0 or SUDO_GID=0 would make setpriv stay root.
copy_var() {
  local name=$1
  if [[ -v $name ]]; then
    printf 'export %s=%q\n' "$name" "${!name}"
  fi
}

write_allowlist() {
  local name
  : >"$1"
  chmod 600 "$1"
  {
    copy_var HOME
    copy_var PATH
    copy_var CI
    copy_var GITHUB_ACTIONS
    copy_var LANG
    copy_var LC_ALL
    copy_var LC_CTYPE
    copy_var TMPDIR
    copy_var PLAYWRIGHT_BROWSERS_PATH
    copy_var INSIGHT_TEST_PORT
    copy_var TEAM_SHOTS
    while IFS= read -r name; do
      case "$name" in
        PW_*|npm_*) copy_var "$name" ;;
      esac
    done < <(compgen -e)
  } >"$1"
}

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
  expected_home=${HOME-}
  if [[ -z "$expected_home" || "$expected_home" != /* ]]; then
    echo "OS network lock failed: HOME must be a non-empty absolute path (got '${expected_home}')." >&2
    exit 1
  fi
  if [[ -z "${PATH:-}" ]]; then
    echo "OS network lock failed: PATH is empty." >&2
    exit 1
  fi
  env_file=$(mktemp)
  chmod 600 "$env_file"
  cleanup_env() { rm -f "$env_file"; }
  trap cleanup_env EXIT
  write_allowlist "$env_file"
  # Do not exec. sudo replaces this shell, and an EXIT trap would not run,
  # leaving the snapshot in /tmp. sudo also closes file descriptors above 2,
  # so the snapshot cannot be handed across on an inherited fd.
  sudo unshare --net \
    bash -c 'set -euo pipefail
      lock_env=$1
      expected_home=$2
      saved_sudo_uid=${SUDO_UID-}
      saved_sudo_gid=${SUDO_GID-}
      saved_sudo_user=${SUDO_USER-}
      saved_sudo_command=${SUDO_COMMAND-}
      workdir=$3
      shift 3
      # Not in a conditional: set -e applies to every line of the snapshot,
      # not only the last assignment.
      source "$lock_env"
      rm -f "$lock_env"
      # Restore the credentials from this sudo. The snapshot must not win.
      export SUDO_UID="$saved_sudo_uid"
      export SUDO_GID="$saved_sudo_gid"
      export SUDO_USER="$saved_sudo_user"
      export SUDO_COMMAND="$saved_sudo_command"
      export INSIGHT_NETNS=1
      export INSIGHT_LOCK_HOME="$expected_home"
      cd "$workdir"
      exec bash "$@"' \
    bash "$env_file" "$expected_home" "$workdir" "$script" "$@"
  exit $?
fi

if [[ -z "${SUDO_UID:-}" || -z "${SUDO_GID:-}" ]]; then
  echo "OS network lock unavailable: entered the namespace without sudo credentials. Refusing to run unprotected." >&2
  exit 1
fi
if ! command -v setpriv >/dev/null 2>&1; then
  echo "OS network lock unavailable: setpriv is not installed, so the tests cannot drop root. Refusing to run unprotected." >&2
  exit 1
fi
if [[ "${SUDO_UID}" == "0" || "${SUDO_GID}" == "0" ]]; then
  echo "OS network lock failed: refusing to run the command as root." >&2
  exit 1
fi
if [[ -z "${INSIGHT_LOCK_HOME:-}" || "$INSIGHT_LOCK_HOME" != /* || "${HOME:-}" != "$INSIGHT_LOCK_HOME" ]]; then
  echo "OS network lock failed: HOME is '${HOME:-}' (expected '${INSIGHT_LOCK_HOME:-}'). Playwright would miss its browser cache. Refusing to run." >&2
  exit 1
fi
unset INSIGHT_LOCK_HOME

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
