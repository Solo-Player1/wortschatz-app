#!/bin/bash
# Builds the signed release APK  ->  dist/Wortschatz-v<version>.apk
# Usage (Git Bash):  bash tools/build_apk.sh        (or double-click tools\build_apk.cmd)
# Needs the portable toolchain installed by C:\Users\abdel\AndroidDev\install.sh (JDK 21 + Android SDK).
# The first run downloads Gradle (~150 MB) and the Android dependencies: several minutes, needs internet.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

DEV_ROOT="/c/Users/abdel/AndroidDev"
export JAVA_HOME='C:\Users\abdel\AndroidDev\jdk21'
export ANDROID_HOME='C:\Users\abdel\AndroidDev\sdk'
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$DEV_ROOT/jdk21/bin:$DEV_ROOT/sdk/platform-tools:$DEV_ROOT/sdk/cmdline-tools/latest/bin:$PATH"

if [ ! -x "$DEV_ROOT/jdk21/bin/java.exe" ]; then
  echo "ERROR: JDK 21 not found at $JAVA_HOME"
  echo "       run: bash $DEV_ROOT/install.sh   and wait until it prints DONE"
  exit 1
fi
if [ ! -d "$DEV_ROOT/sdk/platforms" ]; then
  echo "ERROR: Android SDK platforms not found under $ANDROID_HOME"
  echo "       run: bash $DEV_ROOT/install.sh   and wait until it prints DONE"
  exit 1
fi

VERSION="$(node -p "require('./package.json').version" 2>/dev/null)"
[ -n "$VERSION" ] || VERSION="0.0.0"
echo "== Wortschatz v$VERSION =="

# 1) android/local.properties (escaped Windows path, the format Gradle expects)
echo 'sdk.dir=C\:\\Users\\abdel\\AndroidDev\\sdk' > android/local.properties

# 2) release keystore (no-op if it already exists)
bash "$ROOT/tools/make_keystore.sh" || exit 1

# 3) copy www/ into the native project + update plugins
echo "== npx cap sync android"
npx cap sync android || { echo "ERROR: cap sync failed"; exit 1; }

# 4) gradle (sh wrapper first, gradlew.bat as fallback on Windows)
echo "== gradle assembleRelease (first run downloads Gradle + dependencies, be patient)"
cd android || exit 1
if ! ./gradlew assembleRelease --no-daemon --console=plain; then
  echo "== gradlew (sh) failed, retrying with gradlew.bat"
  cmd //c gradlew.bat assembleRelease --no-daemon --console=plain || { echo "ERROR: gradle build failed"; exit 1; }
fi
cd "$ROOT" || exit 1

# 5) collect the APK
APK="android/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK" ]; then
  APK="android/app/build/outputs/apk/release/app-release-unsigned.apk"
  [ -f "$APK" ] && echo "WARNING: APK is UNSIGNED (keystore missing) - it will not install on a phone"
fi
[ -f "$APK" ] || { echo "ERROR: no APK produced"; exit 1; }
mkdir -p dist
OUT="dist/Wortschatz-v$VERSION.apk"
cp -f "$APK" "$OUT" || exit 1
SIZE="$(du -h "$OUT" | cut -f1)"
echo "== APK ready: $(cygpath -w "$ROOT/$OUT" 2>/dev/null || echo "$ROOT/$OUT") ($SIZE)"

# 6) snapshot of www/ inside this APK (base for in-app web updates: tools/web_update.py make)
python -X utf8 tools/web_update.py baseline || echo "WARNING: web baseline not written"
