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

const encodeBase64 = (buffer: Uint8Array): Uint8Array => {
    return Buffer.from(asBuffer(buffer).toString('base64'), 'utf8');
};

const decodeBase64 = (buffer: Uint8Array): Uint8Array => {
    return Buffer.from(asBuffer(buffer).toString('utf8'), 'base64');
};

// We export promisified versions for consistency
const encodeBase64Promisified = promisify<Uint8Array, Uint8Array>(encodeBase64);
export { encodeBase64Promisified as encodeBase64 };
const decodeBase64Promisified = promisify<Uint8Array, Uint8Array>(decodeBase64);
export { decodeBase64Promisified as decodeBase64 };

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
        return asBuffer(await decodeBase64(bodyBuffer));
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
        return asBuffer(decodeBase64(bodyBuffer));
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
        return asBuffer(encodeBase64(bodyBuffer));
    } else if (IDENTITY_ENCODINGS.includes(encoding)) {
        return asBuffer(bodyBuffer);
    } else {
        throw new Error(`Unsupported encoding: ${encoding}`);
    }
};