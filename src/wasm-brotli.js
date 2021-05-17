// This needs to be imported here in JS, because otherwise the TS build compiles it
// to a synchronous require(), and then webpack won't allow sync requires to become
// necessarily-async WASM imports.
exports.importWasmBrotli = () => import("wasm-brotli");