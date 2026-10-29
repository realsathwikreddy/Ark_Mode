package com.john.arkmode;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import java.util.Calendar;
import java.util.Locale;

// Home-screen widget: level, health, dailies left today, and this week's boss.
public class ArkWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "ark_widget";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            mgr.updateAppWidget(id, build(ctx));
        }
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, ArkWidgetProvider.class));
        for (int id : ids) {
            mgr.updateAppWidget(id, build(ctx));
        }
    }

    // Same rule as the app: before the day-start hour still counts as yesterday.
    static String appDay(int dayStart) {
        Calendar c = Calendar.getInstance();
        c.add(Calendar.HOUR_OF_DAY, -dayStart);
        return String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    static RemoteViews build(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.ark_widget);

        int hp = p.getInt("hp", 50);
        int hpMax = Math.max(1, p.getInt("hpMax", 50));
        int exp = p.getInt("exp", 0);
        int expMax = Math.max(1, p.getInt("expMax", 150));

        v.setTextViewText(R.id.w_level, String.valueOf(p.getInt("lvl", 1)));
        v.setTextViewText(R.id.w_gold, p.getString("gold", "0.0"));
        v.setTextViewText(R.id.w_hp_text, hp + " / " + hpMax);
        v.setProgressBar(R.id.w_hp, hpMax, hp, false);
        v.setProgressBar(R.id.w_xp, expMax, exp, false);

        String saved = p.getString("day", "");
        boolean stale = saved.length() > 0 && !saved.equals(appDay(p.getInt("dayStart", 3)));
        String dailies;
        if (saved.length() == 0) {
            dailies = "Open Ark Mode to sync";
        } else if (p.getBoolean("rest", false)) {
            dailies = "Resting, dailies paused";
        } else if (stale) {
            dailies = "New day: open Ark Mode";
        } else {
            int left = p.getInt("dailiesLeft", 0);
            int total = p.getInt("dailiesTotal", 0);
            dailies = total == 0 ? "No dailies due today" : left == 0 ? "All dailies done" : left + (left == 1 ? " daily left" : " dailies left");
        }
        v.setTextViewText(R.id.w_dailies, dailies);

        String title = p.getString("title", "");
        v.setTextViewText(R.id.w_title, title);
        String nowLine = stale ? "" : p.getString("nowLine", "");
        v.setViewVisibility(R.id.w_now, nowLine.length() > 0 ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_now, nowLine);

        Intent add = new Intent(Intent.ACTION_VIEW, Uri.parse("arkmode://add"));
        add.setPackage(ctx.getPackageName());
        add.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent addPi = PendingIntent.getActivity(ctx, 1, add, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.w_add, addPi);

        boolean hasBoss = p.getBoolean("hasBoss", false);
        v.setViewVisibility(R.id.w_boss_box, hasBoss ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.w_no_boss, hasBoss ? View.GONE : View.VISIBLE);
        if (hasBoss) {
            int bhp = p.getInt("bossHp", 0);
            int bmax = Math.max(1, p.getInt("bossMax", 1));
            v.setTextViewText(R.id.w_boss_name, p.getString("bossName", ""));
            v.setTextViewText(R.id.w_boss_hp, bhp + " / " + bmax);
            v.setProgressBar(R.id.w_boss_bar, bmax, bhp, false);
        }

        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.w_root, pi);
        return v;
    }
}
