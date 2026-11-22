# KB Music 原生版

多音源免费音乐聚合应用。**React Native 原生组件渲染 + TypeScript 严格类型检查**，非 WebView 网页套壳。

## 特性
- 原生播放：react-native-track-player，支持后台播放
- 多音源聚合：网易云 / QQ / 酷狗 / 酷我 / 咪咕 / Jamendo / iTunes，自动去重排序
- 免费优先：≥45 秒的完整音源优先播放，30 秒试听靠后，失败源自动跳过
- 纯本地存储：收藏、队列、昵称、好友、音乐符全部保存在本机，无账号无数据库
- 严格类型：tsconfig 开启全部 strict 选项与 noUnusedLocals / noImplicitReturns

## 本地开发
```bash
npm install
npm run typecheck      # 严格类型检查
npm run android        # 运行到设备/模拟器
```

## 构建 APK
推送到 GitHub 仓库 main 分支，Actions 自动构建；或手动触发 workflow_dispatch。
产物在 Actions 的 Artifacts 中下载，打 tag（如 v1.0.0）会自动发布到 Release。

## 创始人
靠北（靠北科技）。「靠北」仅为项目名称，没有实际意义。
