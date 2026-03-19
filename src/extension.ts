import * as vscode from 'vscode';
import * as express from 'express';
import * as http from 'http';
import * as WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { patchWorkbenchHtml } from './ui_injector';

let httpServer: http.Server | undefined;
let wss: WebSocket.Server | undefined;

// State & Stats (Unlimited Premium Logic - Default to always run)
let state = { auto_run: true, auto_allow: true };
let stats = { 
    autoRunClicks: 0, 
    autoAllowClicks: 0, 
    remoteCommands: 0, 
    totalSessions: 1, 
    firstUsed: new Date().toISOString(), 
    lastUsed: new Date().toISOString() 
};
let queuedCommands: string[] = [];
let pendingNewChat = false;
let pendingSwitchChat: string | null = null;

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel("Antigravity Bridge");
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine(`[${new Date().toISOString()}] Antigravity Bridge activated. Starting servers...`);

    // 0. Inject Code into the Webview for Auto-Run/Auto-Allow tracking
    patchWorkbenchHtml(outputChannel);

    // 1. WebSocket Server (Port 9812)
    wss = new WebSocket.Server({ port: 9812 }, () => {
        console.log("Antigravity Bridge WebSocket Server started on port 9812");
    });
    
    wss.on('connection', ws => {
        ws.send(JSON.stringify({ title: "System", content: "Connected to Unlimited Antigravity Bridge API." }));
    });

    const broadcast = (data: any) => {
        if (wss) {
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });
        }
    };

    // 2. HTTP Server (Port 5000)
    const app = express();
    app.use(express.json());

    // --- CORS Middleware ---
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (req.method === 'OPTIONS') {
            res.sendStatus(200);
            return;
        }
        next();
    });

    // --- API Interaction Logging Middleware ---
    app.use((req, res, next) => {
        const originalJson = res.json;
        res.json = function(body) {
            // Filter out empty polling spam
            if (!(req.path === '/get_command' && body && body.status === 'no_command')) {
                const logMsg = `[${new Date().toISOString()}] API ${req.method} ${req.path} | IN: ${JSON.stringify(req.body)} | OUT: ${JSON.stringify(body)}`;
                console.log(logMsg);
                if (outputChannel) outputChannel.appendLine(logMsg);
            }
            return originalJson.call(this, body);
        };
        next();
    });

    // --- Remote Control Endpoints ---
    app.post('/send_command', async (req, res) => {
        const { text } = req.body;
        if (!text) {
            res.status(400).json({ error: "Missing required 'text' field" });
            return;
        }

        // Sende Initial-Event an Appliance über WebSocket
        broadcast({
            type: "task_started",
            status: "executing",
            command: text,
            content: text,
            timestamp: new Date().toISOString(),
            command_id: "cmd_" + Date.now().toString()
        });

        try {
            await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
            await vscode.commands.executeCommand('antigravity.agentSidePanel.open');
            await new Promise(r => setTimeout(r, 400));
            
            try {
                // Direkter Aufruf der internen API (wie zuvor entdeckt)
                await vscode.commands.executeCommand('antigravity.sendPromptToAgentPanel', text);
            } catch (err) {
                // Fallbacks
                try {
                    await vscode.commands.executeCommand('antigravity.sendPromptToAgentPanel', { text });
                } catch (err2) {
                    await vscode.env.clipboard.writeText(text);
                    await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
                }
            }

            stats.remoteCommands++;
            stats.lastUsed = new Date().toISOString();
            
            // Rückgabe im 1:1 API Format der Original-Erweiterung
            res.json({ 
                status: "executing", 
                position: 1, 
                usage: { 
                    remoteCommands: stats.remoteCommands, 
                    freeRemaining: -1 // Unlimited!
                } 
            });
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/start-new-chat', async (req, res) => {
        pendingNewChat = true;
        stats.totalSessions++;
        try {
            await vscode.commands.executeCommand('antigravity.startNewConversation'); 
        } catch(e) {}
        
        res.json({ status: "queued_new_chat" });
    });

    app.post('/switch_chat', (req, res) => {
        const { title } = req.body;
        if (!title) {
            res.status(400).json({ error: "Missing 'title' field" });
            return;
        }
        pendingSwitchChat = title;
        res.json({ 
            status: "queued", 
            title, 
            usage: { remoteCommands: stats.remoteCommands, freeRemaining: -1 } 
        });
    });

    // --- Content / Sync Endpoints ---
    app.get('/get_command', (req, res) => {
        const text = queuedCommands.length > 0 ? queuedCommands.shift()! : null;
        res.json({
            text,
            status: text ? "success" : "no_command",
            auto_run: state.auto_run,
            auto_allow: state.auto_allow,
            start_new_chat: pendingNewChat,
            switch_chat: pendingSwitchChat,
            usage: {
                autoClicks: stats.autoRunClicks + stats.autoAllowClicks,
                remoteCommands: stats.remoteCommands,
                autoFreeRemaining: -1,
                rcFreeRemaining: -1
            }
        });
        pendingNewChat = false;
        pendingSwitchChat = null;
    });

    app.post('/update', (req, res) => {
        const { title = "Default Conversation", content } = req.body;
        
        // Silently drop empty content to prevent spam from old UI injectors
        if (!content || content.trim() === "") {
            res.json({ status: "ignored_empty" });
            return;
        }

        if (outputChannel) {
            outputChannel.appendLine(`[${new Date().toISOString()}] /update endpoint hit! Title: ${title}, Status: ${req.body.status || 'N/A'}`);
        }

        // --- GLOBAL DEBUG LOGGING ---
        try {
            const fallbackPath = `C:\\forge-os\\antigravity_bridge_update.log`;
            const logEntry = `[${new Date().toISOString()}] /update received - Title: ${title}, Status: ${req.body.status || 'N/A'}\n`;
            fs.appendFileSync(fallbackPath, logEntry);
            
            if (req.body) {
                const bodyLog = JSON.stringify(req.body) + "\n";
                fs.appendFileSync(`C:\\forge-os\\antigravity_bridge_messages.log`, bodyLog);
            }
        } catch (e) {
            console.error("Failed to write global debug log", e);
        }

        // 1. Broadcast über WebSocket (Live-Stream für externe Appliance)
        broadcast({
            type: "agent_response",
            status: req.body.status || "processing",
            content: content,
            timestamp: new Date().toISOString()
        });

        // 2. Logging in den Workspace (identisches Verhalten zum Original)
        const wsFolders = vscode.workspace.workspaceFolders;
        if (wsFolders && wsFolders.length > 0) {
            const rootPath = wsFolders[0].uri.fsPath;
            const safeTitle = title.replace(/[^a-z0-9]/gi, '_');
            const logPath = path.join(rootPath, `content_log_${safeTitle}.txt`);
            fs.appendFileSync(logPath, content + "\n");
            
            // 3. Logge alle JSON-Nachrichten
            const jsonLogPath = path.join(rootPath, `update_messages.log`);
            fs.appendFileSync(jsonLogPath, JSON.stringify(req.body) + "\n");
        }

        res.json({ status: "received" });
    });

    // --- Stats & Telemetry ---
    app.get('/stats', (req, res) => {
        res.json(stats);
    });

    app.post('/track_action', (req, res) => {
        const { action } = req.body;
        if (action === 'auto_run') stats.autoRunClicks++;
        else if (action === 'auto_allow') stats.autoAllowClicks++;
        else if (action === 'remote_command') stats.remoteCommands++;
        
        stats.lastUsed = new Date().toISOString();
        res.json({ status: "tracked", stats });
    });

    // Default Port 5000 according to swagger.yaml
    try {
        httpServer = app.listen(5000, () => {
            const msg = "Antigravity Bridge HTTP Server successfully started on port 5000";
            console.log(msg);
            if (outputChannel) outputChannel.appendLine(`[${new Date().toISOString()}] ${msg}`);
        }).on('error', (err: any) => {
            const errMsg = `ERROR starting HTTP Server on port 5000: ${err.message}`;
            console.error(errMsg);
            if (outputChannel) outputChannel.appendLine(`[${new Date().toISOString()}] ${errMsg}`);
            vscode.window.showErrorMessage(`Antigravity Bridge: ${errMsg}`);
        });
    } catch (e: any) {
        if (outputChannel) outputChannel.appendLine(`[${new Date().toISOString()}] FATAL ERROR starting HTTP Server: ${e.message}`);
    }

    context.subscriptions.push({
        dispose: () => {
            if (httpServer) httpServer.close();
            if (wss) wss.close();
        }
    });
}

export function deactivate() {
    if (httpServer) httpServer.close();
    if (wss) wss.close();
}
