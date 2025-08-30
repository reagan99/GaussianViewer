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
        let vscode = null;
        try {
            vscode = window.acquireVsCodeApi?.() || window.vsCodeIntegration?.vscode || null;
        } catch (error) {
            console.log('Failed to acquire VS Code API:', error);
        }
        console.log('🔧 [DEBUG] VSCode API available:', !!vscode);
        console.log('🔧 [DEBUG] Window location:', window.location.href);
        console.log('🔧 [DEBUG] Document base URI:', document.baseURI);

        // Initialize variables first (shared across functions)
        let isInitializing = false;
        
        // Setup message handlers immediately after VSCode API initialization
        setupMessageHandlers();
        
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
                
                // Even with message handler, add fallback for unresponsive API
                setTimeout(() => {
                    console.log('🔄 [FALLBACK] VSCode API timeout check, forcing streaming fallback');
                    if (finalSettings.useStreaming || finalSettings.fileSizeMB > 500) {
                        console.log('🔄 [FALLBACK] File requires streaming, forcing fallback mode');
                        requestStreamingMode(finalSettings);
                    }
                }, 3000);
            } else {
                console.log('⚠️ [WEBVIEW] VSCode onDidReceiveMessage not available');
                console.log('🔍 [WEBVIEW] Available VSCode API methods:', Object.keys(vscode || {}));
                
                // Fallback: Force immediate streaming check if the API is not available
                console.log('🔧 [FALLBACK] Setting up fallback timer...');
                const fallbackSettings = finalSettings; // Capture settings
                setTimeout(() => {
                    console.log('🔄 [FALLBACK] VSCode API limited, checking for pending streaming...');
                    console.log('🔄 [FALLBACK] fallbackSettings:', fallbackSettings);
                    console.log('🔄 [FALLBACK] useStreaming:', fallbackSettings.useStreaming, 'fileSizeMB:', fallbackSettings.fileSizeMB);
                    if (fallbackSettings.useStreaming || fallbackSettings.fileSizeMB > 500) {
                        console.log('🔄 [FALLBACK] File requires streaming, forcing fallback mode');
                        requestStreamingMode(fallbackSettings);
                    } else {
                        console.log('❌ [FALLBACK] Conditions not met - useStreaming:', fallbackSettings.useStreaming, 'fileSizeMB:', fallbackSettings.fileSizeMB);
                    }
                }, 2000);
            }
            
            function handleMessage(message) {
                
                switch(message.type) {
                    case 'tryNormalMode':
                        console.log('🔧 [DEBUG] Trying normal mode with fallback capability');
                        tryNormalModeWithFallback(message.fileSize, message.fallbackThreshold);
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
                            console.log('🚀 [PARALLEL] Large file detected - using parallel chunk processing');
                            streamingState.useParallel = true;
                            streamingState.batchSize = 5; // Process 5 chunks in parallel
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

        // Initialize performance metrics
        const perfMetrics = {
            fileLoadStart: 0,
            fileLoadEnd: 0,
            parseStart: 0,
            parseEnd: 0,
            renderStart: 0
        };

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
            
            // Send streaming request to VSCode
            setTimeout(() => {
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
            }, 1000);
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
                logPerformance('SuperSplat main script loaded successfully');
                
                // Check what's available in window
                console.log('🔧 [DEBUG] Window globals after script load:', Object.keys(window).filter(key => 
                    key.toLowerCase().includes('scene') || 
                    key.toLowerCase().includes('main') || 
                    key.toLowerCase().includes('splat')
                ));
                
                // Wait for scene availability with minimal polling
                const checkScene = () => {
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
                        console.log('⏳ [DEBUG] Scene not yet available, retrying in 1s...');
                        setTimeout(checkScene, 1000);
                    }
                };
                
                setTimeout(checkScene, 500);
            };
            
            script.onerror = function(error) {
                const errorMsg = `Script load error: ${error.toString()} - URL: ${script.src}`;
                logPerformance(errorMsg);
                console.error('SuperSplat script failed to load:', error, 'URL:', script.src);
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
        async function loadFileIntoSuperSplat(fileUri) {
            try {
                console.log('Loading file with streaming approach...', fileUri);
                
                let fileData;
                
                // Try direct fetch with streaming for large files
                try {
                    const response = await fetch(fileUri);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    const contentLength = response.headers.get('content-length');
                    if (contentLength) {
                        console.log(`File size: ${(parseInt(contentLength) / 1024 / 1024).toFixed(2)} MB`);
                    }
                    
                    // For large files, use ReadableStream
                    if (contentLength && parseInt(contentLength) > 100 * 1024 * 1024) { // 100MB+
                        console.log('Using streaming approach for large file...');
                        
                        const reader = response.body.getReader();
                        const chunks = [];
                        let receivedLength = 0;
                        
                        while (true) {
                            const { done, value } = await reader.read();
                            
                            if (done) break;
                            
                            chunks.push(value);
                            receivedLength += value.length;
                            
                            // Log progress every 10MB
                            if (receivedLength % (10 * 1024 * 1024) < value.length) {
                                console.log(`Downloaded: ${(receivedLength / 1024 / 1024).toFixed(2)} MB`);
                            }
                        }
                        
                        // Combine chunks
                        const fullData = new Uint8Array(receivedLength);
                        let position = 0;
                        for (const chunk of chunks) {
                            fullData.set(chunk, position);
                            position += chunk.length;
                        }
                        
                        const blob = new Blob([fullData]);
                        const filename = fileUri.split('/').pop() || 'file';
                        
                        // Validate PLY header
                        const headerText = new TextDecoder().decode(fullData.slice(0, 100));
                        if (filename.toLowerCase().endsWith('.ply') && !headerText.startsWith('ply')) {
                            throw new Error('Invalid PLY header in streamed file');
                        }
                        
                        fileData = { blob, filename };
                    } else {
                        // For smaller files, use regular blob
                        const blob = await response.blob();
                        const filename = fileUri.split('/').pop() || 'file';
                        fileData = { blob, filename };
                    }
                    
                } catch (fetchError) {
                    console.log('Direct fetch failed, falling back to VSCode message system...', fetchError.message);
                    
                    // Fallback to VSCode message system
                    const requestId = 'file-request-' + Date.now();
                    fileData = await new Promise((resolve, reject) => {
                    let binaryChunks = [];
                    let expectedTotalChunks = 0;
                    let receivedChunksCount = 0;
                    let filename = '';
                    
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
                            filename = message.filename;
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
                                
                                // Validate PLY header for PLY files
                                if (filename.toLowerCase().endsWith('.ply')) {
                                    const reader = new FileReader();
                                    reader.onload = (e) => {
                                        const text = e.target.result;
                                        if (!text.startsWith('ply')) {
                                            console.error('Invalid PLY header. File content:', text.substring(0, 100));
                                            reject(new Error('Invalid PLY header - file may be corrupted during transfer'));
                                            return;
                                        }
                                        resolve({ blob: blob, filename: filename });
                                    };
                                    reader.onerror = () => {
                                        reject(new Error('Failed to validate PLY header'));
                                    };
                                    reader.readAsText(blob.slice(0, 100)); // Read first 100 bytes to check header
                                } else {
                                    resolve({ blob: blob, filename: filename });
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
                const { blob, filename } = fileData;
                
                const url = URL.createObjectURL(blob);

                // Load into SuperSplat
                if (window.scene && window.scene.events) {
                    await window.scene.events.invoke('import', url, filename);

                    const renderTime = performance.now() - perfMetrics.renderStart;
                    logPerformance(`Render complete: ${renderTime.toFixed(2)}ms total`);
                }

                // Clean up
                URL.revokeObjectURL(url);

            } catch (error) {
                logPerformance(`Load error: ${error.message}`);
                if (vscode) {
                    vscode.postMessage({
                        type: 'error',
                        message: `Failed to load file: ${error.message}`
                    });
                }
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
    });
})();
