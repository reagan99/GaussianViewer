"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SuperSplatProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const supersplatDocument_1 = require("./supersplatDocument");
const utils_1 = require("./utils");
/**
 * Provider for SuperSplat viewers.
 */
class SuperSplatProvider {
    _context;
    // Register to subscriptions
    static register(context) {
        const register = vscode.window.registerCustomEditorProvider(SuperSplatProvider.viewType, new SuperSplatProvider(context), {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
            supportsMultipleEditorsPerDocument: false,
        });
        return register;
    }
    // View type name
    static viewType = "supersplat.viewer";
    // Tracks all known webviews
    webviews = new WebviewCollection();
    // Log collection
    logBuffer = [];
    constructor(_context) {
        this._context = _context;
        this.setupLogFile();
    }
    setupLogFile() {
        const logDir = path.join(this._context.extensionPath, 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const logFilePath = path.join(logDir, `supersplat-debug-${timestamp}.log`);
        // Initial log entry
        const initialLog = `SuperSplat VSCode Extension Debug Log\nStarted at: ${new Date().toISOString()}\n${'='.repeat(50)}\n`;
        fs.writeFileSync(logFilePath, initialLog);
        this.logFilePath = logFilePath;
    }
    logFilePath = '';
    writeToLogFile(message) {
        try {
            fs.appendFileSync(this.logFilePath, message + '\n');
        }
        catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }
    async handleFileRequest(fileUri, requestId, document) {
        try {
            this.writeToLogFile(`[VSCode] File requested: ${fileUri}`);
            // Check file size first
            const fileStat = await vscode.workspace.fs.stat(document.uri);
            const fileSizeInMB = fileStat.size / (1024 * 1024);
            this.writeToLogFile(`[VSCode] File size: ${fileSizeInMB.toFixed(2)} MB`);
            // Warn for large files
            if (fileSizeInMB > 100) {
                vscode.window.showWarningMessage(`Large file detected (${fileSizeInMB.toFixed(2)} MB). Loading may take some time.`);
            }
            // Warn for extremely large files but don't reject
            if (fileSizeInMB > 300) {
                vscode.window.showWarningMessage(`Very large file detected (${fileSizeInMB.toFixed(2)} MB). This may take significant time and memory. Continue?`, 'Yes', 'No').then(selection => {
                    if (selection !== 'Yes') {
                        for (const webviewPanel of this.webviews.get(document.uri)) {
                            webviewPanel.webview.postMessage({
                                type: 'fileError',
                                requestId: requestId,
                                error: 'File loading cancelled by user'
                            });
                        }
                        return;
                    }
                });
            }
            // For large files, use chunked transfer instead of direct URI (lowered threshold for SSH)
            if (fileSizeInMB > 100) {
                this.writeToLogFile(`[VSCode] Using chunked transfer for large file`);
                this.handleLargeFileTransfer(requestId, document, fileStat.size);
                return;
            }
            // For smaller files, use the original base64 method
            const fileData = await vscode.workspace.fs.readFile(document.uri);
            const base64Data = Buffer.from(fileData).toString('base64');
            this.writeToLogFile(`[VSCode] File data read successfully, size: ${fileData.length} bytes`);
            // Send file data back to webview
            for (const webviewPanel of this.webviews.get(document.uri)) {
                webviewPanel.webview.postMessage({
                    type: 'fileData',
                    requestId: requestId,
                    data: base64Data,
                    filename: path.basename(document.uri.fsPath),
                    size: fileStat.size
                });
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.writeToLogFile(`[VSCode] Failed to read file: ${errorMessage}`);
            // Send error back to webview
            for (const webviewPanel of this.webviews.get(document.uri)) {
                webviewPanel.webview.postMessage({
                    type: 'fileError',
                    requestId: requestId,
                    error: errorMessage
                });
            }
        }
    }
    async handleLargeFileTransfer(requestId, document, fileSize) {
        const CHUNK_SIZE = 512 * 1024; // 512KB chunks for better stability in remote connections
        const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
        this.writeToLogFile(`[VSCode] Starting chunked transfer: ${totalChunks} chunks of ${CHUNK_SIZE} bytes each`);
        try {
            // Send transfer start message
            for (const webviewPanel of this.webviews.get(document.uri)) {
                webviewPanel.webview.postMessage({
                    type: 'fileTransferStart',
                    requestId: requestId,
                    totalChunks: totalChunks,
                    chunkSize: CHUNK_SIZE,
                    totalSize: fileSize,
                    filename: path.basename(document.uri.fsPath)
                });
            }
            // Read and send file in chunks
            const fileData = await vscode.workspace.fs.readFile(document.uri);
            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, fileSize);
                const chunk = fileData.slice(start, end);
                const base64Chunk = Buffer.from(chunk).toString('base64');
                // Validate base64 encoding
                if (!base64Chunk || base64Chunk.length === 0) {
                    throw new Error(`Invalid base64 chunk at index ${chunkIndex}`);
                }
                // Send chunk
                for (const webviewPanel of this.webviews.get(document.uri)) {
                    webviewPanel.webview.postMessage({
                        type: 'fileChunk',
                        requestId: requestId,
                        chunkIndex: chunkIndex,
                        totalChunks: totalChunks,
                        data: base64Chunk,
                        chunkSize: chunk.length,
                        isLastChunk: chunkIndex === totalChunks - 1
                    });
                }
                // Log progress every 10%
                if (chunkIndex % Math.ceil(totalChunks / 10) === 0) {
                    const progress = (chunkIndex / totalChunks) * 100;
                    this.writeToLogFile(`[VSCode] Chunk transfer progress: ${progress.toFixed(1)}%`);
                }
                // Increased delay for remote SSH connections to prevent timeouts
                if (chunkIndex % 5 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
            this.writeToLogFile(`[VSCode] Chunked transfer completed successfully`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.writeToLogFile(`[VSCode] Chunked transfer failed: ${errorMessage}`);
            // Send error to webview
            for (const webviewPanel of this.webviews.get(document.uri)) {
                webviewPanel.webview.postMessage({
                    type: 'fileError',
                    requestId: requestId,
                    error: errorMessage
                });
            }
        }
    }
    async openCustomDocument(uri, openContext, token) {
        this.writeToLogFile(`[VSCode] Opening custom document: ${uri.fsPath}`);
        const document = await supersplatDocument_1.SuperSplatDocument.create(uri, openContext.backupId, {
            getFileData: async () => {
                const fileData = await vscode.workspace.fs.readFile(uri);
                this.writeToLogFile(`[VSCode] File data loaded, size: ${fileData.length} bytes`);
                return new Uint8Array(fileData);
            }
        });
        const listeners = [];
        listeners.push(document.onDidChangeDocument((e) => {
            this.writeToLogFile(`[VSCode] Document changed event`);
            for (const webviewPanel of this.webviews.get(document.uri)) {
                this.postMessage(webviewPanel, "update", {});
            }
        }));
        document.onDidDispose(() => (0, utils_1.disposeAll)(listeners));
        this.writeToLogFile(`[VSCode] Custom document created successfully`);
        return document;
    }
    async resolveCustomEditor(document, webviewPanel, token) {
        this.writeToLogFile(`[VSCode] Resolving custom editor for: ${document.uri.fsPath}`);
        // Add the webview to our internal set of active webviews
        this.webviews.add(document.uri, webviewPanel);
        // Setup initial content for the webview
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this._context.extensionPath, "media"))
            ],
        };
        this.writeToLogFile(`[VSCode] Generating HTML for webview`);
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document);
        webviewPanel.webview.onDidReceiveMessage((e) => this.onMessage(document, e));
        // File watcher for hot reload
        if (document.uri.scheme === "file" &&
            vscode.workspace.getConfiguration("supersplat").get("hotReload", true)) {
            this.writeToLogFile(`[VSCode] Setting up file watcher for hot reload`);
            const watcher = vscode.workspace.createFileSystemWatcher(document.uri.fsPath, true, false, true);
            watcher.onDidChange(() => {
                this.writeToLogFile(`[VSCode] File changed, sending modelRefresh`);
                webviewPanel.webview.postMessage({ type: "modelRefresh" });
            });
            webviewPanel.onDidDispose(() => watcher.dispose());
        }
        webviewPanel.webview.onDidReceiveMessage((e) => {
            if (e.type === "ready") {
                this.writeToLogFile(`[VSCode] Webview ready, sending init message`);
                this.postMessage(webviewPanel, "init", {});
            }
        });
        this.writeToLogFile(`[VSCode] Custom editor resolved successfully`);
    }
    getMediaWebviewUri(webview, filePath) {
        return webview.asWebviewUri(vscode.Uri.file(path.join(this._context.extensionPath, "media", filePath)));
    }
    getSettings(uri) {
        const config = vscode.workspace.getConfiguration("supersplat");
        const initialData = {
            fileToLoad: uri.toString(),
            backgroundColor: config.get("backgroundColor", "#121212"),
            enableEditing: config.get("enableEditing", true),
            showGrid: config.get("showGrid", true),
            showAxes: config.get("showAxes", true),
        };
        return `<meta id="vscode-supersplat-data" data-settings="${JSON.stringify(initialData).replace(/"/g, "&quot;")}">`;
    }
    /**
     * Get the static HTML used in our webviews.
     */
    getHtmlForWebview(webview, document) {
        const fileToLoad = document.uri.scheme === "file"
            ? webview.asWebviewUri(vscode.Uri.file(document.uri.fsPath))
            : document.uri;
        const integrationUri = this.getMediaWebviewUri(webview, "vscode-supersplat.js");
        const styleUri = this.getMediaWebviewUri(webview, "supersplat/index.css");
        const mediaUri = this.getMediaWebviewUri(webview, "supersplat/");
        const nonce = (0, utils_1.getNonce)();
        return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src ${webview.cspSource} 'self' 'unsafe-eval' 'unsafe-inline' blob: data:; img-src ${webview.cspSource} 'self' 'unsafe-eval' blob: data:; style-src ${webview.cspSource} 'unsafe-inline' blob: data:; script-src ${webview.cspSource} 'self' 'unsafe-inline' 'unsafe-eval' blob: data:;">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">

        <base href="${mediaUri}/">
        <link href="${styleUri}" rel="stylesheet" />
        ${this.getSettings(fileToLoad)}

        <title>SuperSplat Viewer</title>
      </head>
      <body>
        <script nonce="${nonce}">
          // VSCode API for webview communication
          const vscode = acquireVsCodeApi();
          
          // Override file loading for VSCode integration
          window.vsCodeIntegration = {
            fileToLoad: "${fileToLoad}",
            vscode: vscode
          };
          
          // Send ready message
          vscode.postMessage({ type: 'ready' });
        </script>
        <script nonce="${nonce}" src="${integrationUri}"></script>
      </body>
      </html>`;
    }
    _callbacks = new Map();
    postMessage(panel, type, body) {
        panel.webview.postMessage({ type, body });
    }
    onMessage(document, message) {
        switch (message.type) {
            case "response":
                const callback = this._callbacks.get(message.requestId);
                callback?.(message.body);
                return;
            case "save":
                // Handle save operations
                vscode.window.showInformationMessage("Save functionality not yet implemented");
                this.writeToLogFile(`[VSCode] Save operation requested`);
                return;
            case "export":
                // Handle export operations
                vscode.window.showInformationMessage("Export functionality not yet implemented");
                this.writeToLogFile(`[VSCode] Export operation requested`);
                return;
            case "error":
                // Handle error messages from webview
                vscode.window.showErrorMessage(`SuperSplat Error: ${message.message}`);
                this.writeToLogFile(`[VSCode] Error: ${message.message}`);
                return;
            case "ready":
                // Webview is ready, send init message
                console.log("SuperSplat webview ready");
                this.writeToLogFile(`[VSCode] SuperSplat webview ready`);
                return;
            case "requestFile":
                // Handle file request from webview
                this.handleFileRequest(message.fileUri, message.requestId, document);
                return;
            case "log":
                // Handle log messages from webview
                const logMessage = `[${message.timestamp}] [WEBVIEW-${message.level.toUpperCase()}] ${message.message}`;
                this.writeToLogFile(logMessage);
                this.logBuffer.push(logMessage);
                return;
            case "allLogs":
                // Handle bulk log transfer
                this.writeToLogFile(`[VSCode] Received ${message.logs.length} log entries from webview`);
                message.logs.forEach((log) => this.writeToLogFile(`[WEBVIEW-BULK] ${log}`));
                return;
        }
    }
}
exports.SuperSplatProvider = SuperSplatProvider;
class WebviewCollection {
    _webviews = new Set();
    /**
     * Get all known webviews for a given uri.
     */
    *get(uri) {
        const key = uri.toString();
        for (const entry of this._webviews) {
            if (entry.resource === key) {
                yield entry.webviewPanel;
            }
        }
    }
    /**
     * Add a new webview to the collection.
     */
    add(uri, webviewPanel) {
        const entry = { resource: uri.toString(), webviewPanel };
        this._webviews.add(entry);
        webviewPanel.onDidDispose(() => {
            this._webviews.delete(entry);
        });
    }
}
//# sourceMappingURL=supersplatProvider.js.map