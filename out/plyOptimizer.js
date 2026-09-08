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
exports.PLYOptimizer = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const vscode = __importStar(require("vscode"));
class PLYOptimizer {
    constructor(context) {
        this.context = context;
        this.cacheIndex = new Map();
        this.cacheDir = path.join(context.extensionPath, 'cache', 'ply');
        this.ensureCacheDir();
        this.loadCacheIndex();
    }
    ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }
    loadCacheIndex() {
        const indexPath = path.join(this.cacheDir, 'index.json');
        try {
            if (fs.existsSync(indexPath)) {
                const data = fs.readFileSync(indexPath, 'utf8');
                const entries = JSON.parse(data);
                this.cacheIndex = new Map(Object.entries(entries));
            }
        }
        catch (error) {
            console.warn('Failed to load cache index:', error);
        }
    }
    saveCacheIndex() {
        const indexPath = path.join(this.cacheDir, 'index.json');
        try {
            const entries = Object.fromEntries(this.cacheIndex);
            fs.writeFileSync(indexPath, JSON.stringify(entries, null, 2));
        }
        catch (error) {
            console.error('Failed to save cache index:', error);
        }
    }
    getFileHash(filePath) {
        const stat = fs.statSync(filePath);
        const content = filePath + stat.size + stat.mtime.getTime();
        return crypto.createHash('md5').update(content).digest('hex');
    }
    async detectPLYFormat(filePath) {
        return new Promise((resolve, reject) => {
            const stream = fs.createReadStream(filePath, { encoding: 'ascii', highWaterMark: 4096 });
            let headerBuffer = '';
            let headerComplete = false;
            stream.on('data', (chunk) => {
                if (headerComplete) {
                    stream.destroy();
                    return;
                }
                headerBuffer += chunk;
                // Look for the complete end_header line to determine header end.
                const endHeaderMatch = headerBuffer.match(/end_header\r?\n/);
                const endHeaderIndex = endHeaderMatch ? endHeaderMatch.index : -1;
                if (endHeaderIndex !== -1) {
                    headerComplete = true;
                    stream.destroy();
                    const headerLines = headerBuffer.substring(0, endHeaderIndex).split('\n');
                    const header = this.parsePLYHeader(headerLines);
                    if (header) {
                        header.headerEndOffset = Buffer.byteLength(headerBuffer.substring(0, endHeaderIndex + endHeaderMatch[0].length), 'ascii');
                    }
                    resolve(header);
                }
                // Prevent reading too much if header is very long
                if (headerBuffer.length > 32768) {
                    stream.destroy();
                    resolve(null);
                }
            });
            stream.on('error', reject);
            stream.on('end', () => resolve(null));
        });
    }
    parsePLYHeader(lines) {
        if (lines[0]?.trim() !== 'ply') {
            return null;
        }
        let format = null;
        let vertexCount = 0;
        const properties = [];
        let currentElement = null;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('format ')) {
                const formatParts = trimmed.split(' ');
                if (formatParts[1] === 'ascii' || formatParts[1] === 'binary_little_endian' || formatParts[1] === 'binary_big_endian') {
                    format = formatParts[1];
                }
            }
            else if (trimmed.startsWith('element vertex ')) {
                vertexCount = parseInt(trimmed.split(' ')[2]);
                currentElement = 'vertex';
            }
            else if (trimmed.startsWith('element ')) {
                currentElement = trimmed.split(' ')[1] || null;
            }
            else if (currentElement === 'vertex' && trimmed.startsWith('property ')) {
                const parts = trimmed.split(' ');
                if (parts.length >= 3 && parts[1] !== 'list') {
                    const type = parts[1];
                    const name = parts[2];
                    const size = this.getTypeSize(type);
                    properties.push({ type, name, size });
                }
            }
        }
        if (!format) {
            return null;
        }
        return {
            format,
            vertexCount,
            properties,
            headerEndOffset: 0 // Will be set by caller
        };
    }
    getTypeSize(type) {
        switch (type.toLowerCase()) {
            case 'char':
            case 'int8':
            case 'uchar':
            case 'uint8':
                return 1;
            case 'short':
            case 'int16':
            case 'ushort':
            case 'uint16':
                return 2;
            case 'int':
            case 'int32':
            case 'uint':
            case 'uint32':
            case 'float':
            case 'float32':
                return 4;
            case 'double':
            case 'float64':
                return 8;
            default:
                return 4;
        }
    }
    async convertASCIIToBinary(filePath, header) {
        const outputPath = path.join(this.cacheDir, `${path.basename(filePath, '.ply')}_${Date.now()}.ply`);
        return new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(filePath, { encoding: 'ascii' });
            const writeStream = fs.createWriteStream(outputPath);
            let headerSkipped = false;
            let buffer = '';
            let verticesProcessed = 0;
            // Write binary header
            const binaryHeader = this.createBinaryHeader(header);
            writeStream.write(binaryHeader);
            readStream.on('data', (chunk) => {
                buffer += chunk;
                if (!headerSkipped) {
                    const endHeaderMatch = buffer.match(/end_header\r?\n/);
                    if (endHeaderMatch) {
                        buffer = buffer.substring(endHeaderMatch.index + endHeaderMatch[0].length);
                        headerSkipped = true;
                    }
                    else {
                        return; // Continue reading until we find end_header
                    }
                }
                // Process vertices
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer
                for (const line of lines) {
                    if (line.trim() && verticesProcessed < header.vertexCount) {
                        const binaryVertex = this.convertVertexToBinary(line.trim(), header.properties);
                        writeStream.write(binaryVertex);
                        verticesProcessed++;
                    }
                }
            });
            readStream.on('end', () => {
                if (buffer.trim() && verticesProcessed < header.vertexCount) {
                    const binaryVertex = this.convertVertexToBinary(buffer.trim(), header.properties);
                    writeStream.write(binaryVertex);
                }
                writeStream.end();
            });
            writeStream.on('finish', () => resolve(outputPath));
            writeStream.on('error', reject);
            readStream.on('error', reject);
        });
    }
    createBinaryHeader(header) {
        const lines = [
            'ply',
            'format binary_little_endian 1.0',
            `element vertex ${header.vertexCount}`
        ];
        for (const prop of header.properties) {
            lines.push(`property ${prop.type} ${prop.name}`);
        }
        lines.push('end_header');
        return Buffer.from(lines.join('\n') + '\n', 'ascii');
    }
    convertVertexToBinary(line, properties) {
        const values = line.split(/\s+/);
        const buffers = [];
        for (let i = 0; i < properties.length && i < values.length; i++) {
            const prop = properties[i];
            const value = parseFloat(values[i]);
            switch (prop.type.toLowerCase()) {
                case 'char':
                case 'int8':
                    const charBuffer = Buffer.allocUnsafe(1);
                    charBuffer.writeInt8(Math.round(value), 0);
                    buffers.push(charBuffer);
                    break;
                case 'float':
                case 'float32':
                    const floatBuffer = Buffer.allocUnsafe(4);
                    floatBuffer.writeFloatLE(value, 0);
                    buffers.push(floatBuffer);
                    break;
                case 'double':
                case 'float64':
                    const doubleBuffer = Buffer.allocUnsafe(8);
                    doubleBuffer.writeDoubleLE(value, 0);
                    buffers.push(doubleBuffer);
                    break;
                case 'uchar':
                case 'uint8':
                    const ucharBuffer = Buffer.allocUnsafe(1);
                    ucharBuffer.writeUInt8(Math.round(value), 0);
                    buffers.push(ucharBuffer);
                    break;
                case 'short':
                case 'int16':
                    const shortBuffer = Buffer.allocUnsafe(2);
                    shortBuffer.writeInt16LE(Math.round(value), 0);
                    buffers.push(shortBuffer);
                    break;
                case 'ushort':
                case 'uint16':
                    const ushortBuffer = Buffer.allocUnsafe(2);
                    ushortBuffer.writeUInt16LE(Math.round(value), 0);
                    buffers.push(ushortBuffer);
                    break;
                case 'int':
                case 'int32':
                    const intBuffer = Buffer.allocUnsafe(4);
                    intBuffer.writeInt32LE(Math.round(value), 0);
                    buffers.push(intBuffer);
                    break;
                case 'uint':
                case 'uint32':
                    const uintBuffer = Buffer.allocUnsafe(4);
                    uintBuffer.writeUInt32LE(Math.round(value), 0);
                    buffers.push(uintBuffer);
                    break;
            }
        }
        return Buffer.concat(buffers);
    }
    async optimizePLY(filePath) {
        const config = vscode.workspace.getConfiguration('supersplat.performance');
        const enableConversion = config.get('enableASCIIToBinaryConversion', true);
        const enableCaching = config.get('enablePLYCaching', true);
        const fileHash = this.getFileHash(filePath);
        const stat = fs.statSync(filePath);
        // Check cache first
        const cacheEntry = this.cacheIndex.get(filePath);
        if (enableCaching && cacheEntry && cacheEntry.hash === fileHash && cacheEntry.mtime === stat.mtime.getTime()) {
            if (fs.existsSync(cacheEntry.convertedPath)) {
                return cacheEntry.convertedPath;
            }
        }
        // Detect PLY format
        const header = await this.detectPLYFormat(filePath);
        if (!header) {
            throw new Error('Invalid PLY file format');
        }
        let optimizedPath = filePath;
        // Convert ASCII to binary if needed
        if (header.format === 'ascii' && enableConversion) {
            console.log(`Converting ASCII PLY to binary: ${filePath}`);
            optimizedPath = await this.convertASCIIToBinary(filePath, header);
            // Update cache
            if (enableCaching) {
                this.cacheIndex.set(filePath, {
                    hash: fileHash,
                    mtime: stat.mtime.getTime(),
                    convertedPath: optimizedPath,
                    sourceSize: stat.size,
                    cacheSize: fs.statSync(optimizedPath).size,
                    createdAt: Date.now(),
                    lastAccessed: Date.now()
                });
                this.saveCacheIndex();
            }
        }
        return optimizedPath;
    }
    getCacheFiles() {
        const files = [];
        if (!fs.existsSync(this.cacheDir)) {
            return files;
        }
        for (const name of fs.readdirSync(this.cacheDir)) {
            const filePath = path.join(this.cacheDir, name);
            if (filePath.endsWith('index.json') || !fs.existsSync(filePath)) {
                continue;
            }
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
                files.push({ filePath, size: stat.size, mtime: stat.mtime.getTime() });
            }
        }
        return files;
    }
    getCacheSize() {
        return this.getCacheFiles().reduce((total, file) => total + file.size, 0);
    }
    pruneCache(maxSizeMB = 500, maxAgeMs = 24 * 60 * 60 * 1000) {
        try {
            const now = Date.now();
            const maxSizeBytes = maxSizeMB * 1024 * 1024;
            const cacheFiles = this.getCacheFiles().sort((a, b) => a.mtime - b.mtime);
            const keepPaths = new Set();
            for (const file of cacheFiles) {
                if (now - file.mtime > maxAgeMs) {
                    fs.rmSync(file.filePath, { force: true });
                }
                else {
                    keepPaths.add(file.filePath);
                }
            }
            let totalSize = this.getCacheSize();
            for (const file of cacheFiles) {
                if (totalSize <= maxSizeBytes) {
                    break;
                }
                if (fs.existsSync(file.filePath)) {
                    fs.rmSync(file.filePath, { force: true });
                    totalSize -= file.size;
                    keepPaths.delete(file.filePath);
                }
            }
            for (const [sourcePath, entry] of this.cacheIndex) {
                if (!entry.convertedPath || !keepPaths.has(entry.convertedPath) || !fs.existsSync(entry.convertedPath)) {
                    this.cacheIndex.delete(sourcePath);
                }
            }
            this.saveCacheIndex();
        }
        catch (error) {
            console.error('Failed to prune PLY cache:', error);
        }
    }
    clearCache() {
        try {
            fs.rmSync(this.cacheDir, { recursive: true, force: true });
            this.cacheIndex.clear();
            this.ensureCacheDir();
        }
        catch (error) {
            console.error('Failed to clear PLY cache:', error);
        }
    }
}
exports.PLYOptimizer = PLYOptimizer;
//# sourceMappingURL=plyOptimizer.js.map
