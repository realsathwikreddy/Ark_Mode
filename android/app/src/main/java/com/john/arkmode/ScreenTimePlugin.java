package com.john.arkmode;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

// Reads how long each app was in the foreground, using Android's Usage Access.
@CapacitorPlugin(name = "ScreenTime")
public class ScreenTimePlugin extends Plugin {

    private boolean granted() {
        Context ctx = getContext();
        AppOpsManager ops = (AppOpsManager) ctx.getSystemService(Context.APP_OPS_SERVICE);
        int mode;
        if (Build.VERSION.SDK_INT >= 29) {
            mode = ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName());
        } else {
            mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName());
        }
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    @PluginMethod
    public void hasPermission(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", granted());
        call.resolve(r);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    private String labelOf(PackageManager pm, String pkg) {
        try {
            ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
            return pm.getApplicationLabel(ai).toString();
        } catch (Exception e) {
            return pkg;
        }
    }

    private int categoryOf(PackageManager pm, String pkg) {
        if (Build.VERSION.SDK_INT < 26) return -1;
        try {
            return pm.getApplicationInfo(pkg, 0).category;
        } catch (Exception e) {
            return -1;
        }
    }

    @PluginMethod
    public void usage(PluginCall call) {
        if (!granted()) {
            call.reject("Usage access not granted");
            return;
        }
        long from = call.getLong("from", 0L);
        long to = call.getLong("to", System.currentTimeMillis());
        Context ctx = getContext();
        UsageStatsManager usm = (UsageStatsManager) ctx.getSystemService(Context.USAGE_STATS_SERVICE);
        PackageManager pm = ctx.getPackageManager();
        String self = ctx.getPackageName();

        // Start a little earlier so an app already open at `from` is counted from `from`.
        UsageEvents events = usm.queryEvents(from - 6 * 3600000L, to);
        Map<String, Long> openSince = new HashMap<>();
        Map<String, Long> total = new HashMap<>();
        int pickups = 0;
        UsageEvents.Event e = new UsageEvents.Event();
        while (events.hasNextEvent()) {
            events.getNextEvent(e);
            String pkg = e.getPackageName();
            long t = e.getTimeStamp();
            int type = e.getEventType();
            if (type == 1) { // resumed / moved to foreground
                openSince.put(pkg, t);
            } else if (type == 2) { // paused / moved to background
                Long s = openSince.remove(pkg);
                if (s != null) add(total, pkg, Math.max(s, from), Math.min(t, to));
            } else if (type == 18 && t >= from && t <= to) { // keyguard hidden = phone unlocked
                pickups++;
            }
        }
        long now = Math.min(to, System.currentTimeMillis());
        for (Map.Entry<String, Long> o : openSince.entrySet()) {
            add(total, o.getKey(), Math.max(o.getValue(), from), now);
        }

        JSArray apps = new JSArray();
        for (Map.Entry<String, Long> en : total.entrySet()) {
            String pkg = en.getKey();
            if (pkg.equals(self) || en.getValue() < 1000) continue;
            if (pm.getLaunchIntentForPackage(pkg) == null) continue; // skip launchers and system services
            JSObject a = new JSObject();
            a.put("pkg", pkg);
            a.put("label", labelOf(pm, pkg));
            a.put("ms", en.getValue());
            a.put("category", categoryOf(pm, pkg));
            apps.put(a);
        }
        JSObject r = new JSObject();
        r.put("apps", apps);
        r.put("pickups", pickups);
        call.resolve(r);
    }

    private void add(Map<String, Long> m, String pkg, long s, long e) {
        if (e <= s) return;
        Long cur = m.get(pkg);
        m.put(pkg, (cur == null ? 0L : cur) + (e - s));
    }

    @PluginMethod
    public void apps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Intent main = new Intent(Intent.ACTION_MAIN);
        main.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> list = pm.queryIntentActivities(main, 0);
        Set<String> seen = new HashSet<>();
        JSArray out = new JSArray();
        for (ResolveInfo ri : list) {
            String pkg = ri.activityInfo.packageName;
            if (!seen.add(pkg) || pkg.equals(getContext().getPackageName())) continue;
            JSObject a = new JSObject();
            a.put("pkg", pkg);
            a.put("label", ri.loadLabel(pm).toString());
            a.put("category", categoryOf(pm, pkg));
            out.put(a);
        }
        JSObject r = new JSObject();
        r.put("apps", out);
        call.resolve(r);
    }
}
