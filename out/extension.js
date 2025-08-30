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
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const supersplatProvider_1 = require("./supersplatProvider");
function activate(context) {
    // Create logs directory and write activation log
    const logDir = path.join(context.extensionPath, 'logs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extensionLogPath = path.join(logDir, `extension-${timestamp}.log`);
    function writeExtensionLog(message) {
        try {
            const logMessage = `[${new Date().toISOString()}] ${message}\n`;
            fs.appendFileSync(extensionLogPath, logMessage);
        }
        catch (error) {
            console.error('Failed to write extension log:', error);
        }
    }
    // Initial log
    writeExtensionLog('[EXTENSION] SuperSplat extension activated');
    try {
        // Register supersplat provider
        const provider = supersplatProvider_1.SuperSplatProvider.register(context);
        context.subscriptions.push(provider);
        writeExtensionLog('[EXTENSION] SuperSplat provider registered successfully');
    }
    catch (error) {
        writeExtensionLog(`[EXTENSION] Failed to register SuperSplat provider: ${error}`);
        throw error;
    }
    writeExtensionLog('[EXTENSION] Extension activation completed');
}
function deactivate() {
    console.log('SuperSplat extension deactivated');
}
//# sourceMappingURL=extension.js.map