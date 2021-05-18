import * as zlib from 'zlib';
import { promisify } from 'util';
import { importWasmBrotli } from './wasm-brotli';
import { ZstdCodec, ZstdStreaming } from 'zstd-codec';

const gunzip = promisify(zlib.gunzip);
const inflate = promisify(zlib.inflate);
const inflateRaw = promisify(zlib.inflateRaw);

// Use Node's new built-in Brotli compression, if available, or
// use the wasm-brotli package if not.
const brotliDecompress = zlib.brotliDecompress
    ? promisify(zlib.brotliDecompress)
    : (async (buffer: Uint8Array): Promise<Uint8Array> => {
        const { decompress } = await importWasmBrotli();
        return Buffer.from(await decompress(buffer));
    });

// Zstd is a non-built-in wasm implementation that initializes async. We
// handle this by loading it when the first zstd buffer is decompressed.
let zstd: Promise<ZstdStreaming> | undefined;
const zstdDecompress = async (buffer: Uint8Array): Promise<Uint8Array> => {
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
 * Throws if any unrecognized content-encoding is found.
 */
export async function decodeBuffer(body: Uint8Array, encoding?: string | string[]): Promise<Uint8Array> {
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
    } else if (encoding === 'br' && brotliDecompress) {
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