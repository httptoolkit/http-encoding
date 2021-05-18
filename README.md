# http-encoding [![Build Status](https://github.com/httptoolkit/http-encoding/workflows/CI/badge.svg)](https://github.com/httptoolkit/http-encoding/actions) [![Available on NPM](https://img.shields.io/npm/v/http-encoding.svg)](https://npmjs.com/package/http-encoding)

> _Part of [HTTP Toolkit](https://httptoolkit.tech): powerful tools for building, testing & debugging HTTP(S)_

**Everything you need to handle HTTP message body content-encoding**

This package includes methods to decode & encode all commonly used HTTP content encodings, in a consistent format, usable in both Node.js and browsers.

The supported codecs are:
* Gzip
* Deflate (decoded correctly with or without a zlib wrapper)
* Brotli
* Zstandard

The 'identity' and 'amz-1.0' encodings (no-op encodings) are also correctly supported.

Found a codec used in real-world HTTP that isn't supported? Open an issue!

## API

The library includes two general methods:

### `decodeBuffer(body, encoding)`

Takes an encoded body buffer and encoding (in the format of a standard HTTP [content-encoding header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding)) and returns a promise for a decoded buffer, using the zero to many buffers specified in the header.

The input buffer can be either a Uint8Array or a Node Buffer (a subclass of Uint8Array). In a browser this returns a Uint8Array, in Node.js it returns a Node Buffer (a subclass of Uint8Array).

If any encoding is unrecognized or unavailable then this method will throw an exception.

### `encodeBuffer(body, encoding, { level })`

Takes a raw body buffer and a single encoding (a valid HTTP [content-encoding](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding) name) and returns a promise for an encoded buffer, using the zero to many buffers specified in the header.

The input buffer can be either a Uint8Array or a Node Buffer (a subclass of Uint8Array). In a browser this returns a Uint8Array, in Node.js it returns a Node Buffer (a subclass of Uint8Array).

If any encoding is unrecognized or unavailable then this method will throw an exception.

## Per-codec methods

This library also exports consistent async methods to compress and decompress each of the codecs directly:

* `gzip`
* `gunzip`
* `deflate`
* `inflate`
* `inflateRaw`
* `brotliCompress`
* `brotliDecompress`
* `zstdCompress`
* `zstdDecompress`

Each method accepts a buffer and returns a promise for a buffer.

## Browser usage

To use this in a browser, you'll need to use a bundler (e.g. Webpack) that can include standard Node.js polyfill packages, and which supports WebAssembly.

In Webpack v4 this should work automatically, in Webpack v5 this will require explicit dependencies and configuration. See this package's own [test webpack config](./karma.conf.js#L14-L44) and [dev dependencies](./package.json) for a working example.

Brotli and Zstandard are only supported in runtime environments that support WebAssembly. All WebAssembly packages are loaded on-demand and only when native methods (e.g. Node's `zlib.brotli*`) are not available.
