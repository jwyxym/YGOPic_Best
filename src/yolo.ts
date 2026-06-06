import * as ort from 'onnxruntime-web/wasm';
import type { Box, RecognizerImageSource, YoloPreprocessResult } from './types';

export const DEFAULT_INPUT_SIZE = 1280;
export const DEFAULT_CONF_THRESHOLD = 0.7;
export const DEFAULT_IOU_THRESHOLD = 0.5;

export function getImageSize(image: RecognizerImageSource): { width: number; height: number } {
  return {
    width: image.width,
    height: image.height,
  };
}

export function preprocessImage(
  image: RecognizerImageSource,
  inputSize: number = DEFAULT_INPUT_SIZE,
): YoloPreprocessResult {
  const canvas = document.createElement('canvas');
  canvas.width = inputSize;
  canvas.height = inputSize;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Cannot create 2D canvas context for YOLO preprocessing.');
  }

  const { width, height } = getImageSize(image);
  const scale = Math.min(inputSize / width, inputSize / height);
  const newW = Math.round(width * scale);
  const newH = Math.round(height * scale);
  const padX = (inputSize - newW) / 2;
  const padY = (inputSize - newH) / 2;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, inputSize, inputSize);
  ctx.drawImage(image, padX, padY, newW, newH);

  const imageData = ctx.getImageData(0, 0, inputSize, inputSize);
  const data = imageData.data;
  const planeSize = inputSize * inputSize;
  const float32Data = new Float32Array(3 * planeSize);

  for (let i = 0; i < planeSize; i++) {
    float32Data[i] = data[i * 4] / 255;
    float32Data[planeSize + i] = data[i * 4 + 1] / 255;
    float32Data[2 * planeSize + i] = data[i * 4 + 2] / 255;
  }

  return {
    tensor: new ort.Tensor('float32', float32Data, [1, 3, inputSize, inputSize]),
    scale,
    padX,
    padY,
  };
}

export function postprocessYOLO(
  output: ort.Tensor,
  scale: number,
  padX: number,
  padY: number,
  origW: number,
  origH: number,
  confidenceThreshold: number = DEFAULT_CONF_THRESHOLD,
  iouThreshold: number = DEFAULT_IOU_THRESHOLD,
): Box[] {
  const data = output.data as Float32Array;
  const dims = output.dims;
  const numBoxes = dims[2];
  const boxes: Box[] = [];

  for (let i = 0; i < numBoxes; i++) {
    const cx = data[0 * numBoxes + i];
    const cy = data[1 * numBoxes + i];
    const w = data[2 * numBoxes + i];
    const h = data[3 * numBoxes + i];
    const conf = data[4 * numBoxes + i];

    if (conf < confidenceThreshold) continue;

    boxes.push({
      x1: clamp((cx - w / 2 - padX) / scale, 0, origW),
      y1: clamp((cy - h / 2 - padY) / scale, 0, origH),
      x2: clamp((cx + w / 2 - padX) / scale, 0, origW),
      y2: clamp((cy + h / 2 - padY) / scale, 0, origH),
      conf,
    });
  }

  return nms(boxes, iouThreshold);
}

export function sortBoxesByRow(boxes: Box[]): Box[] {
  if (boxes.length === 0) return boxes;

  const sorted = [...boxes].sort((a, b) => a.y1 - b.y1);
  const avgHeight = sorted.reduce((sum, box) => sum + (box.y2 - box.y1), 0) / sorted.length;
  const rowThreshold = avgHeight * 0.3;
  const rows: Box[][] = [];
  let currentRow: Box[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y1 - currentRow[0].y1) < rowThreshold) {
      currentRow.push(sorted[i]);
    } else {
      rows.push(currentRow.sort((a, b) => a.x1 - b.x1));
      currentRow = [sorted[i]];
    }
  }

  rows.push(currentRow.sort((a, b) => a.x1 - b.x1));
  return rows.flat();
}

function nms(boxes: Box[], iouThreshold: number): Box[] {
  const candidates = [...boxes].sort((a, b) => b.conf - a.conf);
  const result: Box[] = [];

  while (candidates.length > 0) {
    const best = candidates.shift();
    if (!best) break;

    result.push(best);
    for (let i = 0; i < candidates.length; i++) {
      if (iou(best, candidates[i]) >= iouThreshold) {
        candidates.splice(i, 1);
        i--;
      }
    }
  }

  return result;
}

function iou(a: Box, b: Box): number {
  const interX1 = Math.max(a.x1, b.x1);
  const interY1 = Math.max(a.y1, b.y1);
  const interX2 = Math.min(a.x2, b.x2);
  const interY2 = Math.min(a.y2, b.y2);
  const interArea = Math.max(0, interX2 - interX1) * Math.max(0, interY2 - interY1);
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  const union = areaA + areaB - interArea;

  return union <= 0 ? 0 : interArea / union;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
