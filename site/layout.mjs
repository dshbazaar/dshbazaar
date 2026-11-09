/** HTML shell, shared fragments and formatting helpers for the static catalog. */
import { t } from './i18n.mjs';
import { categoryById } from '../config/categories.mjs';

export const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const fmtNumber = (value) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value ?? 0);

export const fmtDate = (iso) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

/** Localized text of a catalog field ({ zh, en } or a plain string). */
export const localized = (value, lang) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return value[lang] ?? value.en ?? Object.values(value)[0] ?? '';
};

export function repoSlug(plugin) {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)/u.exec(plugin.repoUrl ?? '');
  return match === null ? plugin.name.replaceAll('/', '-') : `${match[1]}/${match[2]}`;
}

export const pluginPath = (plugin, lang) => `/${lang}/p/${repoSlug(plugin)}/`;

function header({ lang, site, active }) {
  const s = t(lang);
  const nav = [
    ['plugins', `/${lang}/plugins/`],
    ['submit', `/${lang}/submit/`],
    ['about', `/${lang}/about/`],
  ];
  return `<header class="site"><div class="wrap bar">
  <a class="brand" href="/${lang}/"><span class="dot"></span>${escapeHtml(s.brand)}<span class="sub">${escapeHtml(s.tagline)}</span></a>
  <nav class="main">
    ${nav.map(([key, href]) => `<a href="${href}"${active === key ? ' style="color:var(--text)"' : ''}>${escapeHtml(s.nav[key])}</a>`).join('\n    ')}
    <a class="lang" href="/${s.otherLang}/">${escapeHtml(s.langLabel === '中文' ? 'EN' : '中文')}</a>
  </nav>
</div></header>`;
}

function footer({ lang, site, generatedAt }) {
  const s = t(lang);
  return `<footer class="site"><div class="wrap row">
  <div>${escapeHtml(s.footerNote)}</div>
  <div>${escapeHtml(s.generated)} ${escapeHtml(fmtDate(generatedAt))} · <a href="/api/index.json">index.json</a></div>
</div></footer>`;
}

export function page({ lang, site, title, description, body, active, generatedAt }) {
  const s = t(lang);
  const fullTitle = title === undefined ? `${s.brand} · ${s.tagline}` : `${title} · ${s.brand}`;
  return `<!doctype html>
<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(description ?? s.heroBody)}">
<link rel="stylesheet" href="/assets/style.css">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
</head>
<body>
${header({ lang, site, active })}
<main>
${body}
</main>
${footer({ lang, site, generatedAt })}
</body>
</html>
`;
}

export function card(plugin, lang) {
  const s = t(lang);
  const category = categoryById(plugin.category);
  const desc = localized(plugin.description, lang);
  return `<a class="card" href="${pluginPath(plugin, lang)}">
  <div class="top">
    ${plugin.iconUrl ? `<img class="avatar" src="${escapeHtml(plugin.iconUrl)}" alt="" loading="lazy">` : ''}
    <h3>${escapeHtml(localized(plugin.title, lang))}</h3>
  </div>
  <p class="desc">${escapeHtml(desc)}</p>
  <div class="foot">
    <span class="cat-tag">${escapeHtml(localized(category.title, lang))}</span>
    <span>★ ${fmtNumber(plugin.stars)}</span>
    ${plugin.verified ? `<span class="badge ok">${escapeHtml(s.verified)}</span>` : ''}
  </div>
</a>`;
}

export function searchForm(lang, value = '') {
  const s = t(lang);
  return `<form class="search" action="/${lang}/plugins/" method="get">
  <input type="search" name="q" value="${escapeHtml(value)}" placeholder="${escapeHtml(s.searchPlaceholder)}" aria-label="${escapeHtml(s.searchPlaceholder)}">
  <button type="submit">${lang === 'zh' ? '搜索' : 'Search'}</button>
</form>`;
}

export function stat(value, label) {
  return `<div class="stat"><div class="n">${escapeHtml(value)}</div><div class="k">${escapeHtml(label)}</div></div>`;
}

/** The install panel shown on the home page: a copyable command plus the index alternative. */
export function installPanel(lang, { command, indexUrl }) {
  const s = t(lang);
  return `<section class="block install"><div class="wrap">
  <div class="install-card">
    <div class="install-main">
      <h2>${escapeHtml(s.installPanelTitle)}</h2>
      <p>${escapeHtml(s.installPanelBody)}</p>
      <div class="install-command">
        <pre class="code"><span class="p">$</span> ${escapeHtml(command)}</pre>
        <button class="copy" type="button" data-copy="${escapeHtml(command)}" data-copied-label="${escapeHtml(s.copied)}">${escapeHtml(s.copy)}</button>
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
