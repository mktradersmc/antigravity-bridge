# Antigravity Bridge

Minimalistischer VS Code Server auf Port 5000 zur Steuerung von Antigravity-Befehlen per REST-API. 

## Features
- **Remote Control API**: Endpoint `/send_command` zum Starten neuer Tasks.
- **Context Sync**: Liest Chat-Verläufe live aus dem DOM aus und streamt sie an verbundene Clients via WebSocket und `/update`.
- **Autonomous Auto-Accept (v1.0.32+)**: Automatische Bestätigung aller agentischen Aktionen im Chat (Ausführen von Befehlen, File Edits, und Permissions). Die Erweiterung arbeitet komplett im Hintergrund (keine GUI) und erfordert keine Konfiguration (Voller autonomer Modus).

## UI Injector
Die Extension nutzt die `ui_injector.ts` Technologie, um asynchron in die `workbench.html` von VS Code einzugreifen. 
Dadurch läuft der Autonomous Auto-Accept Loop im Kontext der Webviews extrem effizient. 

> **Wichtig:** Nach der Installation der Erweiterung muss das VS Code/Cursor Fenster **vollständig neu geladen** werden (z.B. per `Developer: Reload Window`), um den Injector auszuführen.
