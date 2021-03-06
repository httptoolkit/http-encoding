import * as zlib from 'zlib';
import * as brotli from 'brotli-wasm';
import type { ZstdStreaming } from 'zstd-codec';

import chai = require("chai");
import chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
const expect = chai.expect;

import { encodeBuffer } from '../src/index';

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

describe("Encode", () => {
    it('should return the raw text for identity requests', async () => {
        const body = await encodeBuffer(Buffer.from('hello world'), 'identity', { level: 1 });
        expect(body.toString()).to.equal('hello world');
    });

    it('should throw for unknown encodings', async () => {
        await expect((async () => {
            return await encodeBuffer(Buffer.from('hello world'), 'randomized' as any, { level: 1 })
        })()).to.be.rejectedWith('Unsupported encoding: randomized');
    });

    it('should encode gzip bodies', async () => {
        const body = await encodeBuffer(Buffer.from('Response to gzip'), 'gzip', { level: 1 });
        expect(zlib.gunzipSync(body).toString()).to.equal('Response to gzip');
    });

    it('should encode gzip bodies from Uint8Array', async () => {
        const content = bufferToTypedArray(Buffer.from('Response to gzip'));
        const body = await encodeBuffer(content, 'gzip', { level: 1 });
        expect(zlib.gunzipSync(body).toString()).to.equal('Response to gzip');
    });

    it('should encode gzip bodies from ArrayBuffer', async () => {
        const content = bufferToArrayBuffer(Buffer.from('Response to gzip'));
        const body = await encodeBuffer(content, 'gzip', { level: 1 });
        expect(zlib.gunzipSync(body).toString()).to.equal('Response to gzip');
    });

    it('should encode zlib deflate bodies', async () => {
        const body = await encodeBuffer(Buffer.from('Response to deflate'), 'deflate', { level: 1 });
        expect(zlib.inflateSync(body).toString()).to.equal('Response to deflate');
    });

    it('should encode brotli bodies', async () => {
        const body = await encodeBuffer(Buffer.from('Response to brotlify brotlify'), 'br');
        expect(Buffer.from(
            await (await brotli).decompress(body)
        ).toString()).to.equal('Response to brotlify brotlify');
    });

    it('should encode zstd bodies', async () => {
        const body = await encodeBuffer(Buffer.from('zstd zstd body body body'), 'zstd', { level: 1 });
        expect(Buffer.from(
            (await zstd).decompress(body)
        ).toString()).to.equal('zstd zstd body body body');
    });

    it('should encode gzip bodies', async () => {
        const body = await encodeBuffer(Buffer.from('Response as base64'), 'base64');
        expect(Buffer.from(Buffer.from(body).toString(), 'base64').toString()).to.equal('Response as base64');
    });

    it('should encode bodies ignoring the case of the encoding', async () => {
        const body = await encodeBuffer(Buffer.from('Response to gzip'), 'gzip', { level: 1 });
        expect(zlib.gunzipSync(body).toString()).to.equal('Response to gzip');
    });

    it('should encode bodies at the provided level', async () => {
        const barelyEncodedBody = await encodeBuffer(Buffer.from('Response to brotlify brotlify'), 'br', { level: 1 });
        const heavilyEncodedBody = await encodeBuffer(Buffer.from('Response to brotlify brotlify'), 'br', { level: 11 });

        // Both valid outputs:
        expect(Buffer.from(
            await (await brotli).decompress(barelyEncodedBody)
        ).toString()).to.equal('Response to brotlify brotlify');
        expect(Buffer.from(
            await (await brotli).decompress(heavilyEncodedBody)
        ).toString()).to.equal('Response to brotlify brotlify');

        // But the heavily encoded one is smaller:
        expect(barelyEncodedBody.length).to.be.greaterThan(heavilyEncodedBody.length);
    });
});