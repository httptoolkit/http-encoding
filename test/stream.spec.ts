import * as zlib from 'zlib';

import chai = require("chai");
const expect = chai.expect;

import {
    createGzipStream,
    createGunzipStream,
    createDeflateStream,
    createInflateStream,
    createDeflateRawStream,
    createInflateRawStream,
    createBrotliCompressStream,
    createBrotliDecompressStream,
    brotliCompress,
    brotliDecompress
} from '../src/index';

// Helper to collect all chunks from a ReadableStream into a single Uint8Array
async function collectStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}

// Helper to create a ReadableStream from a Uint8Array
function createReadableStream(data: Uint8Array): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(data);
            controller.close();
        }
    });
}

describe("Streaming", () => {
    describe("Gzip", () => {
        it('should compress data with gzip stream', async () => {
            const input = Buffer.from('Hello streaming gzip world!');
            const inputStream = createReadableStream(input);

            const compressedStream = inputStream.pipeThrough(createGzipStream());
            const compressed = await collectStream(compressedStream);

            // Verify the compressed data can be decompressed with zlib
            const decompressed = zlib.gunzipSync(Buffer.from(compressed));
            expect(decompressed.toString()).to.equal('Hello streaming gzip world!');
        });

        it('should decompress gzip data with stream', async () => {
            const original = 'Hello streaming gunzip world!';
            const compressed = zlib.gzipSync(original);
            const inputStream = createReadableStream(compressed);

            const decompressedStream = inputStream.pipeThrough(createGunzipStream());
            const decompressed = await collectStream(decompressedStream);

            expect(Buffer.from(decompressed).toString()).to.equal(original);
        });

        it('should handle round-trip compression and decompression', async () => {
            const original = 'Round-trip streaming test with some repeated data data data data';
            const inputStream = createReadableStream(Buffer.from(original));

            const compressedStream = inputStream.pipeThrough(createGzipStream());
            const decompressedStream = compressedStream.pipeThrough(createGunzipStream());
            const result = await collectStream(decompressedStream);

            expect(Buffer.from(result).toString()).to.equal(original);
        });

        it('should handle multiple chunks', async () => {
            const chunks = ['chunk1', 'chunk2', 'chunk3', 'chunk4'];
            const inputStream = new ReadableStream<Uint8Array>({
                start(controller) {
                    for (const chunk of chunks) {
                        controller.enqueue(Buffer.from(chunk));
                    }
                    controller.close();
                }
            });

            const compressedStream = inputStream.pipeThrough(createGzipStream());
            const decompressedStream = compressedStream.pipeThrough(createGunzipStream());
            const result = await collectStream(decompressedStream);

            expect(Buffer.from(result).toString()).to.equal(chunks.join(''));
        });

        it('should handle empty input', async () => {
            const inputStream = createReadableStream(new Uint8Array(0));

            const compressedStream = inputStream.pipeThrough(createGzipStream());
            const decompressedStream = compressedStream.pipeThrough(createGunzipStream());
            const result = await collectStream(decompressedStream);

            expect(result.length).to.equal(0);
        });

        it('should handle large data', async () => {
            // Create a 1MB buffer of repeated data
            const pattern = 'This is a test pattern that will be repeated many times. ';
            const repeated = pattern.repeat(20000);
            const inputStream = createReadableStream(Buffer.from(repeated));

            const compressedStream = inputStream.pipeThrough(createGzipStream());
            const compressed = await collectStream(compressedStream);

            // Compressed should be smaller than original due to repetition
            expect(compressed.length).to.be.lessThan(repeated.length);

            // Verify decompression
            const decompressed = zlib.gunzipSync(Buffer.from(compressed));
            expect(decompressed.toString()).to.equal(repeated);
        });
    });

    describe("Deflate", () => {
        it('should compress data with deflate stream', async () => {
            const input = Buffer.from('Hello streaming deflate world!');
            const inputStream = createReadableStream(input);

            const compressedStream = inputStream.pipeThrough(createDeflateStream());
            const compressed = await collectStream(compressedStream);

            // Verify the compressed data can be decompressed with zlib
            const decompressed = zlib.inflateSync(Buffer.from(compressed));
            expect(decompressed.toString()).to.equal('Hello streaming deflate world!');
        });

        it('should decompress deflate data with stream', async () => {
            const original = 'Hello streaming inflate world!';
            const compressed = zlib.deflateSync(original);
            const inputStream = createReadableStream(compressed);

            const decompressedStream = inputStream.pipeThrough(createInflateStream());
            const decompressed = await collectStream(decompressedStream);

            expect(Buffer.from(decompressed).toString()).to.equal(original);
        });

        it('should handle round-trip compression and decompression', async () => {
            const original = 'Round-trip deflate streaming test with some repeated data data data data';
            const inputStream = createReadableStream(Buffer.from(original));

            const compressedStream = inputStream.pipeThrough(createDeflateStream());
            const decompressedStream = compressedStream.pipeThrough(createInflateStream());
            const result = await collectStream(decompressedStream);

            expect(Buffer.from(result).toString()).to.equal(original);
        });
    });

    describe("Deflate-Raw", () => {
        it('should compress data with deflate-raw stream', async () => {
            const input = Buffer.from('Hello streaming deflate-raw world!');
            const inputStream = createReadableStream(input);

            const compressedStream = inputStream.pipeThrough(createDeflateRawStream());
            const compressed = await collectStream(compressedStream);

            // Verify the compressed data can be decompressed with zlib
            const decompressed = zlib.inflateRawSync(Buffer.from(compressed));
            expect(decompressed.toString()).to.equal('Hello streaming deflate-raw world!');
        });

        it('should decompress deflate-raw data with stream', async () => {
            const original = 'Hello streaming inflate-raw world!';
            const compressed = zlib.deflateRawSync(original);
            const inputStream = createReadableStream(compressed);

            const decompressedStream = inputStream.pipeThrough(createInflateRawStream());
            const decompressed = await collectStream(decompressedStream);

            expect(Buffer.from(decompressed).toString()).to.equal(original);
        });

        it('should handle round-trip compression and decompression', async () => {
            const original = 'Round-trip deflate-raw streaming test with some repeated data data data data';
            const inputStream = createReadableStream(Buffer.from(original));

            const compressedStream = inputStream.pipeThrough(createDeflateRawStream());
            const decompressedStream = compressedStream.pipeThrough(createInflateRawStream());
            const result = await collectStream(decompressedStream);

            expect(Buffer.from(result).toString()).to.equal(original);
        });
    });

    describe("Brotli", () => {
        it('should compress data with brotli stream', async () => {
            const input = Buffer.from('Hello streaming brotli world!');
            const inputStream = createReadableStream(input);

            const compressedStream = inputStream.pipeThrough(createBrotliCompressStream());
            const compressed = await collectStream(compressedStream);

            // Verify the compressed data can be decompressed
            const decompressed = await brotliDecompress(compressed);
            expect(Buffer.from(decompressed).toString()).to.equal('Hello streaming brotli world!');
        });

        it('should decompress brotli data with stream', async () => {
            const original = 'Hello streaming brotli decompress world!';
            const compressed = await brotliCompress(Buffer.from(original));
            const inputStream = createReadableStream(new Uint8Array(compressed));

            const decompressedStream = inputStream.pipeThrough(createBrotliDecompressStream());
            const decompressed = await collectStream(decompressedStream);

            expect(Buffer.from(decompressed).toString()).to.equal(original);
        });

        it('should handle round-trip compression and decompression', async () => {
            const original = 'Round-trip brotli streaming test with some repeated data data data data';
            const inputStream = createReadableStream(Buffer.from(original));

            const compressedStream = inputStream.pipeThrough(createBrotliCompressStream());
            const decompressedStream = compressedStream.pipeThrough(createBrotliDecompressStream());
            const result = await collectStream(decompressedStream);

            expect(Buffer.from(result).toString()).to.equal(original);
        });

        it('should handle large data', async () => {
            const pattern = 'Brotli test pattern that will be repeated many times for compression. ';
            const repeated = pattern.repeat(10000);
            const inputStream = createReadableStream(Buffer.from(repeated));

            const compressedStream = inputStream.pipeThrough(createBrotliCompressStream());
            const compressed = await collectStream(compressedStream);

            // Compressed should be smaller than original due to repetition
            expect(compressed.length).to.be.lessThan(repeated.length);

            // Verify decompression
            const decompressed = await brotliDecompress(compressed);
            expect(Buffer.from(decompressed).toString()).to.equal(repeated);
        });
    });
});
