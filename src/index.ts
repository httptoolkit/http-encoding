import * as zlib from 'zlib';
import { promisify } from 'util';
import { importWasmBrotli } from './wasm-brotli';
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
    : (async (buffer: Uint8Array, _unusedOpts: zlib.BrotliOptions): Promise<Uint8Array> => {
        const { compress } = await importWasmBrotli();
        return compress(buffer);
    });

export const brotliDecompress = zlib.brotliDecompress
    ? promisify(zlib.brotliDecompress)
    : (async (buffer: Uint8Array): Promise<Uint8Array> => {
        const { decompress } = await importWasmBrotli();
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

const asBuffer = (input: Buffer | Uint8Array): Buffer => {
    if (Buffer.isBuffer(input)) {
        return input;
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
export async function decodeBuffer(body: Uint8Array, encoding: string | string[] | undefined): Promise<Buffer> {
    if (Array.isArray(encoding) || (typeof encoding === 'string' && encoding.indexOf(', ') >= 0)) {
        const encodings = typeof encoding === 'string' ? encoding.split(', ').reverse() : encoding;
        return encodings.reduce<Promise<Uint8Array>>((contentPromise, nextEncoding) => {
            return contentPromise.then((content) =>
                decodeBuffer(content, nextEncoding)
            );
        }, Promise.resolve(body)) as Promise<Buffer>;
    }

    if (encoding === 'gzip' || encoding === 'x-gzip') {
        return gunzip(body);
    } else if (encoding === 'deflate' || encoding === 'x-deflate') {
        // Deflate is ambiguous, and may or may not have a zlib wrapper.
        // This checks the buffer header directly, based on
        // https://stackoverflow.com/a/37528114/68051
        const lowNibble = body[0] & 0xF;
        if (lowNibble === 8) {
            return inflate(body);
        } else {
            return inflateRaw(body);
        }
    } else if (encoding === 'br') {
        return asBuffer(await brotliDecompress(body));
    } else if (encoding === 'zstd' && ZstdCodec) {
        return asBuffer(await zstdDecompress(body));
    } else if (encoding === 'amz-1.0') {
        // Weird encoding used by some AWS requests, actually just unencoded JSON:
        // https://docs.aws.amazon.com/en_us/AmazonCloudWatch/latest/APIReference/making-api-requests.html
        return asBuffer(body);
    } else if (!encoding || encoding === 'identity') {
        return asBuffer(body);
    } else {
        throw new Error(`Unknown encoding: ${encoding}`);
    }
};

/**
 * Encodes a buffer, given a single encoding name (as used in content-encoding headers), and an optional
 * level. Returns a Buffer instance in Node, or a Uint8Array in a browser.
 *
 * Throws if an unrecognized/unavailable encoding is specified
 */
 export async function encodeBuffer(body: Uint8Array, encoding: SUPPORTED_ENCODING, options: {
    level?: number
 } = {}): Promise<Buffer> {
    const level = options.level ?? 4;

    if (encoding === 'gzip' || encoding === 'x-gzip') {
        return gzip(body, { level });
    } else if (encoding === 'deflate' || encoding === 'x-deflate') {
        return deflate(body, { level });
    } else if (encoding === 'br') {
        return asBuffer(await brotliCompress(body, zlib.constants ? {
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: level
            }
        } : {}));
    } else if (encoding === 'zstd' && ZstdCodec) {
        return asBuffer(await zstdCompress(body, level));
    } else if (!encoding || encoding === 'identity' || encoding === 'amz-1.0') {
        return asBuffer(body);
    } else {
        throw new Error(`Unknown encoding: ${encoding}`);
    }
};