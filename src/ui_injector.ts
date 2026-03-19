import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function patchWorkbenchHtml(outputChannel?: vscode.OutputChannel) {
    const log = (msg: string) => {
        console.log(msg);
        if (outputChannel) outputChannel.appendLine(`[${new Date().toISOString()}] ${msg}`);
    };
    const logErr = (msg: string) => {
        console.error(msg);
        if (outputChannel) outputChannel.appendLine(`[${new Date().toISOString()}] ERROR: ${msg}`);
    };

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
            logErr("Antigravity Bridge: Could not find workbench.html for patching.");
            return;
        }

        let html = fs.readFileSync(targetPath, 'utf8');

        // Verhindern, dass wir mehrfach (die neueste Version) patchen
        const patchMark = "<!-- Antigravity Bridge Auto-Runner v1.0.28 -->";
        if (html.includes(patchMark)) {
            log("Antigravity Bridge: Workbench is already patched with v1.0.28.");
            return;
        }

        // Altes Script entfernen, falls vorhanden
        const oldPatchRegex = /<!-- Antigravity Bridge Auto-Runner v1\.0\.(2|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27) -->[\s\S]*?<\/script>/g;
        if (oldPatchRegex.test(html)) {
            html = html.replace(oldPatchRegex, '');
            log("Antigravity Bridge: Removed old UI injector patch.");
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

    let lastText = "";
    let lastByteSize = 0;
    let idleTicks = 0;
    
    // Optischer Polling-Indikator (Visual Feedback)
    let indicator = document.createElement('div');
    indicator.id = 'ag-bridge-indicator';
    indicator.style.position = 'fixed';
    indicator.style.bottom = '22px'; // Über der Statusbar
    indicator.style.right = '22px';
    indicator.style.width = '8px';
    indicator.style.height = '8px';
    indicator.style.borderRadius = '50%';
    indicator.style.backgroundColor = '#00ff00';
    indicator.style.boxShadow = '0 0 5px #00ff00';
    indicator.style.zIndex = '9999999';
    indicator.style.pointerEvents = 'none';
    indicator.style.transition = 'opacity 0.3s ease-out, transform 0.1s ease-out';
    indicator.style.opacity = '0.2';
    document.body.appendChild(indicator);

    // Scraper-Loop für den Chat (jede 2 Sekunden)
    setInterval(() => {
        try {
            // Blink-Effekt für das optische Feedback
            indicator.style.opacity = '1';
            indicator.style.transform = 'scale(1.5)';
            setTimeout(() => { 
                indicator.style.opacity = '0.2'; 
                indicator.style.transform = 'scale(1)';
            }, 300);

            // Versuche spezifische Chat-Container zu finden, ansonsten fallback auf Body
            const interactiveSession = document.querySelector('.interactive-session');
            const chatView = document.querySelector('.chat-view');
            const panel = interactiveSession || chatView || document.body;
            const containerName = interactiveSession ? '.interactive-session' : (chatView ? '.chat-view' : 'body');
            
            if (panel) {
                const currentText = panel.innerText || "";
                const currentByteSize = new Blob([currentText]).size;
                
                // Kontext-Wechsel oder Chat Clear detektieren
                if (currentByteSize < lastByteSize - 20) {
                    lastText = "";
                    lastByteSize = 0;
                }

                if (currentText.length > lastText.length) {
                    const newText = currentText.substring(lastText.length).trim();
                    lastText = currentText;
                    lastByteSize = currentByteSize;
                    idleTicks = 0;
                    
                    if (newText.length > 0) {
                        // Logge nur den NEUEN content
                        console.log("[Antigravity Chat] " + newText);
                        
                        // Checke, ob der Chat GANZ am Ende ein TASK COMPLETED hat
                        // Wir erlauben Whitespace oder Newlines am Ende
                        const isCompleted = /TASK COMPLETED\s*$/.test(currentText);
                        
                        fetch('http://127.0.0.1:5000/update', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                title: document.title || "VS Code Auto-Title",
                                content: newText,
                                status: isCompleted ? "completed" : "processing"
                            })
                        }).catch(e => {});
                    }
                } else if (lastByteSize > 0) {
                    // Der automatische completed-Status nach 6 Sekunden wurde deaktiviert
                    idleTicks++;
                }
            }
        } catch(e) {}
    }, 2000);

    // Polling-Loop für Auto-Run und Auto-Allow
    setInterval(async () => {
        try {
            const res = await fetch('http://127.0.0.1:5000/get_command');
            
            indicator.style.backgroundColor = res.ok ? '#00ff00' : 'yellow';
            if (res.ok) indicator.style.boxShadow = '0 0 5px #00ff00';

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
                                fetch('http://127.0.0.1:5000/track_action', {
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
            indicator.style.backgroundColor = 'red';
            indicator.style.boxShadow = '0 0 5px red';
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
