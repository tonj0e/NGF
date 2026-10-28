package com.ngffincorp.agent;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** After the phone restarts, resume sharing if the agent had not punched out. */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            try { TrackerService.startIfActive(context); } catch (Exception ignored) { }
        }
    }
}
