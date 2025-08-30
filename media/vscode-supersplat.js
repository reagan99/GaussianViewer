// VSCode SuperSplat integration wrapper
(function() {
    'use strict';

    // Wait for the DOM to be ready
    function ready(fn) {
        if (document.readyState !== 'loading') {
            fn();
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }

    // Initialize the VSCode SuperSplat integration
    ready(function() {
        // Get settings from meta tag
        const settingsElement = document.getElementById('vscode-supersplat-data');
        const settings = settingsElement ? JSON.parse(settingsElement.getAttribute('data-settings')) : {};

        console.log('VSCode SuperSplat Integration - Settings:', settings);

        // VSCode API
        const vscode = window.vsCodeIntegration?.vscode;
        console.log('VSCode API available:', !!vscode);

        // Set up automatic log collection
        const logBuffer = [];
        const originalConsole = {
            log: console.log,
            error: console.error,
            warn: console.warn,
            info: console.info
        };

        // Override console methods to capture logs
        function captureLog(level, ...args) {
            const timestamp = new Date().toISOString();
            const message = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            
            const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
            logBuffer.push(logEntry);
            
            // Send to VSCode
            if (vscode) {
                vscode.postMessage({
                    type: 'log',
                    level: level,
                    message: message,
                    timestamp: timestamp
                });
            }
            
            // Keep original console behavior
            originalConsole[level].apply(console, args);
        }

        console.log = (...args) => captureLog('log', ...args);
        console.error = (...args) => captureLog('error', ...args);
        console.warn = (...args) => captureLog('warn', ...args);
        console.info = (...args) => captureLog('info', ...args);

        // Function to get all collected logs
        window.getAllLogs = function() {
            return logBuffer.join('\n');
        };

        // Function to send all logs to VSCode
        window.sendAllLogsToVSCode = function() {
            if (vscode) {
                vscode.postMessage({
                    type: 'allLogs',
                    logs: logBuffer
                });
            }
        };
        
        // Override file loading for VSCode integration
        if (window.vsCodeIntegration && window.vsCodeIntegration.fileToLoad) {
            // Patch the file loading mechanism to use VSCode's file URI
            const originalFetch = window.fetch;
            window.fetch = function(url, options) {
                if (url === settings.fileToLoad || url.endsWith('.ply') || url.endsWith('.splat')) {
                    // Use VSCode's webview URI for file loading
                    return originalFetch(window.vsCodeIntegration.fileToLoad, options);
                }
                return originalFetch(url, options);
            };

            // Override file input handling
            const originalFileHandler = window.FileReader;
            if (originalFileHandler) {
                // Patch file reading to work with VSCode's file system
                const originalReadAsArrayBuffer = originalFileHandler.prototype.readAsArrayBuffer;
                originalFileHandler.prototype.readAsArrayBuffer = function(file) {
                    if (file && file.path && file.path.includes('vscode-webview')) {
                        // Handle VSCode webview file URIs
                        fetch(file.path).then(response => response.arrayBuffer()).then(buffer => {
                            this.result = buffer;
                            if (this.onload) this.onload({ target: this });
                        }).catch(error => {
                            if (this.onerror) this.onerror(error);
                        });
                        return;
                    }
                    return originalReadAsArrayBuffer.call(this, file);
                };
            }
        }

        // Apply VSCode settings
        if (settings) {
            // Apply background color
            if (settings.backgroundColor) {
                document.body.style.backgroundColor = settings.backgroundColor;
            }

            // Store settings for SuperSplat to use
            window.vsCodeSettings = settings;
        }

        // Message handling
        if (vscode) {
            window.addEventListener('message', function(event) {
                const message = event.data;
                
                // Note: File loading messages are handled inside `loadFileIntoSuperSplat`
                // to avoid conflicts. We only handle other message types here.
                switch (message.type) {
                    case 'init':
                        // Initialize SuperSplat
                        initializeSuperSplat();
                        break;
                    case 'update':
                        // Handle file updates
                        if (window.scene) {
                            window.scene.forceRender = true;
                        }
                        break;
                    case 'modelRefresh':
                        // Handle model refresh
                        location.reload();
                        break;
                }
            });

            // Send messages to VSCode
            window.sendToVSCode = function(type, data) {
                vscode.postMessage({ type: type, data: data });
            };
        }

        // Initialize SuperSplat when ready
        let isInitializing = false;
        function initializeSuperSplat() {
            if (isInitializing) {
                console.log('SuperSplat initialization already in progress, skipping...');
                return;
            }
            isInitializing = true;
            
            console.log('Starting SuperSplat initialization...');
            
            // Load SuperSplat main script
            const script = document.createElement('script');
            script.type = 'module';
            script.src = './index.js';
            
            script.onload = function() {
                console.log('SuperSplat script loaded successfully');
                
                // SuperSplat main() is called automatically when the script loads
                // We need to wait for the scene to be available
                console.log('Waiting for SuperSplat scene to be available...');
                
                // Poll for scene availability
                const checkScene = () => {
                    if (window.scene) {
                        console.log('window.scene available');
                        
                        if (window.scene.events) {
                            console.log('window.scene.events available');
                            
                            // Override save functionality
                            window.scene.events.on('save', (data) => {
                                console.log('Save event triggered');
                                if (vscode) {
                                    vscode.postMessage({ type: 'save', data: data });
                                }
                            });
                            
                            window.scene.events.on('export', (data) => {
                                console.log('Export event triggered');
                                if (vscode) {
                                    vscode.postMessage({ type: 'export', data: data });
                                }
                            });
                            
                            // Auto-load file if specified
                            if (settings.fileToLoad) {
                                console.log('Attempting to load file:', settings.fileToLoad);
                                loadFileIntoSuperSplat(settings.fileToLoad).catch(error => {
                                    console.error('Failed to load file:', error);
                                });
                            } else {
                                console.log('No fileToLoad specified in settings');
                            }
                        } else {
                            console.error('window.scene.events not available');
                        }
                    } else {
                        console.log('window.scene not yet available, retrying...');
                        setTimeout(checkScene, 500);
                    }
                };
                
                // Start checking for scene availability
                setTimeout(checkScene, 1000);
            };
            
            script.onerror = function(error) {
                console.error('Failed to load SuperSplat script:', error);
            };
            
            console.log('Adding script to document head...');
            document.head.appendChild(script);
        }
        
        // Load file into SuperSplat (Memory-Efficient Version)
        async function loadFileIntoSuperSplat(fileUri) {
            console.log('loadFileIntoSuperSplat called with:', fileUri);
            
            try {
                // Request file data from VSCode instead of fetching directly
                console.log('Requesting file data from VSCode...');
                const requestId = 'file-request-' + Date.now();
                
                // Set up promise to wait for file data
                const fileDataPromise = new Promise((resolve, reject) => {
                    // Store decoded binary chunks directly
                    let binaryChunks = []; 
                    let expectedTotalChunks = 0;
                    let receivedChunksCount = 0;
                    let filename = '';
                    
                    const timeout = setTimeout(() => {
                        window.removeEventListener('message', messageHandler);
                        reject(new Error('File transfer timeout (10 minutes)'));
                    }, 10 * 60 * 1000); // 10 minutes timeout
                    
                    const messageHandler = (event) => {
                        const message = event.data;
                        
                        if (message.requestId !== requestId) return;

                        // Handle small files (sent in one go)
                        if (message.type === 'fileData') {
                            console.log('Received single file data from VSCode, size:', message.data.length);
                            clearTimeout(timeout);
                            window.removeEventListener('message', messageHandler);
                            
                            const binaryString = atob(message.data);
                            const bytes = new Uint8Array(binaryString.length);
                            for (let i = 0; i < binaryString.length; i++) {
                                bytes[i] = binaryString.charCodeAt(i);
                            }
                            const blob = new Blob([bytes]);
                            resolve({ blob: blob, filename: message.filename });
                        
                        // Start of chunked transfer
                        } else if (message.type === 'fileTransferStart') {
                            console.log(`Starting chunked file transfer for ${message.filename}...`);
                            console.log(`Total chunks: ${message.totalChunks}, Total size: ${(message.totalSize / (1024 * 1024)).toFixed(2)} MB`);
                            
                            expectedTotalChunks = message.totalChunks;
                            filename = message.filename;
                            // Pre-allocate array for performance
                            binaryChunks = new Array(expectedTotalChunks);
                        
                        // Receiving a chunk
                        } else if (message.type === 'fileChunk') {
                            // Decode base64 chunk immediately into a Uint8Array
                            const binaryString = atob(message.data);
                            const chunkBytes = new Uint8Array(binaryString.length);
                            for (let i = 0; i < binaryString.length; i++) {
                                chunkBytes[i] = binaryString.charCodeAt(i);
                            }
                            
                            binaryChunks[message.chunkIndex] = chunkBytes;
                            receivedChunksCount++;

                            const progress = (receivedChunksCount / expectedTotalChunks) * 100;
                            if (message.chunkIndex % Math.ceil(expectedTotalChunks / 20) === 0 || message.isLastChunk) {
                                console.log(`Chunk transfer progress: ${progress.toFixed(1)}% (${receivedChunksCount}/${expectedTotalChunks})`);
                            }
                            
                            // Check if all chunks are received
                            if (message.isLastChunk || receivedChunksCount === expectedTotalChunks) {
                                console.log('All chunks received, assembling file...');
                                clearTimeout(timeout);
                                window.removeEventListener('message', messageHandler);
                                
                                // Verify all chunks are present
                                const missingChunks = [];
                                for (let i = 0; i < binaryChunks.length; i++) {
                                    if (!binaryChunks[i]) {
                                        missingChunks.push(i);
                                    }
                                }
                                
                                if (missingChunks.length > 0) {
                                    reject(new Error(`Missing chunks: ${missingChunks.join(', ')}`));
                                    return;
                                }

                                // Create a Blob directly from the array of Uint8Arrays.
                                // This is highly memory-efficient as it avoids creating a single large buffer in JS.
                                const blob = new Blob(binaryChunks);
                                console.log('Large file assembled from chunks, size:', blob.size, 'bytes');
                                
                                resolve({ blob: blob, filename: filename });
                            }
                            
                        } else if (message.type === 'fileError') {
                            console.error('Error from VSCode:', message.error);
                            clearTimeout(timeout);
                            window.removeEventListener('message', messageHandler);
                            reject(new Error(message.error));
                        }
                    };
                    
                    window.addEventListener('message', messageHandler);
                });
                
                // Send file request to VSCode
                if (vscode) {
                    vscode.postMessage({
                        type: 'requestFile',
                        fileUri: fileUri,
                        requestId: requestId
                    });
                }
                
                // Wait for the promise to resolve with the blob and filename
                const { blob, filename } = await fileDataPromise;
                
                const url = URL.createObjectURL(blob);
                console.log('Blob URL created:', url);
                
                // Use SuperSplat's import event to load the file
                if (window.scene && window.scene.events) {
                    console.log('Invoking import event...');
                    await window.scene.events.invoke('import', url, filename);
                    console.log('File loaded successfully:', filename);
                } else {
                    console.error('Scene or events not available for import');
                }
                
                // Clean up the created object URL
                URL.revokeObjectURL(url);
                console.log('Blob URL revoked');
                
            } catch (error) {
                console.error('Error loading file:', error);
                if (vscode) {
                    vscode.postMessage({ 
                        type: 'error', 
                        message: `Failed to load file: ${error.message}` 
                    });
                }
            }
        }

        // Add a debug helper function
        window.debugSuperSplat = function() {
            console.log('=== SuperSplat Debug Info ===');
            console.log('Settings:', settings);
            console.log('VSCode Integration:', window.vsCodeIntegration);
            console.log('Window.main:', typeof window.main);
            console.log('Window.scene:', !!window.scene);
            console.log('Window.scene.events:', !!window.scene?.events);
            console.log('Available globals:', Object.keys(window).filter(key => key.toLowerCase().includes('scene') || key.toLowerCase().includes('main')));
            
            // Check if script is loaded
            const scripts = Array.from(document.scripts);
            console.log('Loaded scripts:', scripts.map(s => s.src));
            
            // Check base href
            const base = document.querySelector('base');
            console.log('Base href:', base?.href);
        };
        
        // Initialize SuperSplat immediately
        initializeSuperSplat();
        
        // Send initial logs after a delay to capture initialization
        setTimeout(() => {
            console.log('Sending initial logs to VSCode...');
            window.sendAllLogsToVSCode();
        }, 5000);
    });
})();