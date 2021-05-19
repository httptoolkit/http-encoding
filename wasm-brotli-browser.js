// This makes importing wasm-brotli asynchronous (because of dynamic import).
// This is needed here for Webpack v5, which doesn't allow synchronous import of
// WebAssembly.
module.exports = import("wasm-brotli/dist/browser.js");

// We don't want to do this for _all_ usage, because it's not supported in older
// node versions. We can't do this in TS anyway, because TS compiles to commonjs
// and converts import() into require().