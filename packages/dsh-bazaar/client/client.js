/**
 * Browser half of dsh-bazaar.
 *
 * Contributes a tab to the Plugins page (slot `plugins.tab`) with three views:
 * discover, installed, and updates. The catalog comes from this plugin's host route;
 * the installed list comes from the host plugin manager through a second route.
 * Installing always asks the page's own `install` prop, so the plugin manager keeps
 * pnpm, approvals and progress reporting.
 */
window.__ModuleLoader__.load({
  id: 'dsh-bazaar',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const React = require('react');
    const h = React.createElement;
    const NS = 'dshBazaar';
    const ROUTE_CATALOG = '/api/dsh-bazaar/catalog';
    const ROUTE_INSTALLED = '/api/dsh-bazaar/installed';
    const inject = ['slots', 'locale'];

    const zh = {
      title: '市集',
      discover: '发现',
      installedTab: '已安装',
      updates: '更新',
      search: '搜索名称、描述或话题…',
      refresh: '刷新',
      loading: '加载中…',
      catalogFailed: '目录加载失败',
      installedFailed: '已安装列表读取失败',
      retry: '重试',
      empty: '没有匹配的插件。',
      emptyInstalled: '这个 profile 里还没有安装任何组合包。',
      emptyUpdates: '所有已安装插件都是最新版本。',
      install: '安装',
      installing: '请到对话框…',
      installedBadge: '已安装',
      update: '更新',
      latest: '已是最新',
      verified: '已验证',
      unverified: '未验证',
      stars: 'Star',
      disabled: '已停用',
      sourceNpm: 'npm',
      sourceGit: 'git',
      noInstall: '页面没有提供安装入口，请用命令行安装：',
      results: '个结果',
    };
    const en = {
      title: 'Bazaar',
      discover: 'Discover',
      installedTab: 'Installed',
      updates: 'Updates',
      search: 'Search name, description or topic…',
      refresh: 'Refresh',
      loading: 'Loading…',
      catalogFailed: 'Could not load the catalog',
      installedFailed: 'Could not read installed bundles',
      retry: 'Retry',
      empty: 'No plugin matches.',
      emptyInstalled: 'No bundle is installed in this profile yet.',
      emptyUpdates: 'Every installed plugin is up to date.',
      install: 'Install',
      installing: 'In the dialog…',
      installedBadge: 'Installed',
      update: 'Update',
      latest: 'Up to date',
      verified: 'Verified',
      unverified: 'Unconfirmed',
      stars: 'Stars',
      disabled: 'Disabled',
      sourceNpm: 'npm',
      sourceGit: 'git',
      noInstall: 'This page exposes no install action; use the command line:',
      results: 'results',
    };

    const BORDER = '1px solid var(--dsw-alias-border-l2, #262b30)';
    const SURFACE = 'var(--dsw-alias-bg-layer-2, #171a1d)';

    const styles = {
      root: { display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 0 28px' },
      tabbar: { display: 'flex', alignItems: 'center', gap: '4px', borderBottom: BORDER, paddingBottom: '2px' },
      tab: (active) => ({
        border: 'none',
        borderBottom: active ? '2px solid var(--dsw-alias-brand-primary, #d9a34a)' : '2px solid transparent',
        background: 'transparent',
        color: 'inherit',
        padding: '7px 12px',
        fontSize: '13px',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
      }),
      count: { opacity: 0.55, marginLeft: '5px', fontSize: '11.5px' },
      toolbar: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' },
      input: {
        flex: '1 1 240px',
        background: 'transparent',
        border: BORDER,
        borderRadius: '8px',
        color: 'inherit',
        padding: '7px 11px',
        font: 'inherit',
        fontSize: '13px',
        outline: 'none',
      },
      chip: (active) => ({
        border: BORDER,
        background: active ? 'var(--dsw-alias-brand-primary, #d9a34a)' : 'transparent',
        color: active ? '#17130a' : 'inherit',
        borderRadius: '999px',
        padding: '3px 10px',
        fontSize: '12px',
        cursor: 'pointer',
      }),
      grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))', gap: '10px' },
      card: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '13px 14px',
        border: BORDER,
        background: SURFACE,
        borderRadius: '10px',
        minHeight: '148px',
      },
      title: { fontSize: '14px', fontWeight: 620, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      desc: {
        margin: 0,
        fontSize: '12.5px',
        lineHeight: 1.5,
        opacity: 0.72,
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        flex: '1 1 auto',
      },
      meta: { display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '11.5px', opacity: 0.62 },
      actions: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
      button: (primary) => ({
        border: primary ? 'none' : BORDER,
        background: primary ? 'var(--dsw-alias-brand-primary, #d9a34a)' : 'transparent',
        color: primary ? '#17130a' : 'inherit',
        borderRadius: '7px',
        padding: '5px 12px',
        fontSize: '12.5px',
        fontWeight: primary ? 600 : 400,
        cursor: 'pointer',
      }),
      badge: (ok) => ({
        fontSize: '11px',
        padding: '1px 7px',
        borderRadius: '999px',
        border: '1px solid',
        borderColor: ok ? 'rgba(111,191,139,.45)' : 'var(--dsw-alias-border-l2, #262b30)',
        color: ok ? '#6fbf8b' : 'inherit',
        opacity: ok ? 1 : 0.65,
      }),
      notice: { padding: '22px 4px', fontSize: '13px', opacity: 0.75, display: 'flex', gap: '10px', alignItems: 'center' },
      row: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 13px',
        border: BORDER,
        borderRadius: '9px',
      },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '11.5px', opacity: 0.7 },
    };

    /** Compare two SemVer strings for the update check; prereleases sort below their release. */
    function compareVersions(left, right) {
      const parse = (value) => {
        const [core, pre] = String(value ?? '').split('+')[0].split('-', 2);
        return { parts: core.split('.').map((part) => Number.parseInt(part, 10) || 0), pre };
      };
      const a = parse(left);
      const b = parse(right);
      for (let index = 0; index < 3; index += 1) {
        const diff = (a.parts[index] ?? 0) - (b.parts[index] ?? 0);
        if (diff !== 0) return diff > 0 ? 1 : -1;
      }
      if (a.pre === b.pre) return 0;
      if (a.pre === undefined) return 1;
      if (b.pre === undefined) return -1;
      return a.pre > b.pre ? 1 : -1;
    }

    function textOf(value, language) {
      if (typeof value === 'string') return value;
      return value?.[language] ?? value?.en ?? '';
    }

    function useEndpoint(url) {
      const [state, setState] = React.useState({ phase: 'loading' });
      const load = React.useCallback(() => {
        setState({ phase: 'loading' });
        fetch(url, { headers: { accept: 'application/json' } })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
          .then((data) => setState({ phase: 'ready', data }))
          .catch(() => setState({ phase: 'failed' }));
      }, [url]);
      React.useEffect(load, [load]);
      return [state, load];
    }

    function BazaarTab(props) {
      const t = props.t;
      const language = props.language ?? 'zh';
      const [catalog, reloadCatalog] = useEndpoint(ROUTE_CATALOG);
      const [installed, reloadInstalled] = useEndpoint(ROUTE_INSTALLED);
      const [tab, setTab] = React.useState('discover');
      const [query, setQuery] = React.useState('');
      const [category, setCategory] = React.useState(null);
      const [pending, setPending] = React.useState({});

      const installedMap = React.useMemo(() => {
        const map = new Map();
        for (const bundle of installed.data?.bundles ?? []) map.set(bundle.name, bundle);
        return map;
      }, [installed.data]);

      const plugins = catalog.data?.plugins ?? [];
      const categories = [...new Set(plugins.map((plugin) => plugin.category))];

      const updates = plugins
        .filter((plugin) => {
          const local = installedMap.get(plugin.name);
          return local !== undefined && plugin.version !== undefined
            && compareVersions(plugin.version, local.version) > 0;
        })
        .sort((left, right) => right.stars - left.stars);

      const refresh = () => {
        reloadCatalog();
        reloadInstalled();
      };

      const openTab = (next) => {
        setTab(next);
        if (next !== 'discover') reloadInstalled();
      };

      const requestInstall = (plugin) => {
        if (typeof props.install !== 'function') return;
        setPending((current) => ({ ...current, [plugin.name]: true }));
        Promise.resolve(props.install({
          spec: plugin.installSpec ?? `${plugin.name}@${plugin.version}`,
          ...(plugin.registry === undefined ? {} : { registry: plugin.registry }),
          title: textOf(plugin.title, language),
          version: plugin.version,
        })).catch(() => undefined).finally(() => {
          setPending((current) => ({ ...current, [plugin.name]: false }));
          setTimeout(reloadInstalled, 1200);
        });
      };

      const actionFor = (plugin) => {
        const local = installedMap.get(plugin.name);
        const busy = pending[plugin.name] === true;
        if (typeof props.install !== 'function') {
          return h('span', { style: styles.badge(false) }, t('installedBadge'));
        }
        if (busy) return h('button', { style: styles.button(false), disabled: true }, t('installing'));
        if (local !== undefined && plugin.version !== undefined) {
          if (compareVersions(plugin.version, local.version) > 0) {
            return h('button', { style: styles.button(true), onClick: () => requestInstall(plugin) }, t('update'));
          }
          return h('span', { style: styles.badge(true) }, t('installedBadge'));
        }
        return h('button', { style: styles.button(true), onClick: () => requestInstall(plugin) }, t('install'));
      };

      const card = (plugin, extra) => h('div', { key: plugin.name, style: styles.card },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          h('span', { style: styles.title }, textOf(plugin.title, language)),
          h('span', { style: styles.badge(plugin.verified) },
            plugin.verified ? t('verified') : t('unverified'))),
        h('p', { style: styles.desc }, textOf(plugin.description, language)),
        h('div', { style: styles.meta },
          h('span', null, plugin.category),
          h('span', null, `★ ${plugin.stars}`),
          h('span', null, plugin.version)),
        h('div', { style: styles.actions },
          h('a', {
            style: { fontSize: '11.5px', opacity: 0.6, color: 'inherit' },
            href: plugin.repoUrl,
            target: '_blank',
            rel: 'noreferrer',
          }, 'GitHub'),
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, extra, actionFor(plugin))));

      const header = h('div', { style: styles.tabbar },
        [['discover', t('discover'), plugins.length], ['installedTab', t('installedTab'), installedMap.size], ['updates', t('updates'), updates.length]]
          .map(([id, label, count]) => h('button', {
            key: id,
            style: styles.tab(tab === id),
            onClick: () => openTab(id),
          }, label, h('span', { style: styles.count }, count))),
        h('button', {
          style: { ...styles.button(false), marginLeft: 'auto' },
          onClick: refresh,
        }, t('refresh')));

      if (tab === 'discover') {
        if (catalog.phase === 'loading') return h('div', { style: styles.root }, header, h('div', { style: styles.notice }, t('loading')));
        if (catalog.phase === 'failed') {
          return h('div', { style: styles.root }, header,
            h('div', { style: styles.notice }, t('catalogFailed'),
              h('button', { style: styles.button(true), onClick: reloadCatalog }, t('retry'))));
        }
        const search = query.trim().toLowerCase();
        const visible = plugins.filter((plugin) => {
          if (category !== null && plugin.category !== category) return false;
          if (search === '') return true;
          return [textOf(plugin.title, language), textOf(plugin.description, language), plugin.name,
            ...(plugin.topics ?? [])].join(' ').toLowerCase().includes(search);
        });
        return h('div', { style: styles.root },
          header,
          h('div', { style: styles.toolbar },
            h('input', {
              style: styles.input,
              type: 'search',
              value: query,
              placeholder: t('search'),
              onChange: (event) => setQuery(event.target.value),
            }),
            h('span', { style: styles.mono }, `${visible.length} ${t('results')}`)),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
            h('button', { style: styles.chip(category === null), onClick: () => setCategory(null) }, t('discover')),
            categories.map((id) => h('button', {
              key: id,
              style: styles.chip(category === id),
              onClick: () => setCategory(category === id ? null : id),
            }, id))),
          visible.length === 0
            ? h('div', { style: styles.notice }, t('empty'))
            : h('div', { style: styles.grid }, visible.map((plugin) => card(plugin))));
      }

      if (tab === 'installedTab') {
        const list = [...installedMap.values()].sort((left, right) => left.name.localeCompare(right.name));
        return h('div', { style: styles.root },
          header,
          installed.phase === 'failed'
            ? h('div', { style: styles.notice }, t('installedFailed'),
                h('button', { style: styles.button(true), onClick: reloadInstalled }, t('retry')))
            : list.length === 0
              ? h('div', { style: styles.notice }, t('emptyInstalled'))
              : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                  list.map((bundle) => h('div', { key: bundle.name, style: styles.row },
                    h('div', { style: { flex: '1 1 auto', minWidth: 0 } },
                      h('div', { style: styles.title }, bundle.name),
                      h('div', { style: styles.meta },
                        h('span', null, bundle.version ?? '—'),
                        h('span', null, bundle.official ? 'official' : (bundle.source ?? '')),
                        bundle.enabled ? null : h('span', { style: styles.badge(false) }, t('disabled')))),
                    h('span', { style: styles.badge(bundle.enabled) }, bundle.enabled ? 'enabled' : t('disabled'))))));
      }

      return h('div', { style: styles.root },
        header,
        updates.length === 0
          ? h('div', { style: styles.notice }, t('emptyUpdates'))
          : h('div', { style: styles.grid },
              updates.map((plugin) => {
                const local = installedMap.get(plugin.name);
                return card(plugin, h('span', { style: styles.mono }, `${local.version} → ${plugin.version}`));
              })));
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-bazaar: dictionaries');
      const t = ctx.locale.bind(NS);
      ctx.slots.inject('plugins.tab', () => ctx.slots.register({
        name: 'plugins.tab',
        id: 'bazaar',
        label: () => t('title'),
        locale: NS,
      }, (props) => h(BazaarTab, { ...props, t, language: props.language ?? 'zh' })));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
