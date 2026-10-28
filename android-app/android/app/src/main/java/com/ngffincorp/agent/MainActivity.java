package com.ngffincorp.agent;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NgfTrackerPlugin.class);
        super.onCreate(savedInstanceState);
        TrackerService.startIfActive(this);   // opening the app brings the tracker back if the day is still open
    }
}
