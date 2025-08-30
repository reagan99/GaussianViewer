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
            
            // Force streaming for ALL large files - NO LIMITS
            if (finalSettings.useStreaming || finalSettings.fileSizeMB > 500) {
                console.log('🚀 [FORCE] Loading large file:', finalSettings.fileSizeMB, 'MB - forcing streaming mode');
                requestStreamingMode(finalSettings);
            }
            
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
                        streamingState.isBase64Mode = true;
                        streamingState.expectedChunks = message.totalChunks;
                        streamingState.binaryChunks = new Array(message.totalChunks);
                        streamingState.receivedChunks = 0;
                        streamingState.totalSize = message.totalSize;
                        streamingState.filename = message.filename;
                        streamingState.requestId = message.requestId;
                        
                        console.log('🚀 [BASE64] Base64 streaming state initialized');
                        break;
                        
                    case 'fileChunk':
                        handleBase64Chunk(message, streamingState);
                        break;
                        
                    case 'fileError':
                        console.error('❌ [BASE64] File transfer error:', message.error);
                        break;
                }
            }
            
            // 1.0.1 스타일 base64 청크 처리 함수
            function handleBase64Chunk(message, streamingState) {
                if (!streamingState.isBase64Mode) {
                    console.log('⚠️ [BASE64] Ignoring chunk - not in base64 mode');
                    return;
                }
                
                // requestId가 다르면 새로운 스트림 시작으로 간주하고 상태 리셋
                if (message.requestId !== streamingState.requestId) {
                    console.log('🔄 [BASE64] Different requestId detected, updating state');
                    streamingState.requestId = message.requestId;
                    // 기존 청크 데이터는 유지하되 requestId만 업데이트
                }
                
                console.log(`📦 [BASE64] Processing chunk ${message.chunkIndex}/${message.totalChunks}`);
                
                try {
                    // Decode base64 chunk immediately into a Uint8Array (1.0.1 방식)
                    const binaryString = atob(message.data);
                    const chunkBytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        chunkBytes[i] = binaryString.charCodeAt(i);
                    }
                    
                    streamingState.binaryChunks[message.chunkIndex] = chunkBytes;
                    streamingState.receivedChunks++;
                    
                    const progress = (streamingState.receivedChunks / streamingState.expectedChunks) * 100;
                    if (message.chunkIndex % Math.ceil(streamingState.expectedChunks / 20) === 0 || message.isLastChunk) {
                        console.log(`📊 [BASE64] Progress: ${progress.toFixed(1)}% (${streamingState.receivedChunks}/${streamingState.expectedChunks})`);
                        logPerformance(`Base64 chunk progress: ${progress.toFixed(1)}%`);
                    }
                    
                    // Check if all chunks are received
                    if (message.isLastChunk || streamingState.receivedChunks === streamingState.expectedChunks) {
                        console.log('🎉 [BASE64] All chunks received, assembling file...');
                        
                        // Verify all chunks are present (1.0.1 방식)
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
                        
                        // Create a Blob directly from the array of Uint8Arrays (1.0.1 방식)
                        const blob = new Blob(streamingState.binaryChunks);
                        console.log('✅ [BASE64] Large file assembled from base64 chunks, size:', blob.size, 'bytes');
                        
                        // 파일 헤더 검증
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
                        console.log('🔗 [BASE64] Created blob URL:', url);
                        
                        // Load into SuperSplat with proper filename
                        const filename = streamingState.filename || window.originalFileName || 'large-file.ply';
                        console.log('📤 [BASE64] Loading into SuperSplat with filename:', filename);
                        loadFileIntoSuperSplat(url, filename);
                        
                        // Reset streaming state completely
                        streamingState.isStreaming = false;
                        streamingState.isBase64Mode = false;
                        streamingState.requestId = null;
                        streamingState.binaryChunks = null;
                        streamingState.expectedChunks = 0;
                        streamingState.receivedChunks = 0;
                        
                        console.log('🔄 [BASE64] Streaming state reset after successful load');
                        logPerformance(`Base64 chunked file loaded successfully: ${blob.size} bytes`);
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
                            console.log('Received single file data, size:', message.data.length);
                            clearTimeout(timeout);
                            window.removeEventListener('message', messageHandler);
                            
                            const binaryString = atob(message.data);
                            const bytes = new Uint8Array(binaryString.length);
                            for (let i = 0; i < binaryString.length; i++) {
                                bytes[i] = binaryString.charCodeAt(i);
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
                            const binaryString = atob(message.data);
                            const chunkBytes = new Uint8Array(binaryString.length);
                            for (let i = 0; i < binaryString.length; i++) {
                                chunkBytes[i] = binaryString.charCodeAt(i);
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
