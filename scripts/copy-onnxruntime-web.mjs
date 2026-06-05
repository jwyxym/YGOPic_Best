import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = process.cwd();
const sourceDir = join(root, 'node_modules', 'onnxruntime-web');
const targetDir = join(root, 'dist', 'onnxruntime-web');

if (!existsSync(sourceDir)) {
  throw new Error(`onnxruntime-web package not found: ${sourceDir}`);
}

mkdirSync(dirname(targetDir), { recursive: true });

if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true, force: true });
}

cpSync(sourceDir, targetDir, { recursive: true });
