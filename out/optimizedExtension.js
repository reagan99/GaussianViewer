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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const optimizedSupersplatProvider_1 = require("./optimizedSupersplatProvider");
const performanceConfig_1 = require("./performanceConfig");
const plyOptimizer_1 = require("./plyOptimizer");
function activate(context) {
    console.log('Activating optimized SuperSplat extension...');
    // Initialize performance configuration manager
    const performanceConfig = new performanceConfig_1.PerformanceConfigManager(context);
    // Register the optimized custom editor provider
    const optimizedProvider = optimizedSupersplatProvider_1.OptimizedSuperSplatProvider.register(context);
    context.subscriptions.push(optimizedProvider);
    // Initialize PLY optimizer for cache warmup
    const plyOptimizer = new plyOptimizer_1.PLYOptimizer(context);
    // Register performance-related commands
    const commands = [
        vscode.commands.registerCommand('supersplat.performance.showStats', () => {
            performanceConfig.showPerformanceStats();
        }),
        vscode.commands.registerCommand('supersplat.performance.clearCache', () => {
            performanceConfig.clearAllCaches();
        }),
        vscode.commands.registerCommand('supersplat.performance.optimizeFile', () => {
            performanceConfig.optimizeCurrentFile();
        }),
        vscode.commands.registerCommand('supersplat.performance.preloadFile', async (uri) => {
            if (uri && uri.fsPath.toLowerCase().endsWith('.ply')) {
                try {
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: 'Preloading PLY file...',
                        cancellable: false
                    }, async (progress) => {
                        progress.report({ message: 'Optimizing...' });
                        await plyOptimizer.optimizePLY(uri.fsPath);
                    });
                    vscode.window.showInformationMessage('PLY file preloaded successfully.');
                }
                catch (error) {
                    vscode.window.showErrorMessage(`Failed to preload file: ${error}`);
                }
            }
        }),
        vscode.commands.registerCommand('supersplat.performance.batchOptimize', async () => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showWarningMessage('No workspace folder open.');
                return;
            }
            // Find all PLY files in workspace
            const plyFiles = await vscode.workspace.findFiles('**/*.ply', '**/node_modules/**');
            if (plyFiles.length === 0) {
                vscode.window.showInformationMessage('No PLY files found in workspace.');
                return;
            }
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Batch optimizing PLY files...',
                cancellable: true
            }, async (progress, token) => {
                for (let i = 0; i < plyFiles.length; i++) {
                    if (token.isCancellationRequested) {
                        break;
                    }
                    const file = plyFiles[i];
                    const filename = vscode.workspace.asRelativePath(file);
                    progress.report({
                        message: `Optimizing ${filename} (${i + 1}/${plyFiles.length})`,
                        increment: (100 / plyFiles.length)
                    });
                    try {
                        await plyOptimizer.optimizePLY(file.fsPath);
                    }
                    catch (error) {
                        console.warn(`Failed to optimize ${filename}:`, error);
                    }
                }
            });
            vscode.window.showInformationMessage(`Batch optimization completed for ${plyFiles.length} files.`);
        }),
        vscode.commands.registerCommand('supersplat.performance.resetConfig', async () => {
            const response = await vscode.window.showWarningMessage('Reset all performance settings to defaults?', 'Reset', 'Cancel');
            if (response === 'Reset') {
                const config = vscode.workspace.getConfiguration('supersplat.performance');
                await config.update('enableASCIIToBinaryConversion', undefined);
                await config.update('enablePLYCaching', undefined);
                await config.update('largeFileThreshold', undefined);
                await config.update('enableDirectUriTransfer', undefined);
                await config.update('enablePerformanceLogging', undefined);
                await config.update('enableBufferPooling', undefined);
                await config.update('enableVertexCompression', undefined);
                await config.update('enableLevelOfDetail', undefined);
                await config.update('maxCacheSize', undefined);
                vscode.window.showInformationMessage('Performance settings reset to defaults.');
            }
        })
    ];
    // Add all commands to subscriptions
    context.subscriptions.push(...commands);
    // Register file association context menu commands
    context.subscriptions.push(vscode.commands.registerCommand('supersplat.performance.contextOptimize', async (uri) => {
        await vscode.commands.executeCommand('supersplat.performance.preloadFile', uri);
    }));
    // Setup periodic cache cleanup
    const config = performanceConfig.getConfig();
    if (config.enableGarbageCollection) {
        const cleanupInterval = setInterval(() => {
            plyOptimizer.clearCache(); // This could be made more intelligent
        }, config.gcInterval);
        context.subscriptions.push(new vscode.Disposable(() => {
            clearInterval(cleanupInterval);
        }));
    }
    // Show activation message with performance info
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(zap) SuperSplat Optimized";
    statusBarItem.tooltip = "SuperSplat extension with performance optimizations active";
    statusBarItem.command = "supersplat.performance.showStats";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    // Welcome message for first-time users
    const hasShownWelcome = context.globalState.get('supersplat.performance.hasShownWelcome', false);
    if (!hasShownWelcome) {
        vscode.window.showInformationMessage('SuperSplat performance optimizations are now active! PLY files will be automatically optimized for faster loading.', 'Learn More', 'Settings').then(selection => {
            if (selection === 'Learn More') {
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/playcanvas/supersplat'));
            }
            else if (selection === 'Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'supersplat.performance');
            }
        });
        context.globalState.update('supersplat.performance.hasShownWelcome', true);
    }
    // Log activation success
    console.log('Optimized SuperSplat extension activated successfully');
    return {
        performanceConfig,
        plyOptimizer,
        // Expose API for other extensions
        optimizePLY: (filePath) => plyOptimizer.optimizePLY(filePath),
        getPerformanceStats: () => performanceConfig.showPerformanceStats()
    };
}
function deactivate() {
    console.log('Deactivating optimized SuperSplat extension...');
}
//# sourceMappingURL=optimizedExtension.js.map