package com.abdullah.wortschatz;

import android.content.Intent;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Local Capacitor plugin: speaks German sentences/numbers/letters with the phone's text-to-speech engine.
 * JS side: window.Capacitor.Plugins.Tts.speak({ text, lang, rate }) / stop() / status({ lang }) / install().
 */
@CapacitorPlugin(name = "Tts")
public class TtsPlugin extends Plugin {
    private static final int NOT_INITIALISED = Integer.MIN_VALUE;

    private TextToSpeech tts;
    private volatile int initStatus = NOT_INITIALISED;
    private final Map<String, PluginCall> pending = new HashMap<>();
    private final List<Runnable> waiting = new ArrayList<>();

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), status -> {
            if (status == TextToSpeech.SUCCESS && tts != null) {
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) { }
                    @Override public void onDone(String id) { finish(id, true); }
                    @Override public void onError(String id) { finish(id, false); }
                    @Override public void onError(String id, int code) { finish(id, false); }
                    @Override public void onStop(String id, boolean interrupted) { finish(id, true); }
                });
            }
            List<Runnable> run;
            synchronized (waiting) {
                initStatus = status;
                run = new ArrayList<>(waiting);
                waiting.clear();
            }
            for (Runnable r : run) r.run();
        });
    }

    private boolean ready() { return initStatus == TextToSpeech.SUCCESS && tts != null; }

    private void whenReady(Runnable r) {
        synchronized (waiting) {
            if (initStatus == NOT_INITIALISED) { waiting.add(r); return; }
        }
        r.run();
    }

    private void finish(String id, boolean ok) {
        PluginCall call;
        synchronized (pending) { call = pending.remove(id); }
        if (call == null) return;
        if (ok) call.resolve(); else call.reject("tts error");
    }

    @PluginMethod
    public void speak(PluginCall call) {
        final String text = call.getString("text", "");
        final String lang = call.getString("lang", "de-DE");
        final Float rate = call.getFloat("rate", 0.9f);
        if (text == null || text.trim().isEmpty()) { call.resolve(); return; }
        whenReady(() -> {
            if (!ready()) { call.reject("tts not available"); return; }
            int r = tts.setLanguage(Locale.forLanguageTag(lang));
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) { call.reject("language missing"); return; }
            tts.setSpeechRate(rate == null ? 0.9f : rate);
            String id = UUID.randomUUID().toString();
            synchronized (pending) { pending.put(id, call); }
            if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id) != TextToSpeech.SUCCESS) {
                synchronized (pending) { pending.remove(id); }
                call.reject("speak failed");
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) tts.stop();
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        final String lang = call.getString("lang", "de-DE");
        whenReady(() -> {
            JSObject ret = new JSObject();
            boolean available = false;
            if (ready()) {
                int r = tts.isLanguageAvailable(Locale.forLanguageTag(lang));
                available = r >= TextToSpeech.LANG_AVAILABLE;
                ret.put("engine", tts.getDefaultEngine());
            }
            ret.put("ready", ready());
            ret.put("available", available);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void install(PluginCall call) {
        try {
            Intent i = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent i = new Intent("com.android.settings.TTS_SETTINGS");
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve();
            } catch (Exception e2) {
                call.reject("cannot open text-to-speech settings");
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
    }
}
