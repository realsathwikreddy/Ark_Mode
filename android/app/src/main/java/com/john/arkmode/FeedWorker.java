package com.john.arkmode;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

// Runs every few hours, even with the app closed: checks the opportunities feed
// and whether a new APK is out, and posts notifications for anything new.
public class FeedWorker extends Worker {
    static final String PREFS = "ark_feed";
    static final String BASE = "https://raw.githubusercontent.com/realsathwikreddy/Ark_Mode_Updates/main/";
    static final String CH_OPPS = "ark_opps";
    static final String CH_UPD = "ark_update";

    public FeedWorker(@NonNull Context ctx, @NonNull WorkerParameters params) {
        super(ctx, params);
    }

    static String fetch(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url + "?t=" + System.currentTimeMillis()).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setRequestProperty("Cache-Control", "no-cache");
        BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) sb.append(line).append('\n');
        r.close();
        return sb.toString();
    }

    static void channels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CH_OPPS, "Opportunities", NotificationManager.IMPORTANCE_DEFAULT));
        nm.createNotificationChannel(new NotificationChannel(CH_UPD, "App updates", NotificationManager.IMPORTANCE_DEFAULT));
    }

    static PendingIntent open(Context ctx, String uri, int code) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
        i.setPackage(ctx.getPackageName());
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        channels(ctx);
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        boolean canPost = Build.VERSION.SDK_INT < 33 || nm.areNotificationsEnabled();

        // 1. App update (new APK)
        try {
            JSONObject v = new JSONObject(fetch(BASE + "version.json"));
            int apk = v.optInt("apkVersionCode", 0);
            PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            long mine = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
            int told = p.getInt("toldApk", 0);
            if (apk > mine && apk > told && canPost) {
                NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CH_UPD)
                    .setSmallIcon(R.drawable.ic_stat_arkmode)
                    .setContentTitle("Ark Mode update ready")
                    .setContentText("A new version needs one tap to install.")
                    .setContentIntent(open(ctx, "arkmode://update", 50))
                    .setAutoCancel(true);
                nm.notify(9001, b.build());
                p.edit().putInt("toldApk", apk).apply();
            }
        } catch (Exception ignored) {}

        // 2. Opportunities
        if (!p.getBoolean("enabled", true)) return Result.success();
        try {
            JSONObject feed = new JSONObject(fetch(BASE + "feed.json"));
            JSONArray items = feed.getJSONArray("items");
            Set<String> cats = new HashSet<>(splitCsv(p.getString("cats", "hackathon,ai,music,internship,jee")));
            Set<String> places = new HashSet<>(splitCsv(p.getString("places", "online,hyderabad,india,international")));
            Set<String> seen = new HashSet<>(splitCsv(p.getString("seen", "")));
            boolean first = seen.isEmpty();
            List<JSONObject> fresh = new ArrayList<>();
            for (int i = 0; i < items.length(); i++) {
                JSONObject it = items.getJSONObject(i);
                String id = it.optString("id");
                if (seen.contains(id)) continue;
                seen.add(id);
                if (!cats.contains(it.optString("cat")) || !places.contains(it.optString("place"))) continue;
                if (it.optBoolean("news") && !cats.contains("jee") && "jee".equals(it.optString("cat"))) continue;
                fresh.add(it);
            }
            // Keep the seen list bounded
            List<String> trimmed = new ArrayList<>(seen);
            if (trimmed.size() > 800) trimmed = trimmed.subList(trimmed.size() - 800, trimmed.size());
            p.edit().putString("seen", String.join(",", trimmed)).putInt("pending", p.getInt("pending", 0) + (first ? 0 : fresh.size())).apply();

            if (first || fresh.isEmpty() || !canPost) return Result.success();
            int shown = 0;
            for (JSONObject it : fresh) {
                if (shown >= 3) break;
                String where = it.optString("place");
                String sub = it.optString("source") + (where.length() > 0 ? " · " + label(where) : "") + (it.optBoolean("funded") ? " · travel paid" : "");
                NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CH_OPPS)
                    .setSmallIcon(R.drawable.ic_stat_arkmode)
                    .setContentTitle(catName(it.optString("cat")) + ": " + it.optString("title"))
                    .setContentText(sub)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(sub + (it.optString("when").length() > 0 ? "\n" + it.optString("when") : "")))
                    .setContentIntent(open(ctx, "arkmode://radar", 60 + shown))
                    .setGroup("opps")
                    .setAutoCancel(true);
                nm.notify(9100 + (Math.abs(it.optString("id").hashCode()) % 800), b.build());
                shown++;
            }
            if (fresh.size() > 3) {
                NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CH_OPPS)
                    .setSmallIcon(R.drawable.ic_stat_arkmode)
                    .setContentTitle(fresh.size() + " new opportunities")
                    .setContentText("Open Radar in Ark Mode to see them all.")
                    .setContentIntent(open(ctx, "arkmode://radar", 70))
                    .setGroup("opps").setGroupSummary(true)
                    .setAutoCancel(true);
                nm.notify(9099, b.build());
            }
        } catch (Exception e) {
            return Result.retry();
        }
        return Result.success();
    }

    static List<String> splitCsv(String s) {
        List<String> out = new ArrayList<>();
        for (String x : s.split(",")) if (x.trim().length() > 0) out.add(x.trim());
        return out;
    }

    static String catName(String c) {
        switch (c) {
            case "hackathon": return "Hackathon";
            case "ai": return "AI";
            case "music": return "Music";
            case "internship": return "Internship";
            case "jee": return "JEE news";
            default: return "New";
        }
    }

    static String label(String place) {
        switch (place) {
            case "online": return "Online";
            case "hyderabad": return "Hyderabad";
            case "india": return "India";
            default: return "Abroad";
        }
    }
}
