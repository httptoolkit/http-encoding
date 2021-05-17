declare module 'wasm-brotli' {
    export function compress(buffer: Uint8Array): Uint8Array;
    export function decompress(buffer: Uint8Array): Uint8Array;
}