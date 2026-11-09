/**
 * The eleven capability categories every market entry is classified into.
 * Titles are localized; `match` lists lowercase keywords used for inference.
 */
export const CATEGORIES = [
  {
    id: 'interface',
    title: { en: 'Interface & experience', zh: '界面与体验' },
    blurb: { en: 'Themes, sidebars, panels and layout.', zh: '主题、侧边栏、面板与布局。' },
    match: ['ui', 'theme', 'skin', 'sidebar', 'panel', 'layout', 'css', 'design', 'component', 'markdown', 'render', 'font'],
  },
  {
    id: 'session',
    title: { en: 'Sessions & messages', zh: '会话与消息' },
    blurb: { en: 'Conversation, prompt and session management.', zh: '对话、提示词与会话管理。' },
    match: ['chat', 'message', 'prompt', 'session', 'conversation', 'input', 'quote', 'reply', 'history'],
  },
  {
    id: 'memory',
    title: { en: 'Memory & context', zh: '记忆与上下文' },
    blurb: { en: 'Context budgets, recall and persistence.', zh: '上下文预算、召回与持久化。' },
    match: ['memory', 'context', 'rag', 'embedding', 'recall', 'compaction', 'summarize', 'vector'],
  },
  {
    id: 'tools',
    title: { en: 'Tools & capabilities', zh: '工具与能力' },
    blurb: { en: 'Search, files, shell and other tools.', zh: '检索、文件、Shell 等工具。' },
    match: ['tool', 'search', 'file', 'shell', 'bash', 'exec', 'terminal', 'browser', 'fetch', 'scrape', 'image'],
  },
  {
    id: 'agent',
    title: { en: 'Skills & agents', zh: '技能与智能体' },
    blurb: { en: 'Skill packages and sub-agents.', zh: '技能包与子智能体。' },
    match: ['skill', 'agent', 'subagent', 'persona', 'instruction', 'workflow-agent'],
  },
  {
    id: 'workflow',
    title: { en: 'Workflow & automation', zh: '工作流与自动化' },
    blurb: { en: 'Task orchestration and approvals.', zh: '任务编排与审批策略。' },
    match: ['workflow', 'automation', 'automate', 'task', 'cron', 'schedule', 'approval', 'pipeline', 'loop'],
  },
  {
    id: 'integration',
    title: { en: 'Integrations & connections', zh: '集成与连接' },
    blurb: { en: 'MCP, notifications and protocol bridges.', zh: 'MCP、通知推送与协议桥接。' },
    match: ['mcp', 'integration', 'notion', 'slack', 'feishu', 'lark', 'webhook', 'bridge', 'api', 'github', 'gitlab', 'obsidian'],
  },
  {
    id: 'model',
    title: { en: 'Models & inference', zh: '模型与推理' },
    blurb: { en: 'Model providers, routing and cost.', zh: '模型接入、路由与成本。' },
    match: ['model', 'llm', 'openai', 'anthropic', 'claude', 'gemini', 'ollama', 'provider', 'router', 'token', 'inference'],
  },
  {
    id: 'dev',
    title: { en: 'Development & operations', zh: '开发与运维' },
    blurb: { en: 'Debugging, testing and diagnostics.', zh: '调试、测试、诊断与安全。' },
    match: ['dev', 'debug', 'test', 'lint', 'perf', 'profile', 'diagnose', 'security', 'review', 'build', 'ci'],
  },
  {
    id: 'knowledge',
    title: { en: 'Data & knowledge', zh: '数据与知识' },
    blurb: { en: 'Visualization, research and knowledge bases.', zh: '可视化、研究与知识库。' },
    match: ['data', 'knowledge', 'visual', 'chart', 'graph', 'sql', 'database', 'csv', 'research', 'wiki', 'pdf'],
  },
  {
    id: 'fun',
    title: { en: 'Fun', zh: '娱乐' },
    blurb: { en: 'Games, pets and playful toys.', zh: '游戏、宠物与整活。' },
    match: ['game', 'fun', 'pet', 'toy', 'meme', 'joke', 'play', 'entertainment'],
  },
];

export const CATEGORY_IDS = CATEGORIES.map((category) => category.id);

/** The category id a repo most likely belongs to, inferred from its topics, name and description. */
export function inferCategory({ topics = [], name = '', description = '' }) {
  const tokens = new Set(
    topics.flatMap((topic) => String(topic).toLowerCase().split(/[^a-z0-9]+/u)).filter(Boolean),
  );
  const words = (text) => new Set(String(text).toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean));
  const nameWords = words(name);
  const descriptionWords = words(description);
  const matches = (set, keyword) =>
    set.has(keyword) || set.has(`${keyword}s`) || (keyword.endsWith('s') && set.has(keyword.slice(0, -1)));

  let best = { id: 'tools', score: 0 };
  for (const category of CATEGORIES) {
    let score = 0;
    for (const keyword of category.match) {
      if (matches(tokens, keyword)) score += 4;
      if (matches(nameWords, keyword)) score += 2;
      if (matches(descriptionWords, keyword)) score += 1;
    }
    if (score > best.score) best = { id: category.id, score };
  }
  return best.id;
}

export function categoryById(id) {
  return CATEGORIES.find((category) => category.id === id) ?? CATEGORIES[0];
}
