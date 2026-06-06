# YGOPic_Best

原算法来自：[GetDeck](https://github.com/Souls-R/getdeck)

前端可用的游戏王卡图识别 TypeScript 库，封装了：

- 使用 `onnxruntime-web` 调用 YOLO 模型检测图片里的卡片区域
- 按标准卡 / 灵摆卡裁剪卡图并缩放到 hash 输入尺寸
- 调用 `core-wasm` 计算 pHash
- 使用 wasm `Database.find_best_match()` 返回候选识别结果

## 安装

```bash
npm install ygopic-best
```

## 准备资源

识别器启动时需要加载：

- YOLO 模型：默认路径是 `/best.onnx`
- hash 数据库：可以使用二进制 `/card_data`，也可以使用 JSON `/card_data.json`
- wasm 运行时：包内会使用构建后的 `core-wasm`，也可以通过 `wasmPath` 指定
- ONNX Runtime wasm：默认使用包内导入的 `onnxruntime-web` wasm 资源，也可以通过 `ortWasmPaths` 指定

如果你的项目把模型和数据库放在 `public` 目录，最常见的路径是：

```text
public/best.onnx
public/card_data
```

然后初始化时使用：

```ts
import { createYGOPicRecognizer } from 'ygopic-best';

const recognizer = await createYGOPicRecognizer({
  modelUrl: '/best.onnx',
  hashDbUrl: '/card_data',
});
```

## 生成 card_data

`card_data` 由 `core-wasm` 项目生成。准备一个图片文件夹，里面的卡图文件名需要是卡片 id，例如：

```text
images/
  89631139.jpg
  46986414.png
  14558127.jpeg
```

然后在 `core-wasm` 目录执行：

```bash
cd core-wasm
cargo run -- ../images
```

命令完成后会在 `core-wasm` 目录生成：

```text
core-wasm/card_data
```

把这个文件复制到前端项目的静态资源目录，例如：

```text
public/card_data
```

调用时传给 `hashDbUrl`：

```ts
const recognizer = await createYGOPicRecognizer({
  modelUrl: '/best.onnx',
  hashDbUrl: '/card_data',
});
```

## 快速调用

```ts
import { createYGOPicRecognizer } from 'ygopic-best';

const recognizer = await createYGOPicRecognizer({
  modelUrl: '/best.onnx',
  hashDbUrl: '/card_data',
  onModelDownloadProgress: (progress) => {
    console.log('model download:', progress);
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

`recognizeImage()` 会先检测整张图中的卡片框，再逐张识别。返回值已经按从上到下、从左到右排序。

## 返回结果

```ts
type RecognizedCard = {
  box: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    conf: number;
  };
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

说明：

- `matches` 最多返回 3 个候选结果，按 `distance` 从小到大排序
- `selectedMatchIndex` 默认是 `0`
- `artworkUrl` 只有在 `includeArtworkUrl: true` 时返回，是裁剪后的卡图 `data:image/png;base64,...`
- `hashStandard` 和 `hashPendulum` 分别是按标准卡、灵摆卡裁剪后得到的 hash

## 单独检测卡片框

```ts
const boxes = await recognizer.detectCards(image);
```

返回值：

```ts
type Box = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  conf: number;
};
```

## 重新识别单张卡

适合在前端让用户手动调整框选区域后重新识别：

```ts
const card = await recognizer.recognizeBox(image, editedBox, {
  includeArtworkUrl: true,
});
```

只匹配标准卡：

```ts
const card = await recognizer.recognizeBox(image, editedBox, {
  cardTypes: ['standard'],
});
```

只匹配灵摆卡：

```ts
const card = await recognizer.recognizeBox(image, editedBox, {
  cardTypes: ['pendulum'],
});
```

## 手动初始化

如果你想自己控制生命周期，可以直接创建实例：

```ts
import { YGOPicRecognizer } from 'ygopic-best';

const recognizer = new YGOPicRecognizer({
  modelUrl: '/best.onnx',
  hashDbJsonUrl: '/card_data.json',
});

await recognizer.initialize();

console.log(recognizer.isReady());
```

也可以读取内部 ONNX session 或 wasm 数据库：

```ts
const session = recognizer.getSession();
const database = recognizer.getDatabase();
```

## 使用二进制资源

如果你已经提前拿到了模型或数据库的 `ArrayBuffer`，可以直接传入，避免识别器再次请求网络。

```ts
const [model, hashDb] = await Promise.all([
  fetch('/best.onnx').then((res) => res.arrayBuffer()),
  fetch('/card_data').then((res) => res.arrayBuffer()),
]);

const recognizer = await createYGOPicRecognizer({
  model,
  hashDb,
});
```

也可以只传二进制数据库 URL：

```ts
const recognizer = await createYGOPicRecognizer({
  modelUrl: '/best.onnx',
  hashDbUrl: '/card_data',
});
```

如果你使用的是 JSON 格式数据库，则传给 `hashDbJsonUrl`：

```ts
const recognizer = await createYGOPicRecognizer({
  modelUrl: '/best.onnx',
  hashDbJsonUrl: '/card_data.json',
});
```

## 可调参数

```ts
const recognizer = await createYGOPicRecognizer({
  modelUrl: '/best.onnx',
  hashDbJsonUrl: '/card_data.json',

  // wasm 资源
  wasmPath: '/core_wasm_bg.wasm',
  ortWasmPaths: '/ort/',
  ortNumThreads: 1,

  // YOLO
  inputName: 'images',
  inputSize: 1280,
  confidenceThreshold: 0.7,
  iouThreshold: 0.5,
  executionProviders: ['wasm'],
  graphOptimizationLevel: 'all',

  // pHash 匹配
  hashSize: 128,
  sampleOffsets: [
    { dx: 0, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
  ],
  earlyExitDistance: 50,

  onModelDownloadProgress: (progress) => {
    console.log(progress);
  },
});
```

## 支持的图片输入

```ts
type RecognizerImageSource =
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageBitmap
  | OffscreenCanvas;
```

确保图片已经加载完成后再调用：

```ts
const image = new Image();
image.src = '/deck.jpg';
await image.decode();

const cards = await recognizer.recognizeImage(image);
```
