import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, lstatSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

// Standalone source snapshots. Never copy the working library or build caches.
const root = resolve(import.meta.dirname, '..')
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean)
const allowed = /^(src\/|src-tauri\/|scripts\/|tests\/|patches\/|[^/]+\.(?:json|yaml|toml|ts|html)$|\.dependency-cruiser\.cjs$|\.nvmrc$|\.gitignore$|LICENSE$|THIRD-PARTY-NOTICES\.md$)/
for (const variant of ['mobile', 'desktop-web']) {
  const dest = resolve(root, variant)
  if (existsSync(dest)) throw new Error(`Refusing to overwrite ${dest}`)
  const mobile = variant === 'mobile'
  for (const file of new Set(files)) {
    if (!allowed.test(file) || !existsSync(resolve(root, file))) continue
    if (/\/(?:target|build|node_modules|\.gradle)\//.test(file)) continue
    if (/\.(?:key|p12|jks|keystore)$/.test(file)) continue
    if (mobile && /^(?:src\/app\/web\/|src\/main\.web\.tsx$|src\/main\.tsx$|index\.web\.html$|index\.html$)/.test(file)) continue
    if (!mobile && /^(?:src\/app\/mobile\/|src\/main\.mobile\.tsx$|index\.mobile\.html$|src-tauri\/gen\/)/.test(file)) continue
    const source = resolve(root, file)
    if (!lstatSync(source).isFile()) continue
    const target = resolve(dest, file)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(source, target)
  }
  const edit = (file, fn) => {
    const target = resolve(dest, file)
    if (existsSync(target)) writeFileSync(target, fn(readFileSync(target, 'utf8')))
  }
  if (mobile) {
    for (const name of ['content', 'marks', 'positions', 'pdfRange', 'useTapToTurn', 'tapToTurn', 'wireRow', 'channel']) {
      const target = resolve(dest, 'src/app/shared', `${name}.ts`)
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(resolve(root, 'src/app/web', `${name}.ts`), target)
    }
    for (const file of files.filter(f => f.startsWith('src/app/mobile/'))) {
      edit(file, s => s.replaceAll('../web/', '../shared/'))
    }
  }
  edit('tsconfig.app.json', s => s.replace(/"files": \[[^\]]+\]/, `"files": ${JSON.stringify(mobile ? ['src/main.mobile.tsx', 'src/vite-env.d.ts'] : ['src/main.tsx', 'src/main.web.tsx', 'src/vite-env.d.ts'])}`))
  edit('package.json', s => {
    const p = JSON.parse(s)
    p.name = `carta-${variant}`
    for (const key of Object.keys(p.scripts)) {
      if (mobile ? /desktop|web|cli|shot:client/.test(key) : /ios|android/.test(key)) delete p.scripts[key]
    }
    if (mobile) {
      p.scripts.dev = 'TAURI_ENV_PLATFORM=android vite'
      p.scripts.predev = 'node scripts/sync-pdfjs-assets.mjs'
      p.scripts.prebuild = 'node scripts/sync-pdfjs-assets.mjs'
      p.scripts.build = 'pnpm typecheck && pnpm build:android'
      p.scripts.app = 'pnpm android'
      p.scripts['build:all'] = 'pnpm typecheck && pnpm build:android && pnpm build:ios'
      delete p.bin
    } else p.scripts['build:all'] = 'pnpm typecheck && pnpm build:desktop && pnpm build:web'
    return JSON.stringify(p, null, 2) + '\n'
  })
  if (mobile) edit('vite.config.ts', s => s.replace('const PLATFORM = selectPlatform()', "process.env.TAURI_ENV_PLATFORM ||= 'android'\nconst PLATFORM = selectPlatform()"))
  edit('src-tauri/gen/android/app/build.gradle.kts', s => s
    .replace(/System\.getenv\("TAURI_ANDROID_KEYSTORE"\) \?: "[^"]*"/g, 'System.getenv("TAURI_ANDROID_KEYSTORE") ?: ""')
    .replace(/System\.getenv\("TAURI_ANDROID_KEYSTORE_PASSWORD"\) \?: "[^"]*"/g, 'System.getenv("TAURI_ANDROID_KEYSTORE_PASSWORD")')
    .replace(/System\.getenv\("TAURI_ANDROID_KEY_PASSWORD"\) \?: "[^"]*"/g, 'System.getenv("TAURI_ANDROID_KEY_PASSWORD")')
    .replace(/System\.getenv\("TAURI_ANDROID_KEY_ALIAS"\) \?: "[^"]*"/g, 'System.getenv("TAURI_ANDROID_KEY_ALIAS")')
    .replace(/keystoreFile\.exists\(\)/g, 'keystorePath.isNotBlank() && keystoreFile.isFile')
    .replace(/file\(keystorePath\)\.exists\(\)/g, 'keystorePath.isNotBlank() && file(keystorePath).isFile'))
  writeFileSync(resolve(dest, 'README.md'), `# Carta ${mobile ? '手机端' : '桌面端与网页端'}\n\n这是独立源码目录，可以单独复制或上传 GitHub。公共内核、组件、能力与工具在本目录中各自保存，没有引用另一份源码。平台页面已分开；底层模块和平台组合声明保留完整副本，以维持类型和能力边界。\n\n需要 Node.js 24+、pnpm 10.33.0；原生构建另需 Rust 和对应平台 SDK。\n\n\`\`\`sh\npnpm install --frozen-lockfile\npnpm typecheck\n${mobile ? 'pnpm build:android\n# Android APK（需 Android SDK / NDK）\npnpm android:build\n# iOS（需 Xcode）\npnpm ios:build' : 'pnpm build:all\n# 桌面原生安装包\npnpm tauri build'}\n\`\`\`\n\n${mobile ? 'build:android 生成网页前端资源，android:build 才生成 APK。正式签名通过 TAURI_ANDROID_KEYSTORE、TAURI_ANDROID_KEYSTORE_PASSWORD、TAURI_ANDROID_KEY_ALIAS、TAURI_ANDROID_KEY_PASSWORD 环境变量配置；证书不包含在源码中。155.53 MB 是旧正式 APK 的大小，新构建大小可能变化。' : 'dist/ 是桌面前端，dist-web/ 是浏览器前端；浏览器客户端需要桌面端的书库服务。'}\n\n名称变更沿用当前工作树：应用 ID 为 one.carta.reader。旧 Paper 数据的自动迁移尚未完成，发布前需验证。历史安装包、用户书库、依赖与编译缓存不包含在源码中。完整历史架构脚本中仍有多端断言，拆分后的全量测试尚需适配；以各端类型检查和构建结果为准。\n`)
  console.log(`${variant}: source copied to ${dest}`)
}
