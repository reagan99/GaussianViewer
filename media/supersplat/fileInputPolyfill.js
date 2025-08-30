window.createFileInput = function(options = {}) {
    console.log('🔧 [POLYFILL] createFileInput called with:', options);
    
    // Check if we're in a VS Code webview environment
    if (typeof vscode !== 'undefined' && vscode.postMessage) {
        console.log('🔧 [POLYFILL] Using VS Code API for file selection');
        return new Promise((resolve, reject) => {
            const requestId = 'file_' + Date.now() + '_' + Math.random();
            
            // Set up message listener for response
            const messageHandler = (event) => {
                console.log('Received message in polyfill:', event);
                const message = event.data;
                if (message && message.type === 'fileDialogResponse' && message.requestId === requestId) {
                    window.removeEventListener('message', messageHandler);
                    
                    if (message.success) {
                        console.log('VS Code file dialog completed:', message.files);
                        resolve(message.files || []);
                    } else {
                        console.error('VS Code file dialog error:', message.error);
                        reject(new Error(message.error || 'File dialog failed'));
                    }
                }
            };
            
            // Try both message event listeners
            window.addEventListener('message', messageHandler);
            
            // Also try VS Code API specific listener if available
            if (vscode.onDidReceiveMessage) {
                const vscodeHandler = (message) => {
                    console.log('Received VS Code message in polyfill:', message);
                    messageHandler({ data: message });
                };
                vscode.onDidReceiveMessage(vscodeHandler);
            }
            
            // Send request to VS Code extension
            vscode.postMessage({
                type: 'openFileDialog',
                requestId: requestId,
                options: options
            });
            
            // Timeout after 30 seconds
            setTimeout(() => {
                window.removeEventListener('message', messageHandler);
                reject(new Error('File dialog timeout'));
            }, 30000);
        });
    } else {
        // Fallback to HTML input for non-VS Code environments
        console.log('Using HTML input fallback for file selection');
        return new Promise((resolve, reject) => {
            const input = document.createElement("input");
            input.type = "file";
            
            // Handle file type filtering
            if (options.types && options.types.length > 0) {
                const accept = options.types.map(type => {
                    if (type.accept) {
                        return Object.values(type.accept).flat().join(",");
                    }
                    return "*/*";
                }).join(",");
                input.accept = accept;
            } else if (options.excludeAcceptAllOption === false) {
                input.accept = "*/*";
            }
            
            input.multiple = options.multiple || false;
            input.style.display = "none";
            input.style.position = "absolute";
            input.style.left = "-9999px";
            
            const cleanup = () => {
                if (input.parentNode) {
                    input.parentNode.removeChild(input);
                }
            };
            
            input.onchange = (e) => {
                console.log('File input changed, files:', e.target.files);
                const files = Array.from(e.target.files).map(file => ({
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    lastModified: file.lastModified,
                    stream: () => file.stream(),
                    arrayBuffer: () => file.arrayBuffer(),
                    text: () => file.text(),
                    getFile: () => file
                }));
                cleanup();
                resolve(files);
            };
            
            input.oncancel = () => {
                console.log('File input cancelled');
                cleanup();
                resolve([]);
            };
            
            // Handle escape key to cancel
            const handleKeydown = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    document.removeEventListener('keydown', handleKeydown);
                    resolve([]);
                }
            };
            
            document.addEventListener('keydown', handleKeydown);
            document.body.appendChild(input);
            
            // Trigger the file picker
            try {
                input.click();
            } catch (err) {
                console.error('Error clicking input:', err);
                cleanup();
                reject(err);
            }
        });
    }
};
