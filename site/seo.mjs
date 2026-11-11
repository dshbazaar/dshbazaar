/** Shared SEO head: canonical, hreflang, Open Graph, structured data. */
import { escapeHtml } from './layout.mjs';

export const SITE_NAME = 'DSHBazaar';
export const LANGS = ['zh', 'en'];
export const LOCALES = { zh: 'zh_CN', en: 'en_US' };
export const HTML_LANG = { zh: 'zh-CN', en: 'en' };

export const url = (lang, route, siteUrl) => `${siteUrl}/${lang}/${route === '' ? '' : route}`;

/** Every language's URL for one route, as hreflang alternates. */
export function alternates(route, siteUrl) {
  return [
    { hreflang: 'zh-CN', href: url('zh', route, siteUrl) },
    { hreflang: 'en', href: url('en', route, siteUrl) },
    { hreflang: 'x-default', href: url('zh', route, siteUrl) },
  ];
}

function jsonLdScript(value) {
  return `<script type="application/ld+json">${JSON.stringify(value).replaceAll('</', '<\\/')}</script>`;
}

export function head({
  lang,
  route,
  title,
  description,
  siteUrl,
  type = 'website',
  image,
  jsonLd = [],
  noindex = false,
}) {
  const canonical = url(lang, route, siteUrl);
  const ogImage = image ?? `${siteUrl}/assets/og.png`;
  const blocks = [
    ...alternates(route, siteUrl).map(
      (alternate) => `<link rel="alternate" hreflang="${alternate.hreflang}" href="${escapeHtml(alternate.href)}">`,
    ),
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<link rel="alternate" type="application/json" href="${siteUrl}/api/index.json" title="DSH market index">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:locale" content="${LOCALES[lang]}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta property="og:image" content="${escapeHtml(ogImage)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow">',
    ...jsonLd.map(jsonLdScript),
  ];
  return blocks.join('\n');
}

export function breadcrumbJsonLd(items, siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${siteUrl}${item.path}`,
    })),
  };
}

export function websiteJsonLd(lang, siteUrl, description) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: lang === 'zh' ? 'DSH 插件市场' : 'DSH Plugin Market',
    url: `${siteUrl}/${lang}/`,
    description,
    inLanguage: HTML_LANG[lang],
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/${lang}/search/?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function softwareJsonLd(plugin, lang, siteUrl, name, description) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    description,
    url: `${siteUrl}/${lang}/p/${plugin.repoUrl.replace(/^https:\/\/github\.com\//u, '')}/`,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Windows, Linux',
    softwareVersion: plugin.version,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    author: { '@type': 'Person', name: plugin.author ?? 'unknown' },
    ...(plugin.repoUrl === undefined ? {} : { sameAs: [plugin.repoUrl] }),
    ...(plugin.updatedAt === undefined ? {} : { dateModified: plugin.updatedAt }),
  };
}
