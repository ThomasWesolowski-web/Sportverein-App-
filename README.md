# 🏅 Sportverein-App

Mobile Web-App (PWA) zur Verwaltung eines Sportvereins: Mannschaften, Trainingszeiten,
Sportplätze, Sporthallen, Sportheim, Vereinskalender und Platz-/Raumbelegung.

## Funktionen

- 🏠 **Startseite** – Termine heute, Live-Status aller Anlagen (frei / belegt), Mannschaften, nächste Veranstaltungen
- ⚽ **Mannschaften** – 1. & 2. Mannschaft (Fußball), 🏀 Basketball, 🥋 Kendo; Trainer, Kontakt, Farbe, feste Trainingszeiten; weitere Mannschaften anlegbar
- 🏟️ **3 Sportplätze** mit Unterteilungen (Hälften, Viertel, Kleinfelder)
- 🏢 **2 Sporthallen** mit einzelnen Feldern
- 🍻 **Sportheim** mit Saal, Nebenraum, Küche, Terrasse
- 📅 **Vereinskalender** mit 📆 **Monats- und Tagesansicht**, Filter nach Mannschaft
- 🔄 **Platz- und Raumbelegung** als Zeitleiste pro Anlage und Bereich – freie Stelle antippen und direkt buchen
- ⚠️ **Konfliktprüfung**: Überschneidungen auf demselben Bereich werden beim Buchen und im Kalender angezeigt
- ❌ Einzelne Trainings absagen (z. B. wegen Spieltag oder Ferien), Trainingszeiten mit „gültig ab/bis“
- 💾 Export / Import der Daten als JSON (Backup oder Übertragung auf ein anderes Gerät)
- 📱 Für Handy optimiert, installierbar („Zum Home-Bildschirm hinzufügen“), offline nutzbar, Dark Mode

Alle Bereiche (Anlagen, Unterteilungen, Mannschaften) lassen sich in der App anpassen.

## Starten

Keine Installation und kein Build nötig – es sind reine HTML/CSS/JS-Dateien.

**Am einfachsten:** Repository herunterladen (auf GitHub „Code → Download ZIP“), entpacken
und `index.html` per Doppelklick im Browser öffnen.

Oder mit einem kleinen lokalen Webserver (dann funktioniert auch die Offline-Installation):

```bash
python3 -m http.server 8000
# dann http://localhost:8000 im Browser öffnen
```

Zum Veröffentlichen eignet sich z. B. **GitHub Pages** (Settings → Pages → Branch `master`, Ordner `/`).
Danach die Seite auf dem Handy öffnen und „Zum Home-Bildschirm hinzufügen“ wählen.

## Daten

Die Daten werden lokal im Browser (`localStorage`) des jeweiligen Geräts gespeichert.
Beim ersten Start werden Beispieldaten geladen; unter ⚙️ Einstellungen lassen sie sich
zurücksetzen, exportieren und importieren.

## Nebenprojekt: Server-Version

Eine Version mit gemeinsamer Datenbank, Anmeldung und Rollen (Admin, Trainer, Mitglied)
liegt im Branch [`server-version`](../../tree/server-version) und wird dort separat weiterentwickelt.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Grundgerüst, Navigation |
| `styles.css` | Mobile-first Layout, Dark Mode |
| `app.js` | Daten, Ansichten, Kalender, Belegung, Formulare |
| `sw.js` | Service Worker (Offline-Nutzung) |
| `manifest.webmanifest`, `icon.svg` | PWA-Installation |
