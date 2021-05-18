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
    | 'amz-1.0'

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
        return Buffer.from(await compress(buffer));
    });

export const brotliDecompress = zlib.brotliDecompress
    ? promisify(zlib.brotliDecompress)
    : (async (buffer: Uint8Array): Promise<Uint8Array> => {
        const { decompress } = await importWasmBrotli();
        return Buffer.from(await decompress(buffer));
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

    return Buffer.from(await (await zstd).compress(buffer, level));
};

export const zstdDecompress = async (buffer: Uint8Array): Promise<Uint8Array> => {
    if (!zstd) {
        zstd = new Promise((resolve) => ZstdCodec.run((binding) => {
            resolve(new binding.Streaming());
        }));
    }

    return Buffer.from(await (await zstd).decompress(buffer));
};

/**
 * Decodes a buffer, using the encodings as specified in a content-encoding header. Returns
 * a Buffer instance in Node, or a Uint8Array in a browser.
 *
 * Throws if any unrecognized/unavailable content-encoding is found.
 */
export async function decodeBuffer(body: Uint8Array, encoding: string | string[] | undefined): Promise<Uint8Array> {
    if (Array.isArray(encoding) || (typeof encoding === 'string' && encoding.indexOf(', ') >= 0)) {
        const encodings = typeof encoding === 'string' ? encoding.split(', ').reverse() : encoding;
        return encodings.reduce<Promise<Uint8Array>>((contentPromise, nextEncoding) => {
            return contentPromise.then((content) =>
                decodeBuffer(content, nextEncoding)
            );
        }, Promise.resolve(body));
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
        return brotliDecompress(body);
    } else if (encoding === 'zstd' && ZstdCodec) {
        return zstdDecompress(body);
    } else if (encoding === 'amz-1.0') {
        // Weird encoding used by some AWS requests, actually just unencoded JSON:
        // https://docs.aws.amazon.com/en_us/AmazonCloudWatch/latest/APIReference/making-api-requests.html
        return body;
    } else if (!encoding || encoding === 'identity') {
        return body;
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
 } = {}): Promise<Uint8Array> {
    const level = options.level ?? 4;

    if (encoding === 'gzip' || encoding === 'x-gzip') {
        return gzip(body, { level });
    } else if (encoding === 'deflate' || encoding === 'x-deflate') {
        return deflate(body, { level });
    } else if (encoding === 'br') {
        return Buffer.from(await brotliCompress(body, zlib.constants ? {
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: level
            }
        } : {}));
    } else if (encoding === 'zstd' && ZstdCodec) {
        return zstdCompress(body, level);
    } else if (!encoding || encoding === 'identity' || encoding === 'amz-1.0') {
        return body;
    } else {
        throw new Error(`Unknown encoding: ${encoding}`);
    }
};