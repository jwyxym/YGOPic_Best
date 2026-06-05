# YGOPic_Best

前端可用的游戏王卡图识别 TypeScript 库，封装了：

- `onnxruntime-web` 调用 YOLO 模型检测图片里的卡片区域
- 按标准卡 / 灵摆卡图片区裁剪并缩放到 hash 输入尺寸
- 调用 `core-wasm` 计算 pHash
- 使用 wasm `Database.find_best_match()` 返回候选识别结果

## 快速使用

```ts
import { createYGOPicRecognizer } from './YGOPic_Best/src';

const recognizer = await createYGOPicRecognizer({
  modelUrl: '/best.onnx',
  hashDbUrl: '/card_data',
  ortWasmPaths: '/ort/',
  ortNumThreads: 1,
  onModelDownloadProgress: (progress) => {
    console.log('model progress', progress);
  },
});

const image = document.querySelector('img')!;
const cards = await recognizer.recognizeImage(image, {
  includeArtworkUrl: true,
  onProgress: (state) => {
    console.log(state.stage, state.progress, state.current);
  },
});

console.log(cards);
```

返回的 `cards` 是按行排序后的结果：

```ts
type RecognizedCard = {
  box: { x1: number; y1: number; x2: number; y2: number; conf: number };
  index: number;
  matches: Array<{
    id: number;
    distance: number;
    cardType: string;
    dbHash: string;
  }>;
  selectedMatchIndex: number;
  hashStandard: string;
  hashPendulum: string;
  artworkUrl?: string;
};
```

## 单独检测卡片框

```ts
const boxes = await recognizer.detectCards(image);
```

## 重新识别单张卡

适合前端用户手动调整框选区域后重跑：

```ts
const card = await recognizer.recognizeBox(image, editedBox, {
  includeArtworkUrl: true,
});
```

只匹配灵摆卡或标准卡：

```ts
await recognizer.recognizeBox(image, editedBox, {
  cardTypes: ['pendulum'],
});
```

## 可调参数

```ts
const recognizer = await createYGOPicRecognizer({
  modelUrl: 'https://api.get-deck.com/best.onnx',
  hashDbUrl: '/card_data',
  inputName: 'images',
  inputSize: 1280,
  confidenceThreshold: 0.7,
  iouThreshold: 0.5,
  hashSize: 128,
  sampleOffsets: [
    { dx: 0, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
  ],
  earlyExitDistance: 50,
  executionProviders: ['wasm'],
  graphOptimizationLevel: 'all',
});
```
