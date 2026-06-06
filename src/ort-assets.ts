import ortWasmMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import type * as ort from 'onnxruntime-web/wasm';

export const DEFAULT_ORT_WASM_PATHS: ort.Env.WasmFilePaths = {
  mjs: ortWasmMjsUrl,
  wasm: ortWasmUrl,
};
