package com.example.app;

import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;

/**
 * Privacy / permission rationale shown from Health Connect's permission screen.
 * Health Connect requires an exported activity handling its rationale intent.
 */
public class HealthConnectRationaleActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        TextView view = new TextView(this);
        view.setText(
                "Hybrid Training System usa Connessione Salute per importare dati di allenamento e benessere.\n\n" +
                "Dati richiesti: passi, peso, sonno, sessioni di esercizio, frequenza cardiaca e percorsi GPS degli allenamenti.\n\n" +
                "I dati vengono letti solo dopo il tuo consenso e sono utilizzati per aggiornare statistiche, cronologia degli allenamenti e analisi della corsa. " +
                "Puoi revocare l'accesso in qualsiasi momento dalle impostazioni di Connessione Salute."
        );
        view.setTextSize(16f);
        view.setPadding(48, 48, 48, 48);
        setContentView(view);
    }
}
