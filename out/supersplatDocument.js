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
exports.SuperSplatDocument = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Document for SuperSplat files.
 */
class SuperSplatDocument {
    _uri;
    _documentData;
    _emitter = new vscode.EventEmitter();
    static async create(uri, backupId, delegate) {
        const dataFile = typeof backupId === "string" ? vscode.Uri.parse(backupId) : uri;
        const fileData = await SuperSplatDocument.readFile(dataFile);
        return new SuperSplatDocument(uri, fileData);
    }
    static async readFile(uri) {
        if (uri.scheme === "untitled") {
            return new Uint8Array();
        }
        return new Uint8Array(await vscode.workspace.fs.readFile(uri));
    }
    constructor(uri, initialContent) {
        this._uri = uri;
        this._documentData = initialContent;
    }
    get uri() {
        return this._uri;
    }
    get documentData() {
        return this._documentData;
    }
    _onDidDispose = new vscode.EventEmitter();
    onDidDispose = this._onDidDispose.event;
    _onDidChangeDocument = new vscode.EventEmitter();
    onDidChangeDocument = this._onDidChangeDocument.event;
    dispose() {
        this._onDidDispose.fire();
        this._onDidDispose.dispose();
        this._onDidChangeDocument.dispose();
    }
    /**
     * Called when the document is changed.
     */
    makeEdit(edit) {
        this._documentData = edit.content;
        this._onDidChangeDocument.fire({ content: edit.content });
    }
    /**
     * Called when the document is saved.
     */
    async save(cancellation) {
        if (this._documentData) {
            await vscode.workspace.fs.writeFile(this.uri, this._documentData);
        }
    }
    /**
     * Called when the document is saved to a new location.
     */
    async saveAs(targetResource, cancellation) {
        if (this._documentData) {
            await vscode.workspace.fs.writeFile(targetResource, this._documentData);
        }
    }
    /**
     * Called when the document is reverted.
     */
    async revert(cancellation) {
        const diskContent = await SuperSplatDocument.readFile(this.uri);
        this._documentData = diskContent;
        this._onDidChangeDocument.fire({ content: diskContent });
    }
    /**
     * Called when the document is backed up.
     */
    async backup(destination, cancellation) {
        if (this._documentData) {
            await vscode.workspace.fs.writeFile(destination, this._documentData);
        }
        return {
            id: destination.toString(),
            delete: async () => {
                try {
                    await vscode.workspace.fs.delete(destination);
                }
                catch {
                    // Ignore
                }
            }
        };
    }
}
exports.SuperSplatDocument = SuperSplatDocument;
//# sourceMappingURL=supersplatDocument.js.map