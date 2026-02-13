import chai = require("chai");
const expect = chai.expect;

import {
    gzip,
    gunzip,
    deflate,
    inflate,
    createGzipStream,
    createGunzipStream,
    createDeflateStream,
    createInflateStream,
    createDeflateRawStream,
    createInflateRawStream,
    createBrotliCompressStream,
    createBrotliDecompressStream,
    brotliCompress,
    brotliDecompress,
    createZstdCompressStream,
    createZstdDecompressStream,
    zstdCompress,
    zstdDecompress,
    createBase64EncodeStream,
    createBase64DecodeStream,
    encodeBase64,
    decodeBase64,
    createDecodeStream,
    createEncodeStream
} from '../src/index';

describe("Streaming", () => {
    describe("Gzip", () => {
        it('should compress data with gzip stream', async () => {
            const input = Buffer.from('Hello streaming gzip world!');
            const inputStream = createReadableStream(input);

            const compressedStream = inputStream.pipeThrough(createGzipStream());
            const compressed = await collectStream(compressedStream);

            // Verify the compressed data can be decompressed
            const decompressed = await gunzip(compressed);
            expect(Buffer.from(decompressed).toString()).to.equal('Hello streaming gzip world!');
        });

        it('should decompress gzip data with stream', async () => {
            const original = 'Hello streaming gunzip world!';
            const compressed = await gzip(Buffer.from(original));
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
            const decompressed = await gunzip(compressed);
            expect(Buffer.from(decompressed).toString()).to.equal(repeated);
        });

        it('should produce incremental output during compression', async () => {
            const inputChunks = generateLargeData(STREAMING_TEST_SIZE_KB);
            const { outputBeforeEnd, totalOutput } = await testTrueStreaming(
                createGzipStream(),
                inputChunks
            );

            expect(outputBeforeEnd).to.equal(true, 'Expected output before input completed');

            const decompressed = await gunzip(totalOutput);
            const expectedSize = inputChunks.reduce((sum, c) => sum + c.length, 0);
            expect(decompressed.length).to.equal(expectedSize);
        });

        it('should produce incremental output during decompression', async () => {
            const originalData = concatUint8Arrays(generateLargeData(STREAMING_TEST_SIZE_KB));
            const compressed = await gzip(originalData);

            const chunkSize = 16 * 1024;
            const inputChunks: Uint8Array[] = [];
            for (let i = 0; i < compressed.length; i += chunkSize) {
                inputChunks.push(compressed.subarray(i, Math.min(i + chunkSize, compressed.length)));
            }

            const { outputBeforeEnd, totalOutput } = await testTrueStreaming(
                createGunzipStream(),
                inputChunks
            );

            expect(outputBeforeEnd).to.equal(true, 'Expected output before input completed');
            expect(totalOutput.length).to.equal(originalData.length);
        });
    });

    describe("Deflate", () => {
        it('should compress data with deflate stream', async () => {
            const input = Buffer.from('Hello streaming deflate world!');
            const inputStream = createReadableStream(input);

            const compressedStream = inputStream.pipeThrough(createDeflateStream());
            const compressed = await collectStream(compressedStream);

            // Verify the compressed data can be decompressed
            const decompressed = await inflate(compressed);
            expect(Buffer.from(decompressed).toString()).to.equal('Hello streaming deflate world!');
        });

        it('should decompress deflate data with stream', async () => {
            const original = 'Hello streaming inflate world!';
            const compressed = await deflate(Buffer.from(original));
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

        it('should produce incremental output during compression', async () => {
            const inputChunks = generateLargeData(STREAMING_TEST_SIZE_KB);
            const { outputBeforeEnd, totalOutput } = await testTrueStreaming(
                createDeflateStream(),
                inputChunks
            );

            expect(outputBeforeEnd).to.equal(true, 'Expected output before input completed');

            const decompressed = await inflate(totalOutput);
            const expectedSize = inputChunks.reduce((sum, c) => sum + c.length, 0);
            expect(decompressed.length).to.equal(expectedSize);
        });

        it('should produce incremental output during decompression', async () => {
            const originalData = concatUint8Arrays(generateLargeData(STREAMING_TEST_SIZE_KB));
            const compressed = await deflate(originalData);

            const chunkSize = 16 * 1024;
            const inputChunks: Uint8Array[] = [];
            for (let i = 0; i < compressed.length; i += chunkSize) {
                inputChunks.push(compressed.subarray(i, Math.min(i + chunkSize, compressed.length)));
            }

            const { outputBeforeEnd, totalOutput } = await testTrueStreaming(
                createInflateStream(),
                inputChunks
            );

            expect(outputBeforeEnd).to.equal(true, 'Expected output before input completed');
            expect(totalOutput.length).to.equal(originalData.length);
        });
    });

    describe("Deflate-Raw", () => {
        it('should compress data with deflate-raw stream', async () => {
            const input = Buffer.from('Hello streaming deflate-raw world!');
            const inputStream = createReadableStream(input);

            const compressedStream = inputStream.pipeThrough(createDeflateRawStream());
            const compressed = await collectStream(compressedStream);

            // Verify round-trip via stream
            const decompressedStream = createReadableStream(compressed).pipeThrough(createInflateRawStream());
            const decompressed = await collectStream(decompressedStream);
            expect(Buffer.from(decompressed).toString()).to.equal('Hello streaming deflate-raw world!');
        });

        it('should decompress deflate-raw data with stream', async () => {
            const original = 'Hello streaming inflate-raw world!';
            // Compress via stream to create fixture
            const compressedStream = createReadableStream(Buffer.from(original)).pipeThrough(createDeflateRawStream());
            const compressed = await collectStream(compressedStream);
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

        // Brotli has a larger internal buffer than gzip/deflate, requiring ~1.3MB of
        // incompressible data before it produces streaming output. With compressible data
        // the output is too small to trigger streaming. We use 2MB of random data here.
        it('should produce incremental output during compression', async function () {
            this.timeout(10000); // Can be slow

            const BROTLI_DATA_SIZE_KB = 2048;
            const inputChunks = generateLargeData(BROTLI_DATA_SIZE_KB);
            const { outputBeforeEnd, totalOutput } = await testTrueStreaming(
                createBrotliCompressStream(),
                inputChunks
            );

            expect(outputBeforeEnd).to.equal(true, 'Expected output before input completed');

            const decompressed = await brotliDecompress(totalOutput);
            const expectedSize = inputChunks.reduce((sum, c) => sum + c.length, 0);
            expect(decompressed.length).to.equal(expectedSize);
        });

        it('should produce incremental output during decompression', async function () {
            this.timeout(10000); // Can be slow

            const BROTLI_DECOMPRESS_SIZE_KB = 1024; // 1MB
            const originalData = concatUint8Arrays(generateLargeData(BROTLI_DECOMPRESS_SIZE_KB));
            const compressed = await brotliCompress(originalData);

            const chunkSize = 16 * 1024;
            const inputChunks: Uint8Array[] = [];
            for (let i = 0; i < compressed.length; i += chunkSize) {
                inputChunks.push(new Uint8Array(compressed.buffer, compressed.byteOffset + i,
                    Math.min(chunkSize, compressed.length - i)));
            }

            const { outputBeforeEnd, totalOutput } = await testTrueStreaming(
                createBrotliDecompressStream(),
                inputChunks
            );

            expect(outputBeforeEnd).to.equal(true, 'Expected output before input completed');
            expect(totalOutput.length).to.equal(originalData.length);
        });
    });

    describe("Zstd", () => {
        it('should compress data with zstd stream', async () => {
            const input = Buffer.from('Hello streaming zstd world!');
            const inputStream = createReadableStream(input);

            const compressedStream = inputStream.pipeThrough(createZstdCompressStream());
            const compressed = await collectStream(compressedStream);

            // Verify the compressed data can be decompressed
            const decompressed = await zstdDecompress(compressed);
            expect(Buffer.from(decompressed).toString()).to.equal('Hello streaming zstd world!');
        });

        it('should decompress zstd data with stream', async () => {
            const original = 'Hello streaming zstd decompress world!';
            const compressed = await zstdCompress(Buffer.from(original));
            const inputStream = createReadableStream(new Uint8Array(compressed));

            const decompressedStream = inputStream.pipeThrough(createZstdDecompressStream());
            const decompressed = await collectStream(decompressedStream);

            expect(Buffer.from(decompressed).toString()).to.equal(original);
        });

        it('should handle round-trip compression and decompression', async () => {
            const original = 'Round-trip zstd streaming test with some repeated data data data data';
            const inputStream = createReadableStream(Buffer.from(original));

            const compressedStream = inputStream.pipeThrough(createZstdCompressStream());
            const decompressedStream = compressedStream.pipeThrough(createZstdDecompressStream());
            const result = await collectStream(decompressedStream);

            expect(Buffer.from(result).toString()).to.equal(original);
        });

        it('should handle large data', async () => {
            const pattern = 'Zstd test pattern that will be repeated many times for compression. ';
            const repeated = pattern.repeat(10000);
            const inputStream = createReadableStream(Buffer.from(repeated));

            const compressedStream = inputStream.pipeThrough(createZstdCompressStream());
            const compressed = await collectStream(compressedStream);

            // Compressed should be smaller than original due to repetition
            expect(compressed.length).to.be.lessThan(repeated.length);

            // Verify decompression
            const decompressed = await zstdDecompress(compressed);
            expect(Buffer.from(decompressed).toString()).to.equal(repeated);
        });

        it('should produce incremental output during compression', async () => {
            const inputChunks = generateLargeData(STREAMING_TEST_SIZE_KB);
            const { outputBeforeEnd, totalOutput } = await testTrueStreaming(
                createZstdCompressStream(),
                inputChunks
            );

            expect(outputBeforeEnd).to.equal(true, 'Expected output before input completed');

            const decompressed = await zstdDecompress(totalOutput);
            const expectedSize = inputChunks.reduce((sum, c) => sum + c.length, 0);
            expect(decompressed.length).to.equal(expectedSize);
        });

        it('should produce incremental output during decompression', async () => {
            const originalData = concatUint8Arrays(generateLargeData(STREAMING_TEST_SIZE_KB));
            const compressed = await zstdCompress(originalData);

            const chunkSize = 16 * 1024;
            const inputChunks: Uint8Array[] = [];
            for (let i = 0; i < compressed.length; i += chunkSize) {
                inputChunks.push(new Uint8Array(compressed.buffer, compressed.byteOffset + i,
                    Math.min(chunkSize, compressed.length - i)));
            }

            const { outputBeforeEnd, totalOutput } = await testTrueStreaming(
                createZstdDecompressStream(),
                inputChunks
            );

            expect(outputBeforeEnd).to.equal(true, 'Expected output before input completed');
            expect(totalOutput.length).to.equal(originalData.length);
        });
    });

    describe("Base64", () => {
        it('should encode data with base64 stream', async () => {
            const input = Buffer.from('Hello streaming base64 world!');
            const inputStream = createReadableStream(input);

            const encodedStream = inputStream.pipeThrough(createBase64EncodeStream());
            const encoded = await collectStream(encodedStream);

            // Verify the encoded data matches expected base64
            expect(Buffer.from(encoded).toString('utf8')).to.equal('SGVsbG8gc3RyZWFtaW5nIGJhc2U2NCB3b3JsZCE=');
        });

        it('should decode base64 data with stream', async () => {
            const original = 'Hello streaming base64 decode world!';
            const encoded = Buffer.from(original).toString('base64');
            const inputStream = createReadableStream(Buffer.from(encoded, 'utf8'));

            const decodedStream = inputStream.pipeThrough(createBase64DecodeStream());
            const decoded = await collectStream(decodedStream);

            expect(Buffer.from(decoded).toString()).to.equal(original);
        });

        it('should handle round-trip encoding and decoding', async () => {
            const original = Buffer.from([
                0x52, 0x6f, 0x75, 0x6e, 0x64, 0x2d, 0x74, 0x72, 0x69, 0x70, 0x20, // "Round-trip "
                0x00, 0x01, 0x02, 0xff, 0xfe, 0x80, 0x7f // binary data
            ]);
            const inputStream = createReadableStream(original);

            const encodedStream = inputStream.pipeThrough(createBase64EncodeStream());
            const decodedStream = encodedStream.pipeThrough(createBase64DecodeStream());
            const result = await collectStream(decodedStream);

            expect(Buffer.from(result).equals(original)).to.equal(true);
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

            const encodedStream = inputStream.pipeThrough(createBase64EncodeStream());
            const decodedStream = encodedStream.pipeThrough(createBase64DecodeStream());
            const result = await collectStream(decodedStream);

            expect(Buffer.from(result).toString()).to.equal(chunks.join(''));
        });

        it('should handle empty input', async () => {
            const inputStream = createReadableStream(new Uint8Array(0));

            const encodedStream = inputStream.pipeThrough(createBase64EncodeStream());
            const decodedStream = encodedStream.pipeThrough(createBase64DecodeStream());
            const result = await collectStream(decodedStream);

            expect(result.length).to.equal(0);
        });

        it('should handle large data', async () => {
            // Create a 1MB buffer
            const size = 1024 * 1024;
            const largeData = new Uint8Array(size);
            const rng = mulberry32(0xDEADBEEF);
            for (let i = 0; i < size; i++) {
                largeData[i] = Math.floor(rng() * 256);
            }

            const inputStream = createReadableStream(largeData);

            const encodedStream = inputStream.pipeThrough(createBase64EncodeStream());
            const encoded = await collectStream(encodedStream);

            // Base64 encoded size should be ~4/3 of original
            expect(encoded.length).to.equal(Math.ceil(size / 3) * 4);

            // Verify decoding
            const decodedStream = createReadableStream(encoded).pipeThrough(createBase64DecodeStream());
            const decoded = await collectStream(decodedStream);
            expect(decoded.length).to.equal(size);
            expect(Buffer.from(decoded).equals(Buffer.from(largeData))).to.equal(true);
        });

        it('should decode URL-safe base64', async () => {
            // URL-safe base64 uses - instead of + and _ instead of /
            // Bytes that produce both + and / in standard base64:
            // [0xfb, 0xff, 0xbf] → ++/+ (has both + and /)
            const original = Buffer.from([0xfb, 0xff, 0xbf]);
            const standardB64 = original.toString('base64');
            expect(standardB64).to.include('+');
            expect(standardB64).to.include('/');

            // Convert to URL-safe: + → -, / → _
            const urlSafeB64 = standardB64.replace(/\+/g, '-').replace(/\//g, '_');

            // Decode the URL-safe version
            const inputStream = createReadableStream(Buffer.from(urlSafeB64, 'utf8'));
            const decodedStream = inputStream.pipeThrough(createBase64DecodeStream());
            const decoded = await collectStream(decodedStream);

            // Should decode to same value as original
            expect(Buffer.from(decoded).equals(original)).to.equal(true);
        });

        it('should decode base64 with whitespace', async () => {
            const original = 'Hello world!';
            const b64 = Buffer.from(original).toString('base64');
            // Add various whitespace characters
            const b64WithWhitespace = b64.slice(0, 4) + ' ' + b64.slice(4, 8) + '\n' +
                b64.slice(8, 12) + '\t' + b64.slice(12) + '\r\n';

            const inputStream = createReadableStream(Buffer.from(b64WithWhitespace, 'utf8'));
            const decodedStream = inputStream.pipeThrough(createBase64DecodeStream());
            const decoded = await collectStream(decodedStream);

            expect(Buffer.from(decoded).toString()).to.equal(original);
        });

        it('should handle base64 without padding', async () => {
            const original = 'Hi'; // 2 bytes = 3 base64 chars without padding
            const b64WithPadding = Buffer.from(original).toString('base64');
            expect(b64WithPadding).to.equal('SGk=');

            // Strip the padding
            const b64NoPadding = 'SGk';

            const inputStream = createReadableStream(Buffer.from(b64NoPadding, 'utf8'));
            const decodedStream = inputStream.pipeThrough(createBase64DecodeStream());
            const decoded = await collectStream(decodedStream);

            expect(Buffer.from(decoded).toString()).to.equal(original);
        });

        it('should handle chunks that split base64 groups', async () => {
            // Create data that will be split across chunk boundaries
            const original = 'ABCDEFGHIJKLMNOP';
            const b64 = Buffer.from(original).toString('base64');

            // Split the base64 string into awkward chunks (not aligned to 4 chars)
            const chunks = [
                b64.slice(0, 3),  // 3 chars - not a complete group
                b64.slice(3, 7),  // 4 chars - but starts mid-group
                b64.slice(7, 10), // 3 chars
                b64.slice(10)     // rest
            ];

            const inputStream = new ReadableStream<Uint8Array>({
                start(controller) {
                    for (const chunk of chunks) {
                        controller.enqueue(Buffer.from(chunk, 'utf8'));
                    }
                    controller.close();
                }
            });

            const decodedStream = inputStream.pipeThrough(createBase64DecodeStream());
            const decoded = await collectStream(decodedStream);

            expect(Buffer.from(decoded).toString()).to.equal(original);
        });

        it('should handle chunks that split binary bytes in encoding', async function () {
            this.timeout(5000);

            // Base64 encoding works on 3-byte groups, so test splitting at non-3 boundaries
            const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

            const chunks = [
                original.subarray(0, 2),   // 2 bytes - not a complete group
                original.subarray(2, 5),   // 3 bytes - but starts mid-group
                original.subarray(5, 7),   // 2 bytes
                original.subarray(7)       // rest (3 bytes)
            ];

            const inputStream = new ReadableStream<Uint8Array>({
                start(controller) {
                    for (const chunk of chunks) {
                        controller.enqueue(chunk);
                    }
                    controller.close();
                }
            });

            const encodedStream = inputStream.pipeThrough(createBase64EncodeStream());
            const encoded = await collectStream(encodedStream);

            // Verify round-trip
            const decoded = await decodeBase64(encoded);
            expect(Buffer.from(decoded).equals(Buffer.from(original))).to.equal(true);
        });

        it('should produce incremental output during encoding', async function () {
            this.timeout(10000);

            // Use 4MB for base64 to ensure we get multiple batches (1.5MB batch size)
            const inputChunks = generateLargeData(4096);
            const { outputBeforeEnd, totalOutput } = await testTrueStreaming(
                createBase64EncodeStream(),
                inputChunks
            );

            expect(outputBeforeEnd).to.equal(true, 'Expected output before input completed');

            // Verify the output is valid base64
            const decoded = await decodeBase64(totalOutput);
            const expectedSize = inputChunks.reduce((sum, c) => sum + c.length, 0);
            expect(decoded.length).to.equal(expectedSize);
        });

        it('should produce incremental output during decoding', async function () {
            this.timeout(10000);

            // Generate random data, encode to base64, then decode via stream
            const originalData = concatUint8Arrays(generateLargeData(4096));
            const encoded = await encodeBase64(originalData);

            const chunkSize = 64 * 1024;
            const inputChunks: Uint8Array[] = [];
            for (let i = 0; i < encoded.length; i += chunkSize) {
                inputChunks.push(new Uint8Array(encoded.buffer, encoded.byteOffset + i,
                    Math.min(chunkSize, encoded.length - i)));
            }

            const { outputBeforeEnd, totalOutput } = await testTrueStreaming(
                createBase64DecodeStream(),
                inputChunks
            );

            expect(outputBeforeEnd).to.equal(true, 'Expected output before input completed');
            expect(totalOutput.length).to.equal(originalData.length);
        });

        it('should reject invalid base64 characters', async () => {
            const invalidB64 = Buffer.from('SGVs#G8=', 'utf8'); // # is invalid
            const inputStream = createReadableStream(invalidB64);

            const decodedStream = inputStream.pipeThrough(createBase64DecodeStream());

            try {
                await collectStream(decodedStream);
                expect.fail('Expected error for invalid base64');
            } catch (err: any) {
                expect(err.message).to.include('Invalid base64');
            }
        });
    });

    describe("Generic Streaming API", () => {
        it('should decode with createDecodeStream for single encoding', async () => {
            const original = 'Hello generic decode stream!';
            const compressed = await gzip(Buffer.from(original));
            const inputStream = createReadableStream(compressed);

            const decodedStream = inputStream.pipeThrough(createDecodeStream('gzip')!);
            const decoded = await collectStream(decodedStream);

            expect(Buffer.from(decoded).toString()).to.equal(original);
        });

        it('should encode with createEncodeStream for single encoding', async () => {
            const original = Buffer.from('Hello generic encode stream!');
            const inputStream = createReadableStream(original);

            const encodedStream = inputStream.pipeThrough(createEncodeStream('gzip')!);
            const encoded = await collectStream(encodedStream);

            const decoded = await gunzip(encoded);
            expect(Buffer.from(decoded).toString()).to.equal(original.toString());
        });

        it('should handle multiple encodings in decode (comma-separated)', async () => {
            const original = 'Multiple encodings test!';
            // Encode: first gzip, then base64
            const gzipped = await gzip(Buffer.from(original));
            const encoded = await encodeBase64(gzipped);

            const inputStream = createReadableStream(encoded);
            // Decode: "gzip, base64" means gzip was applied first, base64 second
            // So we decode base64 first, then gzip
            const decodedStream = inputStream.pipeThrough(createDecodeStream('gzip, base64')!);
            const decoded = await collectStream(decodedStream);

            expect(Buffer.from(decoded).toString()).to.equal(original);
        });

        it('should handle multiple encodings in decode (array)', async () => {
            const original = 'Array encodings test!';
            const gzipped = await gzip(Buffer.from(original));
            const encoded = await encodeBase64(gzipped);

            const inputStream = createReadableStream(encoded);
            const decodedStream = inputStream.pipeThrough(createDecodeStream(['gzip', 'base64'])!);
            const decoded = await collectStream(decodedStream);

            expect(Buffer.from(decoded).toString()).to.equal(original);
        });

        it('should handle multiple encodings in encode', async () => {
            const original = Buffer.from('Encode multiple test!');
            const inputStream = createReadableStream(original);

            // Encode with gzip then base64
            const encodedStream = inputStream.pipeThrough(createEncodeStream('gzip, base64')!);
            const encoded = await collectStream(encodedStream);

            // Decode manually in reverse order
            const decoded64 = await decodeBase64(encoded);
            const decoded = await gunzip(Buffer.from(decoded64));
            expect(Buffer.from(decoded).toString()).to.equal(original.toString());
        });

        it('should round-trip with encode and decode streams', async () => {
            const original = Buffer.from('Round trip with generic streams!');
            const encoding = 'gzip, base64';

            const inputStream = createReadableStream(original);
            const encodedStream = inputStream.pipeThrough(createEncodeStream(encoding)!);
            const decodedStream = encodedStream.pipeThrough(createDecodeStream(encoding)!);
            const result = await collectStream(decodedStream);

            expect(Buffer.from(result).toString()).to.equal(original.toString());
        });

        it('should return null for identity/undefined encoding', async () => {
            // Test undefined
            expect(createDecodeStream(undefined)).to.equal(null);
            expect(createEncodeStream(undefined)).to.equal(null);

            // Test 'identity'
            expect(createDecodeStream('identity')).to.equal(null);
            expect(createEncodeStream('identity')).to.equal(null);

            // Test empty string equivalent
            expect(createDecodeStream('')).to.equal(null);
        });

        it('should throw for unsupported encoding', () => {
            expect(() => createDecodeStream('unsupported-encoding')).to.throw('Unsupported encoding');
            expect(() => createEncodeStream('unsupported-encoding')).to.throw('Unsupported encoding');
        });

        it('should handle case-insensitive encodings', async () => {
            const original = 'Case insensitive test!';
            const compressed = await gzip(Buffer.from(original));
            const inputStream = createReadableStream(compressed);

            const decodedStream = inputStream.pipeThrough(createDecodeStream('GZIP')!);
            const decoded = await collectStream(decodedStream);

            expect(Buffer.from(decoded).toString()).to.equal(original);
        });

        it('should handle brotli encoding', async () => {
            const original = Buffer.from('Brotli generic test!');
            const inputStream = createReadableStream(original);

            const encodedStream = inputStream.pipeThrough(createEncodeStream('br')!);
            const decodedStream = encodedStream.pipeThrough(createDecodeStream('br')!);
            const result = await collectStream(decodedStream);

            expect(Buffer.from(result).toString()).to.equal(original.toString());
        });

        it('should handle zstd encoding', async () => {
            const original = Buffer.from('Zstd generic test!');
            const inputStream = createReadableStream(original);

            const encodedStream = inputStream.pipeThrough(createEncodeStream('zstd')!);
            const decodedStream = encodedStream.pipeThrough(createDecodeStream('zstd')!);
            const result = await collectStream(decodedStream);

            expect(Buffer.from(result).toString()).to.equal(original.toString());
        });
    });
});

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

// Helper to concatenate Uint8Array chunks (replaces Buffer.concat usage)
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}

// Data size for incremental output tests (256KB is enough for gzip/deflate/zstd)
const STREAMING_TEST_SIZE_KB = 256;

// Helper to test true streaming behavior - verifies output arrives before all input is sent
async function testTrueStreaming(
    transformStream: TransformStream<Uint8Array, Uint8Array>,
    inputChunks: Uint8Array[],
    timeoutMs = 5000
): Promise<{ outputBeforeEnd: boolean; totalOutput: Uint8Array }> {
    if (inputChunks.length < 2) {
        throw new Error('testTrueStreaming requires at least 2 input chunks');
    }

    const outputChunks: Uint8Array[] = [];

    let resolveFirstOutput!: () => void;
    const firstOutputReceived = new Promise<void>(resolve => {
        resolveFirstOutput = resolve;
    });

    const writer = transformStream.writable.getWriter();
    const reader = transformStream.readable.getReader();

    // Start reading in background
    const readPromise = (async () => {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            outputChunks.push(value);
            if (outputChunks.length === 1) resolveFirstOutput();
        }
    })();

    // Write all chunks except the last
    for (let i = 0; i < inputChunks.length - 1; i++) {
        await writer.write(inputChunks[i]);
    }

    // Wait for output before writing final chunk
    const outputBeforeEnd = await Promise.race([
        firstOutputReceived.then(() => true),
        new Promise<false>(resolve => setTimeout(() => resolve(false), timeoutMs))
    ]);

    // Write final chunk and close
    await writer.write(inputChunks[inputChunks.length - 1]);
    await writer.close();
    await readPromise;

    // Combine output
    const totalLength = outputChunks.reduce((sum, c) => sum + c.length, 0);
    const totalOutput = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of outputChunks) {
        totalOutput.set(chunk, offset);
        offset += chunk.length;
    }

    return { outputBeforeEnd, totalOutput };
}

// Mulberry32: seeded PRNG for deterministic incompressible test data
function mulberry32(seed: number) {
    return function(): number {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Generate deterministic incompressible test data in 16KB chunks
function generateLargeData(sizeKB: number): Uint8Array[] {
    const chunkSize = 16 * 1024;
    const totalSize = sizeKB * 1024;
    const chunks: Uint8Array[] = [];
    const rng = mulberry32(0x12345678);

    let remaining = totalSize;
    while (remaining > 0) {
        const size = Math.min(chunkSize, remaining);
        const chunk = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            chunk[i] = Math.floor(rng() * 256);
        }
        chunks.push(chunk);
        remaining -= size;
    }

    return chunks;
}
