package com.example.app;

/** Centralized weekly schedule used by the home-screen widget. */
public final class WidgetScheduleConfig {
    public record Day(String name, String type, String title, String focus, String cardio) {}

    private static final Day[] WEEK = {
            new Day("Lunedì", "FORZA + CARDIO", "Upper Strength", "Push-up / Pull-up", "Nessun cardio"),
            new Day("Martedì", "FORZA + CARDIO", "Lower Strength + Corsa Facile", "Unilateralità", "Zona 1"),
            new Day("Mercoledì", "CORSA", "Interval Run", "Soglia / VO₂max", "Zona 4"),
            new Day("Giovedì", "FORZA + CARDIO", "Upper Strength + Corsa Facile", "Volume braccia/spalle", "Zona 1–2"),
            new Day("Venerdì", "FORZA + CARDIO", "Lower Strength + Corsa Progressiva", "Potenza + fatica", "Progressiva"),
            new Day("Sabato", "CORSA", "Recupero Attivo (Run)", "Smaltimento", "Zona 1"),
            new Day("Domenica", "CORSA", "Long Run", "Efficienza aerobica", "Zona 2")
    };

    private WidgetScheduleConfig() {}

    public static Day forIndex(int index) {
        if (index < 0 || index >= WEEK.length) {
            throw new IllegalArgumentException("Invalid weekday index: " + index);
        }
        return WEEK[index];
    }
}
