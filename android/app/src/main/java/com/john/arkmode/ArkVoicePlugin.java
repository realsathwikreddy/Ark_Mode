package com.john.arkmode;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import com.getcapacitor.JSArray;
import java.util.Set;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.Locale;

// Ark's ears and voice. Listening happens inside the app (no Google pop-up): the words appear
// live in Ark's sheet and the orb reacts to your voice. Talking back uses the phone's offline TTS.
@CapacitorPlugin(
    name = "ArkVoice",
    permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "mic") }
)
public class ArkVoicePlugin extends Plugin implements TextToSpeech.OnInitListener {
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private String pendingSay = null;
    private SpeechRecognizer rec;
    private PluginCall listening;
    private long lastLevel = 0;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    public void load() {
        // Google's voices are the ones we can tell apart as male; use that engine when it's installed.
        String engine = null;
        try { getContext().getPackageManager().getPackageInfo("com.google.android.tts", 0); engine = "com.google.android.tts"; } catch (Exception ignored) {}
        tts = engine != null ? new TextToSpeech(getContext(), this, engine) : new TextToSpeech(getContext(), this);
    }

    private String wantedVoice = null;

    // Known male Google voices (en-IN first). Other engines: anything that says "male" in its name or features.
    private static final String[] MALE = { "en-in-x-ene", "en-in-x-end", "en-gb-x-rjs", "en-gb-x-gbd", "en-gb-x-gbg", "en-us-x-iol", "en-us-x-iom", "en-us-x-tpd", "en-au-x-aud", "en-au-x-aub" };

    static boolean isMale(Voice v) {
        String n = v.getName().toLowerCase(Locale.US);
        for (String m : MALE) if (n.startsWith(m)) return true;
        Set<String> f = v.getFeatures();
        if (f != null) for (String x : f) { String y = x.toLowerCase(Locale.US); if (y.equals("male") || y.contains("gender=male") || y.endsWith("#male")) return true; }
        return n.contains("male") && !n.contains("female");
    }

    private int rank(Voice v) {
        if (v.getLocale() == null || !"en".equals(v.getLocale().getLanguage())) return -1;
        if (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) return -1;
        int r = 0;
        if (isMale(v)) r += 100;
        if ("IN".equals(v.getLocale().getCountry())) r += 20;
        if (!v.isNetworkConnectionRequired()) r += 10;
        String n = v.getName().toLowerCase(Locale.US);
        for (int i = 0; i < MALE.length; i++) if (n.startsWith(MALE[i])) { r += MALE.length - i; break; }
        return r;
    }

    private void applyVoice() {
        if (!ttsReady) return;
        try {
            Set<Voice> all = tts.getVoices();
            if (all == null) return;
            Voice best = null;
            int bestRank = -1;
            for (Voice v : all) {
                if (wantedVoice != null && v.getName().equals(wantedVoice)) { best = v; break; }
                int r = rank(v);
                if (r > bestRank) { best = v; bestRank = r; }
            }
            if (best != null) tts.setVoice(best);
            // If no male voice is installed, a lower pitch at least keeps it from sounding like the default female one.
            tts.setPitch(best != null && isMale(best) ? 0.95f : 0.8f);
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void voices(PluginCall call) {
        JSArray arr = new JSArray();
        if (ttsReady && tts.getVoices() != null) {
            for (Voice v : tts.getVoices()) {
                if (rank(v) < 0) continue;
                JSObject o = new JSObject();
                o.put("name", v.getName());
                o.put("locale", v.getLocale().toLanguageTag());
                o.put("male", isMale(v));
                o.put("network", v.isNetworkConnectionRequired());
                arr.put(o);
            }
        }
        Voice cur = ttsReady ? tts.getVoice() : null;
        JSObject r = new JSObject();
        r.put("voices", arr);
        r.put("current", cur != null ? cur.getName() : "");
        r.put("ready", ttsReady);
        call.resolve(r);
    }

    @PluginMethod
    public void setVoice(PluginCall call) {
        String n = call.getString("name", "");
        wantedVoice = n.length() > 0 ? n : null;
        applyVoice();
        call.resolve();
    }

    @Override
    public void onInit(int status) {
        if (status != TextToSpeech.SUCCESS) return;
        int r = tts.setLanguage(new Locale("en", "IN"));
        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) tts.setLanguage(Locale.US);
        tts.setSpeechRate(1.05f);
        ttsReady = true;
        applyVoice();
        if (pendingSay != null) {
            tts.speak(pendingSay, TextToSpeech.QUEUE_FLUSH, null, "ark");
            pendingSay = null;
        }
    }

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        r.put("listen", SpeechRecognizer.isRecognitionAvailable(getContext()));
        r.put("speak", ttsReady);
        r.put("mic", getPermissionState("mic") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void listen(PluginCall call) {
        if (tts != null) tts.stop();
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            listenWithDialog(call); // phones without an in-app recogniser: fall back to the system screen
            return;
        }
        if (getPermissionState("mic") != PermissionState.GRANTED) {
            requestPermissionForAlias("mic", call, "micAnswered");
            return;
        }
        startInApp(call);
    }

    @PermissionCallback
    private void micAnswered(PluginCall call) {
        if (getPermissionState("mic") == PermissionState.GRANTED) startInApp(call);
        else call.reject("Ark needs the microphone to hear you. Allow it in Settings → Apps → Ark Mode → Permissions.");
    }

    private void startInApp(PluginCall call) {
        call.setKeepAlive(true);
        main.post(() -> {
            finishListening(null);
            listening = call;
            rec = SpeechRecognizer.createSpeechRecognizer(getContext());
            rec.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) { emit("state", "ready"); }
                @Override public void onBeginningOfSpeech() { emit("state", "speaking"); }
                @Override public void onRmsChanged(float rms) {
                    long t = System.currentTimeMillis();
                    if (t - lastLevel < 70) return;
                    lastLevel = t;
                    JSObject o = new JSObject();
                    o.put("level", Math.max(0f, Math.min(1f, (rms + 2f) / 12f)));
                    notifyListeners("level", o);
                }
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() { emit("state", "thinking"); }
                @Override public void onError(int error) {
                    if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT || error == SpeechRecognizer.ERROR_CLIENT) {
                        finishListening("");
                    } else {
                        PluginCall c = listening;
                        cleanup();
                        if (c != null) { c.setKeepAlive(false); c.reject(errorText(error)); }
                    }
                }
                @Override public void onResults(Bundle results) { finishListening(first(results)); }
                @Override public void onPartialResults(Bundle partial) {
                    String t = first(partial);
                    if (t.length() > 0) emit("partial", t);
                }
                @Override public void onEvent(int eventType, Bundle params) {}
            });
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("lang", "en-IN"));
            i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
            i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L);
            rec.startListening(i);
        });
    }

    // Tap the orb again to finish early.
    @PluginMethod
    public void stopListening(PluginCall call) {
        main.post(() -> { if (rec != null) rec.stopListening(); });
        call.resolve();
    }

    @PluginMethod
    public void cancelListening(PluginCall call) {
        main.post(() -> finishListening(""));
        call.resolve();
    }

    private void finishListening(String text) {
        PluginCall c = listening;
        cleanup();
        if (c != null && text != null) {
            JSObject r = new JSObject();
            r.put("text", text);
            c.setKeepAlive(false);
            c.resolve(r);
        }
    }

    private void cleanup() {
        listening = null;
        if (rec != null) {
            try { rec.cancel(); rec.destroy(); } catch (Exception ignored) {}
            rec = null;
        }
    }

    private void emit(String kind, String value) {
        JSObject o = new JSObject();
        o.put("value", value);
        notifyListeners(kind, o);
    }

    private static String first(Bundle b) {
        if (b == null) return "";
        ArrayList<String> list = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return list != null && !list.isEmpty() && list.get(0) != null ? list.get(0) : "";
    }

    private static String errorText(int e) {
        switch (e) {
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
            case SpeechRecognizer.ERROR_SERVER:
                return "Couldn't reach speech recognition. Check your internet, or type instead.";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "Ark needs the microphone permission.";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "The microphone is busy. Try again in a second.";
            case SpeechRecognizer.ERROR_AUDIO:
                return "Couldn't use the microphone.";
            default:
                return "Couldn't hear that. Try again.";
        }
    }

    private void listenWithDialog(PluginCall call) {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("lang", "en-IN"));
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, "Talk to Ark");
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        try {
            startActivityForResult(call, i, "onHeard");
        } catch (ActivityNotFoundException e) {
            call.reject("No speech recognition on this phone. Install or enable the Google app.");
        } catch (Exception e) {
            call.reject("Couldn't start listening: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void onHeard(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject r = new JSObject();
        String text = "";
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            ArrayList<String> list = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (list != null && !list.isEmpty()) text = list.get(0);
        }
        r.put("text", text);
        call.resolve(r);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (text.length() > 0) {
            if (ttsReady) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "ark");
            else pendingSay = text;
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) tts.stop();
        call.resolve();
    }

    @Override
    protected void handleOnPause() {
        main.post(() -> finishListening(""));
    }

    @Override
    protected void handleOnDestroy() {
        main.post(this::cleanup);
        if (tts != null) tts.shutdown();
    }
}
