# 3D 数字人对话 Demo

基于 `Vite + React + TypeScript + Three.js` 的 H5 demo：

- 左侧渲染一个轻量 3D 虚拟人物
- 右侧配置 OpenAI 兼容接口并直接对话
- 回复后触发浏览器 TTS 播报
- 播报过程中驱动人物头部和嘴型动画

## 启动

```bash
npm install
npm run dev
```

默认地址：

```text
http://localhost:5173
```

## 构建

```bash
npm run build
npm run preview
```

## 配置说明

- `API Base URL`：例如 `https://api.openai.com/v1`
- `API Key`：模型服务密钥
- `Model`：例如 `gpt-4o-mini`
- `系统提示词`：用于定义数字人的角色设定

配置会保存在浏览器本地 `localStorage`。

## 注意

- 当前是前端直连模型接口，只适合 demo
- 生产环境建议通过服务端代理隐藏 API Key
- 语音依赖浏览器 `speechSynthesis`，中文音色取决于浏览器和系统
- 如果后续要换真实角色，可以把当前几何体人物替换成 `glTF/VRM`
