/** Hand-written guides; bodies are trusted HTML authored in this repository. */
export const GUIDES = [
  {
    slug: 'install',
    title: { zh: '安装 DSH 插件', en: 'Install a DSH plugin' },
    description: {
      zh: '一条命令把社区插件装进 DeepSeek Harness 的 web profile，含版本兼容与安装脚本的处理。',
      en: 'Install a community plugin into the DeepSeek Harness web profile with one command, including version and build-script handling.',
    },
    body: {
      zh: `<p>DSH 的插件安装走宿主自己的包管理器，本质是往 profile 目录里加一个依赖，再把它的组合包补丁插进启动配置。</p>
<h2>一条命令</h2>
<pre class="code"><span class="p">$</span> dsh plugin --profile web add &lt;包名或来源&gt;</pre>
<p>来源可以是 npm 包名（<code>some-plugin</code>）、固定到提交的 Git 地址、本地目录或 tgz。执行后 DSH 会调用 pnpm 安装，写入 profile 的 <code>package.json</code>，并在 <code>cordis.patch.yml</code> 里插入插件条目。</p>
<h2>装完为什么没反应</h2>
<p>两种生效方式：</p>
<ul>
<li>启用了 HMR 的 profile：插件会热加载，刷新页面即可看到新页签或设置项；</li>
<li>没启用 HMR：需要重启 DSH，否则条目已写入但未加载。</li>
</ul>
<h2>版本不兼容会直接拒绝</h2>
<p>安装前宿主会检查插件的 <code>engines.dsh</code>（没有则看 <code>@deepseek-ai/dsh-*</code> 的 peer 依赖）是否接受当前 DSH 版本。不接受时<strong>不会下载任何东西</strong>，也不会运行安装脚本。确认风险后可以授予精确版本的豁免，再用同一命令重试。</p>
<h2>安装脚本默认被拦截</h2>
<p>pnpm 11 会拦下依赖的构建脚本。安装失败时回执里带 <code>pendingBuilds</code>，需要你明确批准后重试；批准会以宿主用户权限执行命令，请先确认这个包确实需要构建。</p>`,
      en: `<p>DSH installs plugins through its own package manager: the plugin becomes a dependency of the profile, and its bundle patch is inserted into the startup configuration.</p>
<h2>One command</h2>
<pre class="code"><span class="p">$</span> dsh plugin --profile web add &lt;package or source&gt;</pre>
<p>The source can be an npm name, a git URL pinned to a commit, a local directory, or a tarball. DSH runs pnpm, records the dependency in the profile, and inserts the plugin row into <code>cordis.patch.yml</code>.</p>
<h2>Why nothing happened</h2>
<p>With HMR the plugin loads in place — refresh the page. Without HMR the row is written but not loaded until DSH restarts.</p>
<h2>Incompatible versions are refused up front</h2>
<p>Before running pnpm, the host checks the plugin's <code>engines.dsh</code> (or its <code>@deepseek-ai/dsh-*</code> peer ranges) against the running DSH version. A mismatch installs nothing and runs no scripts; you can grant an exact-version exemption and retry.</p>
<h2>Build scripts are blocked by default</h2>
<p>pnpm 11 blocks dependency build scripts. A failed install reports <code>pendingBuilds</code>; approve them explicitly and retry, knowing they run with your user's permissions.</p>`,
    },
  },
  {
    slug: 'update-remove',
    title: { zh: '更新与卸载插件', en: 'Update and remove plugins' },
    description: {
      zh: 'DSH 插件的更新、卸载与回退：为什么更新需要先卸载，以及失败时会留下什么。',
      en: 'How updating, removing and rolling back a DSH plugin works, and what a failed update leaves behind.',
    },
    body: {
      zh: `<p>更新和卸载都发生在 profile 这一层，插件本身不参与。</p>
<h2>更新</h2>
<pre class="code"><span class="p">$</span> dsh plugin --profile web update &lt;包名&gt;</pre>
<p>插件的市场页会对比已装版本与目录里的版本，发现更新时按钮变成「更新」。实际执行时宿主<strong>先卸载旧版本再装新版本</strong>，因此中间会有一段插件不在运行的时间。</p>
<h2>卸载</h2>
<pre class="code"><span class="p">$</span> dsh plugin --profile web remove &lt;包名&gt;</pre>
<p>卸载会取消选择、卸载运行时贡献、执行 pnpm remove，然后发布新的运行时解析表。任一步失败都不会继续后面的步骤。</p>
<h2>失败时会怎样</h2>
<p>安装失败会恢复 <code>package.json</code> 和 <code>pnpm-lock.yaml</code> 到操作前的快照，但<strong>已经下载的文件和已批准脚本的副作用可能留下</strong>。更新失败时宿主会尝试重装被移除的旧版本；重装也失败，这个包就处于未安装状态，不会自动回滚到“一切如初”。</p>
<p>所以对生产 profile：先在测试 profile 里验证新版本，再更新。</p>`,
      en: `<p>Updates and removals happen at the profile layer; the plugin itself is not involved.</p>
<h2>Update</h2>
<pre class="code"><span class="p">$</span> dsh plugin --profile web update &lt;package&gt;</pre>
<p>An update removes the installed version first, then installs the target, so the plugin is briefly not running.</p>
<h2>Remove</h2>
<pre class="code"><span class="p">$</span> dsh plugin --profile web remove &lt;package&gt;</pre>
<p>Removal deselects the bundle, unloads its runtime contributions, runs <code>pnpm remove</code>, then publishes the new resolution table. A failing step stops the sequence.</p>
<h2>What a failure leaves</h2>
<p>Install failures restore <code>package.json</code> and the lockfile, but downloaded files and approved build-script side effects can remain. A failed update tries to reinstall the removed version; if that also fails the package stays uninstalled. There is no atomic rollback — validate in a test profile first.</p>`,
    },
  },
  {
    slug: 'troubleshooting',
    title: { zh: '插件加载失败排查', en: 'Troubleshoot a plugin that will not load' },
    description: {
      zh: '装上了却加载失败？按模块缺失、版本不兼容、构建脚本、平台不匹配四类逐一排查。',
      en: 'Installed but not loading? Work through missing modules, version mismatches, build scripts and platform checks.',
    },
    body: {
      zh: `<p>先说结论：绝大多数“装了没反应”属于下面四类之一，回执里通常已经写了原因。</p>
<h2>1. 模块找不到</h2>
<p>回执里出现 <code>ERR_MODULE_NOT_FOUND</code>，说明插件声明的入口不存在，或者它的依赖没装上。常见于仓库里没有提交构建产物、需要先 <code>pnpm build</code> 的包。改从正式发布版本安装。</p>
<h2>2. 版本不兼容</h2>
<p>错误码 <code>incompatible-version</code>，会点名是 <code>engines.dsh</code> 还是某个 peer 依赖。要么装兼容版本，要么在确认风险后授予精确版本豁免。</p>
<h2>3. 构建脚本待批准</h2>
<p>回执里有 <code>pendingBuilds</code> 就是这个。批准后重试；不需要构建的包不要批准。</p>
<h2>4. 平台不支持</h2>
<p><code>unsupported-platform</code> 表示这个组合包声明了支持的平台，当前系统不在其中。插件页会显示原因。</p>
<h2>还是不行</h2>
<p>看宿主日志与 <code>~/.dsh/profiles/&lt;profile&gt;/.plugin-manager/logs/</code> 下的 pnpm 日志；错误通常在那里比界面更完整。</p>`,
      en: `<p>Most "installed but nothing happens" cases fall into four buckets, and the receipt usually names the reason.</p>
<h2>1. Module not found</h2>
<p><code>ERR_MODULE_NOT_FOUND</code> means the declared entry is missing or its dependencies did not install — common for repositories that need a build step first. Prefer a published version.</p>
<h2>2. Version mismatch</h2>
<p><code>incompatible-version</code> names <code>engines.dsh</code> or the offending peer dependency. Install a compatible version, or grant an exact-version exemption after accepting the risk.</p>
<h2>3. Build scripts pending</h2>
<p>Look for <code>pendingBuilds</code>. Approve and retry — but only for packages that genuinely need a build.</p>
<h2>4. Platform unsupported</h2>
<p><code>unsupported-platform</code> means the bundle declares platforms that exclude yours.</p>
<h2>Still stuck</h2>
<p>Check the host log and the pnpm log under <code>~/.dsh/profiles/&lt;profile&gt;/.plugin-manager/logs/</code>; they are usually more complete than the UI.</p>`,
    },
  },
  {
    slug: 'mcp',
    title: { zh: '接入一个 MCP 服务', en: 'Connect an MCP server' },
    description: {
      zh: '用 DSH 的 MCP 客户端插件把外部 MCP 服务接进来：配置项、常见坑与验证方法。',
      en: 'Wire an external MCP server into DSH with the MCP client plugin: configuration, pitfalls and verification.',
    },
    body: {
      zh: `<p>DSH 本身不内置具体工具，MCP 服务通过 <code>@deepseek-ai/dsh-mcp-client</code> 这一行接进来。它通常由 profile 补丁配置，而不是装一个新包。</p>
<h2>配置形态</h2>
<pre class="code">- insert:
    - id: my-mcp
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: my-mcp
        transport: stdio
        command: /usr/local/bin/my-mcp
        args: ["mcp"]
        env:
          MY_TOKEN: "..."</pre>
<h2>三种容易踩的坑</h2>
<ul>
<li><strong>绝对路径</strong>：<code>command</code> 必须是可执行文件的绝对路径，宿主不会替你展开 <code>~</code> 或 <code>$PATH</code> 里的别名。</li>
<li><strong>启动即阻塞</strong>：stdio 服务如果启动后不输出握手信息，会表现为“插件加载卡住”。先在终端手动跑一遍命令。</li>
<li><strong>环境变量</strong>：需要凭据的服务把变量放在 <code>env</code> 里，不要写进 <code>args</code>，否则会出现在进程列表里。</li>
</ul>
<h2>怎么确认接上了</h2>
<p>重启或热加载后，会话里应该能看到该服务暴露的工具。没有的话看宿主日志里这个 serverName 的启动输出。</p>`,
      en: `<p>DSH ships no built-in tools; MCP servers arrive through the <code>@deepseek-ai/dsh-mcp-client</code> row, usually configured in the profile patch.</p>
<h2>Configuration</h2>
<pre class="code">- insert:
    - id: my-mcp
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: my-mcp
        transport: stdio
        command: /usr/local/bin/my-mcp
        args: ["mcp"]
        env:
          MY_TOKEN: "..."</pre>
<h2>Three pitfalls</h2>
<ul>
<li><strong>Absolute paths</strong>: <code>command</code> must be absolute; the host does not expand <code>~</code> or shell aliases.</li>
<li><strong>Startup blocking</strong>: a stdio server that never prints its handshake looks like a hang. Run the command manually first.</li>
<li><strong>Secrets</strong>: put credentials in <code>env</code>, not <code>args</code>, or they show up in process listings.</li>
</ul>
<h2>Verify</h2>
<p>After a reload the server's tools should appear in the session; otherwise read the host log for that <code>serverName</code>.</p>`,
    },
  },
  {
    slug: 'market-index',
    title: { zh: '把市场索引接进 DSH', en: 'Feed a market index into DSH' },
    description: {
      zh: 'DSH 内置的插件市场读取 format 1 的索引 JSON；这里说明索引怎么写、怎么配、以及它和装插件的关系。',
      en: 'The built-in plugin market reads a format 1 index JSON. Here is what it contains, how to configure it, and how it relates to installing.',
    },
    body: {
      zh: `<p>DSH 自带的「发现」页不抓网页，只读市场索引（format 1 的 JSON）。索引决定“能浏览到什么”，不决定“能不能装”——安装永远走宿主插件管理器。</p>
<h2>索引长什么样</h2>
<p>顶层是 <code>{ format: 1, title, description, metadata, plugins }</code>。<code>metadata</code> 声明分类、标签和排序键；每个插件给出 <code>name</code>、本地化标题与描述、<code>versions[]</code>，每个版本带精确 SemVer、发布时间与来源（npm 或固定提交的 git）。</p>
<h2>怎么配置</h2>
<p>在插件页的「发现」区添加索引 URL，或写入 profile 补丁：</p>
<pre class="code">- id: plugin-market
  config:
    indexes:
      - https://dshbazaar.io/api/index.json</pre>
<p>默认不配置任何索引，因此发现页在你添加之前不会发出请求。</p>
<h2>校验</h2>
<p>索引被严格校验：格式版本、包名、SemVer、时间戳、git 提交格式都会检查，名字重复会让整份索引被拒绝。生成端最好用同一套校验器先跑一遍。</p>`,
      en: `<p>DSH's Discover page does not scrape the web; it reads a market index (format 1 JSON). The index decides what you can browse, never what gets installed — installation always goes through the host plugin manager.</p>
<h2>Shape</h2>
<p>Top level is <code>{ format: 1, title, description, metadata, plugins }</code>. <code>metadata</code> declares categories, labels and sort keys; each plugin carries <code>name</code>, localized title and description, and <code>versions[]</code> with exact SemVer, publish time and source (npm or a pinned git commit).</p>
<h2>Configure</h2>
<p>Add the index URL in the Discover area, or in the profile patch:</p>
<pre class="code">- id: plugin-market
  config:
    indexes:
      - https://dshbazaar.io/api/index.json</pre>
<h2>Validation</h2>
<p>Indexes are validated strictly — format version, package names, SemVer, timestamps, commit format, and unique names. A duplicate name rejects the whole document.</p>`,
    },
  },
];

export const guideBySlug = (slug) => GUIDES.find((guide) => guide.slug === slug);
