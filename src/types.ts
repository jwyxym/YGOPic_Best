import type * as ort from 'onnxruntime-web';

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  conf: number;
}

export interface Match {
  id: number;
  distance: number;
  cardType: string;
  dbHash: string;
}

export interface RecognizedCard {
  box: Box;
  index: number;
  matches: Match[];
  selectedMatchIndex: number;
  hashStandard: string;
  hashPendulum: string;
  artworkUrl?: string;
}

export interface CardHashEntry {
  id: number;
  phash: string;
  card_type: string;
}

export interface CardCropProfile {
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SampleOffset {
  dx: number;
  dy: number;
}

export type CardType = 'standard' | 'pendulum';

export type RecognizerImageSource =
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageBitmap
  | OffscreenCanvas;

export interface RecognitionProgress {
  stage: 'detecting' | 'identifying' | 'done';
  progress: number;
  index?: number;
  total?: number;
  current?: RecognizedCard;
}

export interface YGOPicRecognizerOptions {
  modelUrl?: string;
  hashDbJsonUrl?: string;
  wasmPath?: string;
  hashDbUrl?: string;
  model?: ArrayBuffer;
  hashDb?: ArrayBuffer;
  inputName?: string;
  executionProviders?: ort.InferenceSession.SessionOptions['executionProviders'];
  graphOptimizationLevel?: ort.InferenceSession.SessionOptions['graphOptimizationLevel'];
  ortWasmPaths?: string;
  ortNumThreads?: number;
  inputSize?: number;
  confidenceThreshold?: number;
  iouThreshold?: number;
  hashSize?: number;
  sampleOffsets?: SampleOffset[];
  earlyExitDistance?: number;
  onModelDownloadProgress?: (progress: number) => void;
}

export interface RecognizeImageOptions {
  includeArtworkUrl?: boolean;
  onProgress?: (progress: RecognitionProgress) => void;
}

export interface RecognizeBoxOptions {
  includeArtworkUrl?: boolean;
  cardTypes?: CardType[];
}

export interface YoloPreprocessResult {
  tensor: ort.Tensor;
  scale: number;
  padX: number;
  padY: number;
}
