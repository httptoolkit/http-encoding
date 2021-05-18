import * as zlib from 'zlib';
import * as brotli from 'wasm-brotli';
import { ZstdCodec, ZstdStreaming } from 'zstd-codec';

import chai = require("chai");
import chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
const expect = chai.expect;

import { decodeBuffer } from '../src/index';

const zstd: Promise<ZstdStreaming> = new Promise((resolve) =>
    ZstdCodec.run((binding) => {
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
        })()).to.be.rejectedWith('Unknown encoding: randomized');
    });

    it('can decode gzip bodies', async () => {
        const content = zlib.gzipSync('Gzip response');
        const body = await decodeBuffer(content, 'gzip');
        expect(body.toString()).to.equal('Gzip response');
    });

    it('can decode zlib deflate bodies', async () => {
        const content = zlib.deflateSync('Deflate response');
        const body = await decodeBuffer(content, 'deflate');
        expect(body.toString()).to.equal('Deflate response');
    });

    it('can decode raw deflate bodies', async () => {
        const content = zlib.deflateRawSync('Raw deflate response');
        const body = await decodeBuffer(content, 'deflate');
        expect(body.toString()).to.equal('Raw deflate response');
    });

    it('can decode brotli bodies', async () => {
        const content = Buffer.from(
            await brotli.compress(Buffer.from('Brotli brotli brotli brotli brotli', 'utf8'))
        );
        const body = await decodeBuffer(content, 'br');
        expect(body.toString()).to.equal('Brotli brotli brotli brotli brotli');
    });

    it('can decode zstd bodies', async () => {
        const content = Buffer.from((await zstd).compress(Buffer.from('hello zstd zstd zstd world')));
        const body = await decodeBuffer(content, 'zstd');
        expect(body.toString()).to.equal('hello zstd zstd zstd world');
    });

    it('can decode bodies with multiple encodings', async () => {
        const content = (await zstd).compress(
            zlib.gzipSync(
                Buffer.from(await brotli.compress(
                    Buffer.from('First brotli, then gzip, last zstandard, now this', 'utf8')
                ))
            )
        );
        const body = await decodeBuffer(content, 'br, identity, gzip, identity, zstd');
        expect(body.toString()).to.equal('First brotli, then gzip, last zstandard, now this');
    });
});