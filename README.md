# Carta 手机端

这是独立源码目录，可以单独复制或上传 GitHub。公共内核、组件、能力与工具在本目录中各自保存，没有引用另一份源码。平台页面已分开；底层模块和平台组合声明保留完整副本，以维持类型和能力边界。

需要 Node.js 24+、pnpm 10.33.0；原生构建另需 Rust 和对应平台 SDK。

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build:android
# Android APK（需 Android SDK / NDK）
pnpm android:build
# iOS（需 Xcode）
pnpm ios:build
```

build:android 生成网页前端资源，android:build 才生成 APK。正式签名通过 TAURI_ANDROID_KEYSTORE、TAURI_ANDROID_KEYSTORE_PASSWORD、TAURI_ANDROID_KEY_ALIAS、TAURI_ANDROID_KEY_PASSWORD 环境变量配置；证书不包含在源码中。155.53 MB 是旧正式 APK 的大小，新构建大小可能变化。

名称变更沿用当前工作树：应用 ID 为 one.carta.reader。旧 Paper 数据的自动迁移尚未完成，发布前需验证。历史安装包、用户书库、依赖与编译缓存不包含在源码中。完整历史架构脚本中仍有多端断言，拆分后的全量测试尚需适配；以各端类型检查和构建结果为准。
