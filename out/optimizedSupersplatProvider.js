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
exports.OptimizedSuperSplatProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const supersplatDocument_1 = require("../out/supersplatDocument");
const utils_1 = require("../out/utils");
const plyOptimizer_1 = require("./plyOptimizer");
/**
 * Optimized Provider for SuperSplat viewers with PLY performance enhancements.
 */
class OptimizedSuperSplatProvider {
    // Register to subscriptions
    static register(context) {
        const provider = new OptimizedSuperSplatProvider(context);
        const register = vscode.window.registerCustomEditorProvider(OptimizedSuperSplatProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
            supportsMultipleEditorsPerDocument: false,
        });
        return register;
    }
    constructor(_context) {
        this.optimizedPaths = new Map();
        // Tracks all known webviews
        this.webviews = new WebviewCollection();
        // Minimal logging for performance
        this.logPath = '';
        this._context = _context;
        this.plyOptimizer = new plyOptimizer_1.PLYOptimizer(_context);
        this.setupMinimalLogging();
        // Track active streaming sessions to prevent duplicates
        this.activeStreamingSessions = new Map();
        this.pendingSaveUri = null; // Track pending save URI
        this.pendingSaveType = null; // Track save type (ply or document)
        this.saves = new Map(); // Track chunked saves
    }
    setupMinimalLogging() {
        const logDir = path.join(this._context.extensionPath, 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.logPath = path.join(logDir, `supersplat-perf-${timestamp}.log`);
    }
    logPerformance(message) {
        // Only log critical performance metrics
        try {
            const timestamp = new Date().toISOString();
            fs.appendFileSync(this.logPath, `[${timestamp}] ${message}\n`);
        }
        catch (error) {
            // Silently ignore log errors to avoid performance impact
        }
    }
    async openCustomDocument(uri, openContext, token) {
        this.logPerformance(`Opening document: ${uri.fsPath}`);
        try {
            const optimizedPath = await this.plyOptimizer.optimizePLY(uri.fsPath);
            this.optimizedPaths.set(uri.toString(), optimizedPath);
            this.logPerformance(`Optimized path for ${uri.fsPath}: ${optimizedPath}`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logPerformance(`Error optimizing PLY ${uri.fsPath}: ${errorMessage}`);
            vscode.window.showErrorMessage(`Failed to optimize PLY file: ${errorMessage}`);
            // Fallback to original path if optimization fails
            this.optimizedPaths.set(uri.toString(), uri.fsPath);
        }
        const document = await supersplatDocument_1.SuperSplatDocument.create(uri, openContext.backupId, {
            getFileData: async () => {
                const fileData = await vscode.workspace.fs.readFile(uri);
                return new Uint8Array(fileData);
            }
        });
        const listeners = [];
        document.onDidDispose(() => {
            this.logPerformance(`Disposing document: ${uri.fsPath}`);
            this.optimizedPaths.delete(uri.toString());
            (0, utils_1.disposeAll)(listeners);
        });
        return document;
    }
    async resolveCustomEditor(document, webviewPanel, token) {
        this.logPerformance(`Resolving editor for: ${document.uri.fsPath}`);
        // Add the webview to our internal set of active webviews
        this.webviews.add(document.uri, webviewPanel);
        // @ts-ignore
        const cacheDir = this.plyOptimizer.cacheDir;
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this._context.extensionPath, "media")),
                vscode.Uri.file(path.dirname(document.uri.fsPath)),
                vscode.Uri.file(cacheDir)
            ],
        };
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document);
        webviewPanel.webview.onDidReceiveMessage((e) => this.onMessage(document, webviewPanel, e));
        // Simplified file watcher for hot reload
        if (document.uri.scheme === "file" &&
            vscode.workspace.getConfiguration("supersplat").get("hotReload", true)) {
            const watcher = vscode.workspace.createFileSystemWatcher(document.uri.fsPath, true, false, true);
            watcher.onDidChange(async () => {
                this.logPerformance(`File changed, re-optimizing: ${document.uri.fsPath}`);
                try {
                    const newOptimizedPath = await this.plyOptimizer.optimizePLY(document.uri.fsPath);
                    this.optimizedPaths.set(document.uri.toString(), newOptimizedPath);
                    this.logPerformance(`Re-optimized path: ${newOptimizedPath}`);
                    webviewPanel.webview.postMessage({ type: "modelRefresh" });
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    this.logPerformance(`Error re-optimizing PLY: ${errorMessage}`);
                    vscode.window.showErrorMessage(`Failed to re-optimize PLY file: ${errorMessage}`);
                }
            });
            webviewPanel.onDidDispose(() => watcher.dispose());
        }
    }
    getMediaWebviewUri(webview, filePath) {
        return webview.asWebviewUri(vscode.Uri.file(path.join(this._context.extensionPath, "media", filePath)));
    }
    onMessage(document, webviewPanel, message) {
        switch (message.type) {
            case 'ready':
                this.loadFile(document, webviewPanel);
                return;
            case 'requestStreamingFallback':
                this.logPerformance(`[WEBVIEW] Received requestStreamingFallback for file size: ${message.fileSize} bytes`);
                // Force streaming mode for the requested file
                this.handleStreamingFallback(document, webviewPanel, message);
                return;
            case 'requestChunk':
                this.handleChunkRequest(document, webviewPanel, message);
                return;
            case 'requestParallelChunks':
                this.handleParallelChunkRequest(document, webviewPanel, message);
                return;
            case "save":
                this.handleSave(document, webviewPanel, message);
                return;
            case "export":
                vscode.window.showInformationMessage("Export functionality not yet implemented");
                return;
            case "error":
                vscode.window.showErrorMessage(`SuperSplat Error: ${message.message}`);
                this.logPerformance(`Error: ${message.message}`);
                return;
            case "perfLog":
                // Log performance metrics from webview
                this.logPerformance(`[WEBVIEW] ${message.message}`);
                return;
            case "openFileDialog":
                this.handleOpenFileDialog(document, webviewPanel, message);
                return;
            case "saveDataComplete":
                this.handleSaveDataComplete(document, webviewPanel, message);
                return;
            case "save/start":
                this.handleSaveStart(document, webviewPanel, message);
                return;
            case "save/chunk":
                this.handleSaveChunk(document, webviewPanel, message);
                return;
            case "save/commit":
                this.handleSaveCommit(document, webviewPanel, message);
                return;
            case "importRemote":
                this.handleImportRemote(document, webviewPanel, message);
                return;
        }
    }
    
    async handleImportRemote(document, webviewPanel, message) {
        console.log('handleImportRemote called with message:', message);
        this.logPerformance(`[IMPORT_REMOTE] Received import request`);
        
        try {
            const { requestId, remotePath } = message;
            
            if (!requestId || !remotePath) {
                throw new Error('Missing requestId or remotePath');
            }
            
            // Resolve remote path
            const absPath = await this.resolveRemotePath(remotePath);
            console.log('📥 [IMPORT] Resolved path:', absPath);
            
            // Stream file to webview
            await this.streamFileToWebviewBase64(webviewPanel, absPath, requestId, 8 * 1024 * 1024);
            
        } catch (error) {
            this.logPerformance(`Import remote error: ${error}`);
            console.error('Import remote error:', error);
            webviewPanel.webview.postMessage({ 
                type: 'error', 
                message: error.message || String(error) 
            });
        }
    }
    
    async resolveRemotePath(reqPath) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('Open a folder on the SSH host first (Remote-SSH workspace required).');
        }
        
        const ws = workspaceFolders[0];
        
        if (reqPath.startsWith('vscode-remote://')) {
            return vscode.Uri.parse(reqPath).fsPath;
        }
        
        if (path.isAbsolute(reqPath)) {
            return reqPath;
        }
        
        // Relative path - join with workspace
        return path.join(ws.uri.fsPath, reqPath);
    }
    
    async streamFileToWebviewBase64(webviewPanel, absPath, requestId, chunkSize = 8 * 1024 * 1024) {
        const stats = fs.statSync(absPath);
        const totalSize = stats.size;
        const totalChunks = Math.ceil(totalSize / chunkSize);
        const filename = path.basename(absPath);
        
        console.log('📥 [IMPORT] Starting import stream:', filename, `(${totalSize} bytes, ${totalChunks} chunks)`);
        
        // Send start message
        webviewPanel.webview.postMessage({
            type: 'fileTransferStart',
            requestId,
            filename,
            totalSize,
            totalChunks,
            chunkSize
        });
        
        // Stream file in chunks
        const stream = fs.createReadStream(absPath, { highWaterMark: chunkSize });
        let chunkIndex = 0;
        let sentBytes = 0;
        
        for await (const chunk of stream) {
            const isLast = sentBytes + chunk.length >= totalSize;
            sentBytes += chunk.length;
            
            webviewPanel.webview.postMessage({
                type: 'fileChunk',
                requestId,
                chunkIndex,
                totalChunks,
                data: chunk.toString('base64'),
                isLastChunk: isLast
            });
            
            chunkIndex++;
            
            // Small delay to prevent overwhelming
            if (chunkIndex % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 1));
            }
        }
        
        console.log('📥 [IMPORT] Import stream completed:', sentBytes, 'bytes sent in', chunkIndex, 'chunks');
    }
    
    async getAbsoluteRemoteUri(absPath) {
        if (!absPath.startsWith('/')) {
            throw new Error('원격 절대경로는 "/"로 시작해야 합니다.');
        }
        
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('Open a folder on the SSH host first (Remote-SSH workspace required).');
        }
        
        const ws = workspaceFolders[0];
        return vscode.Uri.from({ 
            scheme: ws.uri.scheme, 
            authority: ws.uri.authority, 
            path: absPath 
        });
    }
    
    getParentUri(uri) {
        const parentPath = uri.path.replace(/\/[^/]+$/, '') || '/';
        return vscode.Uri.from({ 
            scheme: uri.scheme, 
            authority: uri.authority, 
            path: parentPath 
        });
    }
    
    handleStreamingFallback(document, webviewPanel, message) {
        const documentKey = document.uri.toString();
        
        // Check if already streaming for this document
        if (this.activeStreamingSessions.has(documentKey)) {
            this.logPerformance(`[FALLBACK] Already streaming for ${document.uri.fsPath}, ignoring duplicate request`);
            return;
        }
        
        // Log the fallback request
        this.logPerformance(`[FALLBACK] Starting streaming fallback for ${document.uri.fsPath}`);
        
        // Get file stats
        const optimizedPath = this.optimizedPaths.get(document.uri.toString()) || document.uri.fsPath;
        const stats = fs.statSync(optimizedPath);
        const fileSize = stats.size;
        const fileSizeMB = fileSize / (1024 * 1024);
        
        // Mark as active streaming session
        this.activeStreamingSessions.set(documentKey, Date.now());
        
        // Use 1.0.1 style base64 chunking for better compatibility
        // Adaptive chunk size based on file size
        let chunkSize;
        if (fileSizeMB < 100) chunkSize = 1 * 1024 * 1024;      // 1MB
        else if (fileSizeMB < 500) chunkSize = 5 * 1024 * 1024;  // 5MB  
        else if (fileSizeMB < 1000) chunkSize = 10 * 1024 * 1024; // 10MB
        else chunkSize = 20 * 1024 * 1024;                       // 20MB for 1.3GB+
        
        this.logPerformance(`[FALLBACK] Using adaptive chunk size: ${(chunkSize / (1024 * 1024)).toFixed(0)}MB for ${fileSizeMB.toFixed(2)}MB file`);
        
        // Start base64 chunked transfer like 1.0.1
        this.handleLargeFileTransferV2(document, webviewPanel, message.requestId || 'streaming-fallback', fileSize, chunkSize)
            .finally(() => {
                // Clean up streaming session when done
                this.activeStreamingSessions.delete(documentKey);
                this.logPerformance(`[FALLBACK] Streaming session completed for ${document.uri.fsPath}`);
            });
        
        this.logPerformance(`[FALLBACK] Started base64 chunked transfer - file size: ${fileSizeMB.toFixed(2)}MB`);
    }
    
    // 1.0.1 스타일의 base64 청크 전송 (스트리밍용)
    async handleLargeFileTransferV2(document, webviewPanel, requestId, fileSize, chunkSize) {
        const totalChunks = Math.ceil(fileSize / chunkSize);
        this.logPerformance(`[STREAMING] Starting base64 chunked transfer: ${totalChunks} chunks of ${(chunkSize / (1024 * 1024)).toFixed(0)}MB each`);
        
        try {
            const optimizedPath = this.optimizedPaths.get(document.uri.toString()) || document.uri.fsPath;
            
            // Send transfer start message (1.0.1 style)
            webviewPanel.webview.postMessage({
                type: 'fileTransferStart',
                requestId: requestId,
                totalChunks: totalChunks,
                chunkSize: chunkSize,
                totalSize: fileSize,
                filename: path.basename(document.uri.fsPath)
            });
            
            // Read and send file in chunks using streaming approach
            const stream = fs.createReadStream(optimizedPath, { highWaterMark: chunkSize });
            let chunkIndex = 0;
            
            for await (const chunk of stream) {
                // Convert to base64 like 1.0.1
                const base64Chunk = Buffer.from(chunk).toString('base64');
                
                // Validate base64 encoding
                if (!base64Chunk || base64Chunk.length === 0) {
                    throw new Error(`Invalid base64 chunk at index ${chunkIndex}`);
                }
                
                // Send chunk (1.0.1 style message)
                webviewPanel.webview.postMessage({
                    type: 'fileChunk',
                    requestId: requestId,
                    chunkIndex: chunkIndex,
                    totalChunks: totalChunks,
                    data: base64Chunk,
                    chunkSize: chunk.length,
                    isLastChunk: chunkIndex === totalChunks - 1
                });
                
                // Log progress every 5%
                if (chunkIndex % Math.ceil(totalChunks / 20) === 0) {
                    const progress = ((chunkIndex + 1) / totalChunks) * 100;
                    this.logPerformance(`[STREAMING] Progress: ${progress.toFixed(1)}% (${chunkIndex + 1}/${totalChunks})`);
                }
                
                chunkIndex++;
                
                // Small delay to prevent Extension Host overload
                if (chunkIndex % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            }
            
            this.logPerformance(`[STREAMING] Completed base64 chunked transfer: ${totalChunks} chunks sent`);
            
        } catch (error) {
            this.logPerformance(`[STREAMING] Error in base64 chunked transfer: ${error}`);
            webviewPanel.webview.postMessage({
                type: 'fileError',
                requestId: requestId,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    
    async handleChunkRequest(document, webviewPanel, message) {
        try {
            // Optimized chunk size: 10MB for faster processing of large files
            const { chunkIndex, chunkSize = 10 * 1024 * 1024 } = message; // 10MB chunks
            const optimizedPath = this.optimizedPaths.get(document.uri.toString()) || document.uri.fsPath;
            const stats = fs.statSync(optimizedPath);
            const fileSize = stats.size;
            const start = chunkIndex * chunkSize;
            const end = Math.min(start + chunkSize, fileSize);
            if (start >= fileSize) {
                webviewPanel.webview.postMessage({
                    type: 'chunkResponse',
                    chunkIndex,
                    data: null,
                    isLastChunk: true
                });
                return;
            }
            // Use streaming approach for better memory efficiency with large chunks
            let buffer;
            const chunkSizeMB = (end - start) / (1024 * 1024);
            if (chunkSizeMB > 50) {
                // For very large chunks (>50MB), use streaming read
                this.logPerformance(`Using streaming read for large chunk: ${chunkSizeMB.toFixed(1)}MB`);
                const stream = fs.createReadStream(optimizedPath, { start, end: end - 1 });
                const chunks = [];
                for await (const chunk of stream) {
                    chunks.push(chunk);
                }
                buffer = Buffer.concat(chunks);
            }
            else {
                // Use traditional approach for smaller chunks
                buffer = Buffer.alloc(end - start);
                const fd = fs.openSync(optimizedPath, 'r');
                try {
                    fs.readSync(fd, buffer, 0, end - start, start);
                }
                finally {
                    fs.closeSync(fd);
                }
            }
            const isLastChunk = end >= fileSize;
            // Convert to Uint8Array for direct transfer (no Array.from conversion)
            const uint8Data = new Uint8Array(buffer);
            webviewPanel.webview.postMessage({
                type: 'chunkResponse',
                chunkIndex,
                data: uint8Data,
                isLastChunk,
                totalSize: fileSize
            });
            this.logPerformance(`Sent chunk ${chunkIndex}: ${start}-${end} of ${fileSize} bytes`);
            // Optimized GC: Only force garbage collection every 5 chunks to reduce overhead
            if (global.gc && chunkIndex % 5 === 0) {
                global.gc();
                this.logPerformance(`Forced garbage collection after chunk batch ending at ${chunkIndex}`);
            }
        }
        catch (error) {
            this.logPerformance(`Error sending chunk: ${error}`);
            webviewPanel.webview.postMessage({
                type: 'chunkError',
                error: error instanceof Error ? error.message : String(error)
            });
            // Also force GC on error to clean up any partial buffers
            if (global.gc) {
                global.gc();
            }
        }
    }
    
    // New optimized parallel chunk processing method for 1GB+ files
    async handleParallelChunkRequest(document, webviewPanel, message) {
        try {
            const { startChunkIndex, batchSize = 5, chunkSize = 10 * 1024 * 1024 } = message;
            const optimizedPath = this.optimizedPaths.get(document.uri.toString()) || document.uri.fsPath;
            const stats = fs.statSync(optimizedPath);
            const fileSize = stats.size;
            
            this.logPerformance(`Processing parallel chunk batch: ${startChunkIndex} to ${startChunkIndex + batchSize - 1}`);
            
            // Process multiple chunks in parallel
            const chunkPromises = [];
            for (let i = 0; i < batchSize; i++) {
                const chunkIndex = startChunkIndex + i;
                const start = chunkIndex * chunkSize;
                const end = Math.min(start + chunkSize, fileSize);
                
                if (start >= fileSize) break;
                
                chunkPromises.push(this.processChunkAsync(optimizedPath, chunkIndex, start, end, fileSize));
            }
            
            // Wait for all chunks in the batch to complete
            const chunkResults = await Promise.all(chunkPromises);
            
            // Send all chunks in the batch at once
            for (const chunkResult of chunkResults) {
                if (chunkResult) {
                    webviewPanel.webview.postMessage(chunkResult);
                }
            }
            
            // Optimized batch GC: Only after processing the entire batch
            if (global.gc) {
                global.gc();
                this.logPerformance(`Batch GC after processing chunks ${startChunkIndex}-${startChunkIndex + batchSize - 1}`);
            }
            
        } catch (error) {
            this.logPerformance(`Error in parallel chunk processing: ${error}`);
            webviewPanel.webview.postMessage({
                type: 'chunkError',
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    
    // Helper method for async chunk processing
    async processChunkAsync(filePath, chunkIndex, start, end, totalSize) {
        try {
            let buffer;
            const chunkSizeMB = (end - start) / (1024 * 1024);
            
            if (chunkSizeMB > 50) {
                // For very large chunks, use streaming read
                const stream = fs.createReadStream(filePath, { start, end: end - 1 });
                const chunks = [];
                for await (const chunk of stream) {
                    chunks.push(chunk);
                }
                buffer = Buffer.concat(chunks);
            } else {
                // Use direct file read for normal chunks
                buffer = Buffer.alloc(end - start);
                const fd = fs.openSync(filePath, 'r');
                try {
                    fs.readSync(fd, buffer, 0, end - start, start);
                } finally {
                    fs.closeSync(fd);
                }
            }
            
            const isLastChunk = end >= totalSize;
            const uint8Data = new Uint8Array(buffer);
            
            this.logPerformance(`Processed async chunk ${chunkIndex}: ${start}-${end} (${chunkSizeMB.toFixed(1)}MB)`);
            
            return {
                type: 'chunkResponse',
                chunkIndex,
                data: uint8Data,
                isLastChunk,
                totalSize
            };
            
        } catch (error) {
            this.logPerformance(`Error processing async chunk ${chunkIndex}: ${error}`);
            return null;
        }
    }
    
    loadFile(document, webviewPanel) {
        // Check file size for streaming decision
        const optimizedPath = this.optimizedPaths.get(document.uri.toString()) || document.uri.fsPath;
        const stats = fs.statSync(optimizedPath);
        const fileSizeMB = stats.size / (1024 * 1024);
        // Use original document filename, not optimized path
        const fileName = path.basename(document.uri.fsPath);
        
        this.logPerformance(`[VSCode] File size: ${fileSizeMB.toFixed(2)}MB, File name: ${fileName}`);
        
        // Send file info to webview
        webviewPanel.webview.postMessage({
            type: 'fileInfo',
            fileName: fileName,
            fileSize: stats.size,
            fileSizeMB: fileSizeMB
        });
        
        // For files > 1GB, don't auto-start streaming here since it will be handled by requestStreamingFallback
        if (fileSizeMB > 500 && fileSizeMB <= 1000) { 
            // Only auto-start streaming for files between 500MB and 1GB
            webviewPanel.webview.postMessage({
                type: 'startStreaming',
                fileSize: stats.size,
                chunkSize: 10 * 1024 * 1024, // 10MB chunks for faster processing
                filename: fileName
            });
        }
        this.logPerformance(`[VSCode] Webview is ready for document: ${document.uri.fsPath}`);
    }
    getSettings(webview, document) {
        const config = vscode.workspace.getConfiguration("supersplat");
        const optimizedPath = this.optimizedPaths.get(document.uri.toString()) || document.uri.fsPath;
        const fileToLoadUri = vscode.Uri.file(optimizedPath);
        const fileToLoad = webview.asWebviewUri(fileToLoadUri);
        const optimizedStats = fs.statSync(optimizedPath);
        const optimizedFileSizeMB = optimizedStats.size / (1024 * 1024);
        
        // For large files (>500MB), don't set fileToLoad to prevent direct loading attempts
        const shouldUseStreaming = optimizedFileSizeMB > 500;
        
        const initialData = {
            fileToLoad: shouldUseStreaming ? "" : fileToLoad.toString(), // Empty for streaming mode
            backgroundColor: config.get("backgroundColor", "#1e1e1e"),
            enableEditing: config.get("enableEditing", true),
            showGrid: config.get("showGrid", true),
            showAxes: config.get("showAxes", true),
            optimizedLoading: true,
            fileSizeMB: optimizedFileSizeMB,
            useStreaming: shouldUseStreaming, // Explicit streaming flag
        };
        return `<meta id="vscode-supersplat-data" data-settings="${JSON.stringify(initialData).replace(/"/g, "&quot;")}">`;
    }
    getHtmlForWebview(webview, document) {
        const optimizedPath = this.optimizedPaths.get(document.uri.toString()) || document.uri.fsPath;
        const fileToLoadUri = vscode.Uri.file(optimizedPath);
        const fileToLoad = webview.asWebviewUri(fileToLoadUri);
        const integrationUri = this.getMediaWebviewUri(webview, "optimized-vscode-supersplat.js");
        const gpuOptimizerUri = this.getMediaWebviewUri(webview, "gpu-buffer-optimizer.js");
        const styleUri = this.getMediaWebviewUri(webview, "supersplat/index.css");
        const mediaUri = this.getMediaWebviewUri(webview, "supersplat/");
        const nonce = (0, utils_1.getNonce)();
        this.logPerformance(`[SuperSplat] HTML Generation Debug:`);
        this.logPerformance(`  originalFile: ${document.uri.fsPath}`);
        this.logPerformance(`  optimizedFile: ${optimizedPath}`);
        this.logPerformance(`  fileToLoad: ${fileToLoad}`);
        this.logPerformance(`  integrationUri: ${integrationUri}`);
        this.logPerformance(`  gpuOptimizerUri: ${gpuOptimizerUri}`);
        this.logPerformance(`  styleUri: ${styleUri}`);
        this.logPerformance(`  mediaUri: ${mediaUri}`);
        this.logPerformance(`  nonce: ${nonce}`);
        const settingsHTML = this.getSettings(webview, document);
        this.logPerformance(`[SuperSplat] Generated settings HTML: ${settingsHTML}`);
        const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'self' ${webview.cspSource} https: http: 'unsafe-eval' 'unsafe-inline' blob: data: *; img-src 'self' ${webview.cspSource} https: http: 'unsafe-eval' blob: data: *; style-src 'self' ${webview.cspSource} https: http: 'unsafe-inline' blob: data: *; script-src 'self' ${webview.cspSource} https: http: 'unsafe-inline' 'unsafe-eval' blob: data: *; connect-src 'self' ${webview.cspSource} https: http: blob: data: *; worker-src 'self' ${webview.cspSource} blob: data:; child-src 'self' ${webview.cspSource} blob: data:;">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">

        <base href="${mediaUri.toString()}">
        <link href="${styleUri.toString()}" rel="stylesheet" />
        ${settingsHTML}

        <title>SuperSplat Viewer</title>
      </head>
      <body>
        <script nonce="${nonce}" src="${gpuOptimizerUri.toString()}"></script>
        <script nonce="${nonce}" src="${integrationUri.toString()}"></script>
      </body>
      </html>`;
        this.logPerformance(`[SuperSplat] Generated HTML length: ${html.length} characters`);
        this.logPerformance(`[SuperSplat] HTML preview: \n${html.substring(0, 500)}...`);
        return html;
    }
    
    async handleOpenFileDialog(document, webviewPanel, message) {
        console.log('handleOpenFileDialog called with message:', message);
        this.logPerformance(`[FILE_DIALOG] Received openFileDialog request: ${JSON.stringify(message)}`);
        
        try {
            // Set default URI to workspace folder for SSH compatibility
            const workspaceFolders = vscode.workspace.workspaceFolders;
            let defaultUri = undefined;
            
            if (workspaceFolders && workspaceFolders.length > 0) {
                defaultUri = workspaceFolders[0].uri;
                console.log('📂 [OPEN] Using workspace as defaultUri:', defaultUri.toString());
            } else {
                console.log('📂 [OPEN] No workspace folder found, using system default');
            }
            
            const options = {
                canSelectMany: message.options?.multiple || false,
                openLabel: 'Open',
                defaultUri: defaultUri,
                filters: {}
            };
            
            // Handle file type filters
            if (message.options?.types && message.options.types.length > 0) {
                message.options.types.forEach(type => {
                    if (type.accept) {
                        Object.keys(type.accept).forEach(mimeType => {
                            const extensions = type.accept[mimeType];
                            if (extensions && extensions.length > 0) {
                                // Convert MIME type to filter name
                                const filterName = type.description || mimeType || 'Files';
                                options.filters[filterName] = extensions.map(ext => ext.replace('.', ''));
                            }
                        });
                    }
                });
            } else {
                // Default to PLY files if no types specified
                options.filters = {
                    'PLY Files': ['ply'],
                    'All Files': ['*']
                };
            }
            
            this.logPerformance(`Opening file dialog with options: ${JSON.stringify(options)}`);
            
            const fileUris = await vscode.window.showOpenDialog(options);
            
            if (fileUris && fileUris.length > 0) {
                // Convert file URIs to file handles compatible with the web API
                const fileHandles = await Promise.all(fileUris.map(async (uri) => {
                    const fileData = await vscode.workspace.fs.readFile(uri);
                    const stats = await vscode.workspace.fs.stat(uri);
                    
                    return {
                        name: path.basename(uri.fsPath),
                        size: stats.size,
                        type: this.getMimeType(uri.fsPath),
                        lastModified: stats.mtime,
                        stream: () => new ReadableStream({
                            start(controller) {
                                controller.enqueue(fileData);
                                controller.close();
                            }
                        }),
                        arrayBuffer: () => Promise.resolve(fileData.buffer),
                        text: () => Promise.resolve(new TextDecoder().decode(fileData)),
                        getFile: () => ({ 
                            name: path.basename(uri.fsPath),
                            size: stats.size,
                            type: this.getMimeType(uri.fsPath),
                            lastModified: stats.mtime,
                            arrayBuffer: () => Promise.resolve(fileData.buffer),
                            text: () => Promise.resolve(new TextDecoder().decode(fileData)),
                            stream: () => new ReadableStream({
                                start(controller) {
                                    controller.enqueue(fileData);
                                    controller.close();
                                }
                            })
                        })
                    };
                }));
                
                // Send file handles back to webview
                const responseMessage = {
                    type: 'fileDialogResponse',
                    requestId: message.requestId,
                    success: true,
                    files: fileHandles
                };
                
                console.log('Sending response to webview:', responseMessage);
                this.logPerformance(`[FILE_DIALOG] Sending response: ${JSON.stringify(responseMessage)}`);
                
                webviewPanel.webview.postMessage(responseMessage);
                
                this.logPerformance(`File dialog completed, selected ${fileHandles.length} files`);
            } else {
                // User cancelled
                webviewPanel.webview.postMessage({
                    type: 'fileDialogResponse',
                    requestId: message.requestId,
                    success: true,
                    files: []
                });
                
                this.logPerformance('File dialog cancelled by user');
            }
        } catch (error) {
            this.logPerformance(`File dialog error: ${error}`);
            webviewPanel.webview.postMessage({
                type: 'fileDialogResponse',
                requestId: message.requestId,
                success: false,
                error: error.message
            });
        }
    }
    
    async handleSave(document, webviewPanel, message) {
        console.log('handleSave called with message:', message);
        this.logPerformance(`[SAVE] Received save request`);
        
        try {
            // Determine if this is PLY export or document save
            const isPlyExport = message.isPlyExport || false;
            const originalFilename = message.originalFilename || 'supersplat-export';
            
            console.log(`[SAVE] isPlyExport: ${isPlyExport}, originalFilename: ${originalFilename}`);
            this.logPerformance(`[SAVE] Save type: ${isPlyExport ? 'PLY Export' : 'Document Save'}`);
            
            // Set appropriate file filters and default name
            const options = {
                defaultUri: vscode.Uri.file(
                    isPlyExport ? 
                        originalFilename.endsWith('.ply') ? originalFilename : `${originalFilename}.ply` :
                        originalFilename.endsWith('.ssproj') ? originalFilename : `${originalFilename}.ssproj`
                ),
                filters: isPlyExport ? {
                    'PLY Files': ['ply'],
                    'All Files': ['*']
                } : {
                    'SuperSplat Project': ['ssproj'],
                    'All Files': ['*']
                }
            };
            
            const fileUri = await vscode.window.showSaveDialog(options);
            
            if (!fileUri) {
                this.logPerformance('Save dialog cancelled by user');
                this.pendingSaveUri = null;
                this.pendingSaveType = null;
                // Send cancellation message to webview
                webviewPanel.webview.postMessage({
                    type: 'saveCancelled'
                });
                return;
            }
            
            this.logPerformance(`Save dialog confirmed: ${fileUri.fsPath}`);
            // Store the target URI and type IMMEDIATELY
            this.pendingSaveUri = fileUri;
            this.pendingSaveType = isPlyExport ? 'ply' : 'document';
            
            // Send confirmation to webview that it can proceed with data collection
            webviewPanel.webview.postMessage({
                type: 'saveDialogConfirmed',
                filePath: fileUri.fsPath,
                isPlyExport: isPlyExport
            });
            
            this.logPerformance(`Save URI set (${this.pendingSaveType}), waiting for data...`);
            
        } catch (error) {
            this.logPerformance(`Save error: ${error}`);
            vscode.window.showErrorMessage(`Failed to save file: ${error.message}`);
            this.pendingSaveUri = null;
            this.pendingSaveType = null;
        }
    }
    
    async handleSaveDataComplete(document, webviewPanel, message) {
        console.log('handleSaveDataComplete called with message:', message);
        this.logPerformance(`[SAVE_DATA] Received save data complete`);
        
        try {
            if (!this.pendingSaveUri) {
                throw new Error('No pending save URI found');
            }
            
            if (!message.data || message.data.length === 0) {
                throw new Error('No save data received');
            }
            
            this.logPerformance(`[SAVE_DATA] Received ${message.data.length} data chunks`);
            
            // Log each chunk for debugging
            for (let i = 0; i < message.data.length; i++) {
                const chunk = message.data[i];
                this.logPerformance(`[SAVE_DATA] Chunk ${i}: ${chunk ? chunk.length : 0} bytes`);
            }
            
            // Combine all the data chunks
            const combinedData = Buffer.concat(message.data.map(chunk => Buffer.from(chunk)));
            
            this.logPerformance(`[SAVE_DATA] Combined total: ${combinedData.length} bytes`);
            
            // Check if we have actual data
            if (combinedData.length === 0) {
                throw new Error('No data received from SuperSplat');
            }
            
            // Wait a moment to ensure all data processing is complete
            this.logPerformance(`[SAVE_DATA] Waiting for data collection to complete...`);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Check if this is a ZIP file (Document save exports as ZIP with PLY inside)
            const isZipFile = combinedData.length >= 4 && 
                            combinedData[0] === 0x50 && 
                            combinedData[1] === 0x4B && 
                            (combinedData[2] === 0x03 || combinedData[2] === 0x04);
            
            this.logPerformance(`Data analysis: length=${combinedData.length}, isZip=${isZipFile}, saveType=${this.pendingSaveType}`);
            
            let finalData;
            
            // Handle different save types
            if (this.pendingSaveType === 'ply' && !isZipFile) {
                // PLY export should be direct PLY file
                console.log('SuperSplat provided direct PLY file');
                finalData = combinedData;
                this.logPerformance(`Direct PLY file: ${finalData.length} bytes`);
                
                // Verify PLY header
                const dataStr = combinedData.toString('utf8', 0, Math.min(500, combinedData.length));
                if (dataStr.startsWith('ply')) {
                    const vertexMatch = dataStr.match(/element vertex (\d+)/);
                    if (vertexMatch) {
                        this.logPerformance(`PLY file has ${vertexMatch[1]} vertices`);
                    }
                } else {
                    this.logPerformance(`WARNING: Expected PLY file but header not found`);
                }
                
            } else if (this.pendingSaveType === 'document' && !isZipFile) {
                // Document save should be ZIP, but we got direct data
                console.log('Document save received non-ZIP data - saving as-is');
                finalData = combinedData;
                vscode.window.showWarningMessage(`Document save received unexpected format. Saving as-is.`);
                
            } else if (isZipFile) {
                console.log('SuperSplat provided ZIP file - extracting PLY content');
                
                try {
                    // Search for PLY content in binary data (avoid string conversion which corrupts binary)
                    const plyHeaderBytes = Buffer.from('ply\nformat binary_little_endian', 'utf8');
                    
                    // Find PLY header position in the ZIP file
                    let plyStartIndex = -1;
                    for (let i = 0; i <= combinedData.length - plyHeaderBytes.length; i++) {
                        let found = true;
                        for (let j = 0; j < plyHeaderBytes.length; j++) {
                            if (combinedData[i + j] !== plyHeaderBytes[j]) {
                                found = false;
                                break;
                            }
                        }
                        if (found) {
                            plyStartIndex = i;
                            break;
                        }
                    }
                    
                    if (plyStartIndex === -1) {
                        throw new Error('Could not find PLY header in ZIP file');
                    }
                    
                    this.logPerformance(`Found PLY header at position: ${plyStartIndex}`);
                    
                    // Find end_header to determine where binary data starts
                    const endHeaderBytes = Buffer.from('end_header\n', 'utf8');
                    let headerEndIndex = -1;
                    
                    for (let i = plyStartIndex; i <= combinedData.length - endHeaderBytes.length; i++) {
                        let found = true;
                        for (let j = 0; j < endHeaderBytes.length; j++) {
                            if (combinedData[i + j] !== endHeaderBytes[j]) {
                                found = false;
                                break;
                            }
                        }
                        if (found) {
                            headerEndIndex = i + endHeaderBytes.length;
                            break;
                        }
                    }
                    
                    if (headerEndIndex === -1) {
                        throw new Error('Could not find end_header in PLY file');
                    }
                    
                    this.logPerformance(`Found end_header at position: ${headerEndIndex}`);
                    
                    // Find the end of PLY data by looking for next ZIP entry (PK header)
                    const pkHeader = Buffer.from([0x50, 0x4B]); // "PK"
                    let plyEndIndex = combinedData.length;
                    
                    for (let i = headerEndIndex + 1000; i <= combinedData.length - 2; i++) {
                        if (combinedData[i] === pkHeader[0] && combinedData[i + 1] === pkHeader[1]) {
                            plyEndIndex = i;
                            break;
                        }
                    }
                    
                    this.logPerformance(`PLY data ends at position: ${plyEndIndex}`);
                    
                    // Extract the complete PLY file (header + binary data)
                    finalData = combinedData.slice(plyStartIndex, plyEndIndex);
                    
                    this.logPerformance(`Extracted PLY from ZIP: ${finalData.length} bytes`);
                    
                    // Verify the extracted PLY
                    const headerPart = finalData.toString('utf8', 0, Math.min(1000, headerEndIndex - plyStartIndex));
                    const vertexMatch = headerPart.match(/element vertex (\d+)/);
                    if (vertexMatch) {
                        const vertexCount = parseInt(vertexMatch[1]);
                        const binaryDataSize = finalData.length - (headerEndIndex - plyStartIndex);
                        this.logPerformance(`Extracted PLY: ${vertexCount} vertices, ${binaryDataSize} bytes binary data`);
                    }
                    
                } catch (zipError) {
                    console.warn('Failed to extract PLY from ZIP:', zipError.message);
                    this.logPerformance(`ZIP extraction failed: ${zipError.message}`);
                    
                    // Fallback: save the raw ZIP file with warning
                    finalData = combinedData;
                    vscode.window.showWarningMessage(`Could not extract PLY from ZIP file. Saved as raw ZIP (${combinedData.length} bytes).`);
                }
            } else {
                // Check if it's already a PLY file
                const dataStr = combinedData.toString('utf8', 0, Math.min(1000, combinedData.length));
                const hasHeader = dataStr.startsWith('ply');
                
                if (hasHeader) {
                    console.log('SuperSplat provided complete PLY file - using as-is');
                    finalData = combinedData;
                    this.logPerformance(`Direct PLY file: ${combinedData.length} bytes`);
                } else {
                    console.log('SuperSplat provided unknown format');
                    finalData = combinedData;
                    vscode.window.showWarningMessage(`Unknown file format received (${combinedData.length} bytes).`);
                }
            }
            
            // Final validation before saving
            if (!finalData || finalData.length === 0) {
                throw new Error('Final data is empty after processing');
            }
            
            // Validate that we have a reasonable file size
            if (finalData.length < 1000) {
                this.logPerformance(`WARNING: File size is very small (${finalData.length} bytes)`);
                vscode.window.showWarningMessage(`File size is unexpectedly small (${finalData.length} bytes). The save may be incomplete.`);
            }
            
            // Store the URI temporarily
            const targetUri = this.pendingSaveUri;
            const saveType = this.pendingSaveType;
            this.pendingSaveUri = null; // Clear it early to prevent race conditions
            this.pendingSaveType = null;
            
            this.logPerformance(`[SAVE_DATA] Final validation passed. Writing ${finalData.length} bytes to: ${targetUri.fsPath}`);
            
            // Write the complete file atomically
            await vscode.workspace.fs.writeFile(targetUri, finalData);
            
            this.logPerformance(`[SAVE_DATA] File written successfully: ${targetUri.fsPath}`);
            vscode.window.showInformationMessage(`${saveType === 'ply' ? 'PLY file' : 'Document'} saved successfully: ${path.basename(targetUri.fsPath)} (${finalData.length} bytes)`);
            
        } catch (error) {
            this.logPerformance(`Save data complete error: ${error}`);
            vscode.window.showErrorMessage(`Failed to save file data: ${error.message}`);
            this.pendingSaveUri = null;
            this.pendingSaveType = null;
        }
    }
    
    async handleSaveStart(document, webviewPanel, message) {
        console.log('handleSaveStart called with message:', message);
        this.logPerformance(`[SAVE_START] Received save start`);
        
        try {
            const { requestId, filename, totalChunks, totalSize } = message;
            
            // Show save dialog - use workspace folder for SSH compatibility
            const workspaceFolders = vscode.workspace.workspaceFolders;
            console.log('💾 [SAVE] Workspace folders:', workspaceFolders?.map(f => f.uri.toString()));
            
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('Open a folder on the SSH host first (Remote-SSH workspace required).');
            }
            
            // Debug workspace URI details
            const ws = workspaceFolders[0];
            console.log('💾 [SAVE] Workspace URI scheme:', ws.uri.scheme);
            console.log('💾 [SAVE] Workspace URI authority:', ws.uri.authority);
            console.log('💾 [SAVE] Workspace URI path:', ws.uri.path);
            console.log('💾 [SAVE] Is Remote SSH?', ws.uri.scheme.startsWith('vscode-remote'));
            
            // ALWAYS use workspace-based URI for remote compatibility
            const defaultUri = vscode.Uri.joinPath(ws.uri, filename);
            console.log('💾 [SAVE] Remote-compatible defaultUri:', defaultUri.toString());
            console.log('💾 [SAVE] DefaultUri scheme:', defaultUri.scheme);
            console.log('💾 [SAVE] DefaultUri authority:', defaultUri.authority);
            
            const targetUri = await vscode.window.showSaveDialog({
                defaultUri: defaultUri,
                filters: { 'PLY Files': ['ply'], 'All Files': ['*'] }
            });
            
            if (targetUri) {
                console.log('💾 [SAVE] Selected targetUri:', targetUri.toString());
            }
            
            if (!targetUri) {
                this.logPerformance('Save dialog cancelled by user');
                webviewPanel.webview.postMessage({ type: 'error', message: 'Save cancelled' });
                return;
            }
            
            // Initialize save state
            this.saves.set(requestId, {
                filename,
                totalChunks,
                received: 0,
                parts: new Array(totalChunks),
                totalSize,
                targetUri
            });
            
            this.logPerformance(`[SAVE_START] Save initialized: ${filename}, ${totalSize} bytes, ${totalChunks} chunks`);
            
        } catch (error) {
            this.logPerformance(`Save start error: ${error}`);
            vscode.window.showErrorMessage(`Failed to start save: ${error.message}`);
        }
    }
    
    async handleSaveChunk(document, webviewPanel, message) {
        try {
            const { requestId, index, bytes } = message;
            const saveState = this.saves.get(requestId);
            
            if (!saveState) {
                throw new Error(`Save state not found for requestId: ${requestId}`);
            }
            
            // Store chunk (bytes는 이미 Uint8Array)
            saveState.parts[index] = new Uint8Array(bytes);
            saveState.received += 1;
            
            this.logPerformance(`[SAVE_CHUNK] Received chunk ${saveState.received}/${saveState.totalChunks}: ${bytes.length} bytes`);
            
        } catch (error) {
            this.logPerformance(`Save chunk error: ${error}`);
            console.error('Save chunk error:', error);
        }
    }
    
    async handleSaveCommit(document, webviewPanel, message) {
        console.log('handleSaveCommit called with message:', message);
        this.logPerformance(`[SAVE_COMMIT] Received save commit`);
        
        try {
            const { requestId, byteLength, targetPath } = message;
            const saveState = this.saves.get(requestId);
            
            if (!saveState) {
                throw new Error(`Save state not found for requestId: ${requestId}`);
            }
            
            if (saveState.received !== saveState.totalChunks) {
                throw new Error(`Chunks missing: ${saveState.received}/${saveState.totalChunks}`);
            }
            
            // 하나로 합치기
            const merged = new Uint8Array(byteLength);
            let offset = 0;
            for (let i = 0; i < saveState.totalChunks; i++) {
                const part = saveState.parts[i];
                merged.set(part, offset);
                offset += part.byteLength;
            }
            
            this.logPerformance(`[SAVE_COMMIT] Merged ${merged.length} bytes from ${saveState.totalChunks} chunks`);
            
            // Determine save URI: use targetPath if provided, otherwise use dialog selection
            let finalTargetUri;
            if (targetPath) {
                finalTargetUri = await this.getAbsoluteRemoteUri(targetPath);
                console.log('💾 [SAVE] Using provided targetPath:', finalTargetUri.toString());
            } else {
                finalTargetUri = saveState.targetUri;
                console.log('💾 [SAVE] Using dialog-selected path:', finalTargetUri.toString());
            }
            
            // Ensure parent directory exists
            const parentUri = this.getParentUri(finalTargetUri);
            await vscode.workspace.fs.createDirectory(parentUri);
            
            // 핵심: 인코딩 옵션 없이 "바이트 그대로" 쓰기
            await vscode.workspace.fs.writeFile(finalTargetUri, merged);
            
            this.logPerformance(`[SAVE_COMMIT] File written successfully: ${saveState.targetUri.fsPath}`);
            vscode.window.showInformationMessage(`File saved successfully: ${path.basename(saveState.targetUri.fsPath)} (${merged.length} bytes)`);
            
            // Send success message to webview
            webviewPanel.webview.postMessage({ 
                type: 'save/done', 
                requestId, 
                uri: saveState.targetUri.toString() 
            });
            
            // Clean up
            this.saves.delete(requestId);
            
        } catch (error) {
            this.logPerformance(`Save commit error: ${error}`);
            vscode.window.showErrorMessage(`Failed to save file: ${error.message}`);
            webviewPanel.webview.postMessage({ 
                type: 'error', 
                message: error.message || String(error) 
            });
        }
    }
    
    getMimeType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.ply': 'application/octet-stream',
            '.splat': 'application/octet-stream',
            '.gsplat': 'application/octet-stream',
            '.txt': 'text/plain',
            '.json': 'application/json'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }
}
exports.OptimizedSuperSplatProvider = OptimizedSuperSplatProvider;
// View type name
OptimizedSuperSplatProvider.viewType = "supersplat.viewer";
class WebviewCollection {
    constructor() {
        this._webviews = new Set();
    }
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
//# sourceMappingURL=optimizedSupersplatProvider.js.map