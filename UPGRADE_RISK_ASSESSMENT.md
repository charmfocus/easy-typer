# 依赖与构建链升级风险评估

> 评估时间：2026-08-16（北京时间）
> 范围：MYW-160 目标 B 第 4 项。按架构师边界，本文只做评估，不实施任何大版本升级；实施须先经 leader 确认。

## 现状

| 依赖 | 当前版本 | 说明 |
| --- | --- | --- |
| Electron | ^22.0.0 | 已于 2023-10-10 停止支持（Chromium 108 / Node 16） |
| node-sass | ^8.0.0 | 已停止维护，作者官方建议迁移 dart-sass |
| sass-loader | ^10.4.1 | 与 node-sass / dart-sass 均可配合 |
| @vue/cli | ~4.5.0 | 5.x 为最后大版本，官方进入维护模式 |
| webpack | ^4.36.0 | Node 17+ 下 md4 哈希触发 `ERR_OSSL_EVP_UNSUPPORTED`（本机 Node 18 实测复现，需 `NODE_OPTIONS=--openssl-legacy-provider` 绕过） |
| Vue | ^2.6.11 | Vue 2 已于 2023-12 结束生命周期 |
| element-ui | ^2.15.0 | 仅支持 Vue 2 |

## 逐项评估

### 1. Electron 22 → 41/42/43（当前支持版本为 41/42/43，最新 43 = Chromium 150 / Node 24）

**收益**
- 脱离 EOL 近 3 年的运行时，Chromium/Node 安全补丁恢复到位（远程加载 `typer.owenyang.top`，内核漏洞会直接暴露给网络内容）。
- 新 Chromium 对 macOS arm64 的启动与渲染有持续优化。
- cliclick 为 universal binary、applescript 走子进程，均不受大版本影响。

**兼容风险**
- 主进程使用的 API（`app.dock.setIcon`、`globalShortcut`、`setWindowOpenHandler`、`contextBridge`、`Notification`）在 41~43 均仍受支持，预计无破坏性改动。
- `webPreferences` 默认值趋严：当前已是 `contextIsolation` 默认开启 + preload 桥接的写法，方向一致，风险低。
- 需要回归：F4 全局快捷键、发送成绩（applescript）、dock 图标、通知、窗口重建（activate/F4 路径）。
- 风险点：Electron 22→43 跨约 21 个大版本，需分步升级（22→28→33→…）或一次性直升 + 完整回归，建议直升并完整回归，避免多步折腾。

**工作量**：约 2~3 人日（升级 + 全功能回归 + 双架构出包验证）。
**结论**：**建议升级**（安全收益明确），按边界先回报 leader 批准后单独 issue 实施。

### 2. node-sass → dart-sass（sass）

**收益**
- node-sass 需要 node-gyp 原生编译：本机实测 Node 26 直接编译失败、arm64 预编译包镜像缺失（npmmirror 无 v8.0.0/darwin-arm64-108），新成员/新 CI 环境搭建成本高。dart-sass 纯 JS，无编译环节。
- 摆脱 node-sass 与 Node 版本的绑定（node-sass 8 最高支持到 Node 19）。

**兼容风险**（已扫描代码库）
- 全库无 `::v-deep` / `/deep/` / `/deep/` 选择器（0 处），无 Sass 除法语法（匹配到的 `/` 均为 CSS `url() ... 0/12px` 简写）。
- sass-loader 10 支持通过 `implementation` 指定 dart-sass，无需升级 sass-loader。
- 主要残留风险为少量弃用警告（如 `@import`），不影响产物。

**工作量**：约 0.5 人日（换依赖 + `yarn build` 对比产物）。
**结论**：**低风险高收益，建议尽快实施**（可与 vue-cli 升级解耦单独做）。

### 3. @vue/cli 4.5 → 5.x（带动 webpack 4 → 5）

**收益**
- webpack 5：解决 Node 17+ 的 OpenSSL md4 问题，无需 legacy-provider 绕过；持久缓存提升构建速度。
- Vue 2.7 内建组合式 API，为后续演进铺路。
- 移除已停维护的 node-sass 依赖链。

**兼容风险**
- `vue-cli-plugin-prerender-spa` + `prerender-spa-plugin`（Puppeteer 链）与 webpack 5 兼容性是该升级最大不确定项，可能需换用 `prerender-spa-plugin` 社区 fork 或自写脚本。
- `sitemap-webpack-plugin`、`raw-loader`（webpack5 需换 asset modules 或保留 loader）需逐一验证。
- CI 固定 Node 16，vue-cli 5 建议 Node 14+，可顺带升级 CI Node 版本。

**工作量**：约 3~5 人日（含预渲染链路验证与 CI 调整）。
**结论**：**中风险、收益中等**。若近期无 Node/CI 升级压力可缓做；做的话建议排在 node-sass 迁移之后。

### 4. webpack 4 → 5（单独升级）

不建议脱离 @vue/cli 单独升级：vue-cli 4 的 webpack 配置链与 webpack 5 深度耦合，单独替换等于手工重写整个构建配置。**随 @vue/cli 5 一并升级**即可。

### 5. 其他观察（非本 issue 任务，仅记录）

- Vue 2 / element-ui 均已 EOL，Vue 3 + Element Plus 迁移是一个独立的中型项目，收益主要在长期维护，性能收益有限。
- 渲染端 `element-ui` 全量引入（`Vue.use(ElementUI)`），web 侧首屏体积可用 `babel-plugin-component` 按需引入削减；桌面端渲染页面来自远程站点，此项不影响桌面安装包体积。

## 总结

| 项目 | 风险 | 收益 | 建议 |
| --- | --- | --- | --- |
| Electron 22→43 | 中 | 高（安全+arm64） | 回报 leader 后实施 |
| node-sass→sass | 低 | 高（构建链可用性） | 尽快实施 |
| @vue/cli 4.5→5 | 中 | 中 | 排在 sass 迁移后 |
| webpack 4→5 单独升级 | 高 | 中 | 不单独做，随 vue-cli 5 |
