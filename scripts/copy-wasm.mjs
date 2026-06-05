import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const sourceDir = join(root, 'core-wasm', 'pkg');
const targetDir = join(root, 'dist', 'core-wasm');

if (!existsSync(sourceDir)) {
  throw new Error(`core-wasm pkg directory not found: ${sourceDir}`);
}

mkdirSync(targetDir, { recursive: true });

for (const file of readdirSync(sourceDir)) {
  if (/\.(js|wasm|d\.ts|json)$/.test(file)) {
    copyFileSync(join(sourceDir, file), join(targetDir, file));
  }
}

for (const file of ['YGOPicRecognizer.js', 'YGOPicRecognizer.d.ts']) {
  const outputFile = join(root, 'dist', file);
  if (!existsSync(outputFile)) continue;

  const source = readFileSync(outputFile, 'utf8');
  const patched = source.replace(/from ['"]core-wasm['"]/g, "from './core-wasm/core_wasm.js'");
  writeFileSync(outputFile, patched);
}
