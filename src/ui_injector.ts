import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function patchWorkbenchHtml() {
    try {
        const appRoot = vscode.env.appRoot;
        // Bekannte Pfade für Antigravity/VSCode
        const possiblePaths = [
            path.join(appRoot, 'out/vs/code/electron-sandbox/workbench/workbench.html'),
            path.join(appRoot, 'out/vs/code/electron-browser/workbench/workbench.html')
        ];

        let targetPath = '';
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                targetPath = p;
                break;
            }
        }

        if (!targetPath) {
            console.error("Antigravity Bridge: Could not find workbench.html for patching.");
            return;
        }

        let html = fs.readFileSync(targetPath, 'utf8');

        // Verhindern, dass wir mehrfach patchen
        const patchMark = "<!-- Antigravity Bridge Auto-Runner v1.0.2 -->";
        if (html.includes(patchMark)) {
            console.log("Antigravity Bridge: Workbench is already patched.");
            return;
        }

        // Sicherheits-Backup des Originals
        if (!fs.existsSync(targetPath + '.bak')) {
            fs.writeFileSync(targetPath + '.bak', html, 'utf8');
        }

        // Relax Content-Security-Policy (CSP) to allow our inline script and localhost fetch
        const cspRegex = /<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/?\s*>/i;
        if (cspRegex.test(html)) {
            const relaxedCsp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: blob: vscode-remote-resource: vscode-managed-remote-resource: https:; media-src 'self' data: https://127.0.0.1:* blob: https://www.gstatic.com/; frame-src 'self' vscode-webview: data:; script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' data: http://127.0.0.1:* http://localhost:* https://localhost:* ws: wss: https:; font-src 'self' vscode-remote-resource: vscode-managed-remote-resource: https://*.vscode-unpkg.net;" />`;
            html = html.replace(cspRegex, relaxedCsp);
        }

        // Das saubere, transparente JavaScript Payload, das in die UI injiziert wird
        const payload = `
${patchMark}
<script>
(function() {
    console.log("[Antigravity Bridge] Autonomous UI Injector loaded successfully.");
    
    let lastChatLength = 0;
    let idleTicks = 0;
    // Scraper-Loop für den Chat (jede 2 Sekunden)
    setInterval(() => {
        try {
            // Versuche spezifische Chat-Container zu finden, ansonsten fallback auf Body
            const panel = document.querySelector('.interactive-session') || document.querySelector('.chat-view') || document.body;
            if (panel) {
                const currentText = panel.innerText || "";
                if (Math.abs(currentText.length - lastChatLength) > 10) { // Text wächst -> Processing
                    lastChatLength = currentText.length;
                    idleTicks = 0;
                    const maskedContent = currentText.replace('TASK COMPLETED', 'T*** COMPLETED');
                    fetch('http://localhost:5000/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            title: document.title || "VS Code Auto-Title",
                            content: maskedContent,
                            status: maskedContent.includes("TASK COMPLETED") ? "completed" : "processing"
                        })
                    }).catch(e => {});
                } else if (lastChatLength > 0) {
                    // Der automatische completed-Status nach 6 Sekunden wurde deaktiviert
                    idleTicks++;
                }
            }
        } catch(e) {}
    }, 2000);

    // Polling-Loop für Auto-Run und Auto-Allow
    setInterval(async () => {
        try {
            const res = await fetch('http://localhost:5000/get_command');
            if (!res.ok) return;
            const state = await res.json();
            
            if (state.auto_run || state.auto_allow) {
                // Suche alle Buttons im DOM der Agent Side-Panel Webview
                const buttons = document.querySelectorAll('button');
                buttons.forEach(btn => {
                    const text = btn.textContent ? btn.textContent.trim() : '';
                    const isRun = text === 'Run' || text === 'Ausführen';
                    const isAllow = text === 'Allow' || text === 'Zulassen';
                    
                    if ((isRun && state.auto_run) || (isAllow && state.auto_allow)) {
                        // Verhindern, dass der gleiche Button 100x geklickt wird
                        if (!btn.disabled && !btn.dataset.bridgeClicked) {
                            btn.dataset.bridgeClicked = "true";
                            console.log("[Antigravity Bridge] Autonomous Click executed: " + text);
                            
                            setTimeout(() => {
                                btn.click();
                                // Teile dem Statistik-Server mit, was wir geklickt haben
                                fetch('http://localhost:5000/track_action', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: isRun ? 'auto_run' : 'auto_allow' })
                                }).catch(e => {});
                            }, 400); // 400ms Delay für ein responsiveres UI Feeling
                        }
                    }
                });
            }
        } catch (e) {
            // Wenn der Server aus ist, stumm bleiben
        }
    }, 1500); // Checke alle 1.5 Sekunden
})();
</script>
`;
        
        // Payload direkt vor </html> injizieren
        html = html.replace(/(<\/html>|<\/body>)/i, payload + "\\n$1");

        // Schreibe die veränderte Datei zurück
        fs.writeFileSync(targetPath, html, 'utf8');
        
        // Zwinge den Nutzer, das Fenster neu zu laden
        vscode.window.showWarningMessage('Antigravity Bridge: Auto-Run UI Injector wurde in dein Editor-Core gepatched. BITTE STARTE DEN EDITOR KOMPLETT NEU!');

    } catch (e: any) {
        console.error("Antigravity Bridge: UI Injector Error", e);
        vscode.window.showErrorMessage('Antigravity Bridge: Fehler beim Patchen der Editor UI: ' + e.message);
    }
}
