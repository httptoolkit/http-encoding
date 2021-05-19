import * as zlib from 'zlib';
import { promisify } from 'util';
import { ZstdCodec, ZstdStreaming } from 'zstd-codec';

export type SUPPORTED_ENCODING =
    | 'identity'
    | 'gzip'
    | 'x-gzip'
    | 'deflate'
    | 'x-deflate'
    | 'br'
    | 'zstd'
    | 'amz-1.0';

export const gzip = promisify(zlib.gzip);
export const gunzip = promisify(zlib.gunzip);
export const deflate = promisify(zlib.deflate);
export const inflate = promisify(zlib.inflate);
export const inflateRaw = promisify(zlib.inflateRaw);

// Use Node's new built-in Brotli compression, if available, or
// use the wasm-brotli package if not.
export const brotliCompress = zlib.brotliCompress
    ? promisify(zlib.brotliCompress)
    : (async (buffer: Uint8Array, _unusedOpts?: zlib.BrotliOptions): Promise<Uint8Array> => {
        const { compress } = await import('wasm-brotli'); // Sync in node, async in browsers
        return compress(buffer);
    });

export const brotliDecompress = zlib.brotliDecompress
    ? promisify(zlib.brotliDecompress)
    : (async (buffer: Uint8Array): Promise<Uint8Array> => {
        const { decompress } = await import('wasm-brotli'); // Sync in node, async in browsers
        return decompress(buffer);
    });

// Zstd is a non-built-in wasm implementation that initializes async. We
// handle this by loading it when the first zstd buffer is decompressed.
let zstd: Promise<ZstdStreaming> | undefined;
export const zstdCompress = async (buffer: Uint8Array, level?: number): Promise<Uint8Array> => {
    if (!zstd) {
        zstd = new Promise((resolve) => ZstdCodec.run((binding) => {
            resolve(new binding.Streaming());
        }));
    }

    return (await zstd).compress(buffer, level);
};

export const zstdDecompress = async (buffer: Uint8Array): Promise<Uint8Array> => {
    if (!zstd) {
        zstd = new Promise((resolve) => ZstdCodec.run((binding) => {
            resolve(new binding.Streaming());
        }));
    }

    return (await zstd).decompress(buffer);
};

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
    } else if (encoding === 'zstd' && ZstdCodec) {
        return asBuffer(await zstdDecompress(bodyBuffer));
    } else if (encoding === 'amz-1.0') {
        // Weird encoding used by some AWS requests, actually just unencoded JSON:
        // https://docs.aws.amazon.com/en_us/AmazonCloudWatch/latest/APIReference/making-api-requests.html
        return asBuffer(bodyBuffer);
    } else if (!encoding || encoding === 'identity') {
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
    } else if (encoding === 'amz-1.0') {
        // Weird encoding used by some AWS requests, actually just unencoded JSON:
        // https://docs.aws.amazon.com/en_us/AmazonCloudWatch/latest/APIReference/making-api-requests.html
        return asBuffer(bodyBuffer);
    } else if (!encoding || encoding === 'identity') {
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

    if (encoding === 'gzip' || encoding === 'x-gzip') {
        return gzip(bodyBuffer, { level });
    } else if (encoding === 'deflate' || encoding === 'x-deflate') {
        return deflate(bodyBuffer, { level });
    } else if (encoding === 'br') {
        return asBuffer(await brotliCompress(bodyBuffer, zlib.constants ? {
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: level
            }
        } : {}));
    } else if (encoding === 'zstd' && ZstdCodec) {
        return asBuffer(await zstdCompress(bodyBuffer, level));
    } else if (!encoding || encoding === 'identity' || encoding === 'amz-1.0') {
        return asBuffer(bodyBuffer);
    } else {
        throw new Error(`Unsupported encoding: ${encoding}`);
    }
};