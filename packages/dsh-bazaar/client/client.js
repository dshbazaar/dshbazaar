/**
 * Browser half of dsh-bazaar.
 *
 * Contributes a tab to the Plugins page (slot `plugins.tab`). The tab lists the catalog
 * served by this plugin's host route and asks the page's own `install` prop to install a
 * chosen version, so the host plugin manager keeps ownership of pnpm, approvals and
 * progress reporting.
 */
window.__ModuleLoader__.load({
  id: 'dsh-bazaar',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const React = require('react');
    const h = React.createElement;
    const NS = 'dshMarketHub';
    const CATALOG_URL = '/api/dsh-bazaar/catalog';
    const inject = ['slots', 'locale'];

    const zh = {
      title: '市场',
      search: '搜索插件…',
      all: '全部',
      loadFailed: '目录加载失败',
      retry: '重试',
      empty: '没有匹配的插件。',
      install: '安装',
      installing: '安装中…',
      stars: 'Star',
      verified: '已验证',
      unverified: '未验证',
      results: '个结果',
      noInstall: '当前页面没有提供安装入口，请用命令行安装：',
    };
    const en = {
      title: 'Market',
      search: 'Search plugins…',
      all: 'All',
      loadFailed: 'Could not load the catalog',
      retry: 'Retry',
      empty: 'No plugin matches.',
      install: 'Install',
      installing: 'Installing…',
      stars: 'Stars',
      verified: 'Verified',
      unverified: 'Unconfirmed',
      results: 'results',
      noInstall: 'This page exposes no install action; use the command line:',
    };

    const styles = {
      root: { display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 0 28px' },
      toolbar: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' },
      input: {
        flex: '1 1 220px',
        minWidth: '180px',
        background: 'var(--dsw-alias-bg-base, #14171a)',
        border: '1px solid var(--dsw-alias-border-l2, #262b30)',
        borderRadius: '8px',
        color: 'inherit',
        padding: '7px 11px',
        font: 'inherit',
        fontSize: '13px',
        outline: 'none',
      },
      chip: (active) => ({
        border: '1px solid var(--dsw-alias-border-l2, #262b30)',
        background: active ? 'var(--dsw-alias-brand-primary, #d9a34a)' : 'transparent',
        color: active ? '#17130a' : 'inherit',
        borderRadius: '999px',
        padding: '4px 11px',
        fontSize: '12px',
        cursor: 'pointer',
        fontWeight: active ? 600 : 400,
      }),
      row: {
        display: 'flex',
        gap: '14px',
        alignItems: 'flex-start',
        padding: '12px 14px',
        border: '1px solid var(--dsw-alias-border-l2, #262b30)',
        borderRadius: '10px',
      },
      name: { fontWeight: 600, fontSize: '14px' },
      desc: {
        margin: '3px 0 0',
        fontSize: '12.5px',
        opacity: 0.72,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      },
      meta: { display: 'flex', gap: '10px', marginTop: '6px', fontSize: '11.5px', opacity: 0.6 },
      button: {
        border: '1px solid var(--dsw-alias-border-l2, #262b30)',
        background: 'transparent',
        color: 'inherit',
        borderRadius: '8px',
        padding: '5px 13px',
        fontSize: '12.5px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
      badge: (ok) => ({
        fontSize: '11px',
        padding: '1px 7px',
        borderRadius: '999px',
        border: '1px solid',
        borderColor: ok ? 'rgba(111,191,139,.45)' : 'var(--dsw-alias-border-l2, #262b30)',
        color: ok ? '#6fbf8b' : 'inherit',
        opacity: ok ? 1 : 0.6,
      }),
      error: { padding: '18px', fontSize: '13px', opacity: 0.8 },
    };

    function displayName(plugin, language) {
      const title = plugin.title;
      if (typeof title === 'string') return title;
      return title?.[language] ?? title?.en ?? plugin.name;
    }

    function displayText(value, language) {
      if (typeof value === 'string') return value;
      return value?.[language] ?? value?.en ?? '';
    }

    function MarketTab(props) {
      const t = props.t;
      const language = props.language ?? 'en';
      const [state, setState] = React.useState({ phase: 'loading' });
      const [query, setQuery] = React.useState('');
      const [category, setCategory] = React.useState(null);
      const [installed, setInstalled] = React.useState({});

      const load = React.useCallback(() => {
        setState({ phase: 'loading' });
        fetch(CATALOG_URL, { headers: { accept: 'application/json' } })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
          .then((data) => setState({ phase: 'ready', data }))
          .catch(() => setState({ phase: 'failed' }));
      }, []);

      React.useEffect(() => { load(); }, [load]);

      if (state.phase === 'loading') {
        return h('div', { style: styles.error }, '…');
      }
      if (state.phase === 'failed') {
        return h('div', { style: styles.error },
          h('div', { style: { marginBottom: '10px' } }, t('loadFailed')),
          h('button', { style: styles.button, onClick: load }, t('retry')));
      }

      const plugins = state.data?.plugins ?? [];
      const categories = [...new Set(plugins.map((plugin) => plugin.category))];
      const text = query.trim().toLowerCase();
      const visible = plugins.filter((plugin) => {
        if (category !== null && plugin.category !== category) return false;
        if (text === '') return true;
        const haystack = [
          displayName(plugin, language),
          displayText(plugin.description, language),
          plugin.name,
          ...(plugin.topics ?? []),
        ].join(' ').toLowerCase();
        return haystack.includes(text);
      });

      const install = (plugin) => {
        setInstalled((current) => ({ ...current, [plugin.name]: true }));
        Promise.resolve(props.install?.({
          spec: plugin.installSpec,
          ...(plugin.registry === undefined ? {} : { registry: plugin.registry }),
          title: displayName(plugin, language),
          version: plugin.version,
        })).catch(() => {
          setInstalled((current) => ({ ...current, [plugin.name]: false }));
        });
      };

      return h('div', { style: styles.root },
        h('div', { style: styles.toolbar },
          h('input', {
            style: styles.input,
            type: 'search',
            value: query,
            placeholder: t('search'),
            onChange: (event) => setQuery(event.target.value),
          }),
          h('span', { style: { fontSize: '12px', opacity: 0.6 } }, `${visible.length} ${t('results')}`)),

        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
          h('button', { style: styles.chip(category === null), onClick: () => setCategory(null) }, t('all')),
          categories.map((id) => h('button', {
            key: id,
            style: styles.chip(category === id),
            onClick: () => setCategory(category === id ? null : id),
          }, id))),

        visible.length === 0
          ? h('div', { style: styles.error }, t('empty'))
          : visible.map((plugin) => h('div', { key: plugin.name, style: styles.row },
              h('div', { style: { flex: '1 1 auto', minWidth: 0 } },
                h('div', { style: styles.name }, displayName(plugin, language)),
                h('p', { style: styles.desc }, displayText(plugin.description, language)),
                h('div', { style: styles.meta },
                  h('span', null, `${plugin.category}`),
                  h('span', null, `★ ${plugin.stars}`),
                  h('span', null, plugin.version),
                  h('span', { style: styles.badge(plugin.verified) }, plugin.verified ? t('verified') : t('unverified')))),
              h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' } },
                h('button', {
                  style: styles.button,
                  disabled: installed[plugin.name] === true,
                  onClick: () => install(plugin),
                }, installed[plugin.name] === true ? t('installing') : t('install')),
                h('a', {
                  style: { fontSize: '11.5px', opacity: 0.6, color: 'inherit' },
                  href: plugin.repoUrl,
                  target: '_blank',
                  rel: 'noreferrer',
                }, 'GitHub')))),
      );
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-bazaar: dictionaries');
      const t = ctx.locale.bind(NS);
      ctx.slots.inject('plugins.tab', () => ctx.slots.register({
        name: 'plugins.tab',
        id: 'hub',
        label: () => t('title'),
        locale: NS,
      }, (props) => h(MarketTab, { ...props, t, language: props.language ?? 'zh' })));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
