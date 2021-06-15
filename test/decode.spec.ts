import * as zlib from 'zlib';
import * as brotli from 'brotli-wasm';
import type { ZstdStreaming } from 'zstd-codec';

import chai = require("chai");
import chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
const expect = chai.expect;

import { decodeBuffer, decodeBufferSync } from '../src/index';

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteLength + buffer.byteOffset)
}

function bufferToTypedArray(buffer: Buffer): Uint8Array {
    return new Uint8Array(buffer, buffer.byteOffset, buffer.byteLength);
}

const zstd: Promise<ZstdStreaming> = new Promise(async (resolve) =>
    (await import('zstd-codec')).ZstdCodec.run((binding) => {
        resolve(new binding.Streaming())
    })
);

describe("Decode", () => {
    it('should return the raw text for unspecified requests', async () => {
        const body = await decodeBuffer(Buffer.from('hello world'), undefined);
        expect(body.toString()).to.equal('hello world');
    });

    it('should return the raw text for identity requests', async () => {
        const body = await decodeBuffer(Buffer.from('hello world'), 'identity');
        expect(body.toString()).to.equal('hello world');
    });

    it('should throw for unknown encodings', async () => {
        await expect((async () => {
            return await decodeBuffer(Buffer.from('hello world'), 'randomized')
        })()).to.be.rejectedWith('Unsupported encoding: randomized');
    });

    it('should decode gzip bodies', async () => {
        const content = zlib.gzipSync('Gzip response');
        const body = await decodeBuffer(content, 'gzip');
        expect(body.toString()).to.equal('Gzip response');
    });

    it('should decode gzip bodies from ArrayBuffer', async () => {
        const content = bufferToArrayBuffer(zlib.gzipSync('Gzip response'));
        const body = await decodeBuffer(content, 'gzip');
        expect(body.toString()).to.equal('Gzip response');
    });

    it('should decode gzip bodies from Uint8Array', async () => {
        const content = bufferToTypedArray(zlib.gzipSync('Gzip response'));
        const body = await decodeBuffer(content, 'gzip');
        expect(body.toString()).to.equal('Gzip response');
    });

    it('should decode zlib deflate bodies', async () => {
        const content = zlib.deflateSync('Deflate response');
        const body = await decodeBuffer(content, 'deflate');
        expect(body.toString()).to.equal('Deflate response');
    });

    it('should decode raw deflate bodies', async () => {
        const content = zlib.deflateRawSync('Raw deflate response');
        const body = await decodeBuffer(content, 'deflate');
        expect(body.toString()).to.equal('Raw deflate response');
    });

    it('should decode brotli bodies', async () => {
        const content = Buffer.from(
            await (await brotli).compress(Buffer.from('Brotli brotli brotli brotli brotli', 'utf8'))
        );
        const body = await decodeBuffer(content, 'br');
        expect(body.toString()).to.equal('Brotli brotli brotli brotli brotli');
    });

    it('should decode zstd bodies', async () => {
        const content = Buffer.from((await zstd).compress(Buffer.from('hello zstd zstd zstd world')));
        const body = await decodeBuffer(content, 'zstd');
        expect(body.toString()).to.equal('hello zstd zstd zstd world');
    });

    it('should decode bodies with multiple encodings', async () => {
        const content = (await zstd).compress(
            zlib.gzipSync(
                Buffer.from(await (await brotli).compress(
                    Buffer.from('First brotli, then gzip, last zstandard, now this', 'utf8')
                ))
            )
        );
        const body = await decodeBuffer(content, 'br, identity, gzip, identity, zstd');
        expect(body.toString()).to.equal('First brotli, then gzip, last zstandard, now this');
    });

    it('should decode bodies ignoring the code of the encoding', async () => {
        const content = bufferToTypedArray(zlib.gzipSync('Gzip response'));
        const body = await decodeBuffer(content, 'GZIP');
        expect(body.toString()).to.equal('Gzip response');
    });
});

describe("DecodeSync", () => {
    it('should return the raw text for unspecified requests', () => {
        const body = decodeBufferSync(Buffer.from('hello world'), undefined);
        expect(body.toString()).to.equal('hello world');
    });

    it('should return the raw text for identity requests', () => {
        const body = decodeBufferSync(Buffer.from('hello world'), 'identity');
        expect(body.toString()).to.equal('hello world');
    });

    it('should throw for unknown encodings', () => {
        expect((() =>
            decodeBufferSync(Buffer.from('hello world'), 'randomized')
        )).to.throw('Unsupported encoding: randomized');
    });

    it('should decode gzip bodies', () => {
        const content = zlib.gzipSync('Gzip response');
        const body = decodeBufferSync(content, 'gzip');
        expect(body.toString()).to.equal('Gzip response');
    });

    it('should decode gzip bodies from ArrayBuffer', () => {
        const content = bufferToArrayBuffer(zlib.gzipSync('Gzip response'));
        const body = decodeBufferSync(content, 'gzip');
        expect(body.toString()).to.equal('Gzip response');
    });

    it('should decode gzip bodies from Uint8Array', () => {
        const content = bufferToTypedArray(zlib.gzipSync('Gzip response'));
        const body = decodeBufferSync(content, 'gzip');
        expect(body.toString()).to.equal('Gzip response');
    });

    it('should decode zlib deflate bodies', () => {
        const content = zlib.deflateSync('Deflate response');
        const body = decodeBufferSync(content, 'deflate');
        expect(body.toString()).to.equal('Deflate response');
    });

    it('should decode raw deflate bodies', () => {
        const content = zlib.deflateRawSync('Raw deflate response');
        const body = decodeBufferSync(content, 'deflate');
        expect(body.toString()).to.equal('Raw deflate response');
    });

    it('should decode bodies with multiple encodings', async () => {
        const content = zlib.gzipSync(
            zlib.deflateSync(
                Buffer.from('First deflate, then gzip, now this', 'utf8')
            )
        );
        const body = decodeBufferSync(content, 'deflate, identity, gzip, identity');
        expect(body.toString()).to.equal('First deflate, then gzip, now this');
    });

    it('should decode bodies ignoring the code of the encoding', () => {
        const content = zlib.gzipSync('Gzip response');
        const body = decodeBufferSync(content, 'GZIP');
        expect(body.toString()).to.equal('Gzip response');
    });
});