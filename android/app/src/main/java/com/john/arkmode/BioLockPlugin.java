package com.john.arkmode;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Fingerprint / face unlock for the app lock. The PIN is the fallback, handled in JavaScript.
@CapacitorPlugin(name = "BioLock")
public class BioLockPlugin extends Plugin {
    private static final int AUTH = BiometricManager.Authenticators.BIOMETRIC_WEAK;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        int can = BiometricManager.from(getContext()).canAuthenticate(AUTH);
        JSObject r = new JSObject();
        r.put("available", can == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(r);
    }

    @PluginMethod
    public void verify(PluginCall call) {
        String reason = call.getString("reason", "Unlock Ark Mode");
        FragmentActivity act = getActivity();
        act.runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(act, ContextCompat.getMainExecutor(act), new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                    JSObject r = new JSObject();
                    r.put("verified", true);
                    call.resolve(r);
                }

                @Override
                public void onAuthenticationError(int code, @NonNull CharSequence msg) {
                    JSObject r = new JSObject();
                    r.put("verified", false);
                    call.resolve(r);
                }
            });
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("Ark Mode")
                .setSubtitle(reason)
                .setNegativeButtonText("Use PIN")
                .setAllowedAuthenticators(AUTH)
                .build();
            prompt.authenticate(info);
        });
    }
}
