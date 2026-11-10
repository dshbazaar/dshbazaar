#!/usr/bin/env node
/**
 * Render the static catalog site from `public/api/catalog.json`.
 *
 * Emits both languages under /zh and /en, with canonical + hreflang + Open Graph on
 * every page, JSON-LD (WebSite, ItemList, BreadcrumbList, SoftwareApplication, Article),
 * paginated lists, plugin detail pages that carry the repository README, hand-written
 * guides, and three sitemaps with hreflang alternates and lastmod.
 */
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, categoryById } from '../config/categories.mjs';
import { GUIDES } from '../site/guides.mjs';
import { LANGS, t, format } from '../site/i18n.mjs';
import {
  breadcrumbs,
  card,
  escapeHtml,
  fmtDate,
  fmtNumber,
  localized,
  page,
  pagination,
  pluginPath,
  repoSlug,
  searchForm,
  stat,
  summarize,
} from '../site/layout.mjs';
import {
  HTML_LANG,
  SITE_NAME,
  alternates,
  breadcrumbJsonLd,
  head,
  softwareJsonLd,
  websiteJsonLd,
} from '../site/seo.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public');
const SITE_URL = (process.env.DSH_MARKET_SITE_URL?.trim() || 'https://dshbazaar.io').replace(/\/+$/u, '');
const PAGE_SIZE = 48;

/** The command that installs this market plugin into DSH; the package lives in a repository subdirectory. */
const INSTALL_COMMAND =
  "dsh plugin --profile web add 'git+https://github.com/dshbazaar/dshbazaar.git#main&path:/packages/dsh-bazaar'";

const write = async (path, contents) => {
  const target = resolve(OUT, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents);
};

const sortedByStars = (plugins) => [...plugins].sort((left, right) => right.stars - left.stars);
const pageCount = (total) => Math.max(1, Math.ceil(total / PAGE_SIZE));
const listRoute = (base, n) => (n === 1 ? base : `${base}${n}/`);
const absolute = (lang, route) => `${SITE_URL}/${lang}/${route}`;

function categoryCards(plugins, lang) {
  return CATEGORIES.map((category) => {
    const count = plugins.filter((plugin) => plugin.category === category.id).length;
    return `<a class="cat" href="/${lang}/c/${category.id}/">
  <div class="name">${escapeHtml(localized(category.title, lang))}</div>
  <div class="blurb">${escapeHtml(localized(category.blurb, lang))}</div>
  <div class="count">${count} ${lang === 'zh' ? '个插件' : count === 1 ? 'plugin' : 'plugins'}</div>
</a>`;
  }).join('\n');
}

function listCards(plugins, lang) {
  return plugins.map((plugin) => {
    const desc = summarize(plugin.description, lang);
    const search = [
      localized(plugin.title, lang),
      localized(plugin.description, lang),
      plugin.name,
      repoSlug(plugin),
      ...(plugin.topics ?? []),
    ].join(' ').toLowerCase();
    return card(plugin, lang, desc).replace(
      '<a class="card"',
      `<a class="card" data-card data-verified="${plugin.verified}" data-stars="${plugin.stars}" data-updated="${Date.parse(plugin.updatedAt ?? '') || 0}" data-name="${escapeHtml(localized(plugin.title, lang))}" data-search="${escapeHtml(search)}"`,
    );
  }).join('\n');
}

function listBody(plugins, lang, { category = null, pageNumber = 1, totalPages = 1, basePath, total = plugins.length }) {
  const s = t(lang);
  const heading = category === null
    ? (lang === 'zh' ? `DSH 插件市场 - 全部 ${total} 个 DeepSeek Harness 插件` : `All ${total} DeepSeek Harness plugins`)
    : `${localized(category.title, lang)} - ${lang === 'zh' ? `${total} 个 DSH 插件` : `${total} DSH plugins`}`;

  const chips = [
    `<a class="chip${category === null ? ' active' : ''}" href="/${lang}/plugins/">${escapeHtml(s.allCategories)}</a>`,
    ...CATEGORIES.map((entry) => {
      const active = category?.id === entry.id ? ' active' : '';
      return `<a class="chip${active}" href="/${lang}/c/${entry.id}/">${escapeHtml(localized(entry.title, lang))}</a>`;
    }),
  ].join('\n');

  return `
<div class="wrap" style="padding:44px 0 60px">
  ${breadcrumbs(category === null
    ? [{ name: lang === 'zh' ? '首页' : 'Home', href: `/${lang}/` }, { name: s.pluginsTitle, href: `/${lang}/plugins/` }]
    : [{ name: lang === 'zh' ? '首页' : 'Home', href: `/${lang}/` }, { name: s.pluginsTitle, href: `/${lang}/plugins/` }, { name: localized(category.title, lang), href: `/${lang}/c/${category.id}/` }])}
  <div class="section-head"><div><h1 class="page-title">${escapeHtml(heading)}</h1><p>${escapeHtml(s.pluginsBody)}</p></div>
  <div style="color:var(--muted);font:500 13px var(--mono)"><span data-count>${plugins.length}</span> ${lang === 'zh' ? '个结果' : 'results'}</div></div>
  <div class="chips">
${chips}
  </div>
  <div class="filters">
    <input type="search" data-search placeholder="${escapeHtml(s.searchPlaceholder)}" aria-label="${escapeHtml(s.searchPlaceholder)}">
    <select data-sort aria-label="${escapeHtml(s.sortLabel)}">
      <option value="stars">${escapeHtml(s.sortStars)}</option>
      <option value="updated">${escapeHtml(s.sortUpdated)}</option>
      <option value="name">${escapeHtml(s.sortName)}</option>
    </select>
    <label><input type="checkbox" data-verified> ${escapeHtml(s.onlyVerified)}</label>
  </div>
  <div class="grid" data-grid>
${listCards(plugins, lang)}
  </div>
  <div class="empty" data-empty hidden>${escapeHtml(s.empty)}</div>
  ${pagination({ lang, basePath, page: pageNumber, total: totalPages, s })}
  <p class="note" style="margin-top:26px">${escapeHtml(s.verifiedNote)}</p>
</div>
<script src="/assets/app.js" defer></script>`;
}

function listPage(catalog, lang, { category = null, pageNumber = 1 } = {}) {
  const s = t(lang);
  const pool = category === null
    ? sortedByStars(catalog.plugins)
    : sortedByStars(catalog.plugins.filter((plugin) => plugin.category === category.id));
  const totalPages = pageCount(pool.length);
  const current = Math.min(pageNumber, totalPages);
  const slice = pool.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const base = category === null ? `/${lang}/plugins/` : `/${lang}/c/${category.id}/`;
  const route = category === null ? listRoute('plugins/', current) : listRoute(`c/${category.id}/`, current);
  const title = category === null
    ? (lang === 'zh' ? `DSH 插件市场 - 全部 ${pool.length} 个插件${current > 1 ? `（第 ${current} 页）` : ''}` : `All ${pool.length} DeepSeek Harness plugins${current > 1 ? ` - page ${current}` : ''}`)
    : `${localized(category.title, lang)} - ${lang === 'zh' ? `${pool.length} 个 DSH 插件` : `${pool.length} DSH plugins`}${current > 1 ? ` (${current})` : ''}`;
  const description = category === null ? s.pluginsBody : localized(category.blurb, lang);
  const items = slice.map((plugin, index) => ({
    '@type': 'ListItem',
    position: (current - 1) * PAGE_SIZE + index + 1,
    name: localized(plugin.title, lang),
    url: absolute(lang, `p/${repoSlug(plugin)}/`),
  }));

  return page({
    lang,
    site: SITE_URL,
    title,
    description,
    body: listBody(slice, lang, { category, pageNumber: current, totalPages, basePath: base, total: pool.length }),
    active: 'plugins',
    generatedAt: catalog.generatedAt,
    headExtra: head({
      lang,
      route,
      title,
      description,
      siteUrl: SITE_URL,
      type: 'website',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          inLanguage: HTML_LANG[lang],
          url: absolute(lang, route),
          mainEntity: { '@type': 'ItemList', numberOfItems: pool.length, itemListElement: items },
        },
        breadcrumbJsonLd(category === null
          ? [{ name: s.brand, path: `/${lang}/` }, { name: s.pluginsTitle, path: `/${lang}/plugins/` }]
          : [{ name: s.brand, path: `/${lang}/` }, { name: s.pluginsTitle, path: `/${lang}/plugins/` }, { name: localized(category.title, lang), path: `/${lang}/c/${category.id}/` }], SITE_URL),
      ],
    }),
  });
}

function detailPage(catalog, plugin, lang) {
  const s = t(lang);
  const category = categoryById(plugin.category);
  const title = localized(plugin.title, lang);
  const description = summarize(plugin.description, lang, 160);
  const route = `p/${repoSlug(plugin)}/`;
  const install = plugin.installSpec ?? `${plugin.name}@${plugin.version}`;
  const command = plugin.sourceType === 'npm'
    ? `dsh plugin --profile web add ${install}`
    : `dsh plugin --profile web add '${install}'`;
  const registryNote = plugin.sourceType === 'npm' && plugin.registry && plugin.registry !== 'https://registry.npmjs.org/'
    ? `\n# registry: ${plugin.registry}`
    : '';

  const similar = sortedByStars(catalog.plugins
    .filter((candidate) => candidate.category === plugin.category && candidate.name !== plugin.name))
    .slice(0, 3);

  const readme = typeof plugin.readme === 'string' ? plugin.readme.trim() : '';
  const readmeHtml = readme === ''
    ? ''
    : readme.split(/\n{2,}/u).slice(0, 14).map((paragraph) => `<p>${escapeHtml(paragraph.replace(/\n/gu, ' ')).slice(0, 1200)}</p>`).join('\n');

  const meta = [
    [s.fieldRepo, plugin.repoUrl ? `<a href="${escapeHtml(plugin.repoUrl)}">${escapeHtml(repoSlug(plugin))}</a>` : '—'],
    [s.fieldVersion, escapeHtml(plugin.version ?? '—')],
    [s.fieldSource, escapeHtml(plugin.sourceType === 'npm' ? s.sourceNpm : s.sourceGit)],
    [s.fieldLicense, escapeHtml(plugin.license ?? '—')],
    [s.fieldLanguage, escapeHtml(plugin.language ?? '—')],
    [s.fieldUpdated, escapeHtml(fmtDate(plugin.updatedAt))],
    [s.star, escapeHtml(fmtNumber(plugin.stars))],
    [s.fork, escapeHtml(fmtNumber(plugin.forks))],
  ];

  const body = `
<div class="wrap detail">
  <div>
    ${breadcrumbs([
      { name: lang === 'zh' ? '首页' : 'Home', href: `/${lang}/` },
      { name: s.pluginsTitle, href: `/${lang}/plugins/` },
      { name: localized(category.title, lang), href: `/${lang}/c/${category.id}/` },
      { name: title, href: `/${lang}/${route}` },
    ])}
    <h1>${escapeHtml(title)}</h1>
    <div class="badges">
      <span class="badge ${plugin.verified ? 'ok' : ''}">${escapeHtml(plugin.verified ? s.verified : s.unconfirmed)}</span>
      <a class="badge" href="/${lang}/c/${category.id}/">${escapeHtml(localized(category.title, lang))}</a>
      <span class="badge">★ ${escapeHtml(fmtNumber(plugin.stars))}</span>
      <span class="badge">${escapeHtml(plugin.version ?? '')}</span>
      ${plugin.archived ? '<span class="badge">archived</span>' : ''}
    </div>
    <p class="lede">${escapeHtml(localized(plugin.description, lang))}</p>

    <h2>${escapeHtml(s.detailPositioning)}</h2>
    <p>${escapeHtml(summarize(plugin.description, lang, 260))}</p>

    <h2>${escapeHtml(s.detailInstall)}</h2>
    <p style="color:var(--muted);margin:0 0 12px">${escapeHtml(s.detailInstallBody)}</p>
    <pre class="code"><span class="p">$</span> ${escapeHtml(command)}${escapeHtml(registryNote)}</pre>

    <h2>${escapeHtml(s.detailCompatibility)}</h2>
    <p>${plugin.dshTarget ? `<code>${escapeHtml(plugin.dshTarget)}</code>` : escapeHtml(s.undeclared)}</p>

    <h2>${escapeHtml(s.detailAuthor)}</h2>
    <p>${escapeHtml(plugin.author ?? '—')} · ★ ${escapeHtml(fmtNumber(plugin.stars))} · ${escapeHtml(s.updated)} ${escapeHtml(fmtDate(plugin.updatedAt))}</p>

    ${readmeHtml === '' ? '' : `<h2>${escapeHtml(s.detailAbout)}</h2><div class="prose readme">${readmeHtml}</div>`}

    ${similar.length === 0 ? '' : `<h2>${escapeHtml(s.similar)}</h2>
    <div class="grid">${similar.map((entry) => card(entry, lang, summarize(entry.description, lang))).join('\n')}</div>`}
  </div>
  <aside>
    <h2 style="margin-top:0">${escapeHtml(s.detailMeta)}</h2>
    <div class="meta">
${meta.map(([key, value]) => `      <div><span class="k">${escapeHtml(key)}</span><span class="v">${value}</span></div>`).join('\n')}
    </div>
    <p class="note" style="margin-top:18px">${escapeHtml(s.verifiedNote)}</p>
  </aside>
</div>`;

  return page({
    lang,
    site: SITE_URL,
    title: `${title}（${plugin.author ?? ''}）`,
    description,
    body,
    active: 'plugins',
    generatedAt: catalog.generatedAt,
    headExtra: head({
      lang,
      route,
      title: `${title} - ${s.brand}`,
      description,
      siteUrl: SITE_URL,
      type: 'article',
      image: plugin.iconUrl,
      jsonLd: [
        softwareJsonLd(plugin, lang, SITE_URL, title, description),
        breadcrumbJsonLd([
          { name: s.brand, path: `/${lang}/` },
          { name: s.pluginsTitle, path: `/${lang}/plugins/` },
          { name: localized(category.title, lang), path: `/${lang}/c/${category.id}/` },
          { name: title, path: `/${lang}/${route}` },
        ], SITE_URL),
      ],
    }),
  });
}

function homePage(catalog, lang) {
  const s = t(lang);
  const { totals, plugins } = catalog;
  const strong = sortedByStars(plugins.filter((plugin) => plugin.verified || plugin.dshTarget !== undefined));
  const picks = [...strong, ...sortedByStars(plugins.filter((plugin) => !strong.includes(plugin)))].slice(0, 6);
  const body = `
<section class="hero"><div class="wrap">
  <h1>${escapeHtml(s.heroTitle)}</h1>
  <p>${escapeHtml(s.heroBody)}</p>
  ${searchForm(lang)}
  <div class="stats">
    ${stat(fmtNumber(totals.plugins), s.stats.plugins)}
    ${stat(fmtNumber(totals.verified), s.stats.verified)}
    ${stat(fmtNumber(totals.npm), s.stats.npm)}
    ${stat(fmtNumber(totals.stars), s.stats.stars)}
  </div>
</div></section>
${installPanelBlock(lang)}

<section class="block"><div class="wrap">
  <div class="section-head"><div><h2>${escapeHtml(s.categoriesTitle)}</h2><p>${escapeHtml(s.categoriesBody)}</p></div>
  <a class="more" href="/${lang}/plugins/">${escapeHtml(s.viewAll)} →</a></div>
  <div class="cats">
${categoryCards(plugins, lang)}
  </div>
</div></section>

<section class="block"><div class="wrap">
  <div class="section-head"><div><h2>${escapeHtml(s.featuredTitle)}</h2><p>${escapeHtml(s.featuredBody)}</p></div>
  <a class="more" href="/${lang}/plugins/">${escapeHtml(s.viewAll)} →</a></div>
  <div class="grid">
${picks.map((plugin) => card(plugin, lang, summarize(plugin.description, lang))).join('\n')}
  </div>
</div></section>

<section class="block"><div class="wrap">
  <div class="section-head"><div><h2>${escapeHtml(s.guidesTitle)}</h2><p>${escapeHtml(s.guidesBody)}</p></div>
  <a class="more" href="/${lang}/guide/">${escapeHtml(s.viewAll)} →</a></div>
  <div class="cats">
${GUIDES.map((guide) => `<a class="cat" href="/${lang}/guide/${guide.slug}/">
  <div class="name">${escapeHtml(guide.title[lang])}</div>
  <div class="blurb">${escapeHtml(guide.description[lang])}</div>
</a>`).join('\n')}
  </div>
</div></section>`;

  return page({
    lang,
    site: SITE_URL,
    title: s.homeTitle,
    description: s.homeDescription,
    body,
    active: 'home',
    appendBrand: false,
    generatedAt: catalog.generatedAt,
    headExtra: head({
      lang,
      route: '',
      title: s.homeTitle,
      description: s.homeDescription,
      siteUrl: SITE_URL,
      jsonLd: [websiteJsonLd(lang, SITE_URL, s.homeDescription)],
    }),
  });
}

function installPanelBlock(lang) {
  const s = t(lang);
  const indexUrl = `${SITE_URL}/api/index.json`;
  return `<section class="block install"><div class="wrap">
  <div class="install-card">
    <div class="install-main">
      <h2>${escapeHtml(s.installPanelTitle)}</h2>
      <p>${escapeHtml(s.installPanelBody)}</p>
      <div class="install-command">
        <pre class="code"><span class="p">$</span> ${escapeHtml(INSTALL_COMMAND)}</pre>
        <button class="copy" type="button" data-copy="${escapeHtml(INSTALL_COMMAND)}" data-copied-label="${escapeHtml(s.copied)}">${escapeHtml(s.copy)}</button>
      </div>
      <div class="note">${escapeHtml(s.installPanelNote)}</div>
    </div>
    <div class="install-side">
      <h3>${escapeHtml(s.indexPanelTitle)}</h3>
      <p>${escapeHtml(s.indexPanelBody)}</p>
      <div class="install-command">
        <pre class="code">${escapeHtml(indexUrl)}</pre>
        <button class="copy" type="button" data-copy="${escapeHtml(indexUrl)}" data-copied-label="${escapeHtml(s.copied)}">${escapeHtml(s.copy)}</button>
      </div>
    </div>
  </div>
</div></section>`;
}

function guidesIndexPage(catalog, lang) {
  const s = t(lang);
  const body = `
<div class="wrap" style="padding:44px 0 60px">
  ${breadcrumbs([{ name: lang === 'zh' ? '首页' : 'Home', href: `/${lang}/` }, { name: s.guidesTitle, href: `/${lang}/guide/` }])}
  <h1 class="page-title">${escapeHtml(s.guidesTitle)}</h1>
  <p style="color:var(--muted);max-width:62ch">${escapeHtml(s.guidesBody)}</p>
  <div class="cats" style="margin-top:26px">
${GUIDES.map((guide) => `<a class="cat" href="/${lang}/guide/${guide.slug}/">
  <div class="name">${escapeHtml(guide.title[lang])}</div>
  <div class="blurb">${escapeHtml(guide.description[lang])}</div>
</a>`).join('\n')}
  </div>
</div>`;
  return page({
    lang,
    site: SITE_URL,
    title: s.guidesTitle,
    description: s.guidesBody,
    body,
    active: 'guides',
    generatedAt: catalog.generatedAt,
    headExtra: head({
      lang,
      route: 'guide/',
      title: `${s.guidesTitle} - ${s.brand}`,
      description: s.guidesBody,
      siteUrl: SITE_URL,
      jsonLd: [breadcrumbJsonLd([{ name: s.brand, path: `/${lang}/` }, { name: s.guidesTitle, path: `/${lang}/guide/` }], SITE_URL)],
    }),
  });
}

function guidePage(catalog, guide, lang) {
  const s = t(lang);
  const title = guide.title[lang];
  const description = guide.description[lang];
  const others = GUIDES.filter((entry) => entry.slug !== guide.slug).slice(0, 3);
  const body = `
<div class="wrap" style="padding:44px 0 64px">
  ${breadcrumbs([{ name: lang === 'zh' ? '首页' : 'Home', href: `/${lang}/` }, { name: s.guidesTitle, href: `/${lang}/guide/` }, { name: title, href: `/${lang}/guide/${guide.slug}/` }])}
  <article class="prose" style="max-width:74ch">
    <h1 class="page-title">${escapeHtml(title)}</h1>
    <p style="color:var(--muted);font-size:13px">${escapeHtml(s.guideUpdated)} ${escapeHtml(fmtDate(catalog.generatedAt))}</p>
    ${guide.body[lang]}
  </article>
  <div class="cats" style="margin-top:40px">
${others.map((entry) => `<a class="cat" href="/${lang}/guide/${entry.slug}/">
  <div class="name">${escapeHtml(entry.title[lang])}</div>
  <div class="blurb">${escapeHtml(entry.description[lang])}</div>
</a>`).join('\n')}
  </div>
</div>`;
  return page({
    lang,
    site: SITE_URL,
    title,
    description,
    body,
    active: 'guides',
    generatedAt: catalog.generatedAt,
    headExtra: head({
      lang,
      route: `guide/${guide.slug}/`,
      title: `${title} - ${s.brand}`,
      description,
      siteUrl: SITE_URL,
      type: 'article',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'TechArticle',
          headline: title,
          description,
          inLanguage: HTML_LANG[lang],
          dateModified: catalog.generatedAt,
          author: { '@type': 'Organization', name: SITE_NAME },
          mainEntityOfPage: absolute(lang, `guide/${guide.slug}/`),
        },
        breadcrumbJsonLd([
          { name: s.brand, path: `/${lang}/` },
          { name: s.guidesTitle, path: `/${lang}/guide/` },
          { name: title, path: `/${lang}/guide/${guide.slug}/` },
        ], SITE_URL),
      ],
    }),
  });
}

function picksPage(catalog, lang) {
  const s = t(lang);
  const candidates = sortedByStars(catalog.plugins.filter((plugin) => plugin.verified));
  const picks = candidates.slice(0, 12);
  const title = `${s.picksTitle}：${picks.length} 个`;
  const rows = picks.map((plugin, index) => {
    const install = plugin.installSpec ?? `${plugin.name}@${plugin.version}`;
    const command = plugin.sourceType === 'npm' ? `dsh plugin --profile web add ${install}` : `dsh plugin --profile web add '${install}'`;
    return `<h2>${index + 1}. ${escapeHtml(localized(plugin.title, lang))}</h2>
<p>${escapeHtml(summarize(plugin.description, lang, 220))}</p>
<pre class="code"><span class="p">$</span> ${escapeHtml(command)}</pre>
<p><a href="/${lang}/p/${repoSlug(plugin)}/">${lang === 'zh' ? '查看详情' : 'Details'} →</a> · ★ ${escapeHtml(fmtNumber(plugin.stars))} · ${escapeHtml(plugin.version ?? '')}</p>`;
  }).join('\n');

  const body = `
<div class="wrap" style="padding:44px 0 64px">
  ${breadcrumbs([{ name: lang === 'zh' ? '首页' : 'Home', href: `/${lang}/` }, { name: s.guidesTitle, href: `/${lang}/guide/` }, { name: s.picksTitle, href: `/${lang}/guide/picks/` }])}
  <article class="prose" style="max-width:74ch">
    <h1 class="page-title">${escapeHtml(s.picksTitle)}</h1>
    <p>${escapeHtml(format(s.picksCount, { n: catalog.plugins.length, m: picks.length }))}</p>
    <div class="note">${escapeHtml(s.picksCriteria)}</div>
    ${rows}
  </article>
</div>`;

  return page({
    lang,
    site: SITE_URL,
    title,
    description: s.picksBody,
    body,
    active: 'guides',
    generatedAt: catalog.generatedAt,
    headExtra: head({
      lang,
      route: 'guide/picks/',
      title: `${title} - ${s.brand}`,
      description: s.picksBody,
      siteUrl: SITE_URL,
      type: 'article',
      jsonLd: [{
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: title,
        numberOfItems: picks.length,
        itemListElement: picks.map((plugin, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: localized(plugin.title, lang),
          url: absolute(lang, `p/${repoSlug(plugin)}/`),
        })),
      }],
    }),
  });
}

function searchPage(catalog, lang) {
  const s = t(lang);
  const body = `
<div class="wrap" style="padding:44px 0 60px" data-search-page>
  ${breadcrumbs([{ name: lang === 'zh' ? '首页' : 'Home', href: `/${lang}/` }, { name: s.searchTitle, href: `/${lang}/search/` }])}
  <h1 class="page-title">${escapeHtml(s.searchTitle)}</h1>
  <p style="color:var(--muted)">${escapeHtml(s.searchBody)}</p>
  <form class="search" style="margin:18px 0 26px" action="/${lang}/search/" method="get">
    <input type="search" name="q" data-search-input placeholder="${escapeHtml(s.searchPlaceholder)}" aria-label="${escapeHtml(s.searchPlaceholder)}">
    <button type="submit">${escapeHtml(s.searchButton)}</button>
  </form>
  <div class="grid" data-search-results></div>
  <div class="empty" data-search-empty hidden>${escapeHtml(s.searchEmpty)}</div>
</div>
<script src="/assets/app.js" defer></script>`;
  return page({
    lang,
    site: SITE_URL,
    title: s.searchTitle,
    description: s.searchBody,
    body,
    active: 'plugins',
    generatedAt: catalog.generatedAt,
    headExtra: head({
      lang,
      route: 'search/',
      title: `${s.searchTitle} - ${s.brand}`,
      description: s.searchBody,
      siteUrl: SITE_URL,
      noindex: true,
    }),
  });
}

function submitPage(catalog, lang) {
  const s = t(lang);
  const body = `
<div class="wrap" style="padding:56px 0 64px">
  <div class="prose">
    <h1 class="page-title">${escapeHtml(s.submitTitle)}</h1>
    <p>${escapeHtml(s.submitBody)}</p>
    <ol>
${s.submitSteps.map((step) => `      <li>${escapeHtml(step)}</li>`).join('\n')}
    </ol>
    <div class="note">${escapeHtml(s.submitNote)}</div>
    <h2>${escapeHtml(s.aboutIndexTitle)}</h2>
    <p>${escapeHtml(s.aboutIndexBody)}</p>
    <pre class="code">${escapeHtml(`${SITE_URL}/api/index.json`)}</pre>
  </div>
</div>`;
  return page({
    lang,
    site: SITE_URL,
    title: s.submitTitle,
    description: s.submitBody,
    body,
    active: 'submit',
    generatedAt: catalog.generatedAt,
    headExtra: head({
      lang, route: 'submit/', title: `${s.submitTitle} - ${s.brand}`, description: s.submitBody, siteUrl: SITE_URL,
      jsonLd: [breadcrumbJsonLd([{ name: s.brand, path: `/${lang}/` }, { name: s.submitTitle, path: `/${lang}/submit/` }], SITE_URL)],
    }),
  });
}

function aboutPage(catalog, lang) {
  const s = t(lang);
  const body = `
<div class="wrap" style="padding:56px 0 64px">
  <div class="prose">
    <h1 class="page-title">${escapeHtml(s.aboutTitle)}</h1>
    <p>${escapeHtml(s.aboutBody)}</p>
    <ul>
${s.aboutPoints.map((point) => `      <li>${escapeHtml(point)}</li>`).join('\n')}
    </ul>
    <h2>${escapeHtml(s.aboutIndexTitle)}</h2>
    <p>${escapeHtml(s.aboutIndexBody)}</p>
    <pre class="code">${escapeHtml(`${SITE_URL}/api/index.json`)}</pre>
    <p style="margin-top:26px"><a href="/api/catalog.json" style="color:var(--accent)">catalog.json</a> · <a href="/api/index.json" style="color:var(--accent)">index.json</a></p>
  </div>
</div>`;
  return page({
    lang,
    site: SITE_URL,
    title: s.aboutTitle,
    description: s.aboutBody,
    body,
    active: 'about',
    generatedAt: catalog.generatedAt,
    headExtra: head({
      lang, route: 'about/', title: `${s.aboutTitle} - ${s.brand}`, description: s.aboutBody, siteUrl: SITE_URL,
      jsonLd: [breadcrumbJsonLd([{ name: s.brand, path: `/${lang}/` }, { name: s.aboutTitle, path: `/${lang}/about/` }], SITE_URL)],
    }),
  });
}

function notFoundPage(lang) {
  const s = t(lang);
  const body = `<div class="wrap" style="padding:80px 0"><h1 class="page-title">${escapeHtml(s.notFoundTitle)}</h1><p style="color:var(--muted)">${escapeHtml(s.notFoundBody)}</p><p><a href="/${lang}/plugins/" style="color:var(--accent)">${escapeHtml(s.nav.plugins)} →</a></p></div>`;
  return page({ lang, site: SITE_URL, title: s.notFoundTitle, body, generatedAt: new Date().toISOString() });
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0c0e10"/><circle cx="16" cy="16" r="6" fill="#d9a34a"/><circle cx="16" cy="16" r="10" fill="none" stroke="#262b30" stroke-width="2"/></svg>
`;

function sitemapEntry(loc, lastmod, langRoute) {
  const alternatesXml = alternates(langRoute, SITE_URL)
    .map((alternate) => `<xhtml:link rel="alternate" hreflang="${alternate.hreflang}" href="${escapeHtml(alternate.href)}"/>`)
    .join('');
  return `  <url><loc>${escapeHtml(loc)}</loc><lastmod>${lastmod}</lastmod>${alternatesXml}</url>`;
}

function sitemapFile(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`;
}

async function main() {
  // Prefer the build copy that still carries each repository's README text.
  const buildCopy = resolve(ROOT, 'data/catalog.build.json');
  const catalog = await readFile(buildCopy, 'utf8')
    .then((text) => JSON.parse(text))
    .catch(() => readFile(resolve(OUT, 'api/catalog.json'), 'utf8').then((text) => JSON.parse(text)));
  const lastmod = (catalog.generatedAt ?? new Date().toISOString()).slice(0, 10);

  await mkdir(resolve(OUT, 'assets'), { recursive: true });
  await copyFile(resolve(ROOT, 'site/assets/style.css'), resolve(OUT, 'assets/style.css'));
  await copyFile(resolve(ROOT, 'site/assets/app.js'), resolve(OUT, 'assets/app.js'));
  await copyFile(resolve(ROOT, 'site/assets/og.png'), resolve(OUT, 'assets/og.png'));
  // Search-engine ownership files must stay at the root and must never be removed.
  for (const name of await readdir(resolve(ROOT, 'site'))) {
    if (/^google[0-9a-f]+\.html$/u.test(name) || /^[0-9a-f]{32}\.txt$/u.test(name)) {
      await copyFile(resolve(ROOT, 'site', name), resolve(OUT, name));
    }
  }
  await write('assets/favicon.svg', FAVICON);

  const pages = [];
  for (const lang of LANGS) {
    await write(`${lang}/index.html`, homePage(catalog, lang));
    await write(`${lang}/submit/index.html`, submitPage(catalog, lang));
    await write(`${lang}/about/index.html`, aboutPage(catalog, lang));
    await write(`${lang}/search/index.html`, searchPage(catalog, lang));
    await write(`${lang}/guide/index.html`, guidesIndexPage(catalog, lang));
    await write(`${lang}/guide/picks/index.html`, picksPage(catalog, lang));
    pages.push(`${lang}/`, `${lang}/submit/`, `${lang}/about/`, `${lang}/guide/`);

    for (const guide of GUIDES) {
      await write(`${lang}/guide/${guide.slug}/index.html`, guidePage(catalog, guide, lang));
      pages.push(`${lang}/guide/${guide.slug}/`);
    }

    // Plugin lists, paginated.
    const totalPages = pageCount(catalog.plugins.length);
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      await write(`${lang}/${listRoute('plugins/', pageNumber)}index.html`, listPage(catalog, lang, { pageNumber }));
      pages.push(`${lang}/${listRoute('plugins/', pageNumber)}`);
    }

    for (const category of CATEGORIES) {
      const count = catalog.plugins.filter((plugin) => plugin.category === category.id).length;
      const categoryPages = pageCount(count);
      for (let pageNumber = 1; pageNumber <= categoryPages; pageNumber += 1) {
        await write(`${lang}/${listRoute(`c/${category.id}/`, pageNumber)}index.html`, listPage(catalog, lang, { category, pageNumber }));
        pages.push(`${lang}/${listRoute(`c/${category.id}/`, pageNumber)}`);
      }
    }

    for (const plugin of catalog.plugins) {
      await write(`${lang}/p/${repoSlug(plugin)}/index.html`, detailPage(catalog, plugin, lang));
      pages.push(`${lang}/p/${repoSlug(plugin)}/`);
    }
  }

  await write('index.html', `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/zh/"><link rel="canonical" href="${SITE_URL}/zh/"><title>DSH 插件市场</title></head><body><a href="/zh/">DSH 插件市场</a></body></html>
`);
  await write('404.html', notFoundPage('zh'));

  // Three sitemaps plus an index, each URL carrying lastmod and hreflang alternates.
  const pluginRoutes = catalog.plugins.map((plugin) => `p/${repoSlug(plugin)}/`);
  const categoryRoutes = CATEGORIES.flatMap((category) => {
    const count = catalog.plugins.filter((plugin) => plugin.category === category.id).length;
    return Array.from({ length: pageCount(count) }, (unused, index) => listRoute(`c/${category.id}/`, index + 1));
  });
  const listRoutes = Array.from({ length: pageCount(catalog.plugins.length) }, (unused, index) => listRoute('plugins/', index + 1));
  const pageRoutes = ['', 'submit/', 'about/', 'guide/', ...GUIDES.map((guide) => `guide/${guide.slug}/`), 'guide/picks/'];

  await mkdir(resolve(OUT, 'sitemaps'), { recursive: true });
  await write('sitemaps/pages.xml', sitemapFile(pageRoutes.flatMap((route) =>
    LANGS.map((lang) => sitemapEntry(absolute(lang, route), lastmod, route)))));
  await write('sitemaps/categories.xml', sitemapFile([...categoryRoutes, ...listRoutes].flatMap((route) =>
    LANGS.map((lang) => sitemapEntry(absolute(lang, route), lastmod, route)))));
  await write('sitemaps/plugins.xml', sitemapFile(pluginRoutes.flatMap((route) =>
    LANGS.map((lang) => sitemapEntry(absolute(lang, route), lastmod, route)))));

  await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${SITE_URL}/sitemaps/pages.xml</loc><lastmod>${lastmod}</lastmod></sitemap>
  <sitemap><loc>${SITE_URL}/sitemaps/categories.xml</loc><lastmod>${lastmod}</lastmod></sitemap>
  <sitemap><loc>${SITE_URL}/sitemaps/plugins.xml</loc><lastmod>${lastmod}</lastmod></sitemap>
</sitemapindex>
`);
  await write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

  await write('CNAME', `${new URL(SITE_URL).host}\n`);
  await write('.nojekyll', '');

  process.stdout.write(`✓ ${pages.length + 2} HTML pages across ${LANGS.length} languages\n`);
  process.stdout.write(`  ${catalog.plugins.length} plugins · ${CATEGORIES.length} categories · ${GUIDES.length} guides\n`);
  process.stdout.write(`  sitemap: ${pluginRoutes.length * 2} plugin URLs, ${pageRoutes.length * 2} page URLs\n`);
}

await main();
