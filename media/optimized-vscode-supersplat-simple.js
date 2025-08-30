// Simple Direct Streaming Version - No Fallback Complexity

document.addEventListener('DOMContentLoaded', function() {
    console.log('🔧 [DEBUG] DOM ready, initializing SuperSplat integration...');
    
    // Get settings from data attribute
    const settingsElement = document.querySelector('[data-settings]');
    console.log('🔧 [DEBUG] Settings element found:', !!settingsElement);
    
    if (!settingsElement) {
        console.error('❌ [ERROR] Settings element not found');
        return;
    }
    
    let settings;
    try {
        settings = JSON.parse(settingsElement.getAttribute('data-settings'));
        console.log('🔧 [DEBUG] Settings loaded:', settings);
    } catch (e) {
        console.error('❌ [ERROR] Failed to parse settings:', e);
        return;
    }
    
    // Set up window message listener
    window.addEventListener('message', event => {
        const message = event.data;
        console.log('📨 [WEBVIEW] Received message:', message);
        if (!message || !message.type) return;
        handleMessage(message);
    });
    
    // Direct streaming request for large files
    if (settings.useStreaming || settings.fileSizeMB > 500) {
        console.log('🚀 [DIRECT] Large file detected:', settings.fileSizeMB, 'MB');
        console.log('🚀 [DIRECT] Requesting streaming immediately');
        requestStreamingMode(settings);
    } else {
        console.log('🚀 [DIRECT] Small file, normal loading');
        initializeSuperSplat();
    }
    
    function requestStreamingMode(settings) {
        console.log('📤 [STREAMING] Sending streaming request to VSCode');
        
        if (window.vscode && window.vscode.postMessage) {
            window.vscode.postMessage({
                type: 'requestStreamingFallback',
                fileSizeMB: settings.fileSizeMB,
                useStreaming: true
            });
            console.log('✅ [STREAMING] Request sent via vscode.postMessage');
        } else {
            console.error('❌ [STREAMING] VSCode API not available');
        }
    }
    
    function handleMessage(message) {
        console.log('🔄 [MESSAGE] Processing:', message.type);
        
        switch(message.type) {
            case 'startStreaming':
                console.log('📥 [STREAMING] ✅ RECEIVED startStreaming');
                console.log('📥 [STREAMING] File size:', (message.fileSize / (1024 * 1024)).toFixed(2), 'MB');
                startStreamingProcess(message);
                break;
                
            case 'chunkResponse':
                console.log('📦 [CHUNK] Received chunk', message.chunkIndex + 1);
                processChunk(message);
                break;
                
            default:
                console.log('❓ [MESSAGE] Unknown type:', message.type);
        }
    }
    
    let streamingState = {
        isStreaming: false,
        chunks: [],
        expectedChunks: 0,
        receivedChunks: 0
    };
    
    function startStreamingProcess(message) {
        streamingState.isStreaming = true;
        streamingState.expectedChunks = Math.ceil(message.fileSize / message.chunkSize);
        streamingState.chunks = new Array(streamingState.expectedChunks);
        
        console.log('🔄 [STREAMING] Starting process');
        console.log('🔄 [STREAMING] Expected chunks:', streamingState.expectedChunks);
        
        // Initialize SuperSplat for streaming
        initializeSuperSplat();
    }
    
    function processChunk(message) {
        const { chunkIndex, chunkData, isLast } = message;
        streamingState.chunks[chunkIndex] = chunkData;
        streamingState.receivedChunks++;
        
        console.log(`📦 [CHUNK] ${streamingState.receivedChunks}/${streamingState.expectedChunks}`);
        
        if (isLast || streamingState.receivedChunks === streamingState.expectedChunks) {
            console.log('✅ [STREAMING] All chunks received, assembling file');
            assembleAndLoadFile();
        }
    }
    
    function assembleAndLoadFile() {
        try {
            const combinedData = streamingState.chunks.join('');
            const uint8Array = new Uint8Array(atob(combinedData).split('').map(c => c.charCodeAt(0)));
            const blob = new Blob([uint8Array], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            
            console.log('🎯 [ASSEMBLY] File assembled, size:', blob.size, 'bytes');
            loadSuperSplatWithUrl(url);
        } catch (error) {
            console.error('❌ [ASSEMBLY] Failed to assemble file:', error);
        }
    }
    
    function initializeSuperSplat() {
        console.log('🔧 [SUPERSPLAT] Initializing SuperSplat...');
        // SuperSplat initialization code here
    }
    
    function loadSuperSplatWithUrl(url) {
        console.log('🎯 [SUPERSPLAT] Loading with URL:', url);
        // Load SuperSplat with the assembled file URL
    }
    
    console.log('✅ [WEBVIEW] Simple streaming setup complete');
});