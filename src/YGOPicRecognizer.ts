import * as ort from 'onnxruntime-web';
import initWasm, { Database, get_phash_raw } from 'core-wasm';
import { ImageProcessor, PENDULUM_CARD, STANDARD_CARD, createSourceCanvas } from './image';
import {
  DEFAULT_CONF_THRESHOLD,
  DEFAULT_INPUT_SIZE,
  DEFAULT_IOU_THRESHOLD,
  getImageSize,
  postprocessYOLO,
  preprocessImage,
  sortBoxesByRow,
} from './yolo';
import type {
  Box,
  CardHashEntry,
  CardType,
  Match,
  RecognizedCard,
  RecognizerImageSource,
  RecognizeBoxOptions,
  RecognizeImageOptions,
  SampleOffset,
  YGOPicRecognizerOptions,
} from './types';

export const DEFAULT_MODEL_URL = '/best.onnx';
export const DEFAULT_HASH_DB_URL = '/card_data.json';
export const DEFAULT_INPUT_NAME = 'images';
export const DEFAULT_HASH_SIZE = 128;
export const DEFAULT_EARLY_EXIT_DISTANCE = 50;

export const DEFAULT_SAMPLE_OFFSETS: SampleOffset[] = [
  { dx: 0, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
];

type MatchResult = {
  distance: number;
  matches: Match[];
  hashStandard: string;
  hashPendulum: string;
};

export class YGOPicRecognizer {
  private session: ort.InferenceSession | null = null;
  private database: Database | null = null;
  private initialized: Promise<void> | null = null;

  private readonly options: Required<
    Pick<
      YGOPicRecognizerOptions,
      | 'modelUrl'
      | 'hashDbJsonUrl'
      | 'inputName'
      | 'inputSize'
      | 'confidenceThreshold'
      | 'iouThreshold'
      | 'hashSize'
      | 'sampleOffsets'
      | 'earlyExitDistance'
    >
  > &
    Omit<
      YGOPicRecognizerOptions,
      | 'modelUrl'
      | 'hashDbJsonUrl'
      | 'inputName'
      | 'inputSize'
      | 'confidenceThreshold'
      | 'iouThreshold'
      | 'hashSize'
      | 'sampleOffsets'
      | 'earlyExitDistance'
    >;

  constructor(options: YGOPicRecognizerOptions = {}) {
    this.options = {
      modelUrl: options.modelUrl ?? DEFAULT_MODEL_URL,
      hashDbJsonUrl: options.hashDbUrl ?? DEFAULT_HASH_DB_URL,
      hashDbUrl: options.hashDbUrl ?? undefined,
      wasmPath: options.wasmPath ?? undefined,
      model: options.model ?? undefined,
      hashDb: options.hashDb ?? undefined,
      inputName: options.inputName ?? DEFAULT_INPUT_NAME,
      executionProviders: options.executionProviders ?? ['wasm'],
      graphOptimizationLevel: options.graphOptimizationLevel ?? 'all',
      ortWasmPaths: options.ortWasmPaths,
      ortNumThreads: options.ortNumThreads,
      inputSize: options.inputSize ?? DEFAULT_INPUT_SIZE,
      confidenceThreshold: options.confidenceThreshold ?? DEFAULT_CONF_THRESHOLD,
      iouThreshold: options.iouThreshold ?? DEFAULT_IOU_THRESHOLD,
      hashSize: options.hashSize ?? DEFAULT_HASH_SIZE,
      sampleOffsets: options.sampleOffsets ?? DEFAULT_SAMPLE_OFFSETS,
      earlyExitDistance: options.earlyExitDistance ?? DEFAULT_EARLY_EXIT_DISTANCE,
      onModelDownloadProgress: options.onModelDownloadProgress,
    };
  }

  async initialize(): Promise<void> {
    if (!this.initialized) {
      this.initialized = this.load();
    }

    return this.initialized;
  }

  isReady(): boolean {
    return Boolean(this.session && this.database);
  }

  getSession(): ort.InferenceSession | null {
    return this.session;
  }

  getDatabase(): Database | null {
    return this.database;
  }

  async detectCards(image: RecognizerImageSource): Promise<Box[]> {
    await this.initialize();
    const session = this.requireSession();
    const { width, height } = getImageSize(image);
    const { tensor, scale, padX, padY } = preprocessImage(image, this.options.inputSize);
    const results = await session.run({ [this.options.inputName]: tensor });
    const output = results[Object.keys(results)[0]];

    return sortBoxesByRow(
      postprocessYOLO(
        output,
        scale,
        padX,
        padY,
        width,
        height,
        this.options.confidenceThreshold,
        this.options.iouThreshold,
      ),
    );
  }

  async recognizeImage(
    image: RecognizerImageSource,
    options: RecognizeImageOptions = {},
  ): Promise<RecognizedCard[]> {
    await this.initialize();

    options.onProgress?.({ stage: 'detecting', progress: 0 });
    const boxes = await this.detectCards(image);
    const sourceCtx = createSourceCanvas(image);
    const imageProcessor = new ImageProcessor(this.options.hashSize);
    const cards: RecognizedCard[] = boxes.map((box, index) => ({
      box,
      index,
      matches: [],
      selectedMatchIndex: 0,
      hashStandard: '',
      hashPendulum: '',
    }));

    for (let i = 0; i < boxes.length; i++) {
      const result = this.matchBox(sourceCtx, boxes[i], imageProcessor);
      cards[i] = {
        ...cards[i],
        matches: result.matches,
        hashStandard: result.hashStandard,
        hashPendulum: result.hashPendulum,
        artworkUrl: options.includeArtworkUrl
          ? imageProcessor.getDataURL(sourceCtx, boxes[i], STANDARD_CARD)
          : undefined,
      };

      options.onProgress?.({
        stage: 'identifying',
        progress: boxes.length === 0 ? 100 : Math.round(((i + 1) / boxes.length) * 100),
        index: i + 1,
        total: boxes.length,
        current: cards[i],
      });

      if ((i + 1) % 10 === 0) {
        await nextFrame();
      }
    }

    options.onProgress?.({ stage: 'done', progress: 100 });
    return cards;
  }

  async recognizeBox(
    image: RecognizerImageSource,
    box: Box,
    options: RecognizeBoxOptions = {},
  ): Promise<RecognizedCard> {
    await this.initialize();

    const sourceCtx = createSourceCanvas(image);
    const imageProcessor = new ImageProcessor(this.options.hashSize);
    const result = this.matchBox(sourceCtx, box, imageProcessor, options.cardTypes);

    return {
      box,
      index: 0,
      matches: result.matches,
      selectedMatchIndex: 0,
      hashStandard: result.hashStandard,
      hashPendulum: result.hashPendulum,
      artworkUrl: options.includeArtworkUrl
        ? imageProcessor.getDataURL(sourceCtx, box, STANDARD_CARD)
        : undefined,
    };
  }

  private async load(): Promise<void> {
    if (this.options.ortWasmPaths) {
      ort.env.wasm.wasmPaths = this.options.ortWasmPaths;
    }

    if (typeof this.options.ortNumThreads === 'number') {
      ort.env.wasm.numThreads = this.options.ortNumThreads;
    }

    const [modelBuffer, hashDatabase] = await Promise.all([
      fetchArrayBuffer(this.options.modelUrl, this.options.onModelDownloadProgress, this.options.model),
      (async () => {
        if (this.options.hashDb)
          return this.options.hashDb;
        else if (this.options.hashDbUrl) {
          const res = await fetch(this.options.hashDbUrl);
          return await res.arrayBuffer();
        } else
          return await fetchJson<CardHashEntry[]>(this.options.hashDbJsonUrl);
      })(),
      initWasm(this.options.wasmPath),
    ]);

    this.session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: this.options.executionProviders,
      graphOptimizationLevel: this.options.graphOptimizationLevel,
    });

    this.database = new Database();
    Array.isArray(hashDatabase)
      ? this.database.load_database_from_str(JSON.stringify(hashDatabase))
      : this.database.load_database(new Uint8Array(hashDatabase));
  }

  private matchBox(
    sourceCtx: CanvasRenderingContext2D,
    box: Box,
    imageProcessor: ImageProcessor,
    cardTypes: CardType[] = ['standard', 'pendulum'],
  ): MatchResult {
    const database = this.requireDatabase();
    let best: MatchResult = {
      distance: Infinity,
      matches: [],
      hashStandard: '',
      hashPendulum: '',
    };

    for (let i = 0; i < this.options.sampleOffsets.length; i++) {
      const offset = this.options.sampleOffsets[i];
      const sampleBox = {
        ...box,
        x1: box.x1 + offset.dx,
        y1: box.y1 + offset.dy,
        x2: box.x2 + offset.dx,
        y2: box.y2 + offset.dy,
      };

      const dataStandard = imageProcessor.process(sourceCtx, sampleBox, STANDARD_CARD);
      const dataPendulum = imageProcessor.process(sourceCtx, sampleBox, PENDULUM_CARD);
      const hashStandard = get_phash_raw(dataStandard, this.options.hashSize, this.options.hashSize);
      const hashPendulum = get_phash_raw(dataPendulum, this.options.hashSize, this.options.hashSize);
      const allMatches = this.findMatches(database, hashStandard, hashPendulum, cardTypes);
      const distance = allMatches[0]?.distance ?? Infinity;

      if (distance < best.distance) {
        best = {
          distance,
          matches: allMatches.slice(0, 3),
          hashStandard,
          hashPendulum,
        };
      }

      if (i === 0 && distance < this.options.earlyExitDistance) {
        break;
      }
    }

    return best;
  }

  private findMatches(
    database: Database,
    hashStandard: string,
    hashPendulum: string,
    cardTypes: CardType[],
  ): Match[] {
    const matches: Match[] = [];

    if (cardTypes.includes('standard')) {
      matches.push(...normalizeMatches(database.find_best_match(hashStandard, 'standard')));
    }

    if (cardTypes.includes('pendulum')) {
      matches.push(...normalizeMatches(database.find_best_match(hashPendulum, 'pendulum')));
    }

    return matches.sort((a, b) => a.distance - b.distance);
  }

  private requireSession(): ort.InferenceSession {
    if (!this.session) {
      throw new Error('YGOPicRecognizer is not initialized.');
    }

    return this.session;
  }

  private requireDatabase(): Database {
    if (!this.database) {
      throw new Error('YGOPicRecognizer database is not initialized.');
    }

    return this.database;
  }
}

export async function createYGOPicRecognizer(
  options: YGOPicRecognizerOptions = {},
): Promise<YGOPicRecognizer> {
  const recognizer = new YGOPicRecognizer(options);
  await recognizer.initialize();
  return recognizer;
}

async function fetchArrayBuffer(
  url: string,
  onProgress?: (progress: number) => void,
  model?: ArrayBuffer
): Promise<ArrayBuffer> {
  if (model)
    return model;
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) {
    throw new Error(`Failed to load model: ${response.status} ${response.statusText}`);
  }

  const total = Number(response.headers.get('content-length') ?? 0);
  if (!response.body || total <= 0) {
    return response.arrayBuffer();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(Math.round((received / total) * 100));
  }

  const buffer = new Uint8Array(received);
  let position = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, position);
    position += chunk.length;
  }

  return buffer.buffer;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load hash database: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function normalizeMatches(rawMatches: Array<any>): Match[] {
  return rawMatches.map((match) => ({
    id: match.id,
    distance: match.distance,
    cardType: match.cardType,
    dbHash: match.dbHash,
  }));
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}
