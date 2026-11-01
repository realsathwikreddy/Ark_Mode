package com.john.arkmode;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridgePlugin.class);
        registerPlugin(ScreenTimePlugin.class);
        registerPlugin(BioLockPlugin.class);
        registerPlugin(FeedBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
