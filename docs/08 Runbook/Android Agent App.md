# Android agent app (NGF)

**What it is:** a small Android app (folder `android-app/`, Capacitor) that opens ngffincorp.com inside it and keeps sharing the agent's live location with the phone locked or the app closed, from attendance until punch-out. iPhone agents keep using the web app added to the home screen (no app for iOS).

**How it works**
- Native service `TrackerService` (foreground service, permanent notification "NGF tracking is on") reads GPS every 10 s and POSTs to `/api/agent/location` itself (same API as the web app). Stops by itself when the server answers 409 (punched out / no attendance) or 401 (signed out).
- The web app talks to it through `window.Capacitor.Plugins.NgfTracker` (see `lib/agentTracker.ts`: `nativeTracker()`); inside the app the web `watchPosition` is not used. Methods: `requestPermissions`, `start`, `stop`, `status`, `openBatterySettings`, `openAppSettings`.
- Restarts after the phone reboots (`BootReceiver`) and when the app is opened.
- Screens come from the live website, so normal updates need NO new app. A new app file is only needed when the native code changes.

**Download:** agents on an Android browser see a "Get the NGF app" banner on their home screen (`components/agent/AppDownload.tsx`) and "Download Android app" in the profile menu. File: `public/downloads/ngf-agent.apk` (served as a download by `next.config.ts`). First install: allow "install unknown apps" for the browser, open the app, sign in, choose location "Allow all the time", allow notifications, and "Allow running in background" (battery).

**Building a new app file:** `android-app/build.sh` (needs `brew install openjdk@21` and `brew install --cask android-commandlinetools` plus the SDK 35 packages). It signs the app and copies it to `public/downloads/ngf-agent.apk`. Raise `versionCode`/`versionName` in `android-app/android/app/build.gradle` for every new release, otherwise phones will not update over the old one.

**Signing key (important):** created once in `~/ngf-android-keystore/` on the owner's Mac, outside the project and never in git. BACK THIS FOLDER UP. Without the same key phones cannot update the app in place (agents would have to uninstall and reinstall).

**Gradle note:** `android/gradle.properties` has the file watcher, parallel mode and daemon switched off, because the build froze on this Mac without that.

**Limits:** some phone brands (Xiaomi, Oppo, Vivo, Realme) close background apps aggressively; the app asks for the battery exemption, and on those brands the agent may also need to lock the app in Recent apps. Not tested on a real phone yet.
