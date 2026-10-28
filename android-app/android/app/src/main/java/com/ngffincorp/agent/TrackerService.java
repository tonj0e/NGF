package com.ngffincorp.agent;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Keeps sharing the agent's live location with the office while the app is closed or the phone is locked,
 * until the day is punched out. Runs as a foreground service (the permanent "NGF tracking is on" notification
 * is Android's rule for that). It posts to the same /api/agent/location the web app uses.
 */
public class TrackerService extends Service implements LocationListener {
    static final String CHANNEL = "ngf_tracking";
    private static final int NOTIFICATION_ID = 4711;
    private static final long INTERVAL_MS = 10_000;
    private static final long MIN_POST_GAP_MS = 8_000;

    private LocationManager lm;
    private TrackerPrefs prefs;
    private final ExecutorService net = Executors.newSingleThreadExecutor();
    private long lastPost = 0;
    private long lastGpsFix = 0;
    private Location previous;

    static void startIfActive(Context c) {
        if (new TrackerPrefs(c).active()) ContextCompat.startForegroundService(c, new Intent(c, TrackerService.class));
    }

    @Override public void onCreate() {
        super.onCreate();
        prefs = new TrackerPrefs(this);
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (!prefs.active() || prefs.token().isEmpty()) { stopSelf(); return START_NOT_STICKY; }
        showForeground();
        listen();
        return START_STICKY;   // if the phone ends the service, it brings it back by itself
    }

    private void showForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Location sharing", NotificationManager.IMPORTANCE_LOW));
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int piFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle("NGF tracking is on")
            .setContentText("Your location is shared until you punch out.")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setContentIntent(PendingIntent.getActivity(this, 0, open, piFlags))
            .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        else startForeground(NOTIFICATION_ID, n);
    }

    private void listen() {
        try {
            lm.removeUpdates(this);
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                prefs.error("Location permission is missing. Open the app and allow location all the time.");
                return;
            }
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, INTERVAL_MS, 0f, this, Looper.getMainLooper());
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, INTERVAL_MS, 0f, this, Looper.getMainLooper());
            if (!lm.isProviderEnabled(LocationManager.GPS_PROVIDER) && !lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) prefs.error("Phone location is switched off. Turn on Location in the phone settings.");
        } catch (SecurityException e) {
            prefs.error("Location permission is missing. Open the app and allow location all the time.");
        }
    }

    @Override public void onLocationChanged(Location loc) {
        long now = System.currentTimeMillis();
        boolean gps = LocationManager.GPS_PROVIDER.equals(loc.getProvider());
        if (gps) lastGpsFix = now;
        else if (now - lastGpsFix < 25_000) return;        // a recent GPS fix is better than a network guess
        if (now - lastPost < MIN_POST_GAP_MS) return;
        lastPost = now;
        float speed = loc.hasSpeed() ? loc.getSpeed() : 0f;
        float heading = loc.hasBearing() ? loc.getBearing() : (previous != null ? previous.bearingTo(loc) : 0f);
        previous = loc;
        final double lat = loc.getLatitude(), lng = loc.getLongitude();
        final float acc = loc.hasAccuracy() ? loc.getAccuracy() : 0f;
        final float spd = speed, hdg = heading < 0 ? heading + 360f : heading;
        net.execute(() -> post(lat, lng, acc, spd, hdg, now));
    }

    private void post(double lat, double lng, float acc, float speed, float heading, long ts) {
        HttpURLConnection c = null;
        try {
            JSONObject b = new JSONObject();
            b.put("latitude", lat); b.put("longitude", lng); b.put("accuracy", acc);
            b.put("speed", speed); b.put("heading", heading); b.put("timestamp", ts);
            c = (HttpURLConnection) new URL(prefs.baseUrl() + "/api/agent/location").openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(10_000); c.setReadTimeout(15_000);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Authorization", "Bearer " + prefs.token());
            c.setDoOutput(true);
            try (OutputStream os = c.getOutputStream()) { os.write(b.toString().getBytes(StandardCharsets.UTF_8)); }
            int code = c.getResponseCode();
            if (code == 200) prefs.sent(lat, lng);
            else if (code == 409) { prefs.error("Day closed"); endTracking(); }               // punched out (maybe elsewhere) or no attendance
            else if (code == 401) { prefs.error("Signed out. Open the app and sign in again."); endTracking(); }
            else prefs.error("Server answered " + code);
        } catch (Exception e) {
            prefs.error("No internet. Will keep trying.");
        } finally { if (c != null) c.disconnect(); }
    }

    private void endTracking() {
        prefs.stop();
        try { lm.removeUpdates(this); } catch (Exception ignored) { }
        stopForeground(true);
        stopSelf();
    }

    @Override public void onProviderEnabled(String p) { listen(); }
    @Override public void onProviderDisabled(String p) { }
    @Override @SuppressWarnings("deprecation") public void onStatusChanged(String p, int s, Bundle e) { }
    @Override public IBinder onBind(Intent i) { return null; }

    @Override public void onDestroy() {
        try { lm.removeUpdates(this); } catch (Exception ignored) { }
        net.shutdown();
        super.onDestroy();
    }
}
