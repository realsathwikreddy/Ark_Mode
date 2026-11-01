package com.john.arkmode;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.TimeUnit;

// Lets the app tell the background checker what Sathwik cares about, and starts it.
@CapacitorPlugin(name = "FeedBridge")
public class FeedBridgePlugin extends Plugin {

    @PluginMethod
    public void configure(PluginCall call) {
        SharedPreferences.Editor e = getContext().getSharedPreferences(FeedWorker.PREFS, Context.MODE_PRIVATE).edit();
        e.putBoolean("enabled", Boolean.TRUE.equals(call.getBoolean("enabled", true)));
        e.putString("cats", call.getString("cats", "hackathon,ai,music,internship,jee"));
        e.putString("places", call.getString("places", "online,hyderabad,india,international"));
        String seen = call.getString("seen", null);
        if (seen != null) e.putString("seen", seen);
        e.apply();
        call.resolve();
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        Constraints c = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(FeedWorker.class, 4, TimeUnit.HOURS)
            .setConstraints(c)
            .setInitialDelay(20, TimeUnit.MINUTES)
            .build();
        WorkManager.getInstance(getContext()).enqueueUniquePeriodicWork("ark-feed", ExistingPeriodicWorkPolicy.KEEP, req);
        call.resolve();
    }

    @PluginMethod
    public void runNow(PluginCall call) {
        Constraints c = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        WorkManager.getInstance(getContext()).enqueue(new OneTimeWorkRequest.Builder(FeedWorker.class).setConstraints(c).build());
        call.resolve();
    }

    // Unread count the worker collected while the app was closed; reading it resets it.
    @PluginMethod
    public void takePending(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences(FeedWorker.PREFS, Context.MODE_PRIVATE);
        int n = p.getInt("pending", 0);
        p.edit().putInt("pending", 0).apply();
        JSObject r = new JSObject();
        r.put("pending", n);
        call.resolve(r);
    }
}
