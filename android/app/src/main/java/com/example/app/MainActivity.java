package com.hybridtraining.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/**
 * MainActivity — punto di ingresso nativo Android per l'app impacchettata con Capacitor.
 *
 * NOTA IMPORTANTE SULLA PERSISTENZA:
 * A partire da Capacitor 3+, i plugin "core" (tra cui Filesystem e Preferences,
 * usati da questa app per salvare i dati in modo persistente nella sandbox
 * dell'app — Directory.Data) vengono auto-registrati dal Capacitor Android
 * Gradle plugin: NON servono chiamate manuali a registerPlugin() in questo
 * file per farli funzionare. Estendere BridgeActivity è sufficiente.
 *
 * Questo file va sovrascritto in:
 *   android/app/src/main/java/com/hybridtraining/app/MainActivity.java
 * (il package deve corrispondere all'appId impostato in capacitor.config.json)
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Punto di estensione: qui puoi registrare eventuali plugin nativi
        // CUSTOM (non quelli core, che sono già auto-registrati), es.:
        // registerPlugin(MyCustomPlugin.class);
    }
}