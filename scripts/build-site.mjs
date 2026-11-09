#!/usr/bin/env node
/**
 * Render the static catalog site from `public/api/catalog.json`.
 *
 * Emits both languages under /zh and /en, plus the API artifacts, sitemap and robots.txt.
 * No framework and no client-side rendering: every list page is real HTML, and
 * assets/app.js only filters and reorders the cards already on the page.
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, categoryById } from '../config/categories.mjs';
import { LANGS, t } from '../site/i18n.mjs';
import {
  card,
  escapeHtml,
  fmtDate,
  fmtNumber,
  localized,
  page,
  pluginPath,
  repoSlug,
  searchForm,
  stat,
} from '../site/layout.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public');
const SITE_URL = process.env.DSH_MARKET_SITE_URL?.trim() || 'https://dshbazaar.io';

const write = async (path, contents) => {
  const target = resolve(OUT, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents);
};

const sortedByStars = (plugins) => [...plugins].sort((left, right) => right.stars - left.stars);

function categoryCards(plugins, lang) {
  const s = t(lang);
  return CATEGORIES.map((category) => {
    const count = plugins.filter((plugin) => plugin.category === category.id).length;
    return `<a class="cat" href="/${lang}/c/${category.id}/">
  <div class="name">${escapeHtml(localized(category.title, lang))}</div>
  <div class="blurb">${escapeHtml(localized(category.blurb, lang))}</div>
  <div class="count">${count} ${lang === 'zh' ? '个插件' : count === 1 ? 'plugin' : 'plugins'}</div>
</a>`;
  }).join('\n');
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
${picks.map((plugin) => card(plugin, lang)).join('\n')}
  </div>
</div></section>`;
  return page({
    lang,
    site: SITE_URL,
    description: s.heroBody,
    body,
    active: 'home',
    generatedAt: catalog.generatedAt,
  });
}

function listBody(plugins, lang, { category = null } = {}) {
  const s = t(lang);
  const chips = [
    `<a class="chip${category === null ? ' active' : ''}" href="/${lang}/plugins/">${escapeHtml(s.allCategories)}</a>`,
    ...CATEGORIES.map((entry) => {
      const active = category === entry.id ? ' active' : '';
      return `<a class="chip${active}" href="/${lang}/c/${entry.id}/">${escapeHtml(localized(entry.title, lang))}</a>`;
    }),
  ].join('\n');

  const cards = plugins.map((plugin) => {
    const desc = localized(plugin.description, lang);
    const search = [
      localized(plugin.title, lang),
      desc,
      plugin.name,
      repoSlug(plugin),
      ...(plugin.topics ?? []),
    ].join(' ').toLowerCase();
    return card(plugin, lang).replace(
      '<a class="card"',
      `<a class="card" data-card data-verified="${plugin.verified}" data-stars="${plugin.stars}" data-updated="${Date.parse(plugin.updatedAt ?? '') || 0}" data-name="${escapeHtml(localized(plugin.title, lang))}" data-search="${escapeHtml(search)}"`,
    );
  }).join('\n');

  return `
<div class="wrap" style="padding:44px 0 60px">
  <div class="section-head"><div><h2>${escapeHtml(s.pluginsTitle)}</h2><p>${escapeHtml(s.pluginsBody)}</p></div>
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
${cards}
  </div>
  <div class="empty" data-empty hidden>${escapeHtml(s.empty)}</div>
</div>
<script src="/assets/app.js" defer></script>`;
}

function listPage(catalog, lang, options = {}) {
  const s = t(lang);
  const category = options.category === undefined || options.category === null ? null : categoryById(options.category);
  const plugins = category === null
    ? sortedByStars(catalog.plugins)
    : sortedByStars(catalog.plugins.filter((plugin) => plugin.category === category.id));
  const title = category === null ? s.pluginsTitle : localized(category.title, lang);
  return page({
    lang,
    site: SITE_URL,
    title,
    description: category === null ? s.pluginsBody : localized(category.blurb, lang),
    body: listBody(plugins, lang, { category: category?.id ?? null }),
    active: 'plugins',
    generatedAt: catalog.generatedAt,
  });
}

function detailPage(catalog, plugin, lang) {
  const s = t(lang);
  const category = categoryById(plugin.category);
  const meta = [
    [s.fieldRepo, plugin.repoUrl ? `<a href="${escapeHtml(plugin.repoUrl)}">${escapeHtml(repoSlug(plugin))}</a>` : '—'],
    [s.fieldVersion, escapeHtml(plugin.version ?? '—')],
    [s.fieldSource, escapeHtml(plugin.sourceType === 'npm' ? s.sourceNpm : s.sourceGit)],
    [s.fieldTarget, plugin.dshTarget ? `<code>${escapeHtml(plugin.dshTarget)}</code>` : '—'],
    [s.fieldLicense, escapeHtml(plugin.license ?? '—')],
    [s.fieldLanguage, escapeHtml(plugin.language ?? '—')],
    [s.fieldUpdated, escapeHtml(fmtDate(plugin.updatedAt))],
    [s.star, escapeHtml(fmtNumber(plugin.stars))],
    [s.fork, escapeHtml(fmtNumber(plugin.forks))],
  ];
  const install = plugin.installSpec ?? `${plugin.name}@${plugin.version}`;
  const command = plugin.sourceType === 'npm'
    ? `dsh plugin --profile web add ${install}`
    : `dsh plugin --profile web add '${install}'`;
  const registryNote = plugin.sourceType === 'npm' && plugin.registry && plugin.registry !== 'https://registry.npmjs.org/'
    ? `\n# registry: ${plugin.registry}`
    : '';

  const body = `
<div class="wrap detail">
  <div>
    <a class="more" href="/${lang}/plugins/" style="color:var(--muted);font-size:13px">← ${escapeHtml(s.backToList)}</a>
    <h1>${escapeHtml(localized(plugin.title, lang))}</h1>
    <div class="badges">
      <span class="badge ${plugin.verified ? 'ok' : ''}">${escapeHtml(plugin.verified ? s.verified : s.unconfirmed)}</span>
      <a class="badge" href="/${lang}/c/${category.id}/">${escapeHtml(localized(category.title, lang))}</a>
      <span class="badge">★ ${escapeHtml(fmtNumber(plugin.stars))}</span>
      ${plugin.archived ? '<span class="badge">archived</span>' : ''}
    </div>
    <p class="lede">${escapeHtml(localized(plugin.description, lang))}</p>

    <h2>${escapeHtml(s.detailInstall)}</h2>
    <p style="color:var(--muted);margin:0 0 12px">${escapeHtml(s.detailInstallBody)}</p>
    <pre class="code"><span class="p">$</span> ${escapeHtml(command)}${escapeHtml(registryNote)}</pre>
  </div>
  <aside>
    <h2 style="margin-top:0">${escapeHtml(s.detailMeta)}</h2>
    <div class="meta">
${meta.map(([key, value]) => `      <div><span class="k">${escapeHtml(key)}</span><span class="v">${value}</span></div>`).join('\n')}
    </div>
  </aside>
</div>`;
  return page({
    lang,
    site: SITE_URL,
    title: localized(plugin.title, lang),
    description: localized(plugin.description, lang),
    body,
    active: 'plugins',
    generatedAt: catalog.generatedAt,
  });
}

function submitPage(catalog, lang) {
  const s = t(lang);
  const body = `
<div class="wrap" style="padding:56px 0 64px">
  <div class="prose">
    <h1 style="font:600 clamp(28px,3.6vw,40px)/1.15 var(--serif);letter-spacing:-0.02em;margin:0 0 16px">${escapeHtml(s.submitTitle)}</h1>
    <p>${escapeHtml(s.submitBody)}</p>
    <ol>
${s.submitSteps.map((step) => `      <li>${escapeHtml(step)}</li>`).join('\n')}
    </ol>
    <div class="note">${escapeHtml(s.submitNote)}</div>
    <h2 style="font:600 18px/1.3 var(--sans);margin:32px 0 10px">${escapeHtml(s.aboutIndexTitle)}</h2>
    <p>${escapeHtml(s.aboutIndexBody)}</p>
    <pre class="code">${escapeHtml(`${SITE_URL}/api/index.json`)}</pre>
  </div>
</div>`;
  return page({ lang, site: SITE_URL, title: s.submitTitle, description: s.submitBody, body, active: 'submit', generatedAt: catalog.generatedAt });
}

function aboutPage(catalog, lang) {
  const s = t(lang);
  const body = `
<div class="wrap" style="padding:56px 0 64px">
  <div class="prose">
    <h1 style="font:600 clamp(28px,3.6vw,40px)/1.15 var(--serif);letter-spacing:-0.02em;margin:0 0 16px">${escapeHtml(s.aboutTitle)}</h1>
    <p>${escapeHtml(s.aboutBody)}</p>
    <ul>
${s.aboutPoints.map((point) => `      <li>${escapeHtml(point)}</li>`).join('\n')}
    </ul>
    <h2 style="font:600 18px/1.3 var(--sans);margin:32px 0 10px">${escapeHtml(s.aboutIndexTitle)}</h2>
    <p>${escapeHtml(s.aboutIndexBody)}</p>
    <pre class="code">${escapeHtml(`${SITE_URL}/api/index.json`)}</pre>
    <p style="margin-top:26px"><a href="/api/catalog.json" style="color:var(--accent)">catalog.json</a> · <a href="/api/index.json" style="color:var(--accent)">index.json</a></p>
  </div>
</div>`;
  return page({ lang, site: SITE_URL, title: s.aboutTitle, description: s.aboutBody, body, active: 'about', generatedAt: catalog.generatedAt });
}

function notFoundPage(lang) {
  const s = t(lang);
  const body = `<div class="wrap" style="padding:80px 0"><h1 style="font:600 32px/1.2 var(--serif)">${escapeHtml(s.notFoundTitle)}</h1><p style="color:var(--muted)">${escapeHtml(s.notFoundBody)}</p><p><a href="/${lang}/plugins/" style="color:var(--accent)">${escapeHtml(s.nav.plugins)} →</a></p></div>`;
  return page({ lang, site: SITE_URL, title: s.notFoundTitle, body, generatedAt: new Date().toISOString() });
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0c0e10"/><circle cx="16" cy="16" r="6" fill="#d9a34a"/><circle cx="16" cy="16" r="10" fill="none" stroke="#262b30" stroke-width="2"/></svg>
`;

async function main() {
  const catalog = JSON.parse(await readFile(resolve(OUT, 'api/catalog.json'), 'utf8'));
  await mkdir(resolve(OUT, 'assets'), { recursive: true });
  await copyFile(resolve(ROOT, 'site/assets/style.css'), resolve(OUT, 'assets/style.css'));
  await copyFile(resolve(ROOT, 'site/assets/app.js'), resolve(OUT, 'assets/app.js'));
  await write('assets/favicon.svg', FAVICON);

  for (const lang of LANGS) {
    await write(`${lang}/index.html`, homePage(catalog, lang));
    await write(`${lang}/plugins/index.html`, listPage(catalog, lang));
    await write(`${lang}/submit/index.html`, submitPage(catalog, lang));
    await write(`${lang}/about/index.html`, aboutPage(catalog, lang));
    for (const category of CATEGORIES) {
      await write(`${lang}/c/${category.id}/index.html`, listPage(catalog, lang, { category: category.id }));
    }
    for (const plugin of catalog.plugins) {
      await write(`${lang}/p/${repoSlug(plugin)}/index.html`, detailPage(catalog, plugin, lang));
    }
  }

  await write('index.html', `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/zh/"><link rel="canonical" href="/zh/"><title>DSH 插件市场</title></head><body><a href="/zh/">DSH 插件市场</a></body></html>
`);
  await write('404.html', notFoundPage('zh'));

  const urls = [];
  for (const lang of LANGS) {
    urls.push(`/${lang}/`, `/${lang}/plugins/`, `/${lang}/submit/`, `/${lang}/about/`);
    for (const category of CATEGORIES) urls.push(`/${lang}/c/${category.id}/`);
    for (const plugin of catalog.plugins) urls.push(pluginPath(plugin, lang));
  }
  await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((path) => `  <url><loc>${SITE_URL}${path}</loc></url>`).join('\n')}
</urlset>
`);
  await write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

  // GitHub Pages custom domain + a marker that skips Jekyll processing.
  await write('CNAME', `${new URL(SITE_URL).host}\n`);
  await write('.nojekyll', '');

  const pages = LANGS.length * (4 + CATEGORIES.length + catalog.plugins.length) + 2;
  process.stdout.write(`✓ ${pages} HTML pages across ${LANGS.length} languages\n`);
  process.stdout.write(`  ${catalog.plugins.length} plugin detail pages · ${CATEGORIES.length} category pages\n`);
}

await main();
