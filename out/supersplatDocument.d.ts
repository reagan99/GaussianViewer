export const __esModule: boolean;
/**
 * Document for SuperSplat files.
 */
export class SuperSplatDocument {
    static create(uri: any, backupId: any, delegate: any): Promise<SuperSplatDocument>;
    static readFile(uri: any): Promise<Uint8Array<any>>;
    constructor(uri: any, initialContent: any);
    _uri: any;
    _documentData: any;
    _emitter: any;
    get uri(): any;
    get documentData(): any;
    _onDidDispose: any;
    onDidDispose: any;
    _onDidChangeDocument: any;
    onDidChangeDocument: any;
    dispose(): void;
    /**
     * Called when the document is changed.
     */
    makeEdit(edit: any): void;
    /**
     * Called when the document is saved.
     */
    save(cancellation: any): Promise<void>;
    /**
     * Called when the document is saved to a new location.
     */
    saveAs(targetResource: any, cancellation: any): Promise<void>;
    /**
     * Called when the document is reverted.
     */
    revert(cancellation: any): Promise<void>;
    /**
     * Called when the document is backed up.
     */
    backup(destination: any, cancellation: any): Promise<{
        id: any;
        delete: () => Promise<void>;
    }>;
}
