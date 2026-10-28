package com.ngffincorp.agent;

import android.content.Context;
import android.content.SharedPreferences;

/** What the tracking service needs to keep going on its own (also after the phone restarts the app). */
final class TrackerPrefs {
    private static final String FILE = "ngf_tracker";
    private final SharedPreferences sp;

    TrackerPrefs(Context c) { sp = c.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE); }

    boolean active() { return sp.getBoolean("active", false); }
    String token() { return sp.getString("token", ""); }
    String baseUrl() { return sp.getString("baseUrl", ""); }
    long lastSent() { return sp.getLong("lastSent", 0); }
    String error() { return sp.getString("error", ""); }
    double lastLat() { return Double.longBitsToDouble(sp.getLong("lat", Double.doubleToLongBits(0))); }
    double lastLng() { return Double.longBitsToDouble(sp.getLong("lng", Double.doubleToLongBits(0))); }

    void start(String token, String baseUrl) {
        sp.edit().putBoolean("active", true).putString("token", token).putString("baseUrl", baseUrl).putString("error", "").apply();
    }
    void stop() { sp.edit().putBoolean("active", false).putString("token", "").apply(); }
    void sent(double lat, double lng) {
        sp.edit().putLong("lastSent", System.currentTimeMillis()).putString("error", "")
            .putLong("lat", Double.doubleToLongBits(lat)).putLong("lng", Double.doubleToLongBits(lng)).apply();
    }
    void error(String e) { sp.edit().putString("error", e == null ? "" : e).apply(); }
}
