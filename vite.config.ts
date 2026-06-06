import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
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
      copyOnnxRuntime(root, distDir);
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

function copyOnnxRuntime(root: string, distDir: string) {
  const sourceDir = join(root, 'node_modules', 'onnxruntime-web');
  const targetDir = join(distDir, 'onnxruntime-web');

  if (!existsSync(sourceDir)) {
    throw new Error(`onnxruntime-web package not found: ${sourceDir}`);
  }

  mkdirSync(dirname(targetDir), { recursive: true });

  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }

  cpSync(sourceDir, targetDir, { recursive: true });
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
  plugins: [
    dts({
      entryRoot: 'src',
      tsconfigPath: 'tsconfig.build.json',
    }),
    copyRuntimeAssets(),
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    sourcemap: true,
    target: 'es2020',
    rollupOptions: {
      external: ['core-wasm', 'onnxruntime-web'],
      output: {
        paths: {
          'core-wasm': './core-wasm/core_wasm.js',
        },
      },
    },
  },
});
