import * as brotli from 'brotli-wasm';
import type { ZstdStreaming } from 'zstd-codec';

import chai = require("chai");
import chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
const expect = chai.expect;

import {
    decodeBuffer,
    gzip,
    deflate,
    deflateRaw,
    encodeBuffer
} from '../src/index';

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
        const content = await gzip(Buffer.from('Gzip response'));
        const body = await decodeBuffer(content, 'gzip');
        expect(body.toString()).to.equal('Gzip response');
    });

    it('should decode gzip bodies from ArrayBuffer', async () => {
        const content = bufferToArrayBuffer(await gzip(Buffer.from('Gzip response')));
        const body = await decodeBuffer(content, 'gzip');
        expect(body.toString()).to.equal('Gzip response');
    });

    it('should decode gzip bodies from Uint8Array', async () => {
        const content = bufferToTypedArray(await gzip(Buffer.from('Gzip response')));
        const body = await decodeBuffer(content, 'gzip');
        expect(body.toString()).to.equal('Gzip response');
    });

    it('should decode zlib deflate bodies', async () => {
        const content = await deflate(Buffer.from('Deflate response'));
        const body = await decodeBuffer(content, 'deflate');
        expect(body.toString()).to.equal('Deflate response');
    });

    it('should decode raw deflate bodies', async () => {
        const content = await deflateRaw(Buffer.from('Raw deflate response'));
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
        const original = 'First brotli, then gzip, last zstandard, now this';
        const brotliCompressed = Buffer.from(await (await brotli).compress(
            Buffer.from(original, 'utf8')
        ));
        const gzipCompressed = await gzip(brotliCompressed);
        const content = (await zstd).compress(gzipCompressed);

        const body = await decodeBuffer(content, 'br, identity, gzip, identity, zstd');
        expect(body.toString()).to.equal(original);
    });

    it('should decode bodies ignoring the code of the encoding', async () => {
        const content = bufferToTypedArray(await gzip(Buffer.from('Gzip response')));
        const body = await decodeBuffer(content, 'GZIP');
        expect(body.toString()).to.equal('Gzip response');
    });

    it('should decode base64 bodies', async () => {
        const content = Buffer.from(Buffer.from('Base64 response').toString('base64'));
        const body = await decodeBuffer(content, 'base64');
        expect(body.toString()).to.equal('Base64 response');
    });
});
