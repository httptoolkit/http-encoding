// This makes importing wasm-brotli asynchronous (because of dynamic import).
// This is needed here for Webpack v5, which doesn't allow synchronous import of
// WebAssembly. We can't just do this in TS, because it compiles to commonjs so
// import() becomes a synchronous require() before Webpack gets involved.
exports.importWasmBrotli = () => import("wasm-brotli");