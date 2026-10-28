#!/bin/bash
# Builds the signed NGF Agent Android app and puts it where the website serves it (public/downloads/ngf-agent.apk).
# Needs Java 17 and the Android command-line tools (brew install openjdk@21 ; brew install --cask android-commandlinetools).
set -e
cd "$(dirname "$0")"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}"
export PATH="$JAVA_HOME/bin:$PATH"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

KEYDIR="$HOME/ngf-android-keystore"
if [ ! -f "$KEYDIR/ngf-agent.jks" ]; then
  # First build only: make the signing key. KEEP A BACKUP of this folder: without the same key, phones cannot update the app in place.
  mkdir -p "$KEYDIR"
  PASS=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)
  keytool -genkeypair -v -keystore "$KEYDIR/ngf-agent.jks" -alias ngfagent -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$PASS" -keypass "$PASS" -dname "CN=NGF FINCORP, O=NGF FINCORP, C=IN" >/dev/null 2>&1
  printf 'alias=ngfagent\npassword=%s\n' "$PASS" > "$KEYDIR/keystore.properties"
  chmod 600 "$KEYDIR/keystore.properties" "$KEYDIR/ngf-agent.jks"
  echo "Created the signing key in $KEYDIR (back this folder up)."
fi

npx cap sync android
( cd android && ./gradlew assembleRelease )
mkdir -p ../public/downloads
cp android/app/build/outputs/apk/release/app-release.apk ../public/downloads/ngf-agent.apk
ls -la ../public/downloads/ngf-agent.apk
