# 🏅 Sportverein-App

Mobile Web-App zur Verwaltung eines Sportvereins: Mannschaften, Trainingszeiten,
Sportplätze, Sporthallen, Sportheim, Vereinskalender und Platz-/Raumbelegung –
mit **gemeinsamer Datenbank, Anmeldung und Rollen**, damit Vorstand, Trainer und
Mitglieder alle denselben Stand sehen.

## Funktionen

- 🏠 **Startseite** – Termine heute, Live-Status aller Anlagen (frei / belegt), Mannschaften, nächste Veranstaltungen
- ⚽ **Mannschaften** – 1. & 2. Mannschaft (Fußball), 🏀 Basketball, 🥋 Kendo; Trainer, Kontakt, Farbe, feste Trainingszeiten
- 🏟️ **3 Sportplätze** mit Unterteilungen (Hälften, Viertel, Kleinfelder)
- 🏢 **2 Sporthallen** mit einzelnen Feldern
- 🍻 **Sportheim** mit Saal, Nebenraum, Küche, Terrasse
- 📅 **Vereinskalender** mit 📆 **Monats- und Tagesansicht**, Filter nach Mannschaft
- 🔄 **Platz- und Raumbelegung** als Zeitleiste – freie Stelle antippen und direkt buchen
- ⚠️ **Konfliktprüfung** bei Überschneidungen auf demselben Bereich
- ❌ Einzelne Trainings absagen, Trainingszeiten mit „gültig ab/bis“
- 👥 **Anmeldung & Rollen** (mit Server):
  | Rolle | Darf |
  |---|---|
  | **Administrator/Vorstand** | alles: Benutzer, Mannschaften, Anlagen, alle Termine, Import |
  | **Trainer/in** | Trainingszeiten und Termine der eigenen Mannschaft(en) pflegen, Trainings absagen, eigene Buchungen ohne Mannschaft (z. B. Sportheim) |
  | **Mitglied** | alles ansehen, nichts ändern |
- 🔄 Änderungen anderer Benutzer erscheinen automatisch (Abgleich alle 20 Sekunden und beim Öffnen der App)
- 📴 Ohne Verbindung bleibt der zuletzt geladene Stand lesbar
- 💾 Export / Import als JSON
- 📱 Für Handy optimiert, installierbar („Zum Home-Bildschirm hinzufügen“), Dark Mode

## Zwei Betriebsarten

| | **Vereinsserver** (empfohlen) | **Lokal** (ohne Server) |
|---|---|---|
| Daten | gemeinsam in einer SQLite-Datenbank | nur im Browser des jeweiligen Geräts |
| Anmeldung | ja, mit Rollen | nein |
| Hosting | eigener Server, Raspberry Pi, VPS, … | beliebiger Webspace, z. B. GitHub Pages |

Die App erkennt automatisch, ob sie vom Vereinsserver ausgeliefert wird.

## Vereinsserver starten

Voraussetzung: **Node.js ab Version 22.13** (keine weiteren Pakete nötig – die Datenbank ist in Node eingebaut).

```bash
ADMIN_PASSWORD='ein-sicheres-passwort' npm start
# → http://localhost:3000, anmelden als "admin"
```

Ohne `ADMIN_PASSWORD` wird beim ersten Start ein zufälliges Passwort erzeugt und
in der Konsole angezeigt. Danach unter ⚙️ Einstellungen → **Benutzer** die Zugänge
für Trainer und Mitglieder anlegen und das eigene Passwort ändern.

### Mit Docker

```bash
docker compose up -d
```

Vorher in `docker-compose.yml` das `ADMIN_PASSWORD` anpassen. Die Datenbank liegt
im Docker-Volume `sportverein-daten`.

### Einstellungen (Umgebungsvariablen)

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `3000` | Port des Servers |
| `HOST` | `0.0.0.0` | Netzwerkadresse |
| `DATA_DIR` | `./data` | Ordner für die Datenbank `sportverein.db` |
| `ADMIN_PASSWORD` | zufällig | Passwort für `admin` – **nur beim allerersten Start** |
| `SEED_DEMO` | `1` | `0` = mit leerem Verein starten statt mit Beispieldaten |
| `TRUST_PROXY` | `0` | `1` hinter einem Reverse-Proxy (nginx, Caddy, Traefik) |
| `COOKIE_SECURE` | automatisch | `1` erzwingt sichere Cookies (nur HTTPS) |

### Im Internet erreichbar machen

Damit Trainer und Mitglieder die App auf dem Handy nutzen können, muss der Server
über **HTTPS** erreichbar sein. Am einfachsten mit [Caddy](https://caddyserver.com)
als Reverse-Proxy (holt das Zertifikat automatisch):

```
verein.example.de {
    reverse_proxy localhost:3000
}
```

Dann `TRUST_PROXY=1` setzen.

### Datensicherung

Die komplette Datenbank ist die Datei `data/sportverein.db` – diese regelmäßig sichern.
Zusätzlich kann der Admin unter ⚙️ Einstellungen einen JSON-Export herunterladen.

## Sicherheit

- Passwörter werden mit scrypt (gesalzen) gespeichert, nie im Klartext
- Sitzungen per HttpOnly-Cookie (30 Tage), Abmelden beendet die Sitzung, Passwortänderung meldet andere Geräte ab
- Begrenzung der Anmeldeversuche (10 pro 15 Minuten und IP)
- Alle Rechte werden auf dem Server geprüft, nicht nur in der App
- Schutz vor CSRF (Änderungen nur per JSON) sowie Content-Security-Policy
- Der Server liefert nur die App-Dateien aus, niemals Datenbank oder Quellcode des Servers

## Entwicklung

```bash
npm test     # Server-Tests (Anmeldung, Rollen, Validierung, Import …)
npm start    # Server starten
```

| Datei | Inhalt |
|---|---|
| `index.html`, `styles.css`, `app.js` | Web-App (Ansichten, Kalender, Belegung, Formulare) |
| `demo.js` | Beispieldaten (von App und Server genutzt) |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline-Nutzung & Installation |
| `server/server.js` | HTTP-Server, API, Anmeldung, Rechte |
| `server/db.js` | SQLite-Datenbank |
| `test/` | automatische Tests |
