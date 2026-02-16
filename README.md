# http-encoding [![Build Status](https://github.com/httptoolkit/http-encoding/workflows/CI/badge.svg)](https://github.com/httptoolkit/http-encoding/actions) [![Available on NPM](https://img.shields.io/npm/v/http-encoding.svg)](https://npmjs.com/package/http-encoding)

> _Part of [HTTP Toolkit](https://httptoolkit.com): powerful tools for building, testing & debugging HTTP(S)_

**Everything you need to handle HTTP message body content-encoding**

This package includes methods to decode & encode all commonly used HTTP content encodings, in a consistent format, usable in a wide range of Node.js versions and browsers. Both buffer & streaming APIs are available.

The supported codecs are:

* Gzip
* Raw deflate (with or without a zlib wrapper)
* Brotli
* Zstandard
* Base64

All encoding names are case-insensitive (although lowercase is generally standard). The 'identity', 'amz-1.0', 'none', 'text', 'binary', 'utf8' and 'utf-8' encodings are all supported as no-op encodings, passed through with no en/decoding at all. Only 'identity' is standard, but the others are all in common use regardless.

Found a codec used in real-world HTTP that isn't supported? Open an issue!

## Buffer API

The library includes two general methods for de/encoding buffers:

### `decodeBuffer(body, encoding)`

Takes an encoded body buffer and encoding (in the format of a standard HTTP [content-encoding header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding)) and returns a promise for a decoded buffer, using the zero to many buffers specified in the header.

The input buffer can be any Uint8Array including a Node Buffer (a subclass of Uint8Array). A node-compatible buffer is always returned.

If any encoding is unrecognized or unavailable then this method will throw an exception.

### `encodeBuffer(body, encoding, { level })`

Takes a raw body buffer and a single encoding (a valid HTTP [content-encoding](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding) name) and returns a promise for an encoded buffer, using the zero to many buffers specified in the header.

The input buffer can be any Uint8Array (including a Node Buffer, which is a Uint8Array subclass) or an ArrayBuffer. A node-compatible buffer is always returned.

If any encoding is unrecognized or unavailable then this method will throw an exception.

## Per-codec methods

This library also exports consistent async methods to compress and decompress each of the codecs directly:

* `gzip`
* `gunzip`
* `deflate`
* `deflateRaw`
* `inflate`
* `inflateRaw`
* `brotliCompress`
* `brotliDecompress`
* `zstdCompress`
* `zstdDecompress`
* `encodeBase64`
* `decodeBase64`

Each method accepts a buffer and returns a promise for a buffer.

## Streaming API

This library also supports streaming encoding and decoding, returning web-standard `TransformStream` instances. This uses native `CompressionStream`/`DecompressionStream` where available (all modern browsers and Node 18+).

### `createDecodeStream(encoding)`

Takes an encoding (in the format of a standard HTTP [content-encoding header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding)) and returns a `TransformStream` that decodes data with the specified encoding(s), or `null` if no transformation is needed (identity encoding or undefined).

The encoding can be a string (e.g. `'gzip'` or `'gzip, base64'`), an array of strings, or undefined.

### `createEncodeStream(encoding)`

Takes an encoding (a valid HTTP [content-encoding](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding) name) and returns a `TransformStream` that encodes data with the specified encoding(s), or `null` if no transformation is needed (identity encoding or undefined).

The encoding can be a string (e.g. `'gzip'` or `'gzip, base64'`), an array of strings, or undefined.

### Per-codec streaming methods

Each codec can also be stream-decoded explicitly with the corresponding method:

* `createGzipStream`
* `createGunzipStream`
* `createDeflateStream`
* `createInflateStream`
* `createDeflateRawStream`
* `createInflateRawStream`
* `createBrotliCompressStream`
* `createBrotliDecompressStream`
* `createZstdCompressStream`
* `createZstdDecompressStream`
* `createBase64EncodeStream`
* `createBase64DecodeStream`

## Browser usage

This library works in modern browsers that support `CompressionStream`/`DecompressionStream` (all current browsers). Gzip and deflate are handled natively via these APIs, with no polyfills required. Brotli will also use native `CompressionStream('br')` where supported, falling back to `brotli-wasm`.

Brotli and Zstandard use WebAssembly fallbacks (`brotli-wasm` and `zstd-codec`) when native implementations aren't available. These are loaded on-demand. Your bundler must support WebAssembly (e.g. Webpack v4+).

A `zlib` polyfill (e.g. `browserify-zlib`) is not required in most environments and can generally be omitted. See this package's own [test webpack config](./karma.conf.js) for a working browser bundling example.
