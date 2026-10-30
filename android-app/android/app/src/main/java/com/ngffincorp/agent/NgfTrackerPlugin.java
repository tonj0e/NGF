package com.ngffincorp.agent;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.content.ContentValues;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.util.Base64;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** The bridge the web app uses (window.Capacitor.Plugins.NgfTracker) to start and stop background location sharing. */
@CapacitorPlugin(
    name = "NgfTracker",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "background", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class NgfTrackerPlugin extends Plugin {

    private JSObject status() {
        TrackerPrefs p = new TrackerPrefs(getContext());
        JSObject o = new JSObject();
        o.put("active", p.active());
        o.put("lastSent", p.lastSent());
        o.put("error", p.error());
        o.put("lat", p.lastLat());
        o.put("lng", p.lastLng());
        o.put("location", getPermissionState("location") == PermissionState.GRANTED);
        o.put("background", Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || getPermissionState("background") == PermissionState.GRANTED);
        o.put("notifications", Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED);
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        o.put("batteryUnrestricted", pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        String version = "";
        try { version = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionName; } catch (Exception ignored) { }
        o.put("version", version);
        return o;
    }

    @PluginMethod
    public void status(PluginCall call) { call.resolve(status()); }

    /** Asks, one after the other: location, "all the time" location, notifications. */
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        // notifications first: the "all the time" location step opens the system settings page and may never call back
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") != PermissionState.GRANTED) requestPermissionForAlias("notifications", call, "afterNotifications");
        else afterNotifications(call);
    }

    @PermissionCallback
    private void afterNotifications(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) requestPermissionForAlias("location", call, "afterLocation");
        else afterLocation(call);
    }

    @PermissionCallback
    private void afterLocation(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) { call.resolve(status()); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState("background") != PermissionState.GRANTED) requestPermissionForAlias("background", call, "finished");
        else finished(call);
    }

    @PermissionCallback
    private void finished(PluginCall call) { call.resolve(status()); }

    /** How many saved verifications are waiting for a good network: the service notifies when it has one. */
    @PluginMethod
    public void setPending(PluginCall call) {
        new TrackerPrefs(getContext()).pending(call.getInt("count", 0));
        call.resolve();
    }

    /** Saves a camera photo into the phone's gallery (Pictures/NGF) as a spare copy. */
    @PluginMethod
    public void saveImage(PluginCall call) {
        try {
            byte[] bytes = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
            String name = call.getString("name", "ngf-" + System.currentTimeMillis() + ".jpg");
            if (bytes.length == 0) { call.reject("No image"); return; }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                v.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/NGF");
                Uri uri = getContext().getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                if (uri == null) { call.reject("Could not save"); return; }
                try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) { out.write(bytes); }
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "NGF");
                dir.mkdirs();
                File f = new File(dir, name);
                try (FileOutputStream out = new FileOutputStream(f)) { out.write(bytes); }
                android.media.MediaScannerConnection.scanFile(getContext(), new String[] { f.getAbsolutePath() }, null, null);
            }
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage() == null ? "Could not save" : e.getMessage()); }
    }

    @PluginMethod
    public void start(PluginCall call) {
        String token = call.getString("token", "");
        String baseUrl = call.getString("baseUrl", "");
        if (token.isEmpty() || !baseUrl.startsWith("https://")) { call.reject("A token and an https address are needed"); return; }
        new TrackerPrefs(getContext()).start(token, baseUrl.replaceAll("/+$", ""));
        ContextCompat.startForegroundService(getContext(), new Intent(getContext(), TrackerService.class));
        call.resolve(status());
    }

    @PluginMethod
    public void stop(PluginCall call) {
        new TrackerPrefs(getContext()).stop();
        getContext().stopService(new Intent(getContext(), TrackerService.class));
        call.resolve(status());
    }

    /** Opens the phone's "let this app run in the background" question (some phones stop apps otherwise). */
    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }
}
