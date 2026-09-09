// Optimized VSCode SuperSplat integration with minimal logging and IPC overhead
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

    // Initialize the optimized VSCode SuperSplat integration
    ready(function() {
        console.log('🔧 [DEBUG] DOM ready, initializing SuperSplat integration...');
        
        // Get settings from meta tag
        const settingsElement = document.getElementById('vscode-supersplat-data');
        console.log('🔧 [DEBUG] Settings element found:', !!settingsElement);
        console.log('🔧 [DEBUG] All meta elements:', document.querySelectorAll('meta').length);
        console.log('🔧 [DEBUG] Document head HTML:', document.head.innerHTML.substring(0, 1000) + '...');
        
        let settings = {};
        if (settingsElement) {
            try {
                const settingsAttr = settingsElement.getAttribute('data-settings');
                console.log('🔧 [DEBUG] Settings attribute:', settingsAttr);
                settings = JSON.parse(settingsAttr);
                
                // Check for assembled file fallback
                if (window.useAssembledFile && window.assembledFileUrl) {
                    console.log('🔄 [DEBUG] Using assembled file from fallback globals');
                    settings.fileToLoad = window.assembledFileUrl;
                    settings.fileSizeMB = window.assembledFileSizeMB;
                    settings.useStreaming = false;
                    settings.useClientDynamic = true;
                    
                    // Clean up globals
                    window.useAssembledFile = false;
                    window.assembledFileUrl = null;
                    window.assembledFileSizeMB = null;
                }
            } catch (error) {
                console.error('❌ [DEBUG] Failed to parse settings:', error);
                settings = {};
            }
        } else {
            console.log('❌ [DEBUG] Settings element not found, using defaults');
            
            // Check for assembled file fallback first
            if (window.useAssembledFile && window.assembledFileUrl) {
                console.log('🔄 [DEBUG] Settings element not found, but using assembled file from fallback globals');
                settings = {
                    fileToLoad: window.assembledFileUrl,
                    fileSizeMB: window.assembledFileSizeMB,
                    backgroundColor: '#121212',
                    enableEditing: true,
                    showGrid: true,
                    showAxes: true,
                    optimizedLoading: true,
                    useStreaming: false,
                    useClientDynamic: true
                };
                
                // Clean up globals
                window.useAssembledFile = false;
                window.assembledFileUrl = null;
                window.assembledFileSizeMB = null;
            } else {
                // Provide fallback settings
                settings = {
                    fileToLoad: window.vsCodeIntegration?.fileToLoad || '',
                    backgroundColor: '#121212',
                    enableEditing: true,
                    showGrid: true,
                    showAxes: true,
                    optimizedLoading: true
                };
            }
        }
        console.log('🔧 [DEBUG] Final settings:', settings);
        console.log('🔧 [DEBUG] Use streaming:', settings.useStreaming);
        console.log('🔧 [DEBUG] File size MB:', settings.fileSizeMB);
        console.log('🔧 [DEBUG] FileToLoad URL:', settings.fileToLoad);
        console.log('🔧 [DEBUG] useClientDynamic:', settings.useClientDynamic);
        console.log('🔧 [DEBUG] Is blob URL?', settings.fileToLoad && settings.fileToLoad.startsWith && settings.fileToLoad.startsWith('blob:'));
        
        // Continue with initialization even if settings failed
        console.log('🔧 [DEBUG] Continuing with initialization...');

        // Set global settings for access in initialization
        const finalSettings = settings;
        
        // VSCode API - initialize first
        window.vscode = null; // 전역 변수로 설정
        let vscode = null;
        try {
            vscode = window.vscode = window.acquireVsCodeApi?.() || window.vsCodeIntegration?.vscode || null;
            
            // showSaveFilePicker를 완전히 제거하여 SuperSplat이 fallback 사용하도록 강제
            if (vscode) {
                console.log('🔧 [OVERRIDE] Removing showSaveFilePicker to force fallback...');
                
                // 원본 함수 백업 (필요시)
                if (typeof window.showSaveFilePicker === 'function') {
                    window._originalShowSaveFilePicker = window.showSaveFilePicker;
                }
                
                // showSaveFilePicker를 undefined로 설정
                delete window.showSaveFilePicker;
                window.showSaveFilePicker = undefined;
                
                // 속성을 읽기 전용으로 만들어 SuperSplat이 추가하지 못하게 함
                Object.defineProperty(window, 'showSaveFilePicker', {
                    value: undefined,
                    writable: false,
                    configurable: false
                });
                
                console.log('🔧 [OVERRIDE] showSaveFilePicker removed, SuperSplat will use DownloadWriter fallback');
            }
        } catch (error) {
            console.log('Failed to acquire VS Code API:', error);
        }
        console.log('🔧 [DEBUG] VSCode API available:', !!vscode);
        console.log('🔧 [DEBUG] Window location:', window.location.href);
        console.log('🔧 [DEBUG] Document base URI:', document.baseURI);

        // Initialize variables first (shared across functions)
        let isInitializing = false;
        
        // Initialize performance metrics first
        const perfMetrics = {
            fileLoadStart: 0,
            fileLoadEnd: 0,
            parseStart: 0,
            parseEnd: 0,
            renderStart: 0
        };

        // Setup message handlers immediately after VSCode API initialization
        setupMessageHandlers();
        
        // Check if fileToLoad is a remote path
        function isRemotePath(p) {
            return !!p && (p.startsWith('/') || p.startsWith('vscode-remote://'));
        }
        
        function importFromRemotePath(remotePath) {
            const requestId = 'remote-import-' + Date.now();
            console.log('📥 [IMPORT] Requesting remote file:', remotePath);
            vscode?.postMessage({ type: 'importRemote', requestId, remotePath });
        }
        
        // For very large files (>1GB), use streaming fallback instead of bypass
        if (finalSettings.fileSizeMB > 1000) {
            console.log('🚀 [STREAMING] Large file detected:', finalSettings.fileSizeMB, 'MB');
            console.log('🚀 [STREAMING] Using base64 chunked streaming (1.0.1 style)');
            
            // Initialize SuperSplat first
            initializeSuperSplat();
            
            // Request streaming fallback after a short delay
            setTimeout(() => {
                if (vscode && vscode.postMessage) {
                    console.log('📤 [STREAMING] Requesting streaming fallback for large file...');
                    vscode.postMessage({ 
                        type: 'requestStreamingFallback',
                        fileSize: finalSettings.fileSizeMB * 1024 * 1024,
                        requestId: 'large-file-streaming-' + Date.now()
                    });
                }
            }, 1000);
            return;
        } else if (finalSettings.fileToLoad && isRemotePath(finalSettings.fileToLoad)) {
            console.log('📥 [IMPORT] Remote path detected:', finalSettings.fileToLoad);
            // Initialize SuperSplat first
            initializeSuperSplat();
            // Import from remote path
            setTimeout(() => {
                importFromRemotePath(finalSettings.fileToLoad);
            }, 1000);
            return;
        }
        
        // Send ready message to Extension Host for smaller files
        setTimeout(() => {
            if (vscode && vscode.postMessage) {
                console.log('📤 [WEBVIEW] Sending ready message to Extension Host...');
                vscode.postMessage({ type: 'ready' });
                console.log('✅ [WEBVIEW] Ready message sent successfully');
            }
        }, 500);
        
        function setupMessageHandlers() {
            console.log('🔧 [WEBVIEW] Setting up message handlers...');
            
            if (!vscode) {
                console.log('⚠️ [WEBVIEW] VSCode API not available, skipping message handler setup');
                return;
            }
            
            let streamingState = {
                isStreaming: false,
                chunks: [],
                expectedChunks: 0,
                receivedChunks: 0,
                totalSize: 0
            };
            let cinematicOrbit = null;
            let overlayRenderer = null;
            let pendingOverlayRequest = null;
            let cameraGlyphScale = 1;

            // Use both window message handler and VSCode API for communication
            window.addEventListener('message', event => {
                const message = event.data;
                console.log('📨 [WEBVIEW] Raw window message received:', event);
                console.log('📨 [WEBVIEW] Message data:', message);
                if (!message || !message.type) {
                    console.log('⚠️ [WEBVIEW] Invalid message format, ignoring');
                    return;
                }
                console.log('📨 [WEBVIEW] Processing window message:', message.type);
                handleMessage(message);
            });
            
            // Also try VSCode's built-in message system
            if (vscode && typeof vscode.onDidReceiveMessage === 'function') {
                vscode.onDidReceiveMessage(message => {
                    console.log('📨 [WEBVIEW] Received VSCode API message:', message);
                    console.log('📨 [WEBVIEW] Message type:', message?.type);
                    console.log('📨 [WEBVIEW] Processing VSCode message:', message.type);
                    handleMessage(message);
                });
                console.log('✅ [WEBVIEW] VSCode message handler registered successfully');
                
            } else {
                console.log('⚠️ [WEBVIEW] VSCode onDidReceiveMessage not available');
                console.log('🔍 [WEBVIEW] Available VSCode API methods:', Object.keys(vscode || {}));
            }
            
            // Streaming is reserved for files that cannot be handled by direct webview URLs.
            if (finalSettings.useStreaming) {
                console.log('🚀 [FORCE] Loading large file:', finalSettings.fileSizeMB, 'MB - forcing streaming mode');
                requestStreamingMode(finalSettings);
            }
            createGaussianViewerToolbar();
            installScenePanelControls();
            installTopMenuLayerLift();
            installOrbitInteractionTracking();
            
            function getOptimalChunkSize(fileSize) {
                const fileSizeMB = fileSize / (1024 * 1024);
                
                // Aggressive chunk size for high-end 3DGS environments
                if (fileSizeMB < 1000) { // 500MB - 1GB
                    return 8 * 1024 * 1024; // 8MB - 4x larger!
                } else if (fileSizeMB < 2000) { // 1GB - 2GB
                    return 16 * 1024 * 1024; // 16MB - 4x larger!
                } else if (fileSizeMB < 5000) { // 2GB - 5GB
                    return 32 * 1024 * 1024; // 32MB - massive chunks!
                } else { // > 5GB
                    return 64 * 1024 * 1024; // 64MB - ultimate speed!
                }
            }

            function getOptimalBatchSize(fileSize) {
                const fileSizeMB = fileSize / (1024 * 1024);
                
                // Aggressive batch size for high-end 3DGS environments
                if (fileSizeMB < 1000) { // 500MB - 1GB
                    return 16; // 16 parallel chunks - 2x increase!
                } else if (fileSizeMB < 2000) { // 1GB - 2GB
                    return 20; // 20 parallel chunks - massive parallelism!
                } else if (fileSizeMB < 5000) { // 2GB - 5GB
                    return 24; // 24 parallel chunks - extreme speed!
                } else { // > 5GB
                    return 32; // 32 parallel chunks - maximum throughput!
                }
            }

            function tryNormalModeWithFallback(fileSize, fallbackThreshold = 500 * 1024 * 1024) {
                const fileSizeMB = fileSize / (1024 * 1024);
                console.log(`📊 [LOAD] File size: ${fileSizeMB.toFixed(2)}MB`);
                
                // Simple rule: < 500MB = immediate memory load, >= 500MB = streaming
                if (fileSize < fallbackThreshold) {
                    console.log('🚀 [MEMORY] < 500MB - Using immediate memory load');
                    // Request direct file loading from VSCode
                    if (vscode && vscode.postMessage) {
                        vscode.postMessage({
                            type: 'requestDirectFile',
                            fileSize: fileSize
                        });
                    }
                } else {
                    const optimalChunkSize = getOptimalChunkSize(fileSize);
                    const chunkSizeMB = optimalChunkSize / (1024 * 1024);
                    console.log(`📡 [STREAMING] >= 500MB - Using streaming mode with ${chunkSizeMB}MB chunks`);
                    // Use streaming mode with optimal chunk size and compression hint
                    if (vscode && vscode.postMessage) {
                        vscode.postMessage({
                            type: 'requestStreamingFallback',
                            fileSize: fileSize,
                            chunkSize: optimalChunkSize,
                            enableCompression: fileSizeMB > 500 // Enable compression for all streaming files (>500MB)
                        });
                    }
                }
            }

            function handleMessage(message) {
                
                switch(message.type) {
                    case 'fileInfo':
                        console.log('📋 [FILEINFO] Received file info:', message.fileName);
                        if (message.fileName) {
                            // Store the original filename globally
                            window.originalFileName = message.fileName;
                            console.log('📋 [FILEINFO] Stored original filename:', window.originalFileName);
                        }
                        break;
                        
                    case 'tryNormalMode':
                        console.log('🔧 [DEBUG] Trying normal mode with fallback capability');
                        tryNormalModeWithFallback(message.fileSize, message.fallbackThreshold);
                        break;
                        
                    case 'requestDirectFile':
                        console.log('🚀 [DIRECT] Received direct file data');
                        if (message.fileUri) {
                            console.log('📤 [DIRECT] Loading file directly:', message.fileUri);
                            loadFileIntoSuperSplat(message.fileUri, message.filename);
                        }
                        break;
                        
                    case 'startStreaming':
                        console.log('📥 [STREAMING] ✅ RECEIVED startStreaming message from VSCode');
                        console.log('📥 [STREAMING] File size:', (message.fileSize / (1024 * 1024)).toFixed(2), 'MB');
                        console.log('📥 [STREAMING] Chunk size:', (message.chunkSize / (1024 * 1024)).toFixed(1), 'MB');
                        
                        streamingState.isStreaming = true;
                        streamingState.expectedChunks = Math.ceil(message.fileSize / message.chunkSize);
                        streamingState.chunks = new Array(streamingState.expectedChunks);
                        streamingState.receivedChunks = 0;
                        streamingState.totalSize = message.fileSize;
                        
                        console.log('📥 [STREAMING] Expected total chunks:', streamingState.expectedChunks);
                        console.log('📥 [STREAMING] Initialized streaming state');
                        
                        // For large files (>500MB), use parallel chunk processing for faster loading
                        const fileSizeMB = message.fileSize / (1024 * 1024);
                        if (fileSizeMB > 500) {
                            const optimalBatchSize = getOptimalBatchSize(message.fileSize);
                            console.log(`🚀 [PARALLEL] Large file detected - using parallel chunk processing (${optimalBatchSize} chunks per batch)`);
                            streamingState.useParallel = true;
                            streamingState.batchSize = optimalBatchSize;
                            streamingState.currentBatch = 0;
                            
                            // Request first batch of chunks in parallel
                            requestNextChunkBatch(streamingState, message.chunkSize);
                        } else {
                            // Use traditional sequential processing for smaller files
                            console.log('📤 [STREAMING] Requesting first chunk (0)...');
                            if (vscode && vscode.postMessage) {
                                vscode.postMessage({
                                    type: 'requestChunk',
                                    chunkIndex: 0,
                                    chunkSize: message.chunkSize
                                });
                                console.log('✅ [STREAMING] First chunk request sent');
                            }
                        }
                        break;
                        
                    case 'chunkResponse':
                        handleVSCodeChunk(message, streamingState);
                        break;
                        
                    case 'chunkError':
                        console.error('❌ [DEBUG] VSCode chunk error:', message.error);
                        logPerformance(`VSCode chunk error: ${message.error}`);
                        break;
                        
                    // 1.0.1 스타일 base64 청크 처리
                    case 'fileTransferStart':
                        // 이미 스트리밍 중이면 무시
                        if (streamingState.isStreaming && streamingState.isBase64Mode) {
                            console.log('⚠️ [BASE64] Already streaming, ignoring duplicate fileTransferStart');
                            return;
                        }
                        
                        console.log('🚀 [BASE64] Starting base64 chunked transfer (1.0.1 style)...');
                        console.log('🚀 [BASE64] Total chunks:', message.totalChunks, 'Size:', (message.totalSize / (1024 * 1024)).toFixed(2), 'MB');
                        
                        streamingState.isStreaming = true;
                        streamingState.isBase64Mode = message.encoding !== 'binary';
                        streamingState.expectedChunks = message.totalChunks;
                        streamingState.binaryChunks = new Array(message.totalChunks);
                        streamingState.receivedChunks = 0;
                        streamingState.totalSize = message.totalSize;
                        streamingState.filename = message.filename;
                        streamingState.requestId = message.requestId;
                        
                        console.log(`🚀 [BASE64] Streaming state initialized (mode=${streamingState.isBase64Mode ? 'base64' : 'binary'})`);
                        break;
                        
                    case 'fileChunk':
                        if (message.encoding === 'binary' || !streamingState.isBase64Mode) {
                            handleBinaryChunk(message, streamingState);
                        } else {
                            handleBase64Chunk(message, streamingState);
                        }
                        break;
                        
                    case 'fileError':
                        console.error('❌ [BASE64] File transfer error:', message.error);
                        break;

                    case 'viewpoint/get':
                        handleViewpointGet(message);
                        break;

                    case 'viewpoint/apply':
                        handleViewpointApply(message);
                        break;

                    case 'camera/orbit/start':
                        startCinematicOrbit(message);
                        break;

                    case 'camera/orbit/stop':
                        stopCinematicOrbit();
                        break;

                    case 'overlay/file':
                        handleOverlayFile(message);
                        break;
                }
            }

            function installOrbitInteractionTracking() {
                let pointerAdjusting = false;
                const markUserInput = (event) => {
                    const toolbar = document.getElementById('gaussian-viewer-toolbar');
                    if (event.target instanceof Node && toolbar?.contains(event.target)) {
                        return;
                    }
                    if (cinematicOrbit) {
                        cinematicOrbit.lastUserInput = performance.now();
                    }
                };

                window.addEventListener('pointerdown', event => {
                    pointerAdjusting = true;
                    markUserInput(event);
                }, true);
                window.addEventListener('pointermove', event => {
                    if (pointerAdjusting) {
                        markUserInput(event);
                    }
                }, true);
                window.addEventListener('pointerup', event => {
                    pointerAdjusting = false;
                    markUserInput(event);
                }, true);
                window.addEventListener('pointercancel', event => {
                    pointerAdjusting = false;
                    markUserInput(event);
                }, true);
                window.addEventListener('wheel', markUserInput, true);
                window.addEventListener('keydown', markUserInput, true);
            }

            function createOverlayRequestId(kind) {
                return `overlay-${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            }

            function requestOverlayOpen(kind) {
                if (!vscode?.postMessage) {
                    console.error('VS Code API is not available for overlay loading.');
                    return;
                }
                if (pendingOverlayRequest) {
                    updateOverlayStatus('file picker already open');
                    return;
                }
                const requestId = createOverlayRequestId(kind);
                pendingOverlayRequest = { requestId, kind };
                updateOverlayStatus(`choosing ${kind}...`);
                updateOverlayButtons(true);
                vscode.postMessage({
                    type: 'overlay/open',
                    requestId,
                    kind
                });
            }

            function cancelOverlayOpen() {
                if (!pendingOverlayRequest) {
                    updateOverlayStatus('no pending overlay');
                    return;
                }
                vscode?.postMessage({
                    type: 'overlay/cancel',
                    requestId: pendingOverlayRequest.requestId
                });
                pendingOverlayRequest = null;
                updateOverlayButtons(false);
                updateOverlayStatus('overlay load cancelled');
            }

            async function handleOverlayFile(message) {
                if (pendingOverlayRequest && message.requestId !== pendingOverlayRequest.requestId) {
                    return;
                }
                pendingOverlayRequest = null;
                updateOverlayButtons(false);
                if (message.cancelled) {
                    updateOverlayStatus('overlay load cancelled');
                    return;
                }
                if (!message.success) {
                    console.error('Overlay file load failed:', message.error);
                    updateOverlayStatus('overlay load failed');
                    return;
                }
                try {
                    if (!overlayRenderer) {
                        overlayRenderer = new GaussianViewerOverlayRenderer();
                    }
                    const overlays = message.kind === 'colmap'
                        ? parseColmapReconstructionOverlay(message.filename, message.files, message.format)
                        : [parseAuxiliaryOverlay(message.filename, toUint8Array(message.bytes), message.kind)];
                    for (const overlay of overlays) {
                        overlayRenderer.addOverlay(overlay);
                    }
                    updateOverlayCount();
                    renderOverlayList();
                    updateOverlayStatus(`loaded ${message.filename}`);
                } catch (error) {
                    console.error('Failed to parse overlay:', error);
                    updateOverlayStatus('overlay parse failed');
                    vscode?.postMessage({
                        type: 'error',
                        message: error.message || String(error)
                    });
                }
            }

            function clearOverlays() {
                overlayRenderer?.clear();
                updateOverlayCount();
                renderOverlayList();
                updateOverlayStatus('ready');
            }

            function updateCameraGlyphScale(value) {
                const nextScale = Math.max(0.2, Math.min(3, Number(value) || 1));
                cameraGlyphScale = nextScale;
                overlayRenderer?.setCameraGlyphScale(nextScale);
                updateOverlayStatus(`camera size ${nextScale.toFixed(2)}x`);
            }

            function updateOverlayCount() {
                const countNode = document.querySelector('#gaussian-viewer-toolbar [data-role="overlay-count"]');
                if (countNode) {
                    const overlays = overlayRenderer?.listOverlays() || [];
                    const visible = overlays.filter(overlay => overlay.visible).length;
                    const total = overlays.length;
                    countNode.textContent = total ? `${visible}/${total} overlays visible` : '0 overlays';
                }
            }

            function renderOverlayList() {
                const listNode = document.querySelector('#gaussian-viewer-toolbar [data-role="overlay-list"]');
                if (!listNode) {
                    return;
                }
                listNode.replaceChildren();
                const overlays = overlayRenderer?.listOverlays() || [];
                for (const overlay of overlays) {
                    const row = document.createElement('label');
                    row.className = 'gv-overlay-item';
                    row.title = overlay.filename;

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = overlay.visible;
                    checkbox.addEventListener('change', () => {
                        overlayRenderer?.setOverlayVisible(overlay.id, checkbox.checked);
                        updateOverlayCount();
                        updateOverlayStatus(`${checkbox.checked ? 'shown' : 'hidden'} ${overlay.displayName || overlay.filename}`);
                    });

                    const name = document.createElement('span');
                    name.className = 'gv-overlay-name';
                    name.textContent = overlay.displayName || overlay.filename;

                    const meta = document.createElement('span');
                    meta.className = 'gv-overlay-meta';
                    meta.textContent = overlaySummary(overlay);

                    row.appendChild(checkbox);
                    row.appendChild(name);
                    row.appendChild(meta);
                    listNode.appendChild(row);
                }
            }

            function overlaySummary(overlay) {
                const count = Number(overlay.displayCount ?? overlay.count ?? 0);
                const label = overlay.displayKind || overlay.kind || 'items';
                return `${formatCompactCount(count)} ${label}`;
            }

            function formatCompactCount(value) {
                if (!Number.isFinite(value) || value <= 0) {
                    return '0';
                }
                if (value >= 1000000) {
                    return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
                }
                if (value >= 1000) {
                    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
                }
                return String(Math.round(value));
            }

            function updateOverlayStatus(text) {
                const statusNode = document.querySelector('#gaussian-viewer-toolbar [data-role="overlay-status"]');
                if (statusNode) {
                    statusNode.textContent = text;
                }
            }

            function updateOverlayButtons(isPending) {
                document.querySelectorAll('#gaussian-viewer-toolbar [data-overlay-button]').forEach(button => {
                    button.disabled = isPending;
                });
                const cancelButton = document.querySelector('#gaussian-viewer-toolbar [data-action="overlay-cancel"]');
                if (cancelButton) {
                    cancelButton.disabled = !isPending;
                }
            }

            function createGaussianViewerToolbar() {
                if (document.getElementById('gaussian-viewer-toolbar')) {
                    return;
                }

                const style = document.createElement('style');
                style.textContent = `
                    #gaussian-viewer-toolbar {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                        padding: 5px 7px 6px;
                        border-top: 1px solid rgba(255, 255, 255, 0.08);
                        border-bottom: 1px solid rgba(0, 0, 0, 0.2);
                        background: #303030;
                        font: 12px/1.2 "Helvetica Neue", Arial, Helvetica, sans-serif;
                    }
                    #gaussian-viewer-toolbar.gv-floating {
                        position: fixed;
                        top: 12px;
                        right: 12px;
                        z-index: 2147483647;
                        width: 220px;
                        border: 1px solid rgba(255, 255, 255, 0.18);
                        border-radius: 8px;
                        background: rgba(48, 48, 48, 0.9);
                        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
                        backdrop-filter: blur(10px);
                    }
                    #gaussian-viewer-toolbar .gv-toolbar-title {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        color: #fff;
                        font-weight: bold;
                    }
                    #gaussian-viewer-toolbar .gv-toolbar-row {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    }
                    #gaussian-viewer-toolbar .gv-compact-label {
                        flex: 0 0 auto;
                        color: #9ca3a6;
                        font-size: 10px;
                    }
                    #gaussian-viewer-toolbar input[type="range"] {
                        min-width: 0;
                        flex: 1 1 auto;
                        height: 16px;
                    }
                    #gaussian-viewer-toolbar button,
                    #gaussian-viewer-toolbar select {
                        height: 24px;
                        border: 1px solid #202020;
                        border-radius: 4px;
                        background: #282828;
                        color: #b3aaac;
                        font: inherit;
                    }
                    #gaussian-viewer-toolbar button {
                        width: 28px;
                        flex: 0 0 28px;
                        padding: 0;
                        cursor: pointer;
                    }
                    #gaussian-viewer-toolbar button.gv-wide-button {
                        width: auto;
                        flex: 1 1 auto;
                        padding: 0 5px;
                    }
                    #gaussian-viewer-toolbar button:hover,
                    #gaussian-viewer-toolbar select:hover {
                        color: #fff;
                        background: #202020;
                        box-shadow: 0 0 2px 1px rgba(255, 102, 0, 0.3);
                    }
                    #gaussian-viewer-toolbar button.active {
                        color: #fff;
                        border-color: #f60;
                        background: rgba(255, 102, 0, 0.35);
                    }
                    #gaussian-viewer-toolbar button:disabled,
                    #gaussian-viewer-toolbar select:disabled {
                        opacity: 0.45;
                        cursor: default;
                        box-shadow: none;
                    }
                    #gaussian-viewer-toolbar select {
                        min-width: 0;
                        flex: 1 1 auto;
                        padding: 0 4px;
                    }
                    #gaussian-viewer-toolbar select option {
                        color: #111;
                    }
                    #gaussian-viewer-toolbar .gv-overlay-list {
                        display: flex;
                        flex-direction: column;
                        gap: 1px;
                        max-height: 92px;
                        overflow: auto;
                    }
                    #gaussian-viewer-toolbar .gv-overlay-item {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        min-height: 18px;
                        color: #d1d1d1;
                        cursor: pointer;
                    }
                    #gaussian-viewer-toolbar .gv-overlay-item input {
                        flex: 0 0 auto;
                        margin: 0;
                    }
                    #gaussian-viewer-toolbar .gv-overlay-name {
                        min-width: 0;
                        flex: 1 1 auto;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    #gaussian-viewer-toolbar .gv-overlay-meta {
                        flex: 0 0 auto;
                        color: #8fa1a5;
                        font-size: 10px;
                    }
                    #menu-bar {
                        z-index: 300 !important;
                    }
                    .pcui-menu,
                    .pcui-menu-items,
                    .pcui-overlay,
                    #tooltips-container {
                        z-index: 400 !important;
                    }
                    #scene-panel {
                        z-index: 40 !important;
                    }
                    #scene-panel.gv-scene-panel-moving {
                        cursor: move;
                        user-select: none;
                    }
                    #scene-panel.gv-scene-panel-collapsed {
                        height: auto !important;
                        max-height: 30px;
                    }
                    #scene-panel.gv-scene-panel-collapsed > *:not(.panel-header) {
                        display: none !important;
                    }
                    #scene-panel .panel-header {
                        cursor: move;
                    }
                    #scene-panel .gv-scene-collapse-button {
                        width: 22px;
                        height: 22px;
                        flex: 0 0 22px;
                        margin: 0 2px;
                        padding: 0;
                        border: 1px solid #202020;
                        border-radius: 4px;
                        background: #2c2c2c;
                        color: #b3aaac;
                        font: bold 14px/20px "Helvetica Neue", Arial, Helvetica, sans-serif;
                        cursor: pointer;
                    }
                    #scene-panel .gv-scene-collapse-button:hover {
                        color: #fff;
                        border-color: #f60;
                        background: #202020;
                    }
                    body.gv-menu-layer-active #scene-panel {
                        z-index: 10 !important;
                    }
                `;
                document.head.appendChild(style);

                const toolbar = document.createElement('div');
                toolbar.id = 'gaussian-viewer-toolbar';
                ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick', 'click'].forEach((eventName) => {
                    toolbar.addEventListener(eventName, event => event.stopPropagation());
                });

                const title = document.createElement('div');
                title.className = 'gv-toolbar-title';
                title.textContent = 'GaussianViewer';

                const modeSelect = document.createElement('select');
                modeSelect.title = 'Orbit type';
                [
                    ['turntable', 'Turntable'],
                    ['reverse', 'Reverse'],
                    ['dolly', 'Dolly Orbit'],
                    ['bob', 'Bob Orbit'],
                    ['sway', 'Sway']
                ].forEach(([value, label]) => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = label;
                    modeSelect.appendChild(option);
                });

                const speedSelect = document.createElement('select');
                speedSelect.title = 'Orbit speed';
                [
                    ['15000', 'Normal'],
                    ['30000', 'Slow'],
                    ['8000', 'Fast']
                ].forEach(([value, label]) => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = label;
                    speedSelect.appendChild(option);
                });

                const controlsRow = document.createElement('div');
                controlsRow.className = 'gv-toolbar-row';

                const overlayRow = document.createElement('div');
                overlayRow.className = 'gv-toolbar-row';

                const cameraSizeRow = document.createElement('div');
                cameraSizeRow.className = 'gv-toolbar-row';

                const overlayCount = document.createElement('div');
                overlayCount.dataset.role = 'overlay-count';
                overlayCount.style.color = '#b3aaac';
                overlayCount.style.fontSize = '10px';
                overlayCount.textContent = '0 overlays';

                const overlayStatus = document.createElement('div');
                overlayStatus.dataset.role = 'overlay-status';
                overlayStatus.style.color = '#829193';
                overlayStatus.style.fontSize = '10px';
                overlayStatus.textContent = 'ready';

                const overlayList = document.createElement('div');
                overlayList.dataset.role = 'overlay-list';
                overlayList.className = 'gv-overlay-list';

                const cameraSizeLabel = document.createElement('span');
                cameraSizeLabel.className = 'gv-compact-label';
                cameraSizeLabel.textContent = 'Cam';

                const cameraSizeSlider = document.createElement('input');
                cameraSizeSlider.type = 'range';
                cameraSizeSlider.min = '0.2';
                cameraSizeSlider.max = '3';
                cameraSizeSlider.step = '0.05';
                cameraSizeSlider.value = String(cameraGlyphScale);
                cameraSizeSlider.title = 'COLMAP camera glyph size';
                cameraSizeSlider.addEventListener('input', () => updateCameraGlyphScale(cameraSizeSlider.value));

                const orbitButton = document.createElement('button');
                orbitButton.type = 'button';
                orbitButton.dataset.action = 'orbit';
                orbitButton.textContent = '▶';
                orbitButton.title = 'Start cinematic orbit';
                orbitButton.addEventListener('click', () => {
                    startCinematicOrbit({ mode: modeSelect.value, durationMs: Number(speedSelect.value) });
                });

                const stopButton = document.createElement('button');
                stopButton.type = 'button';
                stopButton.dataset.action = 'stop';
                stopButton.textContent = '■';
                stopButton.title = 'Stop cinematic orbit';
                stopButton.addEventListener('click', () => {
                    stopCinematicOrbit();
                });

                const addPointsButton = document.createElement('button');
                addPointsButton.type = 'button';
                addPointsButton.className = 'gv-wide-button';
                addPointsButton.dataset.overlayButton = 'true';
                addPointsButton.textContent = '+ Points';
                addPointsButton.title = 'Add PLY/BIN/XYZ/TXT/CSV point overlay';
                addPointsButton.addEventListener('click', () => requestOverlayOpen('points'));

                const addMeshButton = document.createElement('button');
                addMeshButton.type = 'button';
                addMeshButton.className = 'gv-wide-button';
                addMeshButton.dataset.overlayButton = 'true';
                addMeshButton.textContent = '+ Mesh';
                addMeshButton.title = 'Add OBJ mesh overlay';
                addMeshButton.addEventListener('click', () => requestOverlayOpen('mesh'));

                const addColmapButton = document.createElement('button');
                addColmapButton.type = 'button';
                addColmapButton.className = 'gv-wide-button';
                addColmapButton.dataset.overlayButton = 'true';
                addColmapButton.textContent = '+ COLMAP';
                addColmapButton.title = 'Add COLMAP sparse folder with points and cameras';
                addColmapButton.addEventListener('click', () => requestOverlayOpen('colmap'));

                const cancelOverlayButton = document.createElement('button');
                cancelOverlayButton.type = 'button';
                cancelOverlayButton.textContent = 'Cancel';
                cancelOverlayButton.className = 'gv-wide-button';
                cancelOverlayButton.dataset.action = 'overlay-cancel';
                cancelOverlayButton.disabled = true;
                cancelOverlayButton.title = 'Cancel pending overlay load';
                cancelOverlayButton.addEventListener('click', cancelOverlayOpen);

                const clearOverlayButton = document.createElement('button');
                clearOverlayButton.type = 'button';
                clearOverlayButton.textContent = '×';
                clearOverlayButton.title = 'Clear overlays';
                clearOverlayButton.addEventListener('click', clearOverlays);

                speedSelect.addEventListener('change', () => {
                    if (cinematicOrbit) {
                        startCinematicOrbit({ mode: modeSelect.value, durationMs: Number(speedSelect.value) });
                    }
                });

                modeSelect.addEventListener('change', () => {
                    if (cinematicOrbit) {
                        startCinematicOrbit({ mode: modeSelect.value, durationMs: Number(speedSelect.value) });
                    }
                });

                controlsRow.appendChild(modeSelect);
                controlsRow.appendChild(speedSelect);
                controlsRow.appendChild(orbitButton);
                controlsRow.appendChild(stopButton);
                overlayRow.appendChild(addPointsButton);
                overlayRow.appendChild(addMeshButton);
                overlayRow.appendChild(addColmapButton);
                overlayRow.appendChild(cancelOverlayButton);
                overlayRow.appendChild(clearOverlayButton);
                cameraSizeRow.appendChild(cameraSizeLabel);
                cameraSizeRow.appendChild(cameraSizeSlider);
                toolbar.appendChild(title);
                toolbar.appendChild(controlsRow);
                toolbar.appendChild(overlayRow);
                toolbar.appendChild(cameraSizeRow);
                toolbar.appendChild(overlayCount);
                toolbar.appendChild(overlayList);
                toolbar.appendChild(overlayStatus);

                const attachToScenePanel = () => {
                    const scenePanel = document.getElementById('scene-panel');
                    if (!scenePanel) {
                        return false;
                    }
                    toolbar.classList.remove('gv-floating');
                    const firstContent = scenePanel.children[1] || null;
                    scenePanel.insertBefore(toolbar, firstContent);
                    return true;
                };

                if (!attachToScenePanel()) {
                    toolbar.classList.add('gv-floating');
                    document.body.appendChild(toolbar);
                    const startTime = Date.now();
                    const timer = setInterval(() => {
                        if (attachToScenePanel() || Date.now() - startTime > 10000) {
                            clearInterval(timer);
                        }
                    }, 250);
                }
            }

            function clamp(value, min, max) {
                return Math.min(Math.max(value, min), max);
            }

            function enhanceScenePanel() {
                const scenePanel = document.getElementById('scene-panel');
                const header = scenePanel?.querySelector?.('.panel-header');
                if (!scenePanel || !header || scenePanel.dataset.gvSceneEnhanced === 'true') {
                    return !!scenePanel;
                }

                scenePanel.dataset.gvSceneEnhanced = 'true';
                scenePanel.style.pointerEvents = 'auto';
                header.title = 'Drag Scene Manager';

                const collapseButton = document.createElement('button');
                collapseButton.type = 'button';
                collapseButton.className = 'gv-scene-collapse-button';
                collapseButton.textContent = '-';
                collapseButton.title = 'Collapse Scene Manager';
                collapseButton.addEventListener('pointerdown', event => event.stopPropagation());
                collapseButton.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const collapsed = scenePanel.classList.toggle('gv-scene-panel-collapsed');
                    collapseButton.textContent = collapsed ? '+' : '-';
                    collapseButton.title = collapsed ? 'Expand Scene Manager' : 'Collapse Scene Manager';
                });
                header.appendChild(collapseButton);

                let dragState = null;
                const interactiveSelector = 'button, input, select, textarea, a, [role="button"], .pcui-button, .panel-header-button, .gv-scene-collapse-button';

                const movePanel = event => {
                    if (!dragState) {
                        return;
                    }
                    event.preventDefault();
                    const panelWidth = scenePanel.offsetWidth || dragState.width;
                    const panelHeight = scenePanel.offsetHeight || dragState.height;
                    const maxLeft = Math.max(0, window.innerWidth - panelWidth - 8);
                    const maxTop = Math.max(0, window.innerHeight - panelHeight - 8);
                    const nextLeft = clamp(dragState.left + event.clientX - dragState.startX, 0, maxLeft);
                    const nextTop = clamp(dragState.top + event.clientY - dragState.startY, 0, maxTop);
                    scenePanel.style.left = `${Math.round(nextLeft)}px`;
                    scenePanel.style.top = `${Math.round(nextTop)}px`;
                    scenePanel.style.right = 'auto';
                    scenePanel.style.bottom = 'auto';
                    scenePanel.style.transform = 'none';
                };

                const stopDrag = event => {
                    if (!dragState) {
                        return;
                    }
                    try {
                        header.releasePointerCapture?.(event.pointerId);
                    } catch (_) {
                        // Some WebView builds throw if capture was already released.
                    }
                    scenePanel.classList.remove('gv-scene-panel-moving');
                    window.removeEventListener('pointermove', movePanel, true);
                    window.removeEventListener('pointerup', stopDrag, true);
                    window.removeEventListener('pointercancel', stopDrag, true);
                    dragState = null;
                };

                header.addEventListener('pointerdown', event => {
                    if (event.button !== 0 || event.target?.closest?.(interactiveSelector)) {
                        return;
                    }
                    const rect = scenePanel.getBoundingClientRect();
                    dragState = {
                        startX: event.clientX,
                        startY: event.clientY,
                        left: rect.left,
                        top: rect.top,
                        width: rect.width,
                        height: rect.height
                    };
                    scenePanel.classList.add('gv-scene-panel-moving');
                    scenePanel.style.left = `${Math.round(rect.left)}px`;
                    scenePanel.style.top = `${Math.round(rect.top)}px`;
                    scenePanel.style.right = 'auto';
                    scenePanel.style.bottom = 'auto';
                    scenePanel.style.transform = 'none';
                    header.setPointerCapture?.(event.pointerId);
                    window.addEventListener('pointermove', movePanel, true);
                    window.addEventListener('pointerup', stopDrag, true);
                    window.addEventListener('pointercancel', stopDrag, true);
                    event.preventDefault();
                });

                return true;
            }

            function installScenePanelControls() {
                if (enhanceScenePanel()) {
                    return;
                }
                const startTime = Date.now();
                const timer = setInterval(() => {
                    if (enhanceScenePanel() || Date.now() - startTime > 10000) {
                        clearInterval(timer);
                    }
                }, 250);
            }

            function installTopMenuLayerLift() {
                let clearTimer = null;
                const activate = () => {
                    document.body.classList.add('gv-menu-layer-active');
                    clearTimeout(clearTimer);
                    clearTimer = setTimeout(() => {
                        document.body.classList.remove('gv-menu-layer-active');
                    }, 1200);
                };

                document.addEventListener('pointerdown', event => {
                    if (event.target?.closest?.('#menu-bar, .pcui-menu, .pcui-menu-items')) {
                        activate();
                    } else {
                        document.body.classList.remove('gv-menu-layer-active');
                    }
                }, true);

                document.addEventListener('mouseover', event => {
                    if (event.target?.closest?.('#menu-bar, .pcui-menu, .pcui-menu-items')) {
                        activate();
                    }
                }, true);
            }

            function waitForSceneEvents(timeoutMs = 5000) {
                if (window.scene && window.scene.events) {
                    return Promise.resolve(window.scene.events);
                }

                return new Promise((resolve, reject) => {
                    const startTime = Date.now();
                    const timer = setInterval(() => {
                        if (window.scene && window.scene.events) {
                            clearInterval(timer);
                            resolve(window.scene.events);
                            return;
                        }
                        if (Date.now() - startTime > timeoutMs) {
                            clearInterval(timer);
                            reject(new Error('SuperSplat scene is not ready.'));
                        }
                    }, 100);
                });
            }

            function toUint8Array(value) {
                if (value instanceof Uint8Array) {
                    return value;
                }
                if (value instanceof ArrayBuffer) {
                    return new Uint8Array(value);
                }
                if (ArrayBuffer.isView(value)) {
                    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
                }
                if (Array.isArray(value)) {
                    return new Uint8Array(value);
                }
                throw new Error('Unsupported overlay byte payload.');
            }

            function findHeaderEnd(bytes) {
                const marker = new TextEncoder().encode('end_header');
                for (let i = 0; i <= bytes.length - marker.length; i++) {
                    let matched = true;
                    for (let j = 0; j < marker.length; j++) {
                        if (bytes[i + j] !== marker[j]) {
                            matched = false;
                            break;
                        }
                    }
                    if (matched) {
                        let end = i + marker.length;
                        while (end < bytes.length && (bytes[end] === 10 || bytes[end] === 13)) {
                            end++;
                        }
                        return end;
                    }
                }
                return -1;
            }

            function parseAuxiliaryOverlay(filename, bytes, kind) {
                const lowerName = filename.toLowerCase();
                if (kind === 'mesh' || lowerName.endsWith('.obj')) {
                    return parseObjOverlay(filename, new TextDecoder().decode(bytes));
                }
                if (lowerName.endsWith('.bin')) {
                    return parseColmapPoints3DBinOverlay(filename, bytes);
                }
                if (lowerName.endsWith('.ply')) {
                    return parsePlyPointOverlay(filename, bytes);
                }
                return parseTextPointOverlay(filename, new TextDecoder().decode(bytes));
            }

            function makePointOverlay(filename, positions, colors = null, pointSize = 2.5) {
                return {
                    kind: 'points',
                    filename,
                    displayName: filename,
                    positions: alignOverlayPositions(positions),
                    colors,
                    count: positions.length / 3,
                    displayCount: positions.length / 3,
                    displayKind: 'pts',
                    pointSize,
                    visible: true
                };
            }

            function normalizeColorChannel(value) {
                const number = Number(value);
                if (!Number.isFinite(number)) {
                    return 1;
                }
                return Math.max(0, Math.min(1, number <= 1 ? number : number / 255));
            }

            function makeMeshOverlay(filename, linePositions) {
                return {
                    kind: 'mesh',
                    filename,
                    displayName: filename,
                    positions: alignOverlayPositions(linePositions),
                    count: linePositions.length / 3,
                    displayCount: linePositions.length / 6,
                    displayKind: 'edges',
                    uniformColor: [1.0, 0.55, 0.08],
                    visible: true
                };
            }

            function makeLineOverlay(filename, linePositions, uniformColor = [0.35, 0.66, 1.0], cameraViews = null, cameraCenters = null) {
                const isCameraOverlay = Array.isArray(cameraViews);
                return {
                    kind: 'mesh',
                    filename,
                    displayName: filename,
                    positions: alignOverlayPositions(linePositions),
                    cameraCenters: cameraCenters ? alignOverlayPositions(cameraCenters) : null,
                    count: linePositions.length / 3,
                    displayCount: isCameraOverlay ? cameraViews.length : linePositions.length / 6,
                    displayKind: isCameraOverlay ? 'cams' : 'edges',
                    uniformColor,
                    cameraViews,
                    visible: true
                };
            }

            function alignOverlayPositions(positions) {
                const aligned = new Float32Array(positions.length);
                for (let i = 0; i < positions.length; i += 3) {
                    aligned[i] = -positions[i];
                    aligned[i + 1] = -positions[i + 1];
                    aligned[i + 2] = positions[i + 2];
                }
                return aligned;
            }

            function alignOverlayVec3(v) {
                return { x: -v[0], y: -v[1], z: v[2] };
            }

            function readUint64AsNumber(view, offset) {
                if (typeof view.getBigUint64 === 'function') {
                    const value = view.getBigUint64(offset, true);
                    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
                        throw new Error('COLMAP binary value exceeds JavaScript safe integer range.');
                    }
                    return Number(value);
                }
                const lo = view.getUint32(offset, true);
                const hi = view.getUint32(offset + 4, true);
                return hi * 4294967296 + lo;
            }

            function parseColmapPoints3DBinOverlay(filename, bytes) {
                const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
                if (view.byteLength < 8) {
                    throw new Error('Invalid COLMAP points3D.bin: file is too small.');
                }

                const pointCount = readUint64AsNumber(view, 0);
                if (!Number.isFinite(pointCount) || pointCount <= 0) {
                    throw new Error('COLMAP points3D.bin has no points.');
                }

                const maxPoints = 1500000;
                const sampleStride = Math.max(1, Math.ceil(pointCount / maxPoints));
                const positions = [];
                const colors = [];
                let offset = 8;

                for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
                    const fixedBytes = 8 + 24 + 3 + 8 + 8;
                    if (offset + fixedBytes > view.byteLength) {
                        break;
                    }

                    offset += 8; // POINT3D_ID
                    const x = view.getFloat64(offset, true); offset += 8;
                    const y = view.getFloat64(offset, true); offset += 8;
                    const z = view.getFloat64(offset, true); offset += 8;
                    const r = view.getUint8(offset++);
                    const g = view.getUint8(offset++);
                    const b = view.getUint8(offset++);
                    offset += 8; // ERROR
                    const trackLength = readUint64AsNumber(view, offset);
                    offset += 8;

                    if (pointIndex % sampleStride === 0 && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
                        positions.push(x, y, z);
                        colors.push(r / 255, g / 255, b / 255);
                    }

                    const trackBytes = trackLength * 8; // IMAGE_ID int32 + POINT2D_IDX int32
                    if (offset + trackBytes > view.byteLength) {
                        break;
                    }
                    offset += trackBytes;
                }

                if (positions.length === 0) {
                    throw new Error('No point coordinates found in COLMAP points3D.bin.');
                }
                return makePointOverlay(filename, new Float32Array(positions), new Float32Array(colors), 2.0);
            }

            function parseColmapReconstructionOverlay(filename, files, format) {
                const actualFormat = format === 'txt' ? 'txt' : 'bin';
                const camerasBytes = toUint8Array(files?.cameras?.bytes);
                const imagesBytes = toUint8Array(files?.images?.bytes);
                const pointsBytes = toUint8Array(files?.points3D?.bytes);
                const cameras = actualFormat === 'txt'
                    ? parseColmapCamerasText(new TextDecoder().decode(camerasBytes))
                    : parseColmapCamerasBin(camerasBytes);
                const images = actualFormat === 'txt'
                    ? parseColmapImagesText(new TextDecoder().decode(imagesBytes))
                    : parseColmapImagesBin(imagesBytes);
                const pointOverlay = actualFormat === 'txt'
                    ? parseTextPointOverlay(`${filename}/points3D.txt`, new TextDecoder().decode(pointsBytes))
                    : parseColmapPoints3DBinOverlay(`${filename}/points3D.bin`, pointsBytes);
                pointOverlay.filename = `${filename} points`;
                pointOverlay.displayName = 'Points';
                const overlays = [pointOverlay];
                const cameraOverlay = buildColmapCameraFrustumOverlay(`${filename} cameras`, cameras, images, pointOverlay.positions);
                if (cameraOverlay) {
                    cameraOverlay.displayName = 'Cameras';
                    overlays.push(cameraOverlay);
                }
                return overlays;
            }

            function parseColmapCamerasBin(bytes) {
                const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
                const cameras = new Map();
                const paramsPerModel = {
                    0: 3,
                    1: 4,
                    2: 4,
                    3: 5,
                    4: 8,
                    5: 8,
                    6: 12,
                    7: 5,
                    8: 4,
                    9: 5,
                    10: 12
                };
                let offset = 0;
                const count = readUint64AsNumber(view, offset);
                offset += 8;
                for (let i = 0; i < count; i++) {
                    if (offset + 24 > view.byteLength) {
                        break;
                    }
                    const cameraId = view.getUint32(offset, true); offset += 4;
                    const model = view.getInt32(offset, true); offset += 4;
                    const width = readUint64AsNumber(view, offset); offset += 8;
                    const height = readUint64AsNumber(view, offset); offset += 8;
                    const paramCount = paramsPerModel[model];
                    if (paramCount === undefined) {
                        throw new Error(`Unknown COLMAP camera model id: ${model}.`);
                    }
                    if (offset + paramCount * 8 > view.byteLength) {
                        break;
                    }
                    const params = [];
                    for (let p = 0; p < paramCount; p++) {
                        params.push(view.getFloat64(offset, true));
                        offset += 8;
                    }
                    cameras.set(cameraId, makeColmapCamera(cameraId, model, width, height, params));
                }
                return cameras;
            }

            function parseColmapCamerasText(text) {
                const cameras = new Map();
                const modelNameToId = {
                    SIMPLE_PINHOLE: 0,
                    PINHOLE: 1,
                    SIMPLE_RADIAL: 2,
                    RADIAL: 3,
                    OPENCV: 4,
                    OPENCV_FISHEYE: 5,
                    FULL_OPENCV: 6,
                    FOV: 7,
                    SIMPLE_RADIAL_FISHEYE: 8,
                    RADIAL_FISHEYE: 9,
                    THIN_PRISM_FISHEYE: 10
                };
                for (const rawLine of text.split(/\r?\n/)) {
                    const line = rawLine.trim();
                    if (!line || line.startsWith('#')) {
                        continue;
                    }
                    const tokens = line.split(/\s+/);
                    const cameraId = Number(tokens[0]);
                    const model = modelNameToId[tokens[1]];
                    const width = Number(tokens[2]);
                    const height = Number(tokens[3]);
                    const params = tokens.slice(4).map(Number);
                    if (Number.isInteger(cameraId) && model !== undefined && Number.isFinite(width) && Number.isFinite(height)) {
                        cameras.set(cameraId, makeColmapCamera(cameraId, model, width, height, params));
                    }
                }
                return cameras;
            }

            function makeColmapCamera(cameraId, model, width, height, params) {
                const singleFocalModels = new Set([0, 2, 3, 7, 8, 9]);
                const fx = singleFocalModels.has(model) ? params[0] : params[0];
                const fy = singleFocalModels.has(model) ? params[0] : params[1];
                const cx = singleFocalModels.has(model) ? params[1] : params[2];
                const cy = singleFocalModels.has(model) ? params[2] : params[3];
                return { cameraId, model, width, height, params, fx, fy, cx, cy };
            }

            function parseColmapImagesBin(bytes) {
                const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
                const images = [];
                let offset = 0;
                const count = readUint64AsNumber(view, offset);
                offset += 8;
                for (let i = 0; i < count; i++) {
                    if (offset + 64 > view.byteLength) {
                        break;
                    }
                    const imageId = view.getUint32(offset, true); offset += 4;
                    const qvec = [
                        view.getFloat64(offset, true),
                        view.getFloat64(offset + 8, true),
                        view.getFloat64(offset + 16, true),
                        view.getFloat64(offset + 24, true)
                    ];
                    offset += 32;
                    const tvec = [
                        view.getFloat64(offset, true),
                        view.getFloat64(offset + 8, true),
                        view.getFloat64(offset + 16, true)
                    ];
                    offset += 24;
                    const cameraId = view.getUint32(offset, true);
                    offset += 4;
                    const nameResult = readCString(view, offset);
                    const name = nameResult.value;
                    offset = nameResult.offset;
                    if (offset + 8 > view.byteLength) {
                        break;
                    }
                    const point2DCount = readUint64AsNumber(view, offset);
                    offset += 8 + point2DCount * 24;
                    images.push({ imageId, qvec, tvec, cameraId, name });
                    if (offset > view.byteLength) {
                        break;
                    }
                }
                return images;
            }

            function parseColmapImagesText(text) {
                const images = [];
                let expectPoseLine = true;
                for (const rawLine of text.split(/\r?\n/)) {
                    const line = rawLine.trim();
                    if (!line || line.startsWith('#')) {
                        continue;
                    }
                    if (!expectPoseLine) {
                        expectPoseLine = true;
                        continue;
                    }
                    const tokens = line.split(/\s+/);
                    if (tokens.length >= 10) {
                        images.push({
                            imageId: Number(tokens[0]),
                            qvec: [Number(tokens[1]), Number(tokens[2]), Number(tokens[3]), Number(tokens[4])],
                            tvec: [Number(tokens[5]), Number(tokens[6]), Number(tokens[7])],
                            cameraId: Number(tokens[8]),
                            name: tokens.slice(9).join(' ')
                        });
                    }
                    expectPoseLine = false;
                }
                return images;
            }

            function readCString(view, offset) {
                const start = offset;
                while (offset < view.byteLength && view.getUint8(offset) !== 0) {
                    offset++;
                }
                const bytes = new Uint8Array(view.buffer, view.byteOffset + start, offset - start);
                return {
                    value: new TextDecoder().decode(bytes),
                    offset: Math.min(offset + 1, view.byteLength)
                };
            }

            function quaternionToRotation(qvec) {
                let [w, x, y, z] = qvec;
                const n = Math.hypot(w, x, y, z) || 1;
                w /= n; x /= n; y /= n; z /= n;
                const xx = x * x, yy = y * y, zz = z * z;
                const xy = x * y, xz = x * z, yz = y * z;
                const wx = w * x, wy = w * y, wz = w * z;
                return [
                    1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy),
                    2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx),
                    2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)
                ];
            }

            function imageToColmapPose(image) {
                const r = quaternionToRotation(image.qvec);
                const rt = [r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]];
                const tx = -image.tvec[0], ty = -image.tvec[1], tz = -image.tvec[2];
                return {
                    center: [
                        rt[0] * tx + rt[1] * ty + rt[2] * tz,
                        rt[3] * tx + rt[4] * ty + rt[5] * tz,
                        rt[6] * tx + rt[7] * ty + rt[8] * tz
                    ],
                    worldFromCamera: rt
                };
            }

            function buildColmapCameraFrustumOverlay(filename, cameras, images, referencePositions) {
                if (!cameras.size || images.length === 0) {
                    return null;
                }
                const bounds = computePositionBounds(referencePositions);
                const diagonal = bounds ? Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]) : 1;
                const cameraSize = Math.max(diagonal * 0.001, 0.001);
                const targetDistance = Math.max(diagonal * 0.15, cameraSize * 12);
                const linePositions = [];
                const cameraCenters = [];
                const cameraViews = [];
                const maxCameras = 20000;
                const stride = Math.max(1, Math.ceil(images.length / maxCameras));
                for (let i = 0; i < images.length; i += stride) {
                    const image = images[i];
                    const camera = cameras.get(image.cameraId);
                    if (!camera || !Number.isFinite(camera.fx) || !Number.isFinite(camera.fy) || camera.fx === 0 || camera.fy === 0) {
                        continue;
                    }
                    const pose = imageToColmapPose(image);
                    const forward = [pose.worldFromCamera[2], pose.worldFromCamera[5], pose.worldFromCamera[8]];
                    const alignedCenter = alignOverlayVec3(pose.center);
                    const alignedForward = vec3Normalize(alignOverlayVec3(forward));
                    const fovY = camera.fy > 0 ? 2 * Math.atan(camera.height / (2 * camera.fy)) * 180 / Math.PI : undefined;
                    const startFloat = linePositions.length;
                    pushColmapCameraGlyph(linePositions, pose, cameraSize);
                    cameraCenters.push(...pose.center);
                    cameraViews.push({
                        name: image.name || `image ${image.imageId}`,
                        center: alignedCenter,
                        forward: alignedForward,
                        targetDistance,
                        fov: Number.isFinite(fovY) && fovY > 1 && fovY < 170 ? fovY : undefined,
                        start: startFloat,
                        count: linePositions.length - startFloat
                    });
                }
                if (linePositions.length === 0) {
                    return null;
                }
                return makeLineOverlay(filename, new Float32Array(linePositions), [1.0, 0.05, 0.85], cameraViews, new Float32Array(cameraCenters));
            }

            function pushColmapCameraGlyph(out, pose, size) {
                const halfW = size * 0.45;
                const halfH = size * 0.3;
                const halfD = size * 0.18;
                const lensHalf = size * 0.14;
                const lensZ = size * 0.36;
                const body = [
                    [-halfW, -halfH, -halfD],
                    [ halfW, -halfH, -halfD],
                    [ halfW,  halfH, -halfD],
                    [-halfW,  halfH, -halfD],
                    [-halfW, -halfH,  halfD],
                    [ halfW, -halfH,  halfD],
                    [ halfW,  halfH,  halfD],
                    [-halfW,  halfH,  halfD]
                ].map(point => colmapCameraLocalToWorld(pose, point));
                const lens = [
                    [-lensHalf, -lensHalf, lensZ],
                    [ lensHalf, -lensHalf, lensZ],
                    [ lensHalf,  lensHalf, lensZ],
                    [-lensHalf,  lensHalf, lensZ]
                ].map(point => colmapCameraLocalToWorld(pose, point));
                const bodyEdges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4]];
                const lensEdges = [[0, 1], [1, 2], [2, 3], [3, 0]];
                for (const [a, b] of bodyEdges) {
                    pushLine(out, body[a], body[b]);
                }
                for (const [a, b] of lensEdges) {
                    pushLine(out, lens[a], lens[b]);
                }
                pushLine(out, body[4], lens[0]);
                pushLine(out, body[5], lens[1]);
                pushLine(out, body[6], lens[2]);
                pushLine(out, body[7], lens[3]);
            }

            function colmapCameraLocalToWorld(pose, local) {
                const c = pose.center;
                const m = pose.worldFromCamera;
                const x = local[0], y = local[1], z = local[2];
                return [
                    c[0] + m[0] * x + m[1] * y + m[2] * z,
                    c[1] + m[3] * x + m[4] * y + m[5] * z,
                    c[2] + m[6] * x + m[7] * y + m[8] * z
                ];
            }

            function colmapFrustumCorners(camera, pose, depth) {
                const c = pose.center;
                const m = pose.worldFromCamera;
                const pixels = [
                    [0, 0],
                    [camera.width, 0],
                    [camera.width, camera.height],
                    [0, camera.height]
                ];
                return pixels.map(([u, v]) => {
                    const x = ((u - camera.cx) / camera.fx) * depth;
                    const y = ((v - camera.cy) / camera.fy) * depth;
                    const z = depth;
                    return [
                        c[0] + m[0] * x + m[1] * y + m[2] * z,
                        c[1] + m[3] * x + m[4] * y + m[5] * z,
                        c[2] + m[6] * x + m[7] * y + m[8] * z
                    ];
                });
            }

            function pushLine(out, a, b) {
                out.push(a[0], a[1], a[2], b[0], b[1], b[2]);
            }

            function computePositionBounds(positions) {
                if (!positions || positions.length < 3) {
                    return null;
                }
                const min = [Infinity, Infinity, Infinity];
                const max = [-Infinity, -Infinity, -Infinity];
                for (let i = 0; i < positions.length; i += 3) {
                    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
                    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
                        continue;
                    }
                    min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z);
                    max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z);
                }
                return Number.isFinite(min[0]) ? { min, max } : null;
            }

            function parseTextPointOverlay(filename, text) {
                const maxPoints = 1500000;
                const positions = [];
                const colors = [];
                const lines = text.split(/\r?\n/);
                const stride = Math.max(1, Math.ceil(lines.length / maxPoints));

                for (let lineIndex = 0; lineIndex < lines.length; lineIndex += stride) {
                    const line = lines[lineIndex].trim();
                    if (!line || line.startsWith('#') || line.startsWith('//')) {
                        continue;
                    }
                    const tokens = line.split(/[,\s]+/).filter(Boolean);
                    const values = tokens.map(Number);
                    if (values.length < 3) {
                        continue;
                    }

                    let xyzOffset = 0;
                    let rgbOffset = 3;
                    const looksLikeColmapPoint = values.length >= 8 &&
                        Number.isInteger(values[0]) &&
                        Number.isFinite(values[1]) &&
                        Number.isFinite(values[2]) &&
                        Number.isFinite(values[3]) &&
                        values[4] >= 0 && values[4] <= 255 &&
                        values[5] >= 0 && values[5] <= 255 &&
                        values[6] >= 0 && values[6] <= 255;
                    if (looksLikeColmapPoint) {
                        xyzOffset = 1;
                        rgbOffset = 4;
                    }

                    const x = values[xyzOffset];
                    const y = values[xyzOffset + 1];
                    const z = values[xyzOffset + 2];
                    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
                        continue;
                    }
                    positions.push(x, y, z);

                    const r = values[rgbOffset];
                    const g = values[rgbOffset + 1];
                    const b = values[rgbOffset + 2];
                    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
                        colors.push(normalizeColorChannel(r), normalizeColorChannel(g), normalizeColorChannel(b));
                    } else {
                        colors.push(0.1, 0.85, 1.0);
                    }
                }

                if (positions.length === 0) {
                    throw new Error('No point coordinates found in overlay file.');
                }
                return makePointOverlay(filename, new Float32Array(positions), new Float32Array(colors));
            }

            function parsePlyPointOverlay(filename, bytes) {
                const headerEnd = findHeaderEnd(bytes);
                if (headerEnd < 0) {
                    throw new Error('Invalid PLY overlay: missing end_header.');
                }

                const headerText = new TextDecoder().decode(bytes.slice(0, headerEnd));
                const lines = headerText.split(/\r?\n/);
                const formatLine = lines.find(line => line.startsWith('format ')) || '';
                const isAscii = formatLine.includes('ascii');
                const isBinaryLittle = formatLine.includes('binary_little_endian');
                if (!isAscii && !isBinaryLittle) {
                    throw new Error('PLY overlay supports ascii and binary_little_endian only.');
                }

                let vertexCount = 0;
                let inVertex = false;
                const properties = [];
                for (const line of lines) {
                    const parts = line.trim().split(/\s+/);
                    if (parts[0] === 'element') {
                        inVertex = parts[1] === 'vertex';
                        if (inVertex) {
                            vertexCount = Number(parts[2]);
                        }
                    } else if (inVertex && parts[0] === 'property' && parts.length >= 3 && parts[1] !== 'list') {
                        properties.push({ type: parts[1], name: parts[2] });
                    }
                }
                if (!Number.isFinite(vertexCount) || vertexCount <= 0) {
                    throw new Error('PLY overlay has no vertices.');
                }

                const maxPoints = 1500000;
                const sampleStride = Math.max(1, Math.ceil(vertexCount / maxPoints));
                const xIndex = properties.findIndex(p => p.name === 'x');
                const yIndex = properties.findIndex(p => p.name === 'y');
                const zIndex = properties.findIndex(p => p.name === 'z');
                const rIndex = properties.findIndex(p => ['red', 'r', 'diffuse_red'].includes(p.name));
                const gIndex = properties.findIndex(p => ['green', 'g', 'diffuse_green'].includes(p.name));
                const bIndex = properties.findIndex(p => ['blue', 'b', 'diffuse_blue'].includes(p.name));
                if (xIndex < 0 || yIndex < 0 || zIndex < 0) {
                    throw new Error('PLY overlay needs x/y/z vertex properties.');
                }

                if (isAscii) {
                    const body = new TextDecoder().decode(bytes.slice(headerEnd));
                    const bodyLines = body.split(/\r?\n/);
                    const positions = [];
                    const colors = [];
                    for (let i = 0; i < Math.min(vertexCount, bodyLines.length); i += sampleStride) {
                        const values = bodyLines[i].trim().split(/\s+/).map(Number);
                        if (values.length < properties.length) {
                            continue;
                        }
                        const x = values[xIndex];
                        const y = values[yIndex];
                        const z = values[zIndex];
                        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
                            continue;
                        }
                        positions.push(x, y, z);
                        if (rIndex >= 0 && gIndex >= 0 && bIndex >= 0) {
                            colors.push(normalizeColorChannel(values[rIndex]), normalizeColorChannel(values[gIndex]), normalizeColorChannel(values[bIndex]));
                        } else {
                            colors.push(0.1, 0.85, 1.0);
                        }
                    }
                    return makePointOverlay(filename, new Float32Array(positions), new Float32Array(colors));
                }

                const typeInfo = {
                    char: [1, 'getInt8'],
                    int8: [1, 'getInt8'],
                    uchar: [1, 'getUint8'],
                    uint8: [1, 'getUint8'],
                    short: [2, 'getInt16'],
                    int16: [2, 'getInt16'],
                    ushort: [2, 'getUint16'],
                    uint16: [2, 'getUint16'],
                    int: [4, 'getInt32'],
                    int32: [4, 'getInt32'],
                    uint: [4, 'getUint32'],
                    uint32: [4, 'getUint32'],
                    float: [4, 'getFloat32'],
                    float32: [4, 'getFloat32'],
                    double: [8, 'getFloat64'],
                    float64: [8, 'getFloat64']
                };
                let stride = 0;
                const offsets = properties.map(property => {
                    const info = typeInfo[property.type];
                    if (!info) {
                        throw new Error(`Unsupported PLY property type: ${property.type}`);
                    }
                    const offset = stride;
                    stride += info[0];
                    return { ...property, offset, getter: info[1] };
                });

                const view = new DataView(bytes.buffer, bytes.byteOffset + headerEnd, bytes.byteLength - headerEnd);
                const positions = [];
                const colors = [];
                const read = (vertexBase, propertyIndex) => {
                    const property = offsets[propertyIndex];
                    return view[property.getter](vertexBase + property.offset, true);
                };

                for (let i = 0; i < vertexCount; i += sampleStride) {
                    const base = i * stride;
                    if (base + stride > view.byteLength) {
                        break;
                    }
                    const x = read(base, xIndex);
                    const y = read(base, yIndex);
                    const z = read(base, zIndex);
                    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
                        continue;
                    }
                    positions.push(x, y, z);
                    if (rIndex >= 0 && gIndex >= 0 && bIndex >= 0) {
                        colors.push(normalizeColorChannel(read(base, rIndex)), normalizeColorChannel(read(base, gIndex)), normalizeColorChannel(read(base, bIndex)));
                    } else {
                        colors.push(0.1, 0.85, 1.0);
                    }
                }
                return makePointOverlay(filename, new Float32Array(positions), new Float32Array(colors));
            }

            function parseObjOverlay(filename, text) {
                const vertices = [];
                const linePositions = [];
                const maxEdges = 2000000;
                const edgeSet = new Set();
                const lines = text.split(/\r?\n/);

                const resolveIndex = (token) => {
                    const raw = Number(token.split('/')[0]);
                    if (!Number.isInteger(raw) || raw === 0) {
                        return -1;
                    }
                    return raw > 0 ? raw - 1 : vertices.length + raw;
                };

                const addEdge = (a, b) => {
                    if (a < 0 || b < 0 || a >= vertices.length || b >= vertices.length || a === b) {
                        return;
                    }
                    const lo = Math.min(a, b);
                    const hi = Math.max(a, b);
                    const key = `${lo}:${hi}`;
                    if (edgeSet.has(key) || edgeSet.size >= maxEdges) {
                        return;
                    }
                    edgeSet.add(key);
                    linePositions.push(...vertices[a], ...vertices[b]);
                };

                for (const rawLine of lines) {
                    const line = rawLine.trim();
                    if (!line || line.startsWith('#')) {
                        continue;
                    }
                    const parts = line.split(/\s+/);
                    if (parts[0] === 'v' && parts.length >= 4) {
                        const x = Number(parts[1]);
                        const y = Number(parts[2]);
                        const z = Number(parts[3]);
                        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
                            vertices.push([x, y, z]);
                        }
                    } else if (parts[0] === 'f' && parts.length >= 3) {
                        const indices = parts.slice(1).map(resolveIndex).filter(index => index >= 0);
                        for (let i = 0; i < indices.length; i++) {
                            addEdge(indices[i], indices[(i + 1) % indices.length]);
                        }
                    } else if (parts[0] === 'l' && parts.length >= 3) {
                        const indices = parts.slice(1).map(resolveIndex).filter(index => index >= 0);
                        for (let i = 0; i < indices.length - 1; i++) {
                            addEdge(indices[i], indices[i + 1]);
                        }
                    }
                }

                if (linePositions.length === 0) {
                    throw new Error('No OBJ edges found in mesh overlay file.');
                }
                return makeMeshOverlay(filename, new Float32Array(linePositions));
            }

            function vec3Subtract(a, b) {
                return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
            }

            function vec3Normalize(v) {
                const len = Math.hypot(v.x, v.y, v.z) || 1;
                return { x: v.x / len, y: v.y / len, z: v.z / len };
            }

            function vec3Cross(a, b) {
                return {
                    x: a.y * b.z - a.z * b.y,
                    y: a.z * b.x - a.x * b.z,
                    z: a.x * b.y - a.y * b.x
                };
            }

            function vec3Dot(a, b) {
                return a.x * b.x + a.y * b.y + a.z * b.z;
            }

            function makeLookAtMatrix(eye, target) {
                const z = vec3Normalize(vec3Subtract(eye, target));
                let x = vec3Normalize(vec3Cross({ x: 0, y: 1, z: 0 }, z));
                if (!Number.isFinite(x.x) || Math.hypot(x.x, x.y, x.z) < 0.0001) {
                    x = vec3Normalize(vec3Cross({ x: 1, y: 0, z: 0 }, z));
                }
                const y = vec3Cross(z, x);
                return new Float32Array([
                    x.x, y.x, z.x, 0,
                    x.y, y.y, z.y, 0,
                    x.z, y.z, z.z, 0,
                    -vec3Dot(x, eye), -vec3Dot(y, eye), -vec3Dot(z, eye), 1
                ]);
            }

            function makePerspectiveMatrix(fovDegrees, aspect, near = 0.01, far = 1000000) {
                const f = 1 / Math.tan((fovDegrees * Math.PI / 180) / 2);
                const nf = 1 / (near - far);
                return new Float32Array([
                    f / aspect, 0, 0, 0,
                    0, f, 0, 0,
                    0, 0, (far + near) * nf, -1,
                    0, 0, 2 * far * near * nf, 0
                ]);
            }

            function multiplyMat4(a, b) {
                const out = new Float32Array(16);
                for (let col = 0; col < 4; col++) {
                    for (let row = 0; row < 4; row++) {
                        out[col * 4 + row] =
                            a[0 * 4 + row] * b[col * 4 + 0] +
                            a[1 * 4 + row] * b[col * 4 + 1] +
                            a[2 * 4 + row] * b[col * 4 + 2] +
                            a[3 * 4 + row] * b[col * 4 + 3];
                    }
                }
                return out;
            }

            class GaussianViewerOverlayRenderer {
                constructor() {
                    this.overlays = [];
                    this.nextOverlayId = 1;
                    this.cameraGlyphScale = cameraGlyphScale;
                    this.animationFrame = null;
                    this.pointerDown = null;
                    this.canvas = document.createElement('canvas');
                    this.canvas.id = 'gaussian-viewer-overlay-canvas';
                    this.canvas.style.position = 'absolute';
                    this.canvas.style.inset = '0';
                    this.canvas.style.width = '100%';
                    this.canvas.style.height = '100%';
                    this.canvas.style.pointerEvents = 'none';
                    this.canvas.style.zIndex = '1';
                    this.canvas.style.background = 'transparent';
                    this.host = document.getElementById('canvas-container') || document.querySelector('canvas:not(#mask-canvas)')?.parentElement || document.body;
                    if (this.host !== document.body && getComputedStyle(this.host).position === 'static') {
                        this.host.style.position = 'relative';
                    }
                    this.host.appendChild(this.canvas);
                    this.gl = this.canvas.getContext('webgl2', { alpha: true, antialias: true }) || this.canvas.getContext('webgl', { alpha: true, antialias: true });
                    if (!this.gl) {
                        throw new Error('WebGL overlay renderer is not available.');
                    }
                    this.program = this.createProgram();
                    this.locations = {
                        position: this.gl.getAttribLocation(this.program, 'a_position'),
                        color: this.gl.getAttribLocation(this.program, 'a_color'),
                        viewProj: this.gl.getUniformLocation(this.program, 'u_viewProj'),
                        pointSize: this.gl.getUniformLocation(this.program, 'u_pointSize'),
                        renderPoints: this.gl.getUniformLocation(this.program, 'u_renderPoints'),
                        useUniformColor: this.gl.getUniformLocation(this.program, 'u_useUniformColor'),
                        uniformColor: this.gl.getUniformLocation(this.program, 'u_uniformColor')
                    };
                    this.render = this.render.bind(this);
                    this.installCameraPicking();
                }

                overlayCount() {
                    return this.overlays.length;
                }

                listOverlays() {
                    return this.overlays.map(overlay => ({
                        id: overlay.id,
                        filename: overlay.filename,
                        displayName: overlay.displayName,
                        visible: overlay.visible !== false,
                        count: overlay.count,
                        displayCount: overlay.displayCount,
                        displayKind: overlay.displayKind,
                        kind: overlay.kind
                    }));
                }

                setOverlayVisible(id, visible) {
                    const overlay = this.overlays.find(item => item.id === id);
                    if (!overlay) {
                        return;
                    }
                    overlay.visible = visible;
                    this.start();
                }

                setCameraGlyphScale(scale) {
                    this.cameraGlyphScale = Math.max(0.2, Math.min(3, Number(scale) || 1));
                    const gl = this.gl;
                    for (const overlay of this.overlays) {
                        if (!overlay.cameraViews?.length || !overlay.basePositions) {
                            continue;
                        }
                        this.applyCameraGlyphScale(overlay);
                        gl.bindBuffer(gl.ARRAY_BUFFER, overlay.positionBuffer);
                        gl.bufferData(gl.ARRAY_BUFFER, overlay.positions, gl.STATIC_DRAW);
                    }
                    this.start();
                }

                applyCameraGlyphScale(overlay) {
                    overlay.positions.set(overlay.basePositions);
                    const scale = this.cameraGlyphScale;
                    if (Math.abs(scale - 1) < 0.0001) {
                        return;
                    }
                    for (const camera of overlay.cameraViews) {
                        for (let i = camera.start; i < camera.start + camera.count; i += 3) {
                            overlay.positions[i] = camera.center.x + (overlay.basePositions[i] - camera.center.x) * scale;
                            overlay.positions[i + 1] = camera.center.y + (overlay.basePositions[i + 1] - camera.center.y) * scale;
                            overlay.positions[i + 2] = camera.center.z + (overlay.basePositions[i + 2] - camera.center.z) * scale;
                        }
                    }
                }

                createProgram() {
                    const gl = this.gl;
                    const vertexSource = `
                        attribute vec3 a_position;
                        attribute vec3 a_color;
                        uniform mat4 u_viewProj;
                        uniform float u_pointSize;
                        uniform bool u_renderPoints;
                        varying vec3 v_color;
                        void main() {
                            gl_Position = u_viewProj * vec4(a_position, 1.0);
                            gl_PointSize = u_renderPoints ? u_pointSize : 1.0;
                            v_color = a_color;
                        }
                    `;
                    const fragmentSource = `
                        precision mediump float;
                        uniform bool u_renderPoints;
                        uniform bool u_useUniformColor;
                        uniform vec3 u_uniformColor;
                        varying vec3 v_color;
                        void main() {
                            if (u_renderPoints && length(gl_PointCoord - vec2(0.5)) > 0.5) {
                                discard;
                            }
                            vec3 color = u_useUniformColor ? u_uniformColor : v_color;
                            gl_FragColor = vec4(color, 0.92);
                        }
                    `;
                    const compile = (type, source) => {
                        const shader = gl.createShader(type);
                        gl.shaderSource(shader, source);
                        gl.compileShader(shader);
                        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                            throw new Error(gl.getShaderInfoLog(shader) || 'Overlay shader compile failed.');
                        }
                        return shader;
                    };
                    const program = gl.createProgram();
                    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
                    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
                    gl.linkProgram(program);
                    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                        throw new Error(gl.getProgramInfoLog(program) || 'Overlay shader link failed.');
                    }
                    return program;
                }

                addOverlay(overlay) {
                    const gl = this.gl;
                    const gpuOverlay = {
                        ...overlay,
                        id: overlay.id || `overlay-${this.nextOverlayId++}`,
                        visible: overlay.visible !== false,
                        basePositions: overlay.cameraViews?.length ? overlay.positions.slice() : null,
                        positionBuffer: gl.createBuffer(),
                        colorBuffer: overlay.colors ? gl.createBuffer() : null,
                        cameraCenterBuffer: overlay.cameraCenters ? gl.createBuffer() : null
                    };
                    if (gpuOverlay.basePositions) {
                        this.applyCameraGlyphScale(gpuOverlay);
                    }
                    gl.bindBuffer(gl.ARRAY_BUFFER, gpuOverlay.positionBuffer);
                    gl.bufferData(gl.ARRAY_BUFFER, overlay.positions, gl.STATIC_DRAW);
                    if (overlay.colors) {
                        gl.bindBuffer(gl.ARRAY_BUFFER, gpuOverlay.colorBuffer);
                        gl.bufferData(gl.ARRAY_BUFFER, overlay.colors, gl.STATIC_DRAW);
                    }
                    if (overlay.cameraCenters) {
                        gl.bindBuffer(gl.ARRAY_BUFFER, gpuOverlay.cameraCenterBuffer);
                        gl.bufferData(gl.ARRAY_BUFFER, overlay.cameraCenters, gl.STATIC_DRAW);
                    }
                    this.overlays.push(gpuOverlay);
                    this.start();
                }

                clear() {
                    const gl = this.gl;
                    for (const overlay of this.overlays) {
                        gl.deleteBuffer(overlay.positionBuffer);
                        if (overlay.colorBuffer) {
                            gl.deleteBuffer(overlay.colorBuffer);
                        }
                        if (overlay.cameraCenterBuffer) {
                            gl.deleteBuffer(overlay.cameraCenterBuffer);
                        }
                    }
                    this.overlays = [];
                    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                    if (this.animationFrame) {
                        cancelAnimationFrame(this.animationFrame);
                        this.animationFrame = null;
                    }
                }

                start() {
                    if (!this.animationFrame) {
                        this.animationFrame = requestAnimationFrame(this.render);
                    }
                }

                installCameraPicking() {
                    const shouldIgnore = event => event.target?.closest?.('#gaussian-viewer-toolbar');
                    window.addEventListener('pointerdown', event => {
                        if (event.button !== 0 || shouldIgnore(event)) {
                            this.pointerDown = null;
                            return;
                        }
                        this.pointerDown = { x: event.clientX, y: event.clientY };
                    }, true);
                    window.addEventListener('pointerup', event => {
                        if (event.button !== 0 || !this.pointerDown || shouldIgnore(event)) {
                            this.pointerDown = null;
                            return;
                        }
                        const dx = event.clientX - this.pointerDown.x;
                        const dy = event.clientY - this.pointerDown.y;
                        this.pointerDown = null;
                        if (Math.hypot(dx, dy) > 5) {
                            return;
                        }
                        const hit = this.pickCameraAt(event.clientX, event.clientY);
                        if (!hit) {
                            return;
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation?.();
                        this.flyToCameraView(hit.camera);
                    }, true);
                }

                getViewProjection(width, height) {
                    const viewpoint = normalizeViewpoint(window.scene.events.invoke('camera.getPose'));
                    const fov = Number(window.scene.events.invoke('camera.fov'));
                    viewpoint.fov = Number.isFinite(fov) ? fov : 45;
                    const view = makeLookAtMatrix(viewpoint.position, viewpoint.target);
                    const projection = makePerspectiveMatrix(viewpoint.fov || 45, width / height);
                    return multiplyMat4(projection, view);
                }

                projectPoint(matrix, point, rect) {
                    const x = point[0], y = point[1], z = point[2];
                    const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
                    const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
                    const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
                    if (!Number.isFinite(clipW) || clipW <= 0.000001) {
                        return null;
                    }
                    const ndcX = clipX / clipW;
                    const ndcY = clipY / clipW;
                    if (ndcX < -1.2 || ndcX > 1.2 || ndcY < -1.2 || ndcY > 1.2) {
                        return null;
                    }
                    return {
                        x: rect.left + (ndcX * 0.5 + 0.5) * rect.width,
                        y: rect.top + (0.5 - ndcY * 0.5) * rect.height
                    };
                }

                distanceToSegment(px, py, a, b) {
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const len2 = dx * dx + dy * dy;
                    if (len2 <= 0.000001) {
                        return Math.hypot(px - a.x, py - a.y);
                    }
                    const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
                    return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
                }

                pickCameraAt(clientX, clientY) {
                    const rect = this.host.getBoundingClientRect();
                    if (!rect.width || !rect.height) {
                        return null;
                    }
                    let viewProj;
                    try {
                        viewProj = this.getViewProjection(rect.width, rect.height);
                    } catch (error) {
                        return null;
                    }
                    let best = null;
                    const threshold = 10;
                    for (const overlay of this.overlays) {
                        if (overlay.visible === false || !overlay.cameraViews?.length) {
                            continue;
                        }
                        for (const camera of overlay.cameraViews) {
                            for (let i = camera.start; i < camera.start + camera.count; i += 6) {
                                const a = this.projectPoint(viewProj, [overlay.positions[i], overlay.positions[i + 1], overlay.positions[i + 2]], rect);
                                const b = this.projectPoint(viewProj, [overlay.positions[i + 3], overlay.positions[i + 4], overlay.positions[i + 5]], rect);
                                if (!a || !b) {
                                    continue;
                                }
                                const distance = this.distanceToSegment(clientX, clientY, a, b);
                                if (distance <= threshold && (!best || distance < best.distance)) {
                                    best = { distance, camera };
                                }
                            }
                        }
                    }
                    return best;
                }

                flyToCameraView(camera) {
                    try {
                        const events = window.scene.events;
                        const position = camera.center;
                        const target = {
                            x: camera.center.x + camera.forward.x * camera.targetDistance,
                            y: camera.center.y + camera.forward.y * camera.targetDistance,
                            z: camera.center.z + camera.forward.z * camera.targetDistance
                        };
                        if (Number.isFinite(camera.fov)) {
                            events.fire('camera.setFov', camera.fov);
                        }
                        events.fire('camera.setPose', { position, target }, 0.45);
                        updateOverlayStatus(`camera ${camera.name}`);
                    } catch (error) {
                        console.error('Failed to fly to COLMAP camera:', error);
                        updateOverlayStatus('camera fly-to failed');
                    }
                }

                resize() {
                    const rect = this.host.getBoundingClientRect();
                    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
                    const width = Math.max(1, Math.floor(rect.width * dpr));
                    const height = Math.max(1, Math.floor(rect.height * dpr));
                    if (this.canvas.width !== width || this.canvas.height !== height) {
                        this.canvas.width = width;
                        this.canvas.height = height;
                    }
                    this.gl.viewport(0, 0, width, height);
                    return { width, height };
                }

                render() {
                    this.animationFrame = null;
                    if (this.overlays.length === 0 || !this.overlays.some(overlay => overlay.visible !== false)) {
                        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
                        return;
                    }

                    const gl = this.gl;
                    const { width, height } = this.resize();
                    let viewProj;
                    try {
                        viewProj = this.getViewProjection(width, height);
                    } catch (error) {
                        this.start();
                        return;
                    }

                    gl.clearColor(0, 0, 0, 0);
                    gl.clearDepth(1);
                    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                    gl.enable(gl.DEPTH_TEST);
                    gl.depthFunc(gl.LEQUAL);
                    gl.useProgram(this.program);
                    gl.uniformMatrix4fv(this.locations.viewProj, false, viewProj);

                    for (const overlay of this.overlays) {
                        if (overlay.visible === false) {
                            continue;
                        }
                        gl.bindBuffer(gl.ARRAY_BUFFER, overlay.positionBuffer);
                        gl.enableVertexAttribArray(this.locations.position);
                        gl.vertexAttribPointer(this.locations.position, 3, gl.FLOAT, false, 0, 0);

                        if (overlay.colorBuffer) {
                            gl.bindBuffer(gl.ARRAY_BUFFER, overlay.colorBuffer);
                            gl.enableVertexAttribArray(this.locations.color);
                            gl.vertexAttribPointer(this.locations.color, 3, gl.FLOAT, false, 0, 0);
                            gl.uniform1i(this.locations.useUniformColor, 0);
                        } else {
                            gl.disableVertexAttribArray(this.locations.color);
                            const uniformColor = overlay.uniformColor || [1.0, 0.55, 0.08];
                            gl.vertexAttrib3f(this.locations.color, uniformColor[0], uniformColor[1], uniformColor[2]);
                            gl.uniform1i(this.locations.useUniformColor, 1);
                            gl.uniform3f(this.locations.uniformColor, uniformColor[0], uniformColor[1], uniformColor[2]);
                        }

                        if (overlay.kind === 'mesh') {
                            gl.uniform1i(this.locations.renderPoints, 0);
                            gl.uniform1f(this.locations.pointSize, 1);
                            gl.drawArrays(gl.LINES, 0, overlay.count);
                            if (overlay.cameraCenterBuffer && overlay.cameraCenters?.length) {
                                gl.bindBuffer(gl.ARRAY_BUFFER, overlay.cameraCenterBuffer);
                                gl.enableVertexAttribArray(this.locations.position);
                                gl.vertexAttribPointer(this.locations.position, 3, gl.FLOAT, false, 0, 0);
                                gl.uniform1i(this.locations.renderPoints, 1);
                                gl.uniform1f(this.locations.pointSize, Math.max(2.5, 4.0 * this.cameraGlyphScale));
                                gl.drawArrays(gl.POINTS, 0, overlay.cameraCenters.length / 3);
                            }
                        } else {
                            gl.uniform1i(this.locations.renderPoints, 1);
                            gl.uniform1f(this.locations.pointSize, overlay.pointSize || 2.5);
                            gl.drawArrays(gl.POINTS, 0, overlay.count);
                        }
                    }

                    this.start();
                }
            }

            function toPlainVec3(value, fieldName) {
                const vec = {
                    x: Number(value?.x),
                    y: Number(value?.y),
                    z: Number(value?.z)
                };
                if (!Number.isFinite(vec.x) || !Number.isFinite(vec.y) || !Number.isFinite(vec.z)) {
                    throw new Error(`Invalid viewpoint ${fieldName}.`);
                }
                return vec;
            }

            function normalizeViewpoint(value) {
                const source = value?.viewpoint || value?.camera || value;
                if (!source || typeof source !== 'object') {
                    throw new Error('Invalid viewpoint payload.');
                }

                const viewpoint = {
                    version: 1,
                    type: 'GaussianViewer.viewpoint',
                    position: toPlainVec3(source.position, 'position'),
                    target: toPlainVec3(source.target, 'target')
                };

                if (source.fov !== undefined && source.fov !== null) {
                    const fov = Number(source.fov);
                    if (!Number.isFinite(fov) || fov <= 0 || fov >= 180) {
                        throw new Error('Invalid viewpoint fov.');
                    }
                    viewpoint.fov = fov;
                }

                return viewpoint;
            }

            async function handleViewpointGet(message) {
                try {
                    const events = await waitForSceneEvents();
                    const pose = events.invoke('camera.getPose');
                    const viewpoint = normalizeViewpoint(pose);
                    try {
                        const fov = events.invoke('camera.fov');
                        if (Number.isFinite(Number(fov))) {
                            viewpoint.fov = Number(fov);
                        }
                    } catch (error) {
                        // Older SuperSplat builds may not expose fov; pose alone is enough.
                    }

                    vscode?.postMessage({
                        type: 'viewpoint/get/response',
                        requestId: message.requestId,
                        success: true,
                        viewpoint
                    });
                } catch (error) {
                    vscode?.postMessage({
                        type: 'viewpoint/get/response',
                        requestId: message.requestId,
                        success: false,
                        error: error.message || String(error)
                    });
                }
            }

            async function handleViewpointApply(message) {
                try {
                    const events = await waitForSceneEvents();
                    const viewpoint = normalizeViewpoint(message.viewpoint);
                    if (viewpoint.fov !== undefined) {
                        events.fire('camera.setFov', viewpoint.fov);
                    }
                    events.fire('camera.setPose', {
                        position: viewpoint.position,
                        target: viewpoint.target
                    }, Number.isFinite(Number(message.duration)) ? Number(message.duration) : 0);

                    vscode?.postMessage({
                        type: 'viewpoint/apply/response',
                        requestId: message.requestId,
                        success: true
                    });
                } catch (error) {
                    vscode?.postMessage({
                        type: 'viewpoint/apply/response',
                        requestId: message.requestId,
                        success: false,
                        error: error.message || String(error)
                    });
                }
            }

            function stopCinematicOrbit() {
                if (cinematicOrbit?.animationFrame) {
                    cancelAnimationFrame(cinematicOrbit.animationFrame);
                }
                cinematicOrbit = null;
                document.querySelector('#gaussian-viewer-toolbar button[data-action="orbit"]')?.classList.remove('active');
            }

            async function startCinematicOrbit(message) {
                try {
                    const events = await waitForSceneEvents();
                    const viewpoint = normalizeViewpoint(events.invoke('camera.getPose'));
                    stopCinematicOrbit();

                    const target = viewpoint.target;
                    const initialOffset = {
                        x: viewpoint.position.x - target.x,
                        y: viewpoint.position.y - target.y,
                        z: viewpoint.position.z - target.z
                    };
                    const radius = Math.hypot(initialOffset.x, initialOffset.z);
                    if (!Number.isFinite(radius) || radius < 0.0001) {
                        throw new Error('Move the camera away from the target before starting orbit.');
                    }

                    const durationMs = Math.max(3000, Number(message.durationMs) || 15000);
                    const mode = message.mode || 'turntable';
                    const direction = mode === 'reverse' || message.direction === 'clockwise' ? -1 : 1;
                    const startTime = performance.now();

                    cinematicOrbit = {
                        animationFrame: null,
                        durationMs,
                        lastTime: startTime,
                        lastDolly: 0,
                        lastBob: 0,
                        lastUserInput: 0
                    };

                    const tick = (now) => {
                        if (!cinematicOrbit) {
                            return;
                        }

                        const elapsedSinceUserInput = now - cinematicOrbit.lastUserInput;
                        if (elapsedSinceUserInput >= 0 && elapsedSinceUserInput < 180) {
                            cinematicOrbit.lastTime = now;
                            cinematicOrbit.animationFrame = requestAnimationFrame(tick);
                            return;
                        }

                        let current;
                        try {
                            current = normalizeViewpoint(events.invoke('camera.getPose'));
                        } catch (error) {
                            stopCinematicOrbit();
                            return;
                        }

                        const elapsedMs = Math.max(0, now - cinematicOrbit.lastTime);
                        cinematicOrbit.lastTime = now;

                        const target = current.target;
                        const offset = {
                            x: current.position.x - target.x,
                            y: current.position.y - target.y,
                            z: current.position.z - target.z
                        };
                        const currentRadius = Math.hypot(offset.x, offset.z);
                        if (!Number.isFinite(currentRadius) || currentRadius < 0.0001) {
                            cinematicOrbit.animationFrame = requestAnimationFrame(tick);
                            return;
                        }

                        const normalizedTime = ((now - startTime) % durationMs) / durationMs;
                        const prevNormalizedTime = (((now - elapsedMs) - startTime) % durationMs) / durationMs;
                        const phase = normalizedTime * Math.PI * 2;
                        const prevPhase = prevNormalizedTime * Math.PI * 2;

                        let angleDelta = direction * Math.PI * 2 * (elapsedMs / durationMs);
                        if (mode === 'sway') {
                            const amplitude = Math.PI / 3;
                            angleDelta = (Math.sin(phase) - Math.sin(prevPhase)) * amplitude;
                        }

                        const cos = Math.cos(angleDelta);
                        const sin = Math.sin(angleDelta);
                        let rotated = {
                            x: offset.x * cos - offset.z * sin,
                            y: offset.y,
                            z: offset.x * sin + offset.z * cos
                        };

                        if (mode === 'dolly') {
                            const dolly = Math.sin(phase) * 0.12;
                            const scale = 1 + dolly - cinematicOrbit.lastDolly;
                            rotated.x *= scale;
                            rotated.y *= scale;
                            rotated.z *= scale;
                            cinematicOrbit.lastDolly = dolly;
                        } else {
                            cinematicOrbit.lastDolly = 0;
                        }

                        if (mode === 'bob') {
                            const bob = Math.sin(phase * 2) * currentRadius * 0.08;
                            rotated.y += bob - cinematicOrbit.lastBob;
                            cinematicOrbit.lastBob = bob;
                        } else {
                            cinematicOrbit.lastBob = 0;
                        }

                        const position = {
                            x: target.x + rotated.x,
                            y: target.y + rotated.y,
                            z: target.z + rotated.z
                        };

                        events.fire('camera.setPose', { position, target }, 0);
                        cinematicOrbit.animationFrame = requestAnimationFrame(tick);
                    };

                    cinematicOrbit.animationFrame = requestAnimationFrame(tick);
                    document.querySelector('#gaussian-viewer-toolbar button[data-action="orbit"]')?.classList.add('active');
                } catch (error) {
                    document.querySelector('#gaussian-viewer-toolbar button[data-action="orbit"]')?.classList.remove('active');
                    console.error('Failed to start cinematic orbit:', error);
                    vscode?.postMessage({
                        type: 'error',
                        message: error.message || String(error)
                    });
                }
            }
            
            function finalizeChunks(streamingState) {
                const missingChunks = [];
                for (let i = 0; i < streamingState.binaryChunks.length; i++) {
                    if (!streamingState.binaryChunks[i]) {
                        missingChunks.push(i);
                    }
                }
                
                if (missingChunks.length > 0) {
                    console.error('❌ [BASE64] Missing chunks:', missingChunks.join(', '));
                    return;
                }
                
                const blob = new Blob(streamingState.binaryChunks);
                console.log(`✅ [BASE64] Large file assembled, size: ${blob.size} bytes (mode=${streamingState.isBase64Mode ? 'base64' : 'binary'})`);
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    const header = new Uint8Array(e.target.result.slice(0, 100));
                    const headerText = new TextDecoder().decode(header);
                    console.log('🔍 [BASE64] File header:', headerText.substring(0, 50));
                    
                    if (headerText.includes('ply') || headerText.includes('PLY')) {
                        console.log('✅ [BASE64] Valid PLY file detected');
                    } else {
                        console.warn('⚠️ [BASE64] Invalid PLY header, file may be corrupted');
                    }
                };
                reader.readAsArrayBuffer(blob.slice(0, 100));
                
                const url = URL.createObjectURL(blob);
                const filename = streamingState.filename || window.originalFileName || 'large-file.ply';
                console.log('📤 [BASE64] Loading into SuperSplat with filename:', filename);
                loadFileIntoSuperSplat(url, filename);
                
                streamingState.isStreaming = false;
                streamingState.isBase64Mode = false;
                streamingState.requestId = null;
                streamingState.binaryChunks = null;
                streamingState.expectedChunks = 0;
                streamingState.receivedChunks = 0;
                
                console.log('🔄 [BASE64] Streaming state reset after successful load');
                logPerformance(`Chunked file loaded successfully: ${blob.size} bytes`);
            }

            function handleBinaryChunk(message, streamingState) {
                if (!streamingState.isStreaming) {
                    console.log('⚠️ [BINARY] Ignoring chunk - not in streaming mode');
                    return;
                }
                if (message.requestId !== streamingState.requestId) {
                    console.log('🔄 [BINARY] Different requestId detected, updating state');
                    streamingState.requestId = message.requestId;
                }

                let chunkBytes;
                if (message.data instanceof ArrayBuffer) {
                    chunkBytes = new Uint8Array(message.data);
                } else if (ArrayBuffer.isView(message.data)) {
                    const view = message.data;
                    chunkBytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
                } else if (typeof message.data === 'string') {
                    try {
                        const binaryString = atob(message.data);
                        chunkBytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            chunkBytes[i] = binaryString.charCodeAt(i);
                        }
                    } catch (e) {
                        console.error('❌ [BINARY] Failed to decode string chunk:', e);
                        return;
                    }
                } else {
                    console.error('Unsupported binary chunk format:', typeof message.data);
                    return;
                }

                streamingState.binaryChunks[message.chunkIndex] = chunkBytes;
                streamingState.receivedChunks++;

                const progress = (streamingState.receivedChunks / streamingState.expectedChunks) * 100;
                if (message.chunkIndex % Math.ceil(streamingState.expectedChunks / 20) === 0 || message.isLastChunk) {
                    console.log(`📊 [BINARY] Progress: ${progress.toFixed(1)}% (${streamingState.receivedChunks}/${streamingState.expectedChunks})`);
                    logPerformance(`Binary chunk progress: ${progress.toFixed(1)}%`);
                }

                if (message.isLastChunk || streamingState.receivedChunks === streamingState.expectedChunks) {
                    finalizeChunks(streamingState);
                }
            }

            // 1.0.1 스타일 base64 청크 처리 함수
            function handleBase64Chunk(message, streamingState) {
                if (!streamingState.isBase64Mode) {
                    console.log('⚠️ [BASE64] Ignoring chunk - not in base64 mode');
                    return;
                }
                
                if (message.requestId !== streamingState.requestId) {
                    console.log('🔄 [BASE64] Different requestId detected, updating state');
                    streamingState.requestId = message.requestId;
                }
                
                console.log(`📦 [BASE64] Processing chunk ${message.chunkIndex}/${message.totalChunks}`);
                
                try {
                    let chunkBytes;
                    const isBinary = message.encoding === 'binary' || message.data instanceof ArrayBuffer || ArrayBuffer.isView(message.data);
                    if (isBinary) {
                        if (message.data instanceof ArrayBuffer) {
                            chunkBytes = new Uint8Array(message.data);
                        } else if (ArrayBuffer.isView(message.data)) {
                            const view = message.data;
                            chunkBytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
                        } else {
                            console.error('Unsupported binary chunk format:', typeof message.data);
                            return;
                        }
                    } else if (typeof message.data === 'string') {
                        const binaryString = atob(message.data);
                        chunkBytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            chunkBytes[i] = binaryString.charCodeAt(i);
                        }
                    } else {
                        console.error('Unsupported chunk format:', typeof message.data);
                        return;
                    }
                    
                    streamingState.binaryChunks[message.chunkIndex] = chunkBytes;
                    streamingState.receivedChunks++;
                    
                    const progress = (streamingState.receivedChunks / streamingState.expectedChunks) * 100;
                    if (message.chunkIndex % Math.ceil(streamingState.expectedChunks / 20) === 0 || message.isLastChunk) {
                        console.log(`📊 [BASE64] Progress: ${progress.toFixed(1)}% (${streamingState.receivedChunks}/${streamingState.expectedChunks})`);
                        logPerformance(`Base64 chunk progress: ${progress.toFixed(1)}%`);
                    }
                    
                    if (message.isLastChunk || streamingState.receivedChunks === streamingState.expectedChunks) {
                        console.log('🎉 [BASE64] All chunks received, assembling file...');
                        finalizeChunks(streamingState);
                    }
                    
                } catch (error) {
                    console.error('❌ [BASE64] Error processing chunk:', error);
                    logPerformance(`Base64 chunk error: ${error.message}`);
                }
            }
            
            function requestNextChunkBatch(streamingState, chunkSize) {
                const startChunkIndex = streamingState.currentBatch * streamingState.batchSize;
                const batchEndIndex = Math.min(startChunkIndex + streamingState.batchSize, streamingState.expectedChunks);
                
                if (startChunkIndex >= streamingState.expectedChunks) {
                    console.log('🎉 [PARALLEL] All chunk batches requested');
                    return;
                }
                
                console.log(`🚀 [PARALLEL] Requesting chunk batch ${streamingState.currentBatch}: chunks ${startChunkIndex} to ${batchEndIndex - 1}`);
                
                if (vscode && vscode.postMessage) {
                    vscode.postMessage({
                        type: 'requestParallelChunks',
                        startChunkIndex: startChunkIndex,
                        batchSize: batchEndIndex - startChunkIndex,
                        chunkSize: chunkSize
                    });
                }
                
                streamingState.currentBatch++;
            }
            
            function handleVSCodeChunk(message, streamingState) {
                console.log(`📦 [STREAMING] Received chunk ${message.chunkIndex + 1}/${streamingState.expectedChunks}`);
                
                if (message.data) {
                    // Data is already a Uint8Array from VSCode
                    const chunkData = new Uint8Array(message.data);
                    streamingState.chunks[message.chunkIndex] = chunkData;
                    streamingState.receivedChunks++;
                    
                    console.log(`📦 [STREAMING] Chunk ${message.chunkIndex} size: ${chunkData.length} bytes`);
                    
                    const progressPercent = ((streamingState.receivedChunks / streamingState.expectedChunks) * 100).toFixed(1);
                    console.log(`📦 [STREAMING] Progress: ${streamingState.receivedChunks}/${streamingState.expectedChunks} (${progressPercent}%)`);
                    
                    // Handle next chunk request based on processing mode
                    if (streamingState.receivedChunks < streamingState.expectedChunks) {
                        if (streamingState.useParallel) {
                            // Check if current batch is complete, then request next batch
                            const currentBatchStart = (streamingState.currentBatch - 1) * streamingState.batchSize;
                            const currentBatchEnd = Math.min(currentBatchStart + streamingState.batchSize, streamingState.expectedChunks);
                            const receivedInCurrentBatch = streamingState.receivedChunks - currentBatchStart;
                            
                            if (receivedInCurrentBatch >= (currentBatchEnd - currentBatchStart)) {
                                console.log(`✅ [PARALLEL] Batch ${streamingState.currentBatch - 1} complete, requesting next batch`);
                                requestNextChunkBatch(streamingState, message.chunkSize);
                            }
                        } else {
                            // Sequential processing
                            const nextChunkIndex = message.chunkIndex + 1;
                            console.log(`📤 [STREAMING] Requesting chunk ${nextChunkIndex}...`);
                            vscode.postMessage({
                                type: 'requestChunk',
                                chunkIndex: nextChunkIndex,
                                chunkSize: message.chunkSize
                            });
                        }
                    } else {
                        console.log('🎉 [STREAMING] All chunks received! Assembling file...');
                        assembleVSCodeFile(streamingState);
                    }
                } else {
                    console.error('❌ [STREAMING] Chunk data is missing');
                }
            }
            
            function assembleVSCodeFile(state) {
                try {
                    const assemblyStartTime = performance.now();
                    console.log('🔗 [ASSEMBLY] Starting file assembly from chunks...');
                    console.log(`🔗 [ASSEMBLY] Total chunks to assemble: ${state.chunks.length}`);
                    
                    // Calculate total size with detailed logging
                    let actualSize = 0;
                    let validChunks = 0;
                    let emptyChunks = 0;
                    
                    for (let i = 0; i < state.chunks.length; i++) {
                        const chunk = state.chunks[i];
                        if (chunk && chunk.length > 0) {
                            actualSize += chunk.length;
                            validChunks++;
                        } else {
                            emptyChunks++;
                            console.log(`⚠️ [ASSEMBLY] Empty chunk detected at index ${i}`);
                        }
                    }
                    
                    console.log(`🔗 [ASSEMBLY] Chunk analysis complete:`);
                    console.log(`  - Valid chunks: ${validChunks}`);
                    console.log(`  - Empty chunks: ${emptyChunks}`);
                    console.log(`  - Total size to assemble: ${(actualSize / 1024 / 1024).toFixed(2)}MB`);
                    console.log(`  - Average chunk size: ${(actualSize / validChunks / (1024 * 1024)).toFixed(1)}MB`);
                    
                    // Create final buffer with progress tracking
                    console.log('🔗 [ASSEMBLY] Creating final buffer...');
                    const bufferCreateStartTime = performance.now();
                    const finalBuffer = new Uint8Array(actualSize);
                    const bufferCreateTime = performance.now() - bufferCreateStartTime;
                    console.log(`🔗 [ASSEMBLY] Buffer created in ${bufferCreateTime.toFixed(2)}ms`);
                    
                    // Assembly process with detailed progress
                    console.log('🔗 [ASSEMBLY] Beginning chunk assembly...');
                    const copyStartTime = performance.now();
                    let offset = 0;
                    let processedChunks = 0;
                    
                    for (let i = 0; i < state.chunks.length; i++) {
                        const chunk = state.chunks[i];
                        if (chunk && chunk.length > 0) {
                            finalBuffer.set(chunk, offset);
                            offset += chunk.length;
                            processedChunks++;
                            
                            // Log progress every 5 chunks or at key milestones (50MB chunks = moderate logging)
                            if (processedChunks % 5 === 0 || processedChunks === validChunks) {
                                const progressPercent = ((processedChunks / validChunks) * 100).toFixed(1);
                                const assembledMB = (offset / 1024 / 1024).toFixed(2);
                                console.log(`🔗 [ASSEMBLY] Progress: ${processedChunks}/${validChunks} chunks (${progressPercent}%) - ${assembledMB}MB assembled`);
                            }
                        }
                    }
                    
                    const copyTime = performance.now() - copyStartTime;
                    const assemblyTime = performance.now() - assemblyStartTime;
                    const throughputMBps = (actualSize / 1024 / 1024) / (assemblyTime / 1000);
                    
                    console.log('🎉 [ASSEMBLY] File assembly completed successfully!');
                    console.log(`🔗 [ASSEMBLY] Final stats:`);
                    console.log(`  - Total assembly time: ${assemblyTime.toFixed(2)}ms`);
                    console.log(`  - Buffer copy time: ${copyTime.toFixed(2)}ms`);
                    console.log(`  - Final file size: ${(actualSize / 1024 / 1024).toFixed(2)}MB`);
                    console.log(`  - Assembly throughput: ${throughputMBps.toFixed(2)} MB/s`);
                    console.log(`  - Processing mode: ${state.useParallel ? 'PARALLEL (5x batch)' : 'SEQUENTIAL'}`);
                    console.log(`  - Chunk size: ${state.useParallel ? '10MB' : '1MB'}`);
                    
                    // Performance analysis for 1GB+ files
                    if (actualSize > 1024 * 1024 * 1024) {
                        const timePerGB = assemblyTime / (actualSize / (1024 * 1024 * 1024));
                        console.log(`🚀 [PERFORMANCE] Time per GB: ${timePerGB.toFixed(2)}ms (Target: <2000ms)`);
                        if (timePerGB < 2000) {
                            console.log(`✅ [PERFORMANCE] SUCCESS: 1GB+ file processed in under 2 seconds!`);
                        } else {
                            console.log(`⚠️ [PERFORMANCE] Optimization needed: ${timePerGB.toFixed(2)}ms per GB`);
                        }
                    }
                    
                    logPerformance(`VSCode assembly completed: ${(actualSize / 1024 / 1024).toFixed(2)}MB in ${assemblyTime.toFixed(2)}ms (${throughputMBps.toFixed(2)}MB/s)`);
                    
                    // Create blob and reinitialize
                    const blob = new Blob([finalBuffer]);
                    const blobUrl = URL.createObjectURL(blob);
                    console.log('✅ [ASSEMBLY] Blob created, reinitializing SuperSplat...');
                    
                    // Update settings in DOM meta tag for reinitialization
                    console.log(`🔄 [ASSEMBLY] Updating DOM settings for reinitialization...`);
                    
                    // Debug: Check all meta elements
                    const allMetas = document.querySelectorAll('meta');
                    console.log(`🔍 [ASSEMBLY] Found ${allMetas.length} meta elements:`);
                    allMetas.forEach((meta, index) => {
                        console.log(`  ${index}: name="${meta.getAttribute('name')}", id="${meta.id}", content="${meta.getAttribute('content')?.substring(0, 100)}..."`);
                    });
                    
                    // Try different selectors
                    let settingsElement = document.querySelector('meta[name="supersplat-settings"]') ||
                                         document.querySelector('meta[id="settings"]') ||
                                         document.querySelector('#settings');
                    
                    console.log(`🔍 [ASSEMBLY] Settings element found:`, settingsElement);
                    
                    if (settingsElement) {
                        // Parse current settings
                        const currentSettings = JSON.parse(settingsElement.getAttribute('content') || '{}');
                        console.log(`🔄 [ASSEMBLY] Current settings:`, currentSettings);
                        
                        // Update with assembled file info
                        const newSettings = {
                            ...currentSettings,
                            fileToLoad: blobUrl,
                            useStreaming: false,
                            fileSizeMB: actualSize / (1024 * 1024),
                            useClientDynamic: true // Ensure dynamic mode is enabled
                        };
                        
                        // Update DOM
                        settingsElement.setAttribute('content', JSON.stringify(newSettings));
                        console.log(`🔄 [ASSEMBLY] Updated DOM settings:`, newSettings);
                        
                        // Also update window.settings if it exists
                        if (window.settings) {
                            Object.assign(window.settings, newSettings);
                            console.log(`🔄 [ASSEMBLY] Updated window.settings`);
                        }
                    } else {
                        console.log(`⚠️ [ASSEMBLY] Settings meta element not found, using fallback method`);
                        
                        // Fallback: Set global variables for reinitialization
                        window.assembledFileUrl = blobUrl;
                        window.assembledFileSizeMB = actualSize / (1024 * 1024);
                        window.useAssembledFile = true;
                        
                        console.log(`🔄 [ASSEMBLY] Set fallback globals:`);
                        console.log(`  - assembledFileUrl: ${window.assembledFileUrl}`);
                        console.log(`  - assembledFileSizeMB: ${window.assembledFileSizeMB.toFixed(2)}MB`);
                        console.log(`  - useAssembledFile: ${window.useAssembledFile}`);
                    }
                    
                    // Reset initialization flag before reinitializing
                    isInitializing = false;
                    console.log('🔄 [ASSEMBLY] Reset initialization flag, starting SuperSplat with assembled file...');
                    console.log('🔄 [ASSEMBLY] New file URL:', blobUrl);
                    
                    // Clear any existing scene data
                    if (window.scene) {
                        console.log('🔄 [ASSEMBLY] Clearing existing scene data...');
                    }
                    
                    // Reinitialize SuperSplat with assembled file
                    initializeSuperSplat();
                    
                } catch (error) {
                    console.error('❌ [ASSEMBLY] File assembly failed:', error);
                    logPerformance(`VSCode assembly failed: ${error.message}`);
                }
            }
            
            console.log('✅ [WEBVIEW] Message handlers setup complete');
        }


        // Minimal logging function
        function logPerformance(message) {
            if (vscode) {
                vscode.postMessage({
                    type: 'perfLog',
                    message: message
                });
            }
        }

        // Define dynamic functions
        function makeSmartLoadingDecision(settings) {
            const fileSizeMB = settings.fileSizeMB;
            console.log(`🧠 [DYNAMIC] Analyzing ${fileSizeMB.toFixed(2)}MB file...`);
            
            // Check if this is a blob URL (already assembled file)
            if (settings.fileToLoad && settings.fileToLoad.startsWith('blob:')) {
                console.log(`🎯 [DYNAMIC] Blob URL detected - using assembled file directly`);
                console.log(`🚀 [DYNAMIC] Loading assembled file (${fileSizeMB.toFixed(2)}MB)`);
                initializeSuperSplat();
                return;
            }
            
            // For very large files (>1GB), go straight to streaming
            if (fileSizeMB > 1000) {
                console.log(`📥 [DYNAMIC] Very large file (${fileSizeMB.toFixed(2)}MB > 1000MB) - requesting streaming immediately`);
                requestStreamingMode(settings);
                return;
            }
            
            // For smaller files, try direct loading with monitoring
            console.log(`🚀 [DYNAMIC] File suitable for direct loading (${fileSizeMB.toFixed(2)}MB <= 1000MB) - trying normal mode with monitoring`);
            
            // Initialize SuperSplat and try direct loading
            initializeSuperSplat();
        }
        
        function requestStreamingMode(settings) {
            console.log('🔄 [DYNAMIC] Requesting streaming mode for', (settings.fileSizeMB).toFixed(2), 'MB file');
            
            // Clear the fileToLoad URL to prevent direct fetch attempts
            finalSettings.fileToLoad = '';
            finalSettings.useStreaming = true; // Add explicit streaming flag
            console.log('🔄 [DYNAMIC] Cleared fileToLoad URL and enabled streaming mode');
            
            // Initialize SuperSplat first for streaming mode
            initializeSuperSplat();
            
            // Send streaming request to VSCode immediately - NO DELAYS
            if (vscode && vscode.postMessage) {
                console.log('📤 [DYNAMIC] Sending streaming request to VSCode...');
                console.log('📤 [DYNAMIC] File size:', (settings.fileSizeMB).toFixed(2), 'MB');
                vscode.postMessage({
                    type: 'requestStreamingFallback',
                    fileSize: settings.fileSizeMB * 1024 * 1024
                });
                console.log('✅ [DYNAMIC] Streaming request sent successfully');
            } else {
                console.error('❌ [DYNAMIC] VSCode API not available for streaming request');
            }
        }
        
        // Dynamic loading decision - execute immediately if enabled
        if (finalSettings.useClientDynamic) {
            console.log('🧠 [DEBUG] Dynamic mode - analyzing loading method...');
            makeSmartLoadingDecision(finalSettings);
            return; // Don't continue with normal initialization
        }


        // Override console to reduce logging overhead
        const originalError = console.error;
        console.error = function(...args) {
            // Only log errors, suppress other console output for performance
            originalError.apply(console, args);
        };

        // Suppress non-error console output in production
        if (!window.location.href.includes('debug=true')) {
            console.log = console.info = console.warn = function() {};
        }

        // Initialize SuperSplat with performance monitoring
        function initializeSuperSplat() {
            console.log('🚀 [DEBUG] initializeSuperSplat called');
            if (isInitializing) {
                console.log('⚠️ [DEBUG] Already initializing, skipping...');
                return;
            }
            isInitializing = true;
            
            perfMetrics.parseStart = performance.now();
            console.log('🚀 [DEBUG] Starting SuperSplat initialization...');
            
            // Check document structure
            console.log('🔧 [DEBUG] Document head exists:', !!document.head);
            console.log('🔧 [DEBUG] Document body exists:', !!document.body);
            
            // Load SuperSplat main script
            const script = document.createElement('script');
            script.type = 'module';
            script.src = './index.js';
            console.log('🔧 [DEBUG] Created script element with src:', script.src);
            console.log('🔧 [DEBUG] Resolved script URL:', new URL(script.src, document.baseURI).href);
            
            script.onload = function() {
                console.log('✅ [DEBUG] SuperSplat main script loaded successfully');
                console.log('🔧 [DEBUG] Script loaded from:', script.src);
                logPerformance('SuperSplat main script loaded successfully');
                
                // Check what's available in window
                console.log('🔧 [DEBUG] Window globals after script load:', Object.keys(window).filter(key => 
                    key.toLowerCase().includes('scene') || 
                    key.toLowerCase().includes('main') || 
                    key.toLowerCase().includes('splat')
                ));
                
                // Check scene availability immediately - NO POLLING
                console.log('🔍 [DEBUG] Checking for scene availability...');
                console.log('🔧 [DEBUG] window.scene exists:', !!window.scene);
                console.log('🔧 [DEBUG] window.main exists:', !!window.main);
                
                if (window.scene && window.scene.events) {
                        console.log('✅ [DEBUG] Scene and events found!');
                        perfMetrics.parseEnd = performance.now();
                        logPerformance(`Scene initialization: ${(perfMetrics.parseEnd - perfMetrics.parseStart).toFixed(2)}ms`);
                        
                        // Override save/export with minimal event handling
                        window.scene.events.on('save', (data) => {
                            if (vscode) {
                                vscode.postMessage({ type: 'save', data: data });
                            }
                        });
                        
                        window.scene.events.on('export', (data) => {
                            if (vscode) {
                                vscode.postMessage({ type: 'export', data: data });
                            }
                        });
                        
                        // Auto-load file with performance tracking
                        if (settings.useStreaming || !settings.fileToLoad) {
                            console.log('📥 [DEBUG] Streaming mode - waiting for streaming data...');
                            console.log('📥 [DEBUG] File size:', settings.fileSizeMB.toFixed(2), 'MB - using streaming');
                            perfMetrics.renderStart = performance.now();
                            // Scene is ready, but waiting for streaming data
                        } else if (settings.fileToLoad) {
                            perfMetrics.renderStart = performance.now();
                            loadFileIntoSuperSplat(settings.fileToLoad).catch(error => {
                                logPerformance(`File load error: ${error.message}`);
                            });
                        } else if (settings.useClientDynamic) {
                            console.log('🧠 [DEBUG] Dynamic mode - analyzing system for loading decision...');
                            perfMetrics.renderStart = performance.now();
                            makeSmartLoadingDecision(settings);
                        }
                } else {
                    console.log('⏳ [DEBUG] Scene not available immediately after script load');
                    console.log('🔧 [DEBUG] Available window properties:', Object.keys(window).filter(key => 
                        key.toLowerCase().includes('scene') || 
                        key.toLowerCase().includes('main') || 
                        key.toLowerCase().includes('splat') ||
                        key.toLowerCase().includes('app')
                    ));
                }
            };
            
            script.onerror = function(error) {
                const errorMsg = `Script load error: ${error.toString()} - URL: ${script.src}`;
                console.error('❌ [DEBUG] SuperSplat script failed to load:', error);
                console.error('❌ [DEBUG] Script URL:', script.src);
                console.error('❌ [DEBUG] Resolved URL:', new URL(script.src, document.baseURI).href);
                logPerformance(errorMsg);
            };
            
            
            console.log('🔧 [DEBUG] Appending script to document head...');
            document.head.appendChild(script);
            console.log('✅ [DEBUG] Script successfully added to document head');
            
            // Additional debug: check if script is actually in DOM
            setTimeout(() => {
                const scriptInDom = document.querySelector('script[src="./index.js"]');
                console.log('🔧 [DEBUG] Script found in DOM after 100ms:', !!scriptInDom);
                if (scriptInDom) {
                    console.log('🔧 [DEBUG] Script element src:', scriptInDom.src);
                    console.log('🔧 [DEBUG] Script element type:', scriptInDom.type);
                }
            }, 100);
        }

        // Optimized file loading into SuperSplat with streaming support
        async function loadFileIntoSuperSplat(fileUri, filename = null) {
            try {
                console.log('🔄 [SUPERSPLAT] Loading file into SuperSplat...', fileUri);
                console.log('🔧 [SUPERSPLAT] File URI type:', fileUri.startsWith('blob:') ? 'BLOB URL' : 'HTTP URL');
                
                // Ensure SuperSplat scene is ready
                if (!window.scene || !window.scene.events) {
                    console.error('❌ [SUPERSPLAT] Scene not ready for file loading');
                    throw new Error('SuperSplat scene not initialized');
                }
                
                // Initialize variables first
                let detectedFilename = filename || window.originalFileName || 'unknown-file.ply';
                let fileData;
                
                // Handle different URI types
                try {
                    const response = await fetch(fileUri);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText} for URL: ${fileUri}`);
                    }
                    
                    console.log('✅ [SUPERSPLAT] Fetch successful, response headers:', Array.from(response.headers.entries()));
                    
                    // Get file data as blob directly
                    const blob = await response.blob();
                    const fileSize = blob.size;
                    console.log(`🔧 [SUPERSPLAT] File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
                    
                    // Validate file type for PLY files (only for smaller files to improve performance)
                    if (detectedFilename.toLowerCase().endsWith('.ply') && fileSize < 500 * 1024 * 1024) { // Only validate files < 500MB
                        console.log('🔧 [SUPERSPLAT] Validating PLY file header...');
                        const headerBuffer = await blob.slice(0, 100).arrayBuffer();
                        const headerText = new TextDecoder().decode(headerBuffer);
                        
                        if (!headerText.startsWith('ply')) {
                            console.warn('⚠️ [SUPERSPLAT] File may not have valid PLY header, but proceeding...');
                            console.log('🔧 [SUPERSPLAT] Header preview:', headerText.substring(0, 50));
                        } else {
                            console.log('✅ [SUPERSPLAT] Valid PLY header detected');
                        }
                    } else if (detectedFilename.toLowerCase().endsWith('.ply')) {
                        console.log('🚀 [SUPERSPLAT] Skipping header validation for large PLY file (>500MB - performance optimization)');
                    }
                    
                    fileData = { blob, filename: detectedFilename };
                    
                } catch (fetchError) {
                    console.log('Direct fetch failed, falling back to VSCode message system...', fetchError.message);
                    
                    // Fallback to VSCode message system
                    const requestId = 'file-request-' + Date.now();
                    fileData = await new Promise((resolve, reject) => {
                    let binaryChunks = [];
                    let expectedTotalChunks = 0;
                    let receivedChunksCount = 0;
                    let receivedFilename = '';
                    
                    const timeout = setTimeout(() => {
                        window.removeEventListener('message', messageHandler);
                        reject(new Error('File transfer timeout (30 minutes)'));
                    }, 30 * 60 * 1000); // 30 minutes timeout
                    
                    const messageHandler = (event) => {
                        const message = event.data;
                        if (message.requestId !== requestId) return;

                        // Handle small files (sent directly)
                        if (message.type === 'fileData') {
                            console.log('Received single file data, size:', message.data?.length || message.size);
                            clearTimeout(timeout);
                            window.removeEventListener('message', messageHandler);
                            
                            let bytes;
                            if (typeof message.data === 'string') {
                                // Backward-compatible base64 payload
                                const binaryString = atob(message.data);
                                bytes = new Uint8Array(binaryString.length);
                                for (let i = 0; i < binaryString.length; i++) {
                                    bytes[i] = binaryString.charCodeAt(i);
                                }
                            } else if (message.data instanceof ArrayBuffer) {
                                bytes = new Uint8Array(message.data);
                            } else if (ArrayBuffer.isView(message.data)) {
                                const view = message.data;
                                bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
                            } else {
                                return reject(new Error('Unsupported file data format'));
                            }
                            const blob = new Blob([bytes]);
                            resolve({ blob: blob, filename: message.filename });
                        
                        // Start of chunked transfer for large files
                        } else if (message.type === 'fileTransferStart') {
                            console.log(`Starting chunked transfer: ${message.totalChunks} chunks, ${(message.totalSize / (1024 * 1024)).toFixed(2)} MB`);
                            expectedTotalChunks = message.totalChunks;
                            receivedFilename = message.filename;
                            binaryChunks = new Array(expectedTotalChunks);
                        
                        // Handle individual chunks
                        } else if (message.type === 'fileChunk') {
                            let chunkBytes;
                            if (typeof message.data === 'string') {
                                const binaryString = atob(message.data);
                                chunkBytes = new Uint8Array(binaryString.length);
                                for (let i = 0; i < binaryString.length; i++) {
                                    chunkBytes[i] = binaryString.charCodeAt(i);
                                }
                            } else if (message.data instanceof ArrayBuffer) {
                                chunkBytes = new Uint8Array(message.data);
                            } else if (ArrayBuffer.isView(message.data)) {
                                const view = message.data;
                                chunkBytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
                            } else {
                                console.error('Unsupported chunk format:', typeof message.data);
                                return;
                            }
                            binaryChunks[message.chunkIndex] = chunkBytes;
                            receivedChunksCount++;
                            
                            // Progress logging every 10%
                            if (receivedChunksCount % Math.ceil(expectedTotalChunks / 10) === 0) {
                                const progress = (receivedChunksCount / expectedTotalChunks) * 100;
                                console.log(`Chunk progress: ${progress.toFixed(1)}%`);
                            }
                            
                            // Complete when all chunks received
                            if (message.isLastChunk || receivedChunksCount === expectedTotalChunks) {
                                console.log('All chunks received, validating and creating blob...');
                                clearTimeout(timeout);
                                window.removeEventListener('message', messageHandler);
                                
                                // Validate all chunks are received and in order
                                let allChunksValid = true;
                                for (let i = 0; i < expectedTotalChunks; i++) {
                                    if (!binaryChunks[i] || binaryChunks[i].length === 0) {
                                        console.error(`Missing or invalid chunk at index ${i}`);
                                        allChunksValid = false;
                                        break;
                                    }
                                }
                                
                                if (!allChunksValid) {
                                    reject(new Error('Invalid chunk data - some chunks are missing or corrupted'));
                                    return;
                                }
                                
                                const blob = new Blob(binaryChunks);
                                
                                // Validate PLY header for PLY files (skip for large files to improve performance)
                                if (receivedFilename.toLowerCase().endsWith('.ply') && blob.size < 500 * 1024 * 1024) { // Only validate files < 500MB
                                    console.log('🔧 [STREAMING] Validating PLY header for transferred file...');
                                    const reader = new FileReader();
                                    reader.onload = (e) => {
                                        const text = e.target.result;
                                        if (!text.startsWith('ply')) {
                                            console.error('Invalid PLY header. File content:', text.substring(0, 100));
                                            reject(new Error('Invalid PLY header - file may be corrupted during transfer'));
                                            return;
                                        }
                                        console.log('✅ [STREAMING] Valid PLY header confirmed');
                                        resolve({ blob: blob, filename: receivedFilename });
                                    };
                                    reader.onerror = () => {
                                        reject(new Error('Failed to validate PLY header'));
                                    };
                                    reader.readAsText(blob.slice(0, 100)); // Read first 100 bytes to check header
                                } else {
                                    if (receivedFilename.toLowerCase().endsWith('.ply')) {
                                        console.log('🚀 [STREAMING] Skipping PLY header validation for large file (>500MB - performance optimization)');
                                    }
                                    resolve({ blob: blob, filename: receivedFilename });
                                }
                            }
                        
                        // Handle errors
                        } else if (message.type === 'fileError') {
                            clearTimeout(timeout);
                            window.removeEventListener('message', messageHandler);
                            reject(new Error('File transfer error: ' + message.error));
                        }
                    };
                    
                    window.addEventListener('message', messageHandler);
                    
                    // Request file data from VSCode
                    if (vscode) {
                        vscode.postMessage({
                            type: 'loadFile',
                            requestId: requestId,
                            uri: fileUri
                        });
                    } else {
                        reject(new Error('VSCode API not available'));
                    }
                });
                }
                
                // Use the file data (either from streaming or fallback)
                const { blob, filename: loadedFilename } = fileData;
                
                console.log('🎯 [SUPERSPLAT] Preparing to load into SuperSplat...');
                console.log(`🔧 [SUPERSPLAT] Blob size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
                console.log(`🔧 [SUPERSPLAT] Filename: ${loadedFilename}`);
                
                // Create object URL for SuperSplat
                const url = URL.createObjectURL(blob);
                console.log(`🔧 [SUPERSPLAT] Created object URL: ${url}`);

                // Verify SuperSplat scene and events are available
                if (!window.scene) {
                    console.error('❌ [SUPERSPLAT] window.scene not available');
                    throw new Error('SuperSplat scene not initialized');
                }
                
                if (!window.scene.events) {
                    console.error('❌ [SUPERSPLAT] window.scene.events not available');
                    throw new Error('SuperSplat events system not available');
                }
                
                console.log('✅ [SUPERSPLAT] Scene and events available, invoking import...');
                
                // Load into SuperSplat with error handling
                try {
                    await window.scene.events.invoke('import', url, loadedFilename);
                    console.log('✅ [SUPERSPLAT] File successfully loaded into SuperSplat');
                    
                    const renderTime = performance.now() - perfMetrics.renderStart;
                    logPerformance(`Render complete: ${renderTime.toFixed(2)}ms total`);
                    
                } catch (importError) {
                    console.error('❌ [SUPERSPLAT] Import failed:', importError);
                    console.error('❌ [SUPERSPLAT] Import error details:', importError.message);
                    
                    // Try alternative loading methods
                    console.log('🔄 [SUPERSPLAT] Trying alternative import method...');
                    
                    // Check if SuperSplat has alternative loading methods
                    if (window.scene && window.scene.loadFile) {
                        console.log('🔄 [SUPERSPLAT] Trying scene.loadFile method...');
                        await window.scene.loadFile(url, loadedFilename);
                        console.log('✅ [SUPERSPLAT] File loaded via alternative method');
                    } else if (window.scene && window.scene.import) {
                        console.log('🔄 [SUPERSPLAT] Trying scene.import method...');
                        await window.scene.import(url, loadedFilename);
                        console.log('✅ [SUPERSPLAT] File loaded via scene.import');
                    } else {
                        throw new Error(`SuperSplat import failed: ${importError.message}`);
                    }
                }

                // Clean up object URL after a delay to ensure loading is complete
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                    console.log('🧹 [SUPERSPLAT] Object URL cleaned up');
                }, 5000);

            } catch (error) {
                console.error('❌ [SUPERSPLAT] Complete loading error:', error);
                logPerformance(`Load error: ${error.message}`);
                if (vscode) {
                    vscode.postMessage({
                        type: 'error',
                        message: `Failed to load file into SuperSplat: ${error.message}`
                    });
                }
                throw error; // Re-throw for upstream handling
            }
        }

        // Performance debugging (only in debug mode)
        if (window.location.href.includes('debug=true')) {
            window.getPerformanceMetrics = function() {
                return {
                    ...perfMetrics,
                    totalLoadTime: perfMetrics.fileLoadEnd - perfMetrics.fileLoadStart,
                    totalParseTime: perfMetrics.parseEnd - perfMetrics.parseStart,
                    totalRenderTime: performance.now() - perfMetrics.renderStart
                };
            };
        }
        
        // Always initialize SuperSplat - streaming will update the file later
        console.log('🔧 [DEBUG] Initializing SuperSplat (streaming mode will update file later)');
        initializeSuperSplat();
        
        // Function to load large files directly bypassing Extension Host
        function loadLargeFileDirectly(settings) {
            console.log('🔥 [BYPASS] Loading large file directly in webview');
            console.log('🔥 [BYPASS] File size:', settings.fileSizeMB, 'MB');
            
            // Create a mock blob for testing - replace with actual file access
            const mockData = new Uint8Array(1024); // Small mock data
            const blob = new Blob([mockData], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            
            console.log('🔥 [BYPASS] Created mock file URL:', url);
            
            // Wait for SuperSplat to initialize then load
            setTimeout(() => {
                if (window.scene && window.scene.events) {
                    console.log('🔥 [BYPASS] Loading into SuperSplat...');
                    window.scene.events.invoke('import', url, 'large-file.ply');
                } else {
                    console.log('🔥 [BYPASS] SuperSplat not ready, retrying...');
                    setTimeout(() => loadLargeFileDirectly(settings), 1000);
                }
            }, 3000);
        }
    });
    // 안전 저장: Blob/ArrayBuffer/Uint8Array 모두 수용, 8MB 청크 스트리밍
    function normalizeToBlob(payload, fallbackName = 'scene.ply') {
        // SuperSplat이 무엇을 주는지 케이스별 처리
        if (payload instanceof Blob) return { blob: payload, filename: payload.name || fallbackName };
        if (payload?.blob instanceof Blob) return { blob: payload.blob, filename: payload.filename || fallbackName };
        if (payload instanceof ArrayBuffer) return { blob: new Blob([payload]), filename: fallbackName };
        if (payload instanceof Uint8Array) return { blob: new Blob([payload.buffer]), filename: fallbackName };
        if (payload?.bytes instanceof Uint8Array) return { blob: new Blob([payload.bytes.buffer]), filename: payload.filename || fallbackName };
        // 마지막으로 문자열은 금지(손상 위험)
        throw new Error('Unsupported save payload type');
    }

    async function sendFileInChunks(vscode, blob, filename, targetPath) {
        const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB for better performance
        const totalSize = blob.size;
        const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
        const requestId = `save-${Date.now()}`;

        console.log(`🔧 [SAVE] Starting chunked save: ${filename}, ${totalSize} bytes, ${totalChunks} chunks`);
        if (targetPath) {
            console.log(`🔧 [SAVE] Target path: ${targetPath}`);
        }

        // 시작 알림
        vscode.postMessage({
            type: 'save/start',
            requestId,
            filename,
            totalSize,
            totalChunks,
            mimeType: blob.type || 'application/octet-stream'
        });

        // ArrayBuffer로 한 번 읽고 view로 슬라이스 → 복사 최소화
        const fullBuf = await blob.arrayBuffer();
        const u8 = new Uint8Array(fullBuf);

        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, totalSize);
            const chunk = u8.subarray(start, end); // 뷰: 복사 없음

            console.log(`🔧 [SAVE] Sending chunk ${i + 1}/${totalChunks}: ${chunk.length} bytes`);

            // 구조화 복제로 Uint8Array 전송
            vscode.postMessage({
                type: 'save/chunk',
                requestId,
                index: i,
                bytes: chunk
            });
        }

        // 커밋(무결성 검사용 길이)
        vscode.postMessage({
            type: 'save/commit',
            requestId,
            byteLength: totalSize,
            targetPath: targetPath
        });

        console.log(`🔧 [SAVE] All chunks sent, committed ${totalSize} bytes`);
        if (targetPath) {
            console.log(`🔧 [SAVE] Will save to: ${targetPath}`);
        }
    }

    function setupSaveExportHooks() {
        console.log('🔧 [SAVE] Setting up DownloadWriter hook...');
        
        if (!window.vscode) {
            console.log('🔧 [SAVE] VSCode API not available, cannot setup hooks');
            return;
        }

        // DOM에서 다운로드 링크 클릭을 가로채기
        const originalCreateElement = document.createElement;
        document.createElement = function(tagName) {
            const element = originalCreateElement.call(this, tagName);
            
            if (tagName.toLowerCase() === 'a' && window.vscode) {
                // <a> 태그 생성을 감지하여 다운로드 가로채기
                const originalClick = element.click;
                element.click = function() {
                    if (this.download && this.href && this.href.startsWith('blob:')) {
                        console.log('🔧 [SAVE] Download intercepted:', this.download, this.href);
                        
                        // Blob URL에서 데이터 추출
                        fetch(this.href)
                            .then(response => response.blob())
                            .then(blob => {
                                console.log('🔧 [SAVE] Retrieved blob:', blob.size, 'bytes');
                                // Use original filename as base, modify for export
                                const originalName = window.originalFileName || 'export.ply';
                                const baseName = originalName.replace(/\.ply$/i, '');
                                const filename = this.download || `${baseName}_exported.ply`;
                                
                                // Optional: set target path for direct save to specific location
                                // const targetPath = `/data4/rgkoo/exports/${filename}`;
                                return sendFileInChunks(window.vscode, blob, filename /* , targetPath */);
                            })
                            .catch(error => {
                                console.error('🔧 [SAVE] Failed to intercept download:', error);
                                // fallback to original download
                                originalClick.call(this);
                            });
                        
                        // 원본 다운로드 방지
                        return false;
                    } else {
                        // 일반 링크는 그대로 처리
                        return originalClick.call(this);
                    }
                };
            }
            
            return element;
        };

        console.log('🔧 [SAVE] DownloadWriter hook installed successfully');
    }

    // SuperSplat이 로드된 후 save/export hooks 설정
    setTimeout(() => {
        if (window.vscode) {
            setupSaveExportHooks();
        } else {
            console.log('🔧 [SAVE] VSCode API not available, retrying...');
            // VSCode API 재시도
            setTimeout(() => {
                try {
                    window.vscode = window.acquireVsCodeApi?.() || window.vsCodeIntegration?.vscode || null;
                    if (window.vscode) {
                        console.log('🔧 [SAVE] VSCode API acquired on retry');
                        setupSaveExportHooks();
                    } else {
                        console.log('🔧 [SAVE] VSCode API still not available');
                    }
                } catch (error) {
                    console.log('🔧 [SAVE] Failed to acquire VSCode API on retry:', error);
                }
            }, 2000);
        }
    }, 3000);
})();
