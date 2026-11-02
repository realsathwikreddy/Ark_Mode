package com.john.arkmode;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Locale;

// Ark's ears and voice. Listening uses Android's own speech screen (so no microphone permission
// is needed by the app); talking back uses the phone's text-to-speech, which works offline.
@CapacitorPlugin(name = "ArkVoice")
public class ArkVoicePlugin extends Plugin implements TextToSpeech.OnInitListener {
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private String pendingSay = null;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), this);
    }

    @Override
    public void onInit(int status) {
        if (status != TextToSpeech.SUCCESS) return;
        int r = tts.setLanguage(new Locale("en", "IN"));
        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) tts.setLanguage(Locale.US);
        tts.setSpeechRate(1.05f);
        ttsReady = true;
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
        call.resolve(r);
    }

    @PluginMethod
    public void listen(PluginCall call) {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("lang", "en-IN"));
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, call.getString("prompt", "Talk to Ark"));
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        if (tts != null) tts.stop();
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
    protected void handleOnDestroy() {
        if (tts != null) tts.shutdown();
    }
}
