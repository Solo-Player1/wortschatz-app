package com.abdullah.wortschatz;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TtsPlugin.class);   // local plugin: German text-to-speech for sentences/numbers/letters
        registerPlugin(UpdaterPlugin.class);   // local plugin: in-app updates (web zip in place, or APK installer)
        super.onCreate(savedInstanceState);
    }
}
