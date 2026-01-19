import * as zlib from 'zlib';
import type { ZstdStreaming } from 'zstd-codec';

// We want promisify, but for easy browser usage downstream we want to avoid using Node's util
// version. We replace it with pify, but we import util here purely to get the more accurate types.
import { promisify as utilPromisify } from 'util';
const promisify: typeof utilPromisify = require('pify');

export type SUPPORTED_ENCODING =
    | 'identity'
    | 'gzip'
    | 'x-gzip'
    | 'deflate'
    | 'x-deflate'
    | 'br'
    | 'zstd'
    | 'base64';

export const gzip = promisify(zlib.gzip);
export const gunzip = promisify(zlib.gunzip);
export const deflate = promisify(zlib.deflate);
export const deflateRaw = promisify(zlib.deflateRaw);
export const inflate = promisify(zlib.inflate);
export const inflateRaw = promisify(zlib.inflateRaw);

// Use Node's new built-in Brotli compression, if available, or
// use the brotli-wasm package if not.
export const brotliCompress = zlib.brotliCompress
    ? (async (buffer: Uint8Array, level?: number): Promise<Uint8Array> => {
        // In node, we just have to convert between the options formats and promisify:
        return new Promise((resolve, reject) => {
            zlib.brotliCompress(buffer, level !== undefined
                ? { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: level } }
                : {}
            , (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
    })
    : (async (buffer: Uint8Array, level?: number): Promise<Uint8Array> => {
        const { compress } = await import('brotli-wasm'); // Sync in node, async in browsers
        return compress(buffer, { quality: level });
    });

export const brotliDecompress = zlib.brotliDecompress
    ? promisify(zlib.brotliDecompress)
    : (async (buffer: Uint8Array): Promise<Uint8Array> => {
        const { decompress } = await import('brotli-wasm'); // Sync in node, async in browsers
        return decompress(buffer);
    });

// Browser Zstd is a non-built-in wasm implementation that initializes async. We handle this
// by loading it when the first zstd buffer is decompressed. That lets us defer loading
// until that point too, which is good since it's large-ish & rarely used.
let zstd: Promise<ZstdStreaming> | undefined;
const getZstd = async () => {
    // In Node 22.15 / 23.8+, we can use zstd built-in:
    if (zlib.zstdCompress && zlib.zstdDecompress) {
        return {
            compress: (buffer: Uint8Array, level?: number) => {
                return new Promise<Uint8Array>((resolve, reject) => {
                    const options = level !== undefined
                        ? { [zlib.constants.ZSTD_c_compressionLevel]: level }
                        : {};

                    zlib.zstdCompress(buffer, options, (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    });
                });
            },
            decompress: (buffer: Uint8Array) => {
                return new Promise<Uint8Array>((resolve, reject) => {
                    zlib.zstdDecompress(buffer, (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    });
                });
            }
        };
    }

    // In older Node and browsers, we fall back to zstd-codec:
    else if (!zstd) {
        zstd = new Promise(async (resolve) => {
            const { ZstdCodec } = await import('zstd-codec');
            ZstdCodec.run((binding) => {
                resolve(new binding.Streaming());
            })
        });
    }
    return await zstd;
};

export const zstdCompress = async (buffer: Uint8Array, level?: number): Promise<Uint8Array> => {
    return (await getZstd()).compress(buffer, level);
};

export const zstdDecompress = async (buffer: Uint8Array): Promise<Uint8Array> => {
    return (await getZstd()).decompress(buffer);
};

// --- Base64 Implementation ---

// Check if Buffer is available (Node.js environment)
const hasBuffer = typeof Buffer !== 'undefined' && typeof Buffer.from === 'function';

// Lookup tables for browser fallback (no Buffer available)
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_CHAR_CODES = new Uint8Array(64);
for (let i = 0; i < 64; i++) {
    BASE64_CHAR_CODES[i] = BASE64_CHARS.charCodeAt(i);
}

// Decode lookup: maps ASCII code to 6-bit value, 255 = invalid, 254 = whitespace (skip)
const BASE64_DECODE_LOOKUP = new Uint8Array(256).fill(255);
for (let i = 0; i < 64; i++) {
    BASE64_DECODE_LOOKUP[BASE64_CHARS.charCodeAt(i)] = i;
}
// URL-safe variants: - for +, _ for /
BASE64_DECODE_LOOKUP['-'.charCodeAt(0)] = 62;
BASE64_DECODE_LOOKUP['_'.charCodeAt(0)] = 63;
// Whitespace: skip
BASE64_DECODE_LOOKUP[' '.charCodeAt(0)] = 254;
BASE64_DECODE_LOOKUP['\t'.charCodeAt(0)] = 254;
BASE64_DECODE_LOOKUP['\n'.charCodeAt(0)] = 254;
BASE64_DECODE_LOOKUP['\r'.charCodeAt(0)] = 254;
// Padding: treat as 0 for decoding purposes
BASE64_DECODE_LOOKUP['='.charCodeAt(0)] = 0;

function encodeBase64Lookup(bytes: Uint8Array): Uint8Array {
    const len = bytes.length;
    const resultLen = Math.ceil(len / 3) * 4;
    const result = new Uint8Array(resultLen);

    let j = 0;
    let i = 0;
    for (; i + 2 < len; i += 3) {
        const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
        result[j++] = BASE64_CHAR_CODES[a >> 2];
        result[j++] = BASE64_CHAR_CODES[((a & 3) << 4) | (b >> 4)];
        result[j++] = BASE64_CHAR_CODES[((b & 15) << 2) | (c >> 6)];
        result[j++] = BASE64_CHAR_CODES[c & 63];
    }

    // Handle remaining 1 or 2 bytes
    if (i < len) {
        const a = bytes[i];
        result[j++] = BASE64_CHAR_CODES[a >> 2];
        if (i + 1 < len) {
            const b = bytes[i + 1];
            result[j++] = BASE64_CHAR_CODES[((a & 3) << 4) | (b >> 4)];
            result[j++] = BASE64_CHAR_CODES[(b & 15) << 2];
        } else {
            result[j++] = BASE64_CHAR_CODES[(a & 3) << 4];
            result[j++] = 61; // '='
        }
        result[j++] = 61; // '='
    }

    return result;
}

function decodeBase64Lookup(base64Bytes: Uint8Array): Uint8Array {
    // First pass: count valid chars
    let validCount = 0;
    for (let i = 0; i < base64Bytes.length; i++) {
        const v = BASE64_DECODE_LOOKUP[base64Bytes[i]];
        if (v < 64) {
            validCount++;
        } else if (v === 255) {
            throw new Error(`Invalid base64 character at position ${i}: ${base64Bytes[i]}`);
        }
        // v === 254 is whitespace, skip
    }

    // Calculate output size (each 4 chars = 3 bytes, minus padding)
    const resultLen = Math.floor(validCount / 4) * 3 +
        (validCount % 4 === 3 ? 2 : validCount % 4 === 2 ? 1 : 0);
    const result = new Uint8Array(resultLen);

    let j = 0;
    let buffer = 0;
    let bufferLen = 0;

    for (let i = 0; i < base64Bytes.length && j < resultLen; i++) {
        const v = BASE64_DECODE_LOOKUP[base64Bytes[i]];
        if (v >= 64) continue; // skip whitespace and padding

        buffer = (buffer << 6) | v;
        bufferLen += 6;

        if (bufferLen >= 8) {
            bufferLen -= 8;
            result[j++] = (buffer >> bufferLen) & 0xff;
        }
    }

    return result;
}

// Core sync implementation - uses Buffer when available, lookup table otherwise
// Used by both sync exports and streaming internals
function encodeBase64Sync(bytes: Uint8Array): Uint8Array {
    if (hasBuffer) {
        const b64String = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
        return Buffer.from(b64String, 'utf8');
    }
    return encodeBase64Lookup(bytes);
}

function decodeBase64Sync(base64Bytes: Uint8Array): Uint8Array {
    if (hasBuffer) {
        const b64String = Buffer.from(base64Bytes.buffer, base64Bytes.byteOffset, base64Bytes.byteLength).toString('utf8');
        return Buffer.from(b64String, 'base64');
    }
    return decodeBase64Lookup(base64Bytes);
}

// Exported async versions for consistency with other codecs
export const encodeBase64 = (buffer: Uint8Array): Promise<Uint8Array> => {
    return Promise.resolve(encodeBase64Sync(buffer));
};

export const decodeBase64 = (buffer: Uint8Array): Promise<Uint8Array> => {
    return Promise.resolve(decodeBase64Sync(buffer));
};

// --- Streaming APIs ---

// Lazily loaded to avoid bundling Node's stream polyfill for browsers
let Duplex: typeof import('stream').Duplex | undefined;
const getDuplex = () => {
    if (!Duplex) {
        Duplex = require('stream').Duplex;
    }
    return Duplex!;
};

type BufferSource = ArrayBufferView | ArrayBuffer;

export function createGzipStream(): TransformStream<BufferSource, Uint8Array> {
    // Use native CompressionStream where available:
    if (typeof CompressionStream !== 'undefined') {
        return new CompressionStream('gzip');
    }
    // Turn zlib node built-in into a web stream if not:
    return getDuplex().toWeb(zlib.createGzip()) as TransformStream<BufferSource, Uint8Array>;
}

export function createGunzipStream(): TransformStream<BufferSource, Uint8Array> {
    // Use native DecompressionStream where available:
    if (typeof DecompressionStream !== 'undefined') {
        return new DecompressionStream('gzip');
    }
    // Turn zlib node built-in into a web stream if not:
    return getDuplex().toWeb(zlib.createGunzip()) as TransformStream<BufferSource, Uint8Array>;
}

export function createDeflateStream(): TransformStream<BufferSource, Uint8Array> {
    // Use native CompressionStream where available:
    if (typeof CompressionStream !== 'undefined') {
        return new CompressionStream('deflate');
    }
    // Turn zlib node built-in into a web stream if not:
    return getDuplex().toWeb(zlib.createDeflate()) as TransformStream<BufferSource, Uint8Array>;
}

export function createInflateStream(): TransformStream<BufferSource, Uint8Array> {
    // Use native DecompressionStream where available:
    if (typeof DecompressionStream !== 'undefined') {
        return new DecompressionStream('deflate');
    }
    // Turn zlib node built-in into a web stream if not:
    return getDuplex().toWeb(zlib.createInflate()) as TransformStream<BufferSource, Uint8Array>;
}

export function createDeflateRawStream(): TransformStream<BufferSource, Uint8Array> {
    // Use native CompressionStream where available:
    if (typeof CompressionStream !== 'undefined') {
        try {
            return new CompressionStream('deflate-raw');
        } catch {
            // deflate-raw not supported (e.g. Node 18)
        }
    }
    // Turn zlib node built-in into a web stream if not:
    return getDuplex().toWeb(zlib.createDeflateRaw()) as TransformStream<BufferSource, Uint8Array>;
}

export function createInflateRawStream(): TransformStream<BufferSource, Uint8Array> {
    // Use native DecompressionStream where available:
    if (typeof DecompressionStream !== 'undefined') {
        try {
            return new DecompressionStream('deflate-raw');
        } catch {
            // deflate-raw not supported (e.g. Node 18)
        }
    }
    // Turn zlib node built-in into a web stream if not:
    return getDuplex().toWeb(zlib.createInflateRaw()) as TransformStream<BufferSource, Uint8Array>;
}

export function createBrotliCompressStream(): TransformStream<BufferSource, Uint8Array> {
    // Try native CompressionStream with brotli if available
    if (typeof CompressionStream !== 'undefined') {
        try {
            // 'br' may not be in TS types yet, but is supported in some browsers
            return new CompressionStream('br' as CompressionFormat);
        } catch {
            // Brotli not supported in this browser's CompressionStream
        }
    }

    // Node: use zlib brotli if available
    if (zlib.createBrotliCompress) {
        return getDuplex().toWeb(zlib.createBrotliCompress()) as TransformStream<BufferSource, Uint8Array>;
    }

    // Fallback: wrap brotli-wasm
    return createBrotliWasmCompressStream();
}

export function createBrotliDecompressStream(): TransformStream<BufferSource, Uint8Array> {
    // Try native DecompressionStream with brotli if available
    if (typeof DecompressionStream !== 'undefined') {
        try {
            // 'br' may not be in TS types yet, but is supported in some browsers
            return new DecompressionStream('br' as CompressionFormat);
        } catch {
            // Brotli not supported in this browser's DecompressionStream
        }
    }

    // Node: use zlib brotli if available
    if (zlib.createBrotliDecompress) {
        return getDuplex().toWeb(zlib.createBrotliDecompress()) as TransformStream<BufferSource, Uint8Array>;
    }

    // Fallback: wrap brotli-wasm
    return createBrotliWasmDecompressStream();
}

const BROTLI_WASM_OUTPUT_SIZE = 1024 * 1024; // 1MB output buffer for streaming

function createBrotliWasmCompressStream(): TransformStream<BufferSource, Uint8Array> {
    type BrotliWasm = typeof import('brotli-wasm');
    let brotliWasm: BrotliWasm;
    let compressStream: InstanceType<BrotliWasm['CompressStream']>;
    const brotliWasmPromise = import('brotli-wasm') as Promise<BrotliWasm>;

    return new TransformStream<BufferSource, Uint8Array>({
        async start() {
            brotliWasm = await brotliWasmPromise;
            compressStream = new brotliWasm.CompressStream();
        },
        transform(chunk, controller) {
            const input = new Uint8Array(
                ArrayBuffer.isView(chunk) ? chunk.buffer : chunk,
                ArrayBuffer.isView(chunk) ? chunk.byteOffset : 0,
                ArrayBuffer.isView(chunk) ? chunk.byteLength : chunk.byteLength
            );

            let offset = 0;
            while (offset < input.length) {
                const result = compressStream.compress(
                    input.subarray(offset),
                    BROTLI_WASM_OUTPUT_SIZE
                );
                if (result.buf.length > 0) {
                    controller.enqueue(result.buf);
                }
                offset += result.input_offset;
                if (result.code === brotliWasm.BrotliStreamResultCode.NeedsMoreInput) {
                    break;
                }
            }
        },
        flush(controller) {
            // Signal end of input and collect remaining output
            while (true) {
                const result = compressStream.compress(undefined, BROTLI_WASM_OUTPUT_SIZE);
                if (result.buf.length > 0) {
                    controller.enqueue(result.buf);
                }
                if (result.code !== brotliWasm.BrotliStreamResultCode.NeedsMoreOutput) {
                    break;
                }
            }
            compressStream.free();
        }
    });
}

function createBrotliWasmDecompressStream(): TransformStream<BufferSource, Uint8Array> {
    type BrotliWasm = typeof import('brotli-wasm');
    let brotliWasm: BrotliWasm;
    let decompressStream: InstanceType<BrotliWasm['DecompressStream']>;
    const brotliWasmPromise = import('brotli-wasm') as Promise<BrotliWasm>;

    return new TransformStream<BufferSource, Uint8Array>({
        async start() {
            brotliWasm = await brotliWasmPromise;
            decompressStream = new brotliWasm.DecompressStream();
        },
        transform(chunk, controller) {
            const input = new Uint8Array(
                ArrayBuffer.isView(chunk) ? chunk.buffer : chunk,
                ArrayBuffer.isView(chunk) ? chunk.byteOffset : 0,
                ArrayBuffer.isView(chunk) ? chunk.byteLength : chunk.byteLength
            );

            let offset = 0;
            while (offset < input.length) {
                const result = decompressStream.decompress(
                    input.subarray(offset),
                    BROTLI_WASM_OUTPUT_SIZE
                );
                if (result.buf.length > 0) {
                    controller.enqueue(result.buf);
                }
                offset += result.input_offset;
                if (result.code === brotliWasm.BrotliStreamResultCode.NeedsMoreInput) {
                    break;
                }
            }
        },
        flush() {
            decompressStream.free();
        }
    });
}

export function createZstdCompressStream(): TransformStream<BufferSource, Uint8Array> {
    // Try native CompressionStream with zstd if available
    if (typeof CompressionStream !== 'undefined') {
        try {
            // 'zstd' may not be in TS types yet, but is supported in some browsers
            return new CompressionStream('zstd' as CompressionFormat);
        } catch {
            // Zstd not supported in this browser's CompressionStream
        }
    }

    // Node 22.15+: use zlib zstd streaming if available
    if (zlib.createZstdCompress) {
        return getDuplex().toWeb(zlib.createZstdCompress()) as TransformStream<BufferSource, Uint8Array>;
    }

    // Fallback: use zstd-codec's Transform stream (requires 'stream' module/polyfill)
    return createZstdCodecTransformCompressStream();
}

export function createZstdDecompressStream(): TransformStream<BufferSource, Uint8Array> {
    // Try native DecompressionStream with zstd if available
    if (typeof DecompressionStream !== 'undefined') {
        try {
            // 'zstd' may not be in TS types yet, but is supported in some browsers
            return new DecompressionStream('zstd' as CompressionFormat);
        } catch {
            // Zstd not supported in this browser's DecompressionStream
        }
    }

    // Node 22.15+: use zlib zstd streaming if available
    if (zlib.createZstdDecompress) {
        return getDuplex().toWeb(zlib.createZstdDecompress()) as TransformStream<BufferSource, Uint8Array>;
    }

    // Fallback: use zstd-codec's Transform stream (requires 'stream' module/polyfill)
    return createZstdCodecTransformDecompressStream();
}

// Cache for zstd-codec/lib/zstd-stream classes (lazily loaded)
type ZstdStreamClasses = {
    ZstdCompressTransform: new (level?: number) => import('stream').Transform;
    ZstdDecompressTransform: new () => import('stream').Transform;
};
let zstdStreamClasses: Promise<ZstdStreamClasses> | undefined;
const getZstdStreamClasses = () => {
    if (!zstdStreamClasses) {
        zstdStreamClasses = new Promise((resolve) => {
            const zstdStream = require('zstd-codec/lib/zstd-stream');
            zstdStream.run((classes: ZstdStreamClasses) => {
                resolve(classes);
            });
        });
    }
    return zstdStreamClasses;
};

function createZstdCodecTransformCompressStream(): TransformStream<BufferSource, Uint8Array> {
    let compressTransform: import('stream').Transform;
    const initPromise = getZstdStreamClasses().then((classes) => {
        compressTransform = new classes.ZstdCompressTransform();
    });

    return new TransformStream<BufferSource, Uint8Array>({
        async start() {
            await initPromise;
        },
        transform(chunk, controller) {
            const input = new Uint8Array(
                ArrayBuffer.isView(chunk) ? chunk.buffer : chunk,
                ArrayBuffer.isView(chunk) ? chunk.byteOffset : 0,
                ArrayBuffer.isView(chunk) ? chunk.byteLength : chunk.byteLength
            );

            return new Promise<void>((resolve, reject) => {
                const onData = (data: Buffer) => {
                    controller.enqueue(new Uint8Array(data));
                };
                compressTransform.once('error', reject);
                compressTransform.on('data', onData);

                compressTransform.write(input, (err) => {
                    compressTransform.off('data', onData);
                    compressTransform.off('error', reject);
                    if (err) reject(err);
                    else resolve();
                });
            });
        },
        flush(controller) {
            return new Promise<void>((resolve, reject) => {
                compressTransform.once('error', reject);
                compressTransform.on('data', (data: Buffer) => {
                    controller.enqueue(new Uint8Array(data));
                });
                compressTransform.once('end', resolve);
                compressTransform.end();
            });
        }
    });
}

function createZstdCodecTransformDecompressStream(): TransformStream<BufferSource, Uint8Array> {
    let decompressTransform: import('stream').Transform;
    const initPromise = getZstdStreamClasses().then((classes) => {
        decompressTransform = new classes.ZstdDecompressTransform();
    });

    return new TransformStream<BufferSource, Uint8Array>({
        async start() {
            await initPromise;
        },
        transform(chunk, controller) {
            const input = new Uint8Array(
                ArrayBuffer.isView(chunk) ? chunk.buffer : chunk,
                ArrayBuffer.isView(chunk) ? chunk.byteOffset : 0,
                ArrayBuffer.isView(chunk) ? chunk.byteLength : chunk.byteLength
            );

            return new Promise<void>((resolve, reject) => {
                const onData = (data: Buffer) => {
                    controller.enqueue(new Uint8Array(data));
                };
                decompressTransform.once('error', reject);
                decompressTransform.on('data', onData);

                decompressTransform.write(input, (err) => {
                    decompressTransform.off('data', onData);
                    decompressTransform.off('error', reject);
                    if (err) reject(err);
                    else resolve();
                });
            });
        },
        flush(controller) {
            return new Promise<void>((resolve, reject) => {
                decompressTransform.once('error', reject);
                decompressTransform.on('data', (data: Buffer) => {
                    controller.enqueue(new Uint8Array(data));
                });
                decompressTransform.once('end', resolve);
                decompressTransform.end();
            });
        }
    });
}

// --- Base64 Streaming Functions ---

// Batch size for base64 streaming (must be divisible by 3 for encoding)
// 1.5MB gives ~5-15ms processing time per batch
const BASE64_BATCH_SIZE = 1536 * 1024;

export function createBase64EncodeStream(): TransformStream<BufferSource, Uint8Array> {
    let leftover = new Uint8Array(0); // 0-2 bytes from previous chunk
    let isFirstBatch = true;

    return new TransformStream<BufferSource, Uint8Array>({
        async transform(chunk, controller) {
            const input = new Uint8Array(
                ArrayBuffer.isView(chunk) ? chunk.buffer : chunk,
                ArrayBuffer.isView(chunk) ? chunk.byteOffset : 0,
                ArrayBuffer.isView(chunk) ? chunk.byteLength : chunk.byteLength
            );

            // Combine leftover with new input
            const combined = new Uint8Array(leftover.length + input.length);
            combined.set(leftover, 0);
            combined.set(input, leftover.length);

            // Process in batches, keeping bytes that don't align to 3
            let offset = 0;
            while (offset + 3 <= combined.length) {
                const batchEnd = Math.min(offset + BASE64_BATCH_SIZE, combined.length);
                // Round down to multiple of 3
                const alignedEnd = offset + Math.floor((batchEnd - offset) / 3) * 3;

                if (alignedEnd > offset) {
                    const batch = combined.subarray(offset, alignedEnd);
                    const encoded = encodeBase64Sync(batch);
                    controller.enqueue(encoded);
                    offset = alignedEnd;

                    // Yield to event loop between batches (skip first to reduce latency for small data)
                    if (!isFirstBatch) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                    isFirstBatch = false;
                } else {
                    break;
                }
            }

            // Keep remaining 0-2 bytes for next chunk
            leftover = combined.subarray(offset);
        },
        flush(controller) {
            // Encode any remaining bytes with padding
            if (leftover.length > 0) {
                const encoded = encodeBase64Sync(leftover);
                controller.enqueue(encoded);
            }
        }
    });
}

export function createBase64DecodeStream(): TransformStream<BufferSource, Uint8Array> {
    let leftover = new Uint8Array(0); // 0-3 chars from previous chunk
    let isFirstBatch = true;

    return new TransformStream<BufferSource, Uint8Array>({
        async transform(chunk, controller) {
            const input = new Uint8Array(
                ArrayBuffer.isView(chunk) ? chunk.buffer : chunk,
                ArrayBuffer.isView(chunk) ? chunk.byteOffset : 0,
                ArrayBuffer.isView(chunk) ? chunk.byteLength : chunk.byteLength
            );

            // Combine leftover with new input
            const combined = new Uint8Array(leftover.length + input.length);
            combined.set(leftover, 0);
            combined.set(input, leftover.length);

            // Find how many valid base64 chars we have (skip whitespace)
            // We need to process in groups of 4 chars
            let validCount = 0;
            let lastValidIndex = -1;
            for (let i = 0; i < combined.length; i++) {
                const v = BASE64_DECODE_LOOKUP[combined[i]];
                if (v < 64 || combined[i] === 61) { // valid char or padding
                    validCount++;
                    lastValidIndex = i;
                } else if (v === 255) {
                    throw new Error(`Invalid base64 character at position ${i}: ${combined[i]}`);
                }
                // v === 254 is whitespace, skip
            }

            // Process complete groups of 4
            const completeGroups = Math.floor(validCount / 4);
            if (completeGroups > 0) {
                // Find the byte position after the last complete group
                let groupsFound = 0;
                let processEnd = 0;
                for (let i = 0; i < combined.length && groupsFound < completeGroups * 4; i++) {
                    const v = BASE64_DECODE_LOOKUP[combined[i]];
                    if (v < 64 || combined[i] === 61) {
                        groupsFound++;
                        processEnd = i + 1;
                    }
                }

                // Process in batches
                let offset = 0;
                while (offset < processEnd) {
                    const batchEnd = Math.min(offset + BASE64_BATCH_SIZE, processEnd);
                    const batch = combined.subarray(offset, batchEnd);
                    const decoded = decodeBase64Sync(batch);
                    if (decoded.length > 0) {
                        controller.enqueue(decoded);
                    }
                    offset = batchEnd;

                    // Yield to event loop between batches
                    if (!isFirstBatch && offset < processEnd) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                    isFirstBatch = false;
                }

                // Keep remaining bytes for next chunk
                leftover = combined.subarray(processEnd);
            } else {
                // Not enough for a complete group, keep everything
                leftover = combined;
            }
        },
        flush(controller) {
            // Decode any remaining chars (handles missing padding)
            if (leftover.length > 0) {
                // Count valid chars
                let validCount = 0;
                for (let i = 0; i < leftover.length; i++) {
                    const v = BASE64_DECODE_LOOKUP[leftover[i]];
                    if (v < 64) validCount++;
                }
                if (validCount > 0) {
                    const decoded = decodeBase64Sync(leftover);
                    if (decoded.length > 0) {
                        controller.enqueue(decoded);
                    }
                }
            }
        }
    });
}

// --- Generic Streaming API ---

// Chain multiple TransformStreams into one composite stream
function chainStreams(streams: TransformStream<BufferSource, Uint8Array>[]): TransformStream<BufferSource, Uint8Array> {
    if (streams.length === 1) {
        return streams[0];
    }

    // Connect streams: readable of each flows into writable of next
    const first = streams[0];
    const last = streams[streams.length - 1];

    for (let i = 0; i < streams.length - 1; i++) {
        streams[i].readable.pipeTo(streams[i + 1].writable);
    }

    return { writable: first.writable, readable: last.readable } as TransformStream<BufferSource, Uint8Array>;
}

// Get decoder stream for a single encoding (identity already filtered out)
function getDecoderStream(encoding: string): TransformStream<BufferSource, Uint8Array> {
    switch (encoding.toLowerCase()) {
        case 'gzip':
        case 'x-gzip':
            return createGunzipStream();
        case 'deflate':
        case 'x-deflate':
            return createInflateStream();
        case 'br':
            return createBrotliDecompressStream();
        case 'zstd':
            return createZstdDecompressStream();
        case 'base64':
            return createBase64DecodeStream();
        default:
            throw new Error(`Unsupported encoding: ${encoding}`);
    }
}

// Get encoder stream for a single encoding (identity already filtered out)
function getEncoderStream(encoding: string): TransformStream<BufferSource, Uint8Array> {
    switch (encoding.toLowerCase()) {
        case 'gzip':
        case 'x-gzip':
            return createGzipStream();
        case 'deflate':
        case 'x-deflate':
            return createDeflateStream();
        case 'br':
            return createBrotliCompressStream();
        case 'zstd':
            return createZstdCompressStream();
        case 'base64':
            return createBase64EncodeStream();
        default:
            throw new Error(`Unsupported encoding: ${encoding}`);
    }
}

// Parse encoding header into array of non-identity encodings
function parseEncodings(encoding: string | string[] | undefined): string[] {
    if (!encoding) return [];

    const encodings = Array.isArray(encoding)
        ? encoding
        : encoding.includes(', ')
            ? encoding.split(', ')
            : [encoding];

    return encodings.filter(e => !IDENTITY_ENCODINGS.includes(e.toLowerCase()));
}

/**
 * Creates a decode stream for the given content-encoding header value.
 * Supports multiple encodings (comma-separated or array), applied in reverse order.
 * Returns null if no decoding is needed (identity or no encoding).
 *
 * @example
 * const decoder = createDecodeStream('gzip');
 * const output = decoder ? stream.pipeThrough(decoder) : stream;
 *
 * @example
 * // Multiple encodings (decodes in reverse order)
 * const decoder = createDecodeStream('gzip, br');
 */
export function createDecodeStream(encoding: string | string[] | undefined): TransformStream<BufferSource, Uint8Array> | null {
    const encodings = parseEncodings(encoding);
    if (encodings.length === 0) return null;

    // Reverse order for decoding (last applied encoding = first to decode)
    encodings.reverse();

    if (encodings.length === 1) {
        return getDecoderStream(encodings[0]);
    }
    return chainStreams(encodings.map(e => getDecoderStream(e)));
}

/**
 * Creates an encode stream for the given content-encoding header value.
 * Supports multiple encodings (comma-separated or array), applied in order.
 * Returns null if no encoding is needed (identity or no encoding).
 *
 * @example
 * const encoder = createEncodeStream('gzip');
 * const output = encoder ? stream.pipeThrough(encoder) : stream;
 *
 * @example
 * // Multiple encodings (applies gzip first, then base64)
 * const encoder = createEncodeStream('gzip, base64');
 */
export function createEncodeStream(encoding: string | string[] | undefined): TransformStream<BufferSource, Uint8Array> | null {
    const encodings = parseEncodings(encoding);
    if (encodings.length === 0) return null;

    if (encodings.length === 1) {
        return getEncoderStream(encodings[0]);
    }
    return chainStreams(encodings.map(e => getEncoderStream(e)));
}

// --- Buffer helpers ---

const asBuffer = (input: Buffer | Uint8Array | ArrayBuffer): Buffer => {
    if (Buffer.isBuffer(input)) {
        return input;
    } else if (input instanceof ArrayBuffer) {
        return Buffer.from(input);
    } else {
        // Offset & length allow us to support all sorts of buffer views:
        return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
    }
};

const IDENTITY_ENCODINGS = [
    // Explicitly unencoded in the standard way:
    'identity',
    // Weird encoding used by some AWS requests, actually just unencoded JSON:
    // https://docs.aws.amazon.com/en_us/AmazonCloudWatch/latest/APIReference/making-api-requests.html
    'amz-1.0',
    // Workaround for Apache's mod_deflate handling of 'identity', used in the wild mostly with PHP.
    // https://github.com/curl/curl/pull/2298
    'none',
    // No idea where these come from, but they definitely exist in real traffic and seem to come
    // from common confusion between content encodings and content types:
    'text',
    'binary',
    'utf8',
    'utf-8'
]

/**
 * Decodes a buffer, using the encodings as specified in a content-encoding header. Returns
 * a Buffer instance in Node, or a Uint8Array in a browser.
 *
 * Throws if any unrecognized/unavailable content-encoding is found.
 */
export async function decodeBuffer(body: Uint8Array | ArrayBuffer, encoding: string | string[] | undefined): Promise<Buffer> {
    const bodyBuffer = asBuffer(body);

    if (Array.isArray(encoding) || (typeof encoding === 'string' && encoding.indexOf(', ') >= 0)) {
        const encodings = typeof encoding === 'string' ? encoding.split(', ').reverse() : encoding;
        return encodings.reduce<Promise<Uint8Array>>((contentPromise, nextEncoding) => {
            return contentPromise.then((content) =>
                decodeBuffer(content, nextEncoding)
            );
        }, Promise.resolve(bodyBuffer as Uint8Array)) as Promise<Buffer>;
    }

    if (!encoding) encoding = 'identity';
    else encoding = encoding.toLowerCase();

    if (encoding === 'gzip' || encoding === 'x-gzip') {
        return gunzip(bodyBuffer);
    } else if (encoding === 'deflate' || encoding === 'x-deflate') {
        // Deflate is ambiguous, and may or may not have a zlib wrapper.
        // This checks the buffer header directly, based on
        // https://stackoverflow.com/a/37528114/68051
        const lowNibble = bodyBuffer[0] & 0xF;
        if (lowNibble === 8) {
            return inflate(bodyBuffer);
        } else {
            return inflateRaw(bodyBuffer);
        }
    } else if (encoding === 'br') {
        return asBuffer(await brotliDecompress(bodyBuffer));
    } else if (encoding === 'zstd') {
        return asBuffer(await zstdDecompress(bodyBuffer));
    } else if (encoding === 'base64') {
        return asBuffer(decodeBase64Sync(bodyBuffer));
    } else if (IDENTITY_ENCODINGS.includes(encoding)) {
        return asBuffer(bodyBuffer);
    }

    throw new Error(`Unsupported encoding: ${encoding}`);
};

/**
 * Decodes a buffer, using the encodings as specified in a content-encoding header, synchronously.
 * Returns a Buffer instance in Node, or a Uint8Array in a browser.
 *
 * Zstandard and Brotli decoding are not be supported in synchronous usage.
 *
 * Throws if any unrecognized/unavailable content-encoding is found.
 *
 * @deprecated This is here for convenience with some existing APIs, but for performance & consistency
 * async usage with decodeBuffer is preferable.
 */
 export function decodeBufferSync(body: Uint8Array | ArrayBuffer, encoding: string | string[] | undefined): Buffer {
    const bodyBuffer = asBuffer(body);

    if (Array.isArray(encoding) || (typeof encoding === 'string' && encoding.indexOf(', ') >= 0)) {
        const encodings = typeof encoding === 'string' ? encoding.split(', ').reverse() : encoding;
        return encodings.reduce((content, nextEncoding) => {
            return decodeBufferSync(content, nextEncoding);
        }, bodyBuffer) as Buffer;
    }

    if (!encoding) encoding = 'identity';
    else encoding = encoding.toLowerCase();

    if (encoding === 'gzip' || encoding === 'x-gzip') {
        return zlib.gunzipSync(bodyBuffer);
    } else if (encoding === 'deflate' || encoding === 'x-deflate') {
        // Deflate is ambiguous, and may or may not have a zlib wrapper.
        // This checks the buffer header directly, based on
        // https://stackoverflow.com/a/37528114/68051
        const lowNibble = bodyBuffer[0] & 0xF;
        if (lowNibble === 8) {
            return zlib.inflateSync(bodyBuffer);
        } else {
            return zlib.inflateRawSync(bodyBuffer);
        }
    } else if (encoding === 'base64') {
        return asBuffer(decodeBase64Sync(bodyBuffer));
    } else if (IDENTITY_ENCODINGS.includes(encoding)) {
        return asBuffer(bodyBuffer);
    }

    throw new Error(`Unsupported encoding: ${encoding}`);
};

/**
 * Encodes a buffer, given a single encoding name (as used in content-encoding headers), and an optional
 * level. Returns a Buffer instance in Node, or a Uint8Array in a browser.
 *
 * Throws if an unrecognized/unavailable encoding is specified
 */
 export async function encodeBuffer(body: Uint8Array | ArrayBuffer, encoding: SUPPORTED_ENCODING, options: {
    level?: number
 } = {}): Promise<Buffer> {
    const bodyBuffer = asBuffer(body);
    const level = options.level ?? 4;

    if (!encoding) encoding = 'identity';
    else encoding = encoding.toLowerCase() as SUPPORTED_ENCODING;

    if (encoding === 'gzip' || encoding === 'x-gzip') {
        return gzip(bodyBuffer, { level });
    } else if (encoding === 'deflate' || encoding === 'x-deflate') {
        return deflate(bodyBuffer, { level });
    } else if (encoding === 'br') {
        return asBuffer(await brotliCompress(bodyBuffer, level));
    } else if (encoding === 'zstd') {
        return asBuffer(await zstdCompress(bodyBuffer, level));
    } else if (encoding === 'base64') {
        return asBuffer(encodeBase64Sync(bodyBuffer));
    } else if (IDENTITY_ENCODINGS.includes(encoding)) {
        return asBuffer(bodyBuffer);
    } else {
        throw new Error(`Unsupported encoding: ${encoding}`);
    }
};