# DSH Bazaar · DSH 插件市场

一个 DeepSeek Harness（DSH）插件市场的骨架，包含三层：

> 名字：npm 包名与安装标识用 `dsh-bazaar`（“集市”），站点品牌暂时仍显示「DSH 插件市场」。两者可以分开改：包名发布后不宜再动，品牌随时可换。

| 层 | 目录 | 作用 |
|---|---|---|
| 数据 | `scripts/fetch-catalog.mjs` → `data/repos.json` | 按创建时间窗口分多次搜 GitHub `dsh-plugin` 话题（单查询上限 1000），读 `package.json`、README、npm 发布状态与默认分支 commit |
| 索引 + 站点 | `scripts/build-index.mjs`、`scripts/build-site.mjs` → `public/` | 生成市场索引（format 1）与中英双语静态站点（SEO 头、结构化数据、分页、教程、三份 sitemap） |
| 应用内市场 | `packages/dsh-bazaar/` | 一个 DSH 插件，把同一份目录渲染进「设置 → 插件市场」的 `plugins.tab` |

## 快速开始

```bash
node scripts/fetch-catalog.mjs     # 抓取（默认 100 个仓库）
node scripts/build-index.mjs       # 生成 public/api/{index,catalog}.json
node scripts/build-site.mjs        # 生成 public/ 静态站点
node scripts/serve.mjs 4188        # http://127.0.0.1:4188/zh/
```

没有依赖需要安装，Node ≥ 22 即可。一条命令跑完三步：`npm run build`。

环境变量：

| 变量 | 默认 | 说明 |
|---|---|---|
| `GITHUB_TOKEN` | 空 | 提高 GitHub API 限额；不会被打印或写进产物 |
| `DSH_MARKET_TOP_STARS` | `1000` | 按 star 排名收录的前 N 个仓库 |
| `DSH_MARKET_NEW_DAYS` | `30` | 新插件窗口（天） |
| `DSH_MARKET_NEW_TOP` | `200` | 该窗口内额外收录的仓库数（0 关闭） |
| `DSH_MARKET_LIMIT` | `1200` | 抽样总量硬上限（≤ 3000） |
| `DSH_MARKET_RETAIN_MAX` | `1500` | 抽样之外保留页面的上限（按 star 排序） |
| `DSH_MARKET_STATE` | `.catalog-state.json` | 已收录仓库状态文件，用于保留页面 |
| `DSH_MARKET_SITE_URL` | `https://dshbazaar.io` | 站点绝对地址，用于 sitemap 与索引里的 icon 解析 |

## 产物

- `public/api/index.json` — **市场索引 format 1**，DSH 自带 `dsh-plugin-market` 直接读这个格式。已用 DSH 内置的 `parseMarketIndex` 校验通过。
- `public/api/catalog.json` — 站点与应用内插件渲染的扁平目录（含 `installSpec`、star、更新时间等）。`plugins` 是当天的抽样，`retained` 是保留页面对应的条目。
- `public/{zh,en}/…` — 首页、分页列表、11 个分类页、每个插件的详情页（含渲染后的仓库 README）、话题标签页（`/t/…`）、教程、提交与关于页。
- `public/sitemap.xml` 是索引，指向 `sitemaps/pages.xml`、`categories.xml`、`plugins.xml`、`tags.xml`；每个 URL 带 `lastmod`（插件页按仓库最近推送时间）与 `zh-CN / en / x-default` 三条 alternate。

## SEO 基线

每页都有 canonical、三向 hreflang、Open Graph 与 Twitter 卡片；结构化数据覆盖 `WebSite`（首页）、`CollectionPage` + `ItemList`（列表）、`SoftwareApplication` + `BreadcrumbList`（插件页）、`TechArticle`（教程）。`assets/og.png` 是分享图（暖白底，与默认亮色主题一致，暗色版留在 `site/assets/og-dark.png` 备用），在 `site/assets/` 下维护。

列表按 48 条分页；插件详情页会抓取仓库 README 的纯文本（最多 4000 字符）作为正文，避免薄内容。

## 收录规则

1. 仓库带 `dsh-plugin` 话题；
2. 通过相关性过滤：声明了 `dsh.bundle`、声明了 `engines.dsh`/`@deepseek-ai/dsh-*` peer，或名称/描述/话题里明确提到 DSH；`deepseek-ai` 官方仓库排除；
3. 有可安装来源：优先 npm 正式版本（`name@version`），否则回退到固定默认分支 commit 的 git 源；
4. 包名唯一：format 1 不允许重复的 `name`，冲突时按「verified 优先、star 高优先」保留第一条，其余丢弃并在构建输出里打印两个仓库地址；
5. 非 `deepseek-ai` 仓库不得声明 `@deepseek-ai/*` 包名，避免在「发现」页伪装成官方包；
6. 能通过市场索引 format 1 校验才会写进 `index.json`；构建末尾还会再断言一次包名唯一。

`verified` 只表示**仓库声明了 `dsh.bundle.patch`**，不代表安全审计。收录不是背书。

## 抽样与保留页

话题下有 3 万多个仓库，站点只维护一个固定大小的抽样，而不是镜像：按 star 排名的前 `DSH_MARKET_TOP_STARS` 个，加上 `DSH_MARKET_NEW_DAYS` 天内新建的前 `DSH_MARKET_NEW_TOP` 个。

抽样的边界每天都在动。为了让详情页 URL 不跟着消失：

- `.catalog-state.json` 记录所有曾经收录过的仓库；下次构建时，掉出抽样的仓库会被单独复核一遍；
- 仓库仍存在且未归档 → 继续生成详情页（数据照常从 GitHub 现拉），但**不进列表、标签页、首页和 `index.json`**，排在 `catalog.json` 的 `retained` 里；
- 仓库 404 或已归档 → 页面下架；
- 复核失败（限流、超时）不算下架，下次构建重试。

`.catalog-state.json` 是种子文件 + CI 缓存：本地没有缓存时会从仓库里那份开始。抽样之外的保留页面超过 `DSH_MARKET_RETAIN_MAX` 时，按 star 从低到高淘汰。

> GitHub Pages 不能按路径返回 410，下架的页面只能退回 404。要让「已删除」和「不存在」在状态码上区分，需要在前面加一层能设响应头的 CDN。

## 应用内插件

```bash
dsh plugin --profile web add /绝对路径/dsh-bazaar/packages/dsh-bazaar
```

它做两件事：

- 宿主半侧注册两条同源路由：`GET /api/dsh-bazaar/catalog`（代理并缓存目录）与 `GET /api/dsh-bazaar/installed`（读宿主 `pluginManager.listBundles()`，供已安装与更新判断）；
- 浏览器半侧向 `plugins.tab` 注册一个「市集」标签页，内含 **发现 / 已安装 / 更新** 三个视图；安装调用标签页 owner 提供的 `install({ spec, registry, title, version })`，**实际安装仍由宿主插件管理器执行**。

从仓库安装（尚未发布 npm）：

```bash
dsh plugin --profile web add 'git+https://github.com/dshbazaar/dshbazaar.git#main&path:/packages/dsh-bazaar'
```

本地开发时也可以直接装目录：`dsh plugin --profile web add /绝对路径/packages/dsh-bazaar`。

`node scripts/test-plugin.mjs` 会验证：客户端 bundle 能在 `window.__ModuleLoader__` 下加载并注册 `plugins.tab`、字典注册成功、宿主路由注册成功并返回目录 JSON。它**不**验证标签页在真实 DSH 里的渲染效果。

## 尚未验证 / 下一步

- 未在真实 DSH 进程里安装并截图验证标签页（避免改动当前 desktop profile）；
- 详情页还没有 README 正文（索引里目前只有描述）；
- 分类靠关键词推断，没有人工审核队列；
- 没有增量抓取与缓存，每次全量扫描；
- 索引地址默认占位符，部署后需要设置 `DSH_MARKET_SITE_URL`。

## 部署

站点是纯静态目录，`public/` 直接丢给任意静态托管即可。部署后：

1. 设置 `DSH_MARKET_SITE_URL` 重新构建，修正 sitemap 与图标解析；
2. 在 DSH 的插件市场设置里把 `…/api/index.json` 加为索引源；
3. 若要发布应用内插件，把 `packages/dsh-bazaar` 的 `name`/`version` 定好再 `npm publish`（当前是本地骨架，未发布）。
