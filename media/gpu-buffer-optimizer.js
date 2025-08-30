// GPU Buffer Optimization Module for SuperSplat
// Minimizes GPU buffer uploads and memory usage for PLY files

(function() {
    'use strict';

    // Buffer pool for reusing GPU buffers
    class BufferPool {
        constructor(gl) {
            this.gl = gl;
            this.pools = new Map(); // size -> [buffer, buffer, ...]
            this.activeBuffers = new WeakSet();
        }

        getBuffer(size, usage = this.gl.STATIC_DRAW) {
            const key = `${size}-${usage}`;
            let pool = this.pools.get(key);
            
            if (!pool) {
                pool = [];
                this.pools.set(key, pool);
            }

            // Reuse existing buffer if available
            for (let i = 0; i < pool.length; i++) {
                const buffer = pool[i];
                if (!this.activeBuffers.has(buffer)) {
                    this.activeBuffers.add(buffer);
                    return buffer;
                }
            }

            // Create new buffer if none available
            const buffer = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, size, usage);
            
            pool.push(buffer);
            this.activeBuffers.add(buffer);
            return buffer;
        }

        releaseBuffer(buffer) {
            this.activeBuffers.delete(buffer);
        }

        cleanup() {
            for (const pool of this.pools.values()) {
                for (const buffer of pool) {
                    if (this.gl.isBuffer(buffer)) {
                        this.gl.deleteBuffer(buffer);
                    }
                }
            }
            this.pools.clear();
        }
    }

    // Optimized vertex buffer management
    class VertexBufferOptimizer {
        constructor(gl) {
            this.gl = gl;
            this.bufferPool = new BufferPool(gl);
            this.cachedBuffers = new Map(); // hash -> buffer info
            this.compressionWorker = null;
            this.initCompressionWorker();
        }

        initCompressionWorker() {
            // Create a worker for vertex data compression/decompression
            const workerCode = `
                self.onmessage = function(e) {
                    const { action, data, id } = e.data;
                    
                    if (action === 'compress') {
                        // Implement vertex data compression (quantization, delta encoding)
                        const compressed = compressVertexData(data);
                        self.postMessage({ action: 'compressed', data: compressed, id });
                    } else if (action === 'decompress') {
                        // Implement vertex data decompression
                        const decompressed = decompressVertexData(data);
                        self.postMessage({ action: 'decompressed', data: decompressed, id });
                    }
                };

                function compressVertexData(vertices) {
                    // Simple quantization compression for positions
                    const positions = new Float32Array(vertices.buffer, vertices.byteOffset, vertices.byteLength / 4);
                    const compressed = new Int16Array(positions.length);
                    
                    // Find bounds for quantization
                    let minX = Infinity, minY = Infinity, minZ = Infinity;
                    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
                    
                    for (let i = 0; i < positions.length; i += 3) {
                        minX = Math.min(minX, positions[i]);
                        maxX = Math.max(maxX, positions[i]);
                        minY = Math.min(minY, positions[i + 1]);
                        maxY = Math.max(maxY, positions[i + 1]);
                        minZ = Math.min(minZ, positions[i + 2]);
                        maxZ = Math.max(maxZ, positions[i + 2]);
                    }
                    
                    const scaleX = (maxX - minX) / 65535;
                    const scaleY = (maxY - minY) / 65535;
                    const scaleZ = (maxZ - minZ) / 65535;
                    
                    // Quantize to 16-bit integers
                    for (let i = 0; i < positions.length; i += 3) {
                        compressed[i] = ((positions[i] - minX) / scaleX) | 0;
                        compressed[i + 1] = ((positions[i + 1] - minY) / scaleY) | 0;
                        compressed[i + 2] = ((positions[i + 2] - minZ) / scaleZ) | 0;
                    }
                    
                    return {
                        data: compressed.buffer,
                        bounds: { minX, minY, minZ, maxX, maxY, maxZ },
                        scales: { scaleX, scaleY, scaleZ }
                    };
                }

                function decompressVertexData(compressed) {
                    const { data, bounds, scales } = compressed;
                    const quantized = new Int16Array(data);
                    const positions = new Float32Array(quantized.length);
                    
                    // Dequantize back to floats
                    for (let i = 0; i < quantized.length; i += 3) {
                        positions[i] = bounds.minX + quantized[i] * scales.scaleX;
                        positions[i + 1] = bounds.minY + quantized[i + 1] * scales.scaleY;
                        positions[i + 2] = bounds.minZ + quantized[i + 2] * scales.scaleZ;
                    }
                    
                    return positions.buffer;
                }
            `;
            
            try {
                this.compressionWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' })));
            } catch (error) {
                console.warn('Compression worker not available, using synchronous processing');
            }
        }

        // Generate hash for vertex data to enable caching
        hashVertexData(data) {
            let hash = 0;
            const view = new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4);
            for (let i = 0; i < view.length; i++) {
                hash = ((hash << 5) - hash + view[i]) | 0;
            }
            return hash.toString(36);
        }

        // Optimize vertex buffer upload with caching
        async uploadVertexBuffer(data, attributes) {
            const hash = this.hashVertexData(data);
            
            // Check if buffer already exists in cache
            if (this.cachedBuffers.has(hash)) {
                const cached = this.cachedBuffers.get(hash);
                return cached.buffer;
            }

            // Create and upload new buffer
            const buffer = this.bufferPool.getBuffer(data.byteLength);
            
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
            this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, data);
            
            // Cache buffer info
            this.cachedBuffers.set(hash, {
                buffer,
                size: data.byteLength,
                attributes,
                timestamp: Date.now()
            });

            return buffer;
        }

        // Batch multiple vertex attributes into a single buffer (interleaved)
        createInterleavedBuffer(attributes) {
            const totalStride = attributes.reduce((sum, attr) => sum + attr.size * attr.componentSize, 0);
            const vertexCount = attributes[0].data.length / attributes[0].size;
            
            const interleavedData = new ArrayBuffer(vertexCount * totalStride);
            const interleavedView = new DataView(interleavedData);
            
            let offset = 0;
            for (let vertex = 0; vertex < vertexCount; vertex++) {
                let currentOffset = offset;
                
                for (const attr of attributes) {
                    const sourceData = attr.data;
                    const sourceOffset = vertex * attr.size;
                    
                    for (let component = 0; component < attr.size; component++) {
                        if (attr.type === 'float') {
                            interleavedView.setFloat32(currentOffset, sourceData[sourceOffset + component], true);
                            currentOffset += 4;
                        } else if (attr.type === 'uint8') {
                            interleavedView.setUint8(currentOffset, sourceData[sourceOffset + component]);
                            currentOffset += 1;
                        }
                    }
                }
                
                offset += totalStride;
            }
            
            return new Uint8Array(interleavedData);
        }

        // Level-of-detail vertex decimation for distant objects
        decimateVertices(vertices, positions, targetReduction = 0.5) {
            const vertexCount = positions.length / 3;
            const targetCount = Math.floor(vertexCount * (1 - targetReduction));
            
            if (targetCount >= vertexCount) {
                return vertices; // No decimation needed
            }

            // Simple spatial decimation - remove vertices based on spatial distribution
            const decimated = [];
            const grid = new Map();
            const cellSize = 0.1; // Adjust based on model scale
            
            for (let i = 0; i < vertexCount; i++) {
                const x = positions[i * 3];
                const y = positions[i * 3 + 1];
                const z = positions[i * 3 + 2];
                
                const cellX = Math.floor(x / cellSize);
                const cellY = Math.floor(y / cellSize);
                const cellZ = Math.floor(z / cellSize);
                const cellKey = `${cellX},${cellY},${cellZ}`;
                
                if (!grid.has(cellKey) || decimated.length < targetCount) {
                    grid.set(cellKey, true);
                    decimated.push(i);
                }
                
                if (decimated.length >= targetCount) {
                    break;
                }
            }
            
            // Extract decimated vertex data
            const vertexSize = vertices.length / vertexCount;
            const decimatedVertices = new Float32Array(decimated.length * vertexSize);
            
            for (let i = 0; i < decimated.length; i++) {
                const sourceIndex = decimated[i];
                const sourceOffset = sourceIndex * vertexSize;
                const targetOffset = i * vertexSize;
                
                for (let j = 0; j < vertexSize; j++) {
                    decimatedVertices[targetOffset + j] = vertices[sourceOffset + j];
                }
            }
            
            return decimatedVertices;
        }

        // Clean up cached buffers periodically
        cleanupCache(maxAge = 5 * 60 * 1000) { // 5 minutes
            const now = Date.now();
            const toDelete = [];
            
            for (const [hash, cached] of this.cachedBuffers) {
                if (now - cached.timestamp > maxAge) {
                    this.bufferPool.releaseBuffer(cached.buffer);
                    toDelete.push(hash);
                }
            }
            
            for (const hash of toDelete) {
                this.cachedBuffers.delete(hash);
            }
        }

        destroy() {
            this.bufferPool.cleanup();
            this.cachedBuffers.clear();
            if (this.compressionWorker) {
                this.compressionWorker.terminate();
            }
        }
    }

    // Export to global scope for SuperSplat integration
    window.GPUBufferOptimizer = {
        VertexBufferOptimizer,
        BufferPool,
        
        // Initialize optimizer when WebGL context is available
        initialize(gl) {
            if (!gl) {
                console.warn('WebGL context not available for buffer optimization');
                return null;
            }
            
            return new VertexBufferOptimizer(gl);
        }
    };

    // Auto-initialize when SuperSplat is ready
    const checkForSuperSplat = () => {
        if (window.scene && window.scene.graphicsDevice) {
            const optimizer = window.GPUBufferOptimizer.initialize(window.scene.graphicsDevice.gl);
            if (optimizer && window.vsCodeIntegration) {
                window.vsCodeIntegration.vscode?.postMessage({
                    type: 'perfLog',
                    message: 'GPU buffer optimizer initialized'
                });
            }
        } else {
            setTimeout(checkForSuperSplat, 1000);
        }
    };

    // Start checking for SuperSplat availability
    setTimeout(checkForSuperSplat, 2000);

})();