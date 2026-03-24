# Antigravity Bridge API-Dokumentation (Unlimited Edition)

Diese Dokumentation beschreibt die lokalen REST- und WebSocket-Schnittstellen der **Antigravity Bridge Extension (v1.0.23)**. Die Schnittstelle erlaubt es Netzwerkskripten (Python, Node.js etc.), den Antigravity VS Code Agenten zu steuern und Live-Antworten auszulesen.

---

## ⚙️ Server Konfiguration

- **REST API (HTTP)**: `http://localhost:5000`
- **Live-Streaming (WebSocket)**: `ws://localhost:9812`

> **Hinweis:** Alle API-Requests erwarten den Header `Content-Type: application/json`. Alle Limits und Paywalls wurden in dieser Version permanent deaktiviert (`freeRemaining: -1`).

---

## 🎯 1. Remote Control Endpoints (HTTP)
Steuere den Antigravity-Agenten fern und sende automatisiert Prompts.

### `POST /send_command`
Sendet einen Prompt in den Chat und lässt den Agenten sofort darauf antworten.
- **Payload:**
  ```json
  { "text": "Schreibe ein kurzes Python-Skript." }
  ```
- **Response (200 OK):**
  ```json
  {
    "status": "queued",
    "position": 1,
    "usage": { "remoteCommands": 1, "freeRemaining": -1 }
  }
  ```

### `POST /start-new-chat`
Leert den aktuellen Chatverlauf und startet eine komplett neue Session.
- **Payload:** None (`{}`)
- **Response (200 OK):**
  ```json
  { "status": "queued_new_chat" }
  ```

### `POST /switch_chat`
Wechselt die Chat-Historie (für Kompatibilität mit den offiziellen SDKs).
- **Payload:**
  ```json
  { "title": "Refactoring Auth Module" }
  ```
- **Response (200 OK):**
  ```json
  {
    "status": "queued",
    "title": "Refactoring Auth Module",
    "usage": { "remoteCommands": 1, "freeRemaining": -1 }
  }
  ```

---

## 🤖 2. Automation Endpoints (HTTP)
Aktiviert oder deaktiviert programmgesteuert das Auto-Klick-Verhalten.

### `POST /toggle_auto_run`
Wechselt den Status für automatisches Ausführen (Klicken auf "Run").
- **Payload:** None (`{}`)
- **Response (200 OK):**
  ```json
  { "auto_run": true }
  ```

### `POST /toggle_auto_allow`
Wechselt den Status für die automatische Datei-Freigabe ("Allow").
- **Payload:** None (`{}`)
- **Response (200 OK):**
  ```json
  { "auto_allow": true }
  ```

---

## 📡 3. Daten & Live-Streaming (WebSocket & HTTP)
Lese Antworten aus dem Chat aus oder verwalte interne Queues.

### `WebSocket ws://localhost:9812`
Sobald der Agent eine Antwort schreibt, sendet der Broadcast-Server in Echtzeit ein JSON-Paket an alle verbundenen WebSockets (z.B. dein Python-Skript):
- **Live-Payload:**
  ```json
  {
    "title": "Current Topic",
    "content": "Hier ist dein kurzes Python-Skript: ..."
  }
  ```

### `GET /get_command` (Internes Polling)
Fragt ab, ob asynchrone Commands in der Pipeline liegen (für Polling-Clients).
- **Response (200 OK):**
  ```json
  {
    "text": "Schreibe ein Python-Skript",
    "status": "success",
    "auto_run": true,
    "auto_allow": true,
    "start_new_chat": false,
    "switch_chat": null,
    "usage": { "autoClicks": 5, "remoteCommands": 1, "autoFreeRemaining": -1, "rcFreeRemaining": -1 }
  }
  ```

### `POST /update` (Interner Webhook)
Nimmt neue Chat-Texte der VS-Code Webview entgegen, loggt sie als Textdatei ins Workspace-Root und broadcastet sie sofort an alle WebSocket-Zuhörer auf Port 9812 weiter.

> **v1.0.23 Update:** Das `content`-Feld wird nun statisch als leerer String gesendet, um das Backend-Log vor DOM-Scraping-Artefakten zu schützen. Der `status` wechselt deterministisch auf `"completed"`, sobald die Zeichenfolge `TASK COMPLETED` mindestens **zweimal** im DOM gefunden wurde (da das erste Vorkommen nativ durch den initialen Prompt in der Chat-History existiert).

- **Payload:**
  ```json
  { "title": "Test Chat", "content": "", "status": "processing" }
  ```
- **Response (200 OK):**
  ```json
  { "status": "received" }
  ```

### `POST /ui_injector_log` (Heartbeat & Diagnostics)
Empfängt alle 2 Sekunden ein Lebenszeichen vom injizierten UI-Scraper, welcher den DOM-Container analysiert. Dies steuert auch den optischen Statusindikator unten rechts im Editor (Grün = Laufend, Gelb = HTTP Fehler, Rot = CORS/Netzwerk Fehler).
Zusätzlich wird dieser Log hart in `C:\forge-os\ui_injector_heartbeat.log` geschrieben.
- **Payload:**
  ```json
  { 
    "message": "Heartbeat - Scraped DOM", 
    "panelInfo": "Container: .interactive-session | Length: 125 chars" 
  }
  ```
- **Response (200 OK):**
  ```json
  { "status": "received" }
  ```

---

## 📊 4. Telemetrie & Stats (HTTP)
Statistiken ohne Limits.

### `GET /stats`
Liefert die aktuellen Sessions und Statistiken der lokalen Erweiterung zurück.
- **Response (200 OK):**
  ```json
  {
    "autoRunClicks": 12,
    "autoAllowClicks": 4,
    "remoteCommands": 5,
    "totalSessions": 2,
    "firstUsed": "2026-03-18T14:30:00.000Z",
    "lastUsed": "2026-03-18T15:00:00.000Z"
  }
  ```

### `POST /track_action`
Trackt einen manuell ausgelösten Klick (für das Dashboard der Original-Extension).
- **Payload:**
  ```json
  { "action": "remote_command" } // oder "auto_run", "auto_allow"
  ```
- **Response (200 OK):**
  ```json
  { "status": "tracked", "stats": { ... } }
  ```
