import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = process.cwd();
const sourceDir = join(root, 'public');
const targetDir = join(root, 'dist');

if (!existsSync(sourceDir)) {
  throw new Error(`onnxruntime-web package not found: ${sourceDir}`);
}

mkdirSync(dirname(targetDir), { recursive: true });

cpSync(sourceDir, targetDir, { recursive: true });
