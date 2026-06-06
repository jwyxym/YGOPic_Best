import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import dts from 'vite-plugin-dts';

function copyRuntimeAssets(): Plugin {
  return {
    name: 'copy-runtime-assets',
    closeBundle() {
      const root = process.cwd();
      const distDir = join(root, 'dist');

      copyCoreWasm(root, distDir);
      copyPublic(root, distDir);
    },
  };
}

function copyCoreWasm(root: string, distDir: string) {
  const sourceDir = join(root, 'core-wasm', 'pkg');
  const targetDir = join(distDir, 'core-wasm');

  if (!existsSync(sourceDir)) {
    throw new Error(`core-wasm pkg directory not found: ${sourceDir}`);
  }

  mkdirSync(targetDir, { recursive: true });

  for (const file of readdirSync(sourceDir)) {
    if (/\.(js|wasm|d\.ts|json)$/.test(file)) {
      copyFileSync(join(sourceDir, file), join(targetDir, file));
    }
  }
}

function copyPublic(root: string, distDir: string) {
  const sourceDir = join(root, 'public');

  if (!existsSync(sourceDir)) {
    throw new Error(`public directory not found: ${sourceDir}`);
  }

  mkdirSync(dirname(distDir), { recursive: true });
  cpSync(sourceDir, distDir, { recursive: true });
}

export default defineConfig({
  resolve: {
    conditions: ['onnxruntime-web-use-extern-wasm'],
  },
  plugins: [
    dts({
      entryRoot: 'src',
      tsconfigPath: 'tsconfig.build.json',
    }),
    copyRuntimeAssets(),
  ],
  build: {
    assetsInlineLimit: 0,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    sourcemap: true,
    target: 'es2020',
    rollupOptions: {
      external: (id) =>
        id === 'core-wasm' ||
        id === 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url' ||
        id === 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url',
      output: {
        paths: {
          'core-wasm': './core-wasm/core_wasm.js',
        },
      },
    },
  },
});
