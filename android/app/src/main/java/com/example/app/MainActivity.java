package com.example.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * MainActivity — punto di ingresso nativo Android per l'app impacchettata con Capacitor.
 *
 * Il package DEVE corrispondere esattamente all'appId dichiarato in
 * capacitor.config.json ("com.example.app") e al percorso della cartella:
 *   android/app/src/main/java/com/example/app/MainActivity.java
 *
 * NOTA SULLA PERSISTENZA:
 * I plugin core Filesystem/Preferences si auto-registrano da Capacitor 3+:
 * non serve altro codice qui, estendere BridgeActivity è sufficiente.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Eventuali plugin nativi CUSTOM (non quelli core) vanno registrati qui.
    }
}