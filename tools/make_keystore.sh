#!/bin/bash
# Creates the release keystore android/keystore/wortschatz.jks (idempotent: does nothing if it exists).
# The password is read from android/keystore.properties (generated here if missing and mirrored
# into android/keystore/PASSWORD.txt). Needs keytool from the portable JDK 21:
#   C:\Users\abdel\AndroidDev\jdk21   (installed by C:\Users\abdel\AndroidDev\install.sh)
# Usage (Git Bash):  bash tools/make_keystore.sh
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KS_DIR="$ROOT/android/keystore"
KS="$KS_DIR/wortschatz.jks"
PROPS="$ROOT/android/keystore.properties"
ALIAS="wortschatz"

if [ -f "$KS" ]; then
  echo "keystore already exists: $KS"
  exit 0
fi

# locate keytool: portable JDK first, then JAVA_HOME, then PATH
KEYTOOL=""
CANDIDATES=("/c/Users/abdel/AndroidDev/jdk21/bin/keytool.exe")
if [ -n "${JAVA_HOME:-}" ]; then
  JH="$(cygpath -u "$JAVA_HOME" 2>/dev/null || echo "$JAVA_HOME")"
  CANDIDATES+=("$JH/bin/keytool.exe" "$JH/bin/keytool")
fi
CANDIDATES+=("$(command -v keytool 2>/dev/null || true)")
for c in "${CANDIDATES[@]}"; do
  if [ -n "$c" ] && [ -x "$c" ]; then KEYTOOL="$c"; break; fi
done
if [ -z "$KEYTOOL" ]; then
  echo "ERROR: keytool not found (JDK 21 is not installed yet)."
  echo "       run: bash /c/Users/abdel/AndroidDev/install.sh   and wait until it prints DONE, then retry."
  exit 1
fi

mkdir -p "$KS_DIR"

# password: keep the existing one, otherwise generate a random one (letters + digits only)
if ! grep -q '^storePassword=' "$PROPS" 2>/dev/null; then
  PW="$(python -c "import secrets,string;print(''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(24)))" 2>/dev/null || true)"
  [ -n "$PW" ] || PW="$(head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"
  printf 'storeFile=keystore/wortschatz.jks\nstorePassword=%s\nkeyAlias=%s\nkeyPassword=%s\n' "$PW" "$ALIAS" "$PW" > "$PROPS"
  printf 'Wortschatz release keystore - DO NOT LOSE THIS FOLDER (back it up somewhere safe, never share it)\nfile     : android/keystore/wortschatz.jks\nalias    : %s\npassword : %s   (store password = key password)\n\nUsed by android/keystore.properties and tools/build_apk.sh / tools/build_apk.cmd.\nAn update APK must be signed with this exact keystore, otherwise Android refuses to install it over the old version.\n' "$ALIAS" "$PW" > "$KS_DIR/PASSWORD.txt"
  echo "generated a new password -> $KS_DIR/PASSWORD.txt"
fi
PW="$(grep '^storePassword=' "$PROPS" | head -1 | cut -d= -f2- | tr -d '\r\n')"
A="$(grep '^keyAlias=' "$PROPS" | head -1 | cut -d= -f2- | tr -d '\r\n')"
[ -n "$A" ] && ALIAS="$A"
if [ -z "$PW" ]; then
  echo "ERROR: storePassword is empty in $PROPS"
  exit 1
fi

KS_WIN="$(cygpath -w "$KS" 2>/dev/null || echo "$KS")"
echo "creating keystore: $KS_WIN (alias $ALIAS, valid ~27 years)"
"$KEYTOOL" -genkeypair -v -keystore "$KS_WIN" -storetype PKCS12 \
  -alias "$ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$PW" -keypass "$PW" \
  -dname "CN=Wortschatz, OU=Mobile, O=Abdullah, L=Cairo, ST=Cairo, C=EG" \
  || { echo "ERROR: keytool failed"; exit 1; }
echo "keystore created: $KS_WIN"
echo "password saved in: $KS_DIR/PASSWORD.txt  (back up the whole android/keystore folder!)"
