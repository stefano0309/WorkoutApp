# 🏋️ WorkoutApp — Hybrid Training System

WorkoutApp è una webapp mobile-first impacchettata con **Capacitor** e un layer **Android nativo**, pensata per gestione degli allenamenti, corsa, progressi corporei, gamification, notifiche e widget.

## Funzionalità

### Health Connect
- Permessi Android per peso, passi, sonno, esercizi, frequenza cardiaca e route GPS.
- Bridge nativo verso Health Connect.
- Cache locale dei dati importati per funzionamento offline.
- Servizio TypeScript per il modello di sincronizzazione.

> La route `ExerciseRoute` richiede il consenso specifico di Health Connect e viene gestita separatamente dagli altri dati.

### Editor Sessione
- Esercizi e serie modulari.
- Ripetizioni, carico, RPE e recupero.
- Salvataggio automatico della bozza in locale.
- Collegamento opzionale a una sessione Health Connect.

### Gamification
- Prima 5K di corsa.
- 10.000 passi per 7 giorni consecutivi.
- Master della Costanza.
- Vista badge sbloccati/in corso.

### Peso e foto
- Misurazioni di peso e body fat già disponibili nella webapp.
- Foto progressi archiviate localmente.
- Confronto side-by-side con slider.
- Nessuna sincronizzazione cloud delle immagini.

### Notifiche e widget Android
- Canale notifiche nativo.
- Promemoria giornalieri per l'allenamento.
- Promemoria foto ogni domenica alle 10:00.
- Widget home screen con sessione del giorno, ultima serie e metriche Health Connect disponibili.

## Architettura

```text
www/
├── index.html                 # Webapp principale esistente
├── workout-ux.js              # UI tracker rapido / UX touch
└── roadmap-features.js         # Session Editor, Badge, Foto, Health Connect UI

src/
├── components/
│   ├── badges/BadgeGrid.tsx
│   ├── photos/PhotoComparison.tsx
│   └── session-editor/SessionEditor.tsx
├── services/
│   ├── badgeEngine.service.ts
│   ├── healthConnect.service.ts
│   └── runAnalysis.service.ts
├── store/session.store.ts
└── theme/variables.css

android/app/src/main/java/com/example/app/
├── HealthConnectBridge.java
├── MainActivity.java
├── NotificationHelper.java
├── WeeklyPhotoReceiver.java
├── HybridTrainingWidgetProvider.java
└── ...
```

## Installazione

```bash
git clone https://github.com/stefano0309/WorkoutApp.git
cd WorkoutApp
npm install
npx cap sync android
npx cap run android
```

Per Health Connect, l'utente deve concedere i permessi dall'interfaccia Android. Su Android 14+ Health Connect è integrato nel sistema; sui dispositivi meno recenti può essere necessario installare l'app Health Connect.

## Roadmap implementata

1. Health Connect & analisi corsa
2. Editor sessione
3. Gamification & badge
4. Confronto foto
5. Notifiche native & promemoria foto
6. Widget Android
7. Design system condiviso
8. Documentazione e backlog GitHub

## Backlog

Vedi le Issue GitHub `Health Connect caching`, `Badge micro-interactions`, `GPS route map`, `Local photo encryption`, `GPX/TCX export`, `Configurable widget` e `Integration tests` per le iterazioni successive.

## Note tecniche

La webapp corrente resta compatibile con il modello locale già presente: `localStorage` è la fonte primaria lato UI, mentre Android mantiene una copia persistente per widget/notifiche. Le nuove funzioni sono aggiunte senza rimuovere le schermate esistenti.
