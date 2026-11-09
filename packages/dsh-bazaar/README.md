# dsh-bazaar

DSH 插件：把 [DSH 插件市场](https://dshbazaar.io) 的目录渲染成插件页里的一个标签页。

- 宿主半侧：`GET /api/dsh-bazaar/catalog`，同源代理并缓存目录（默认 10 分钟）。
- 浏览器半侧：向 `plugins.tab` 注册「市场」标签页，搜索、按分类过滤、一键安装。
- 安装走插件页 owner 提供的 `install()`，不自己调 pnpm。

## 安装

```bash
dsh plugin --profile web add /绝对路径/packages/dsh-bazaar
```

装完刷新页面，打开 **设置 → 插件市场 → 市场**。

## 配置

宿主侧支持 `catalogUrl` 与 `timeoutMs`：

```yaml
# profile 的 cordis.patch.yml 中对应条目
- id: dsh-bazaar
  name: dsh-bazaar
  config:
    catalogUrl: https://your-site.example.com/api/catalog.json
```

默认指向 `DEFAULT_CATALOG_URL`（`lib/index.js`）。

## 约定

- 依赖：无；只 `require` 共享模块表里的 `react`。
- 安装脚本：无。
- 原生模块：无。
