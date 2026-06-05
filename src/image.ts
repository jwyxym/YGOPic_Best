import type { Box, CardCropProfile, RecognizerImageSource } from './types';

export const STANDARD_CARD: CardCropProfile = {
  width: 130,
  height: 186,
  left: 16,
  top: 34,
  right: 114,
  bottom: 131,
};

export const PENDULUM_CARD: CardCropProfile = {
  width: 405,
  height: 591,
  left: 26,
  top: 106,
  right: 379,
  bottom: 367,
};

export function createSourceCanvas(image: RecognizerImageSource): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Cannot create 2D canvas context for source image.');
  }

  ctx.drawImage(image, 0, 0);
  return ctx;
}

export function extractArtwork(
  ctx: CanvasRenderingContext2D,
  box: Box,
  cardProfile: CardCropProfile,
): ImageData {
  const crop = getArtworkCrop(box, cardProfile);
  return ctx.getImageData(
    Math.round(crop.left),
    Math.round(crop.top),
    Math.round(crop.width),
    Math.round(crop.height),
  );
}

export function upscaleForHash(imageData: ImageData, targetSize: number = 128): ImageData {
  if (imageData.width === targetSize && imageData.height === targetSize) {
    return imageData;
  }

  const source = document.createElement('canvas');
  source.width = imageData.width;
  source.height = imageData.height;

  const sourceCtx = source.getContext('2d');
  if (!sourceCtx) {
    throw new Error('Cannot create 2D canvas context for hash upscale source.');
  }
  sourceCtx.putImageData(imageData, 0, 0);

  const target = document.createElement('canvas');
  target.width = targetSize;
  target.height = targetSize;

  const targetCtx = target.getContext('2d');
  if (!targetCtx) {
    throw new Error('Cannot create 2D canvas context for hash upscale target.');
  }

  targetCtx.imageSmoothingEnabled = true;
  targetCtx.imageSmoothingQuality = 'high';
  targetCtx.drawImage(source, 0, 0, targetSize, targetSize);

  return targetCtx.getImageData(0, 0, targetSize, targetSize);
}

export class ImageProcessor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(private targetSize: number = 128) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = targetSize;
    this.canvas.height = targetSize;

    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Cannot create 2D canvas context for image processor.');
    }

    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  process(
    sourceCtx: CanvasRenderingContext2D,
    box: Box,
    cardProfile: CardCropProfile,
  ): Uint8Array {
    const crop = getArtworkCrop(box, cardProfile);

    this.ctx.drawImage(
      sourceCtx.canvas,
      crop.left,
      crop.top,
      crop.width,
      crop.height,
      0,
      0,
      this.targetSize,
      this.targetSize,
    );

    const imageData = this.ctx.getImageData(0, 0, this.targetSize, this.targetSize);
    return new Uint8Array(imageData.data.buffer);
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getDataURL(
    sourceCtx: CanvasRenderingContext2D,
    box: Box,
    cardProfile: CardCropProfile = STANDARD_CARD,
  ): string {
    this.process(sourceCtx, box, cardProfile);
    return this.canvas.toDataURL('image/png');
  }
}

function getArtworkCrop(box: Box, cardProfile: CardCropProfile): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const cardW = box.x2 - box.x1;
  const cardH = box.y2 - box.y1;
  const left = box.x1 + cardW * (cardProfile.left / cardProfile.width);
  const top = box.y1 + cardH * (cardProfile.top / cardProfile.height);
  const right = box.x1 + cardW * (cardProfile.right / cardProfile.width);
  const bottom = box.y1 + cardH * (cardProfile.bottom / cardProfile.height);

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}
