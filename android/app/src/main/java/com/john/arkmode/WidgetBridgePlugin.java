package com.john.arkmode;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Receives a snapshot of the app state from JavaScript and redraws the home-screen widget.
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences.Editor e = ctx.getSharedPreferences(ArkWidgetProvider.PREFS, Context.MODE_PRIVATE).edit();
        e.putInt("lvl", call.getInt("lvl", 1));
        e.putInt("hp", call.getInt("hp", 50));
        e.putInt("hpMax", call.getInt("hpMax", 50));
        e.putInt("exp", call.getInt("exp", 0));
        e.putInt("expMax", call.getInt("expMax", 150));
        e.putString("gold", call.getString("gold", "0.0"));
        e.putInt("dailiesLeft", call.getInt("dailiesLeft", 0));
        e.putInt("dailiesTotal", call.getInt("dailiesTotal", 0));
        e.putString("day", call.getString("day", ""));
        e.putInt("dayStart", call.getInt("dayStart", 3));
        e.putBoolean("rest", Boolean.TRUE.equals(call.getBoolean("rest", false)));
        e.putBoolean("hasBoss", Boolean.TRUE.equals(call.getBoolean("hasBoss", false)));
        e.putString("bossName", call.getString("bossName", ""));
        e.putInt("bossHp", call.getInt("bossHp", 0));
        e.putInt("bossMax", call.getInt("bossMax", 1));
        e.putString("bossEnd", call.getString("bossEnd", ""));
        e.putString("nowLine", call.getString("nowLine", ""));
        e.putString("title", call.getString("title", ""));
        e.apply();
        ArkWidgetProvider.refreshAll(ctx);
        call.resolve();
    }
}
