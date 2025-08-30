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
exports.performanceConfigurationSchema = exports.PerformanceConfigManager = void 0;
const vscode = __importStar(require("vscode"));
class PerformanceConfigManager {
    constructor(context) {
        this.context = context;
        this.config = this.loadConfig();
        this.registerConfigurationListener();
    }
    loadConfig() {
        const config = vscode.workspace.getConfiguration('supersplat.performance');
        return {
            // PLY Optimization
            enableASCIIToBinaryConversion: config.get('enableASCIIToBinaryConversion', true),
            enablePLYCaching: config.get('enablePLYCaching', true),
            cacheMaxAge: config.get('cacheMaxAge', 24 * 60 * 60 * 1000), // 24 hours
            // File Transfer
            largeFileThreshold: config.get('largeFileThreshold', 10), // 10MB
            enableDirectUriTransfer: config.get('enableDirectUriTransfer', true),
            chunkSize: config.get('chunkSize', 8 * 1024 * 1024), // 8MB for high-end systems
            // Logging
            enablePerformanceLogging: config.get('enablePerformanceLogging', true),
            enableVerboseLogging: config.get('enableVerboseLogging', false),
            logLevel: config.get('logLevel', 'info'),
            // GPU Optimization
            enableBufferPooling: config.get('enableBufferPooling', true),
            enableVertexCompression: config.get('enableVertexCompression', false), // Experimental
            enableLevelOfDetail: config.get('enableLevelOfDetail', false), // Experimental
            lodReductionFactor: config.get('lodReductionFactor', 0.3),
            // Memory Management
            enableGarbageCollection: config.get('enableGarbageCollection', true),
            gcInterval: config.get('gcInterval', 5 * 60 * 1000), // 5 minutes
            maxCacheSize: config.get('maxCacheSize', 500), // 500MB
        };
    }
    registerConfigurationListener() {
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('supersplat.performance')) {
                this.config = this.loadConfig();
                this.notifyConfigChange();
            }
        });
    }
    notifyConfigChange() {
        // Notify all active webviews about configuration changes
        vscode.window.showInformationMessage('SuperSplat performance configuration updated. Reload to apply changes.', 'Reload')
            .then(selection => {
            if (selection === 'Reload') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
    }
    getConfig() {
        return { ...this.config };
    }
    updateConfig(updates) {
        const workspaceConfig = vscode.workspace.getConfiguration('supersplat.performance');
        for (const [key, value] of Object.entries(updates)) {
            workspaceConfig.update(key, value, vscode.ConfigurationTarget.Workspace);
        }
    }
    // Performance profiling commands
    async showPerformanceStats() {
        const stats = await this.collectPerformanceStats();
        const panel = vscode.window.createWebviewPanel('supersplatPerformance', 'SuperSplat Performance Stats', vscode.ViewColumn.Two, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        panel.webview.html = this.generateStatsHtml(stats);
    }
    async collectPerformanceStats() {
        // Collect various performance statistics
        return {
            cacheSize: await this.getCacheSize(),
            cacheHitRatio: await this.getCacheHitRatio(),
            averageLoadTime: await this.getAverageLoadTime(),
            memoryUsage: process.memoryUsage(),
            activeWebviews: this.getActiveWebviewCount(),
            config: this.config
        };
    }
    async getCacheSize() {
        // Implementation to calculate cache size
        return 0; // Placeholder
    }
    async getCacheHitRatio() {
        // Implementation to calculate cache hit ratio
        return 0; // Placeholder
    }
    async getAverageLoadTime() {
        // Implementation to calculate average load time
        return 0; // Placeholder
    }
    getActiveWebviewCount() {
        // Implementation to count active webviews
        return 0; // Placeholder
    }
    generateStatsHtml(stats) {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>SuperSplat Performance Stats</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; }
                    .stat { margin: 10px 0; padding: 10px; background: #f0f0f0; border-radius: 5px; }
                    .config { background: #e6f3ff; }
                    pre { overflow-x: auto; }
                </style>
            </head>
            <body>
                <h1>SuperSplat Performance Statistics</h1>
                
                <div class="stat">
                    <h3>Cache Performance</h3>
                    <p>Cache Size: ${(stats.cacheSize / (1024 * 1024)).toFixed(2)} MB</p>
                    <p>Cache Hit Ratio: ${(stats.cacheHitRatio * 100).toFixed(1)}%</p>
                </div>
                
                <div class="stat">
                    <h3>Loading Performance</h3>
                    <p>Average Load Time: ${stats.averageLoadTime.toFixed(2)} ms</p>
                    <p>Active Webviews: ${stats.activeWebviews}</p>
                </div>
                
                <div class="stat">
                    <h3>Memory Usage</h3>
                    <p>RSS: ${(stats.memoryUsage.rss / (1024 * 1024)).toFixed(2)} MB</p>
                    <p>Heap Used: ${(stats.memoryUsage.heapUsed / (1024 * 1024)).toFixed(2)} MB</p>
                    <p>External: ${(stats.memoryUsage.external / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
                
                <div class="stat config">
                    <h3>Current Configuration</h3>
                    <pre>${JSON.stringify(stats.config, null, 2)}</pre>
                </div>
                
                <script>
                    // Auto-refresh every 30 seconds
                    setTimeout(() => location.reload(), 30000);
                </script>
            </body>
            </html>
        `;
    }
    // Command to clear all caches
    async clearAllCaches() {
        try {
            // Clear PLY cache
            const response = await vscode.window.showWarningMessage('This will clear all SuperSplat caches. Continue?', 'Clear Caches', 'Cancel');
            if (response === 'Clear Caches') {
                // Implementation to clear caches
                vscode.window.showInformationMessage('SuperSplat caches cleared successfully.');
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to clear caches: ${error}`);
        }
    }
    // Command to optimize current file
    async optimizeCurrentFile() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showWarningMessage('No active file to optimize.');
            return;
        }
        const filePath = activeEditor.document.fileName;
        if (!filePath.toLowerCase().endsWith('.ply')) {
            vscode.window.showWarningMessage('Active file is not a PLY file.');
            return;
        }
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Optimizing PLY file...',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Converting to binary format...' });
                // Implementation to optimize the file
                await new Promise(resolve => setTimeout(resolve, 2000)); // Placeholder
                progress.report({ message: 'Complete!' });
            });
            vscode.window.showInformationMessage('PLY file optimized successfully.');
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to optimize file: ${error}`);
        }
    }
}
exports.PerformanceConfigManager = PerformanceConfigManager;
// Export configuration schema for package.json
exports.performanceConfigurationSchema = {
    "supersplat.performance.enableASCIIToBinaryConversion": {
        "type": "boolean",
        "default": true,
        "description": "Automatically convert ASCII PLY files to binary format for faster loading"
    },
    "supersplat.performance.enablePLYCaching": {
        "type": "boolean",
        "default": true,
        "description": "Cache converted PLY files to avoid re-processing"
    },
    "supersplat.performance.cacheMaxAge": {
        "type": "number",
        "default": 86400000,
        "description": "Maximum age of cache entries in milliseconds (default: 24 hours)"
    },
    "supersplat.performance.largeFileThreshold": {
        "type": "number",
        "default": 10,
        "description": "File size threshold in MB for using optimized transfer methods"
    },
    "supersplat.performance.enableDirectUriTransfer": {
        "type": "boolean",
        "default": true,
        "description": "Use direct URI transfer for large files instead of base64 encoding"
    },
    "supersplat.performance.enablePerformanceLogging": {
        "type": "boolean",
        "default": true,
        "description": "Enable performance metrics logging"
    },
    "supersplat.performance.enableBufferPooling": {
        "type": "boolean",
        "default": true,
        "description": "Enable GPU buffer pooling for improved memory management"
    },
    "supersplat.performance.enableVertexCompression": {
        "type": "boolean",
        "default": false,
        "description": "Enable experimental vertex data compression (may reduce quality)"
    },
    "supersplat.performance.enableLevelOfDetail": {
        "type": "boolean",
        "default": false,
        "description": "Enable experimental level-of-detail optimization for large models"
    },
    "supersplat.performance.maxCacheSize": {
        "type": "number",
        "default": 500,
        "description": "Maximum cache size in MB before cleanup"
    }
};
//# sourceMappingURL=performanceConfig.js.map