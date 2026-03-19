import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { autoAcceptScript } from './autoAcceptCode';

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
        const patchMark = "<!-- Antigravity Bridge Auto-Runner v1.0.32 -->";
        if (html.includes(patchMark)) {
            log("Antigravity Bridge: Workbench is already patched with v1.0.32.");
            return;
        }

        // Altes Script entfernen, falls vorhanden
        const oldPatchRegex = /<!-- Antigravity Bridge Auto-Runner v1\.0\.(2|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31) -->[\s\S]*?<\/script>/g;
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
${autoAcceptScript}

(function() {
    console.log("[Antigravity Bridge] Autonomous UI Injector loaded successfully. (Auto Accept + Scraper)");

    // Start auto-accept logic natively
    if (typeof window.__autoAcceptStart === 'function') {
        window.__autoAcceptStart({ isBackgroundMode: false, bannedCommands: [] });
    }

    let lastByteSize = 0;
    
    // Scraper-Loop für den Chat (jede 2 Sekunden)
    setInterval(() => {
        try {
            // Versuche spezifische Chat-Container zu finden, ansonsten fallback auf Body
            const interactiveSession = document.querySelector('.interactive-session');
            const chatView = document.querySelector('.chat-view');
            const panel = interactiveSession || chatView || document.body;
            
            if (panel) {
                const currentText = panel.innerText || "";
                const currentByteSize = new Blob([currentText]).size;
                
                // Kontext-Wechsel oder Chat Clear detektieren
                if (currentByteSize < lastByteSize - 20) {
                    lastByteSize = 0;
                }

                if (currentByteSize !== lastByteSize) {
                    lastByteSize = currentByteSize;
                    
                    fetch('http://127.0.0.1:5000/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            title: document.title || "VS Code Auto-Title",
                            content: currentText,
                            status: "processing"
                        })
                    }).catch(e => {});
                }
            }
        } catch(e) {}
    }, 2000);
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
