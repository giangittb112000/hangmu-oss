#!/bin/sh
set -eu

CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
HERE=$(cd "$(dirname "$0")" && pwd)
PUB="$HERE/../public"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

shot() {
  "$CHROME" --headless --enable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --default-background-color=00000000 --virtual-time-budget=3000 \
    --window-size="$2,$3" --screenshot="$4" "$1" >/dev/null 2>&1
}

shot "file://$HERE/og-image.html" 1200 630 "$PUB/og-image.png"

cat >"$TMP/icon.html" <<EOF
<!doctype html><style>*{margin:0}html,body{background:transparent}</style>
<img src="file://$PUB/favicon.svg" width="512" height="512" style="display:block">
EOF
shot "file://$TMP/icon.html" 512 512 "$TMP/icon-512.png"

cp "$TMP/icon-512.png" "$PUB/icon-512.png"
sips -z 192 192 "$TMP/icon-512.png" --out "$PUB/icon-192.png" >/dev/null
sips -z 180 180 "$TMP/icon-512.png" --out "$PUB/apple-touch-icon.png" >/dev/null
for s in 16 32 48; do sips -z $s $s "$TMP/icon-512.png" --out "$TMP/icon-$s.png" >/dev/null; done

python3 -I - "$TMP" "$PUB/favicon.ico" <<'PY'
import struct, sys
tmp, out = sys.argv[1], sys.argv[2]
imgs = [open(f"{tmp}/icon-{s}.png", "rb").read() for s in (16, 32, 48)]
head = struct.pack("<HHH", 0, 1, len(imgs))
off, dirs = 6 + 16 * len(imgs), b""
for s, data in zip((16, 32, 48), imgs):
    dirs += struct.pack("<BBBBHHII", s, s, 0, 0, 1, 32, len(data), off)
    off += len(data)
open(out, "wb").write(head + dirs + b"".join(imgs))
PY

echo "OK: og-image.png, favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png"
