#!/usr/bin/env node
/**
 * Turn the raw repository scan into two artifacts:
 *
 *   public/api/index.json    market index format 1, the format DSH reads
 *   public/api/catalog.json  the flat catalog the website and the in-app plugin render
 *
 * Emits only entries that can be installed today: a published npm release, or a git
 * source pinned to the default branch head commit.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, inferCategory } from '../config/categories.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'data/repos.json');
const OUT_DIR = resolve(ROOT, 'public/api');
const SITE_URL = process.env.DSH_MARKET_SITE_URL ?? 'https://dshbazaar.io';

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u;
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const CJK = /[\u4e00-\u9fff]/u;

const hasCjk = (text) => CJK.test(text);

/** A package name npm accepts, derived from the repository when the manifest has none. */
function packageNameOf(repo) {
  const declared = repo.manifest?.name;
  if (typeof declared === 'string' && PACKAGE_NAME.test(declared) && declared.length <= 214) return declared;
  const slug = `${repo.owner}-${repo.repoName}`
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/gu, '-')
    .replace(/^[^a-z0-9]+/u, '')
    .replace(/-+/gu, '-')
    .slice(0, 100);
  return /^[a-z0-9]/u.test(slug) ? slug : `dsh-${slug}`.slice(0, 214);
}

/** Localized text that always carries `en`, as market index format 1 requires. */
function localized(text, fallback = '') {
  const value = String(text ?? '').trim() || fallback;
  if (value === '') return { en: 'Untitled plugin' };
  return hasCjk(value) ? { zh: value, en: value } : { en: value };
}

const toSeconds = (iso) => {
  const value = Date.parse(iso ?? '');
  return Number.isFinite(value) ? Math.floor(value / 1000) : 0;
};

function engineRange(value) {
  if (typeof value !== 'string' || value === '' || value.startsWith('workspace:')) return undefined;
  return value;
}

/** The installable version of a repository, or undefined when neither source is usable. */
function versionOf(repo) {
  const engines = engineRange(repo.manifest?.dshTarget);
  if (repo.npm !== undefined && SEMVER.test(repo.npm.version)) {
    return {
      version: repo.npm.version,
      publishTimestamp: repo.npm.publishedAt ?? toSeconds(repo.pushedAt),
      source: { type: 'npm', registry: repo.npm.registry },
      ...(engines === undefined ? {} : { engines: { dsh: engines } }),
      installSpec: `${packageNameOf(repo)}@${repo.npm.version}`,
      registry: repo.npm.registry,
    };
  }
  if (typeof repo.commit === 'string' && /^[0-9a-f]{40}$/u.test(repo.commit)) {
    const declared = repo.manifest?.version;
    return {
      version: typeof declared === 'string' && SEMVER.test(declared) ? declared : '0.0.0',
      publishTimestamp: toSeconds(repo.pushedAt),
      source: { type: 'git', url: repo.htmlUrl, commit: repo.commit },
      ...(engines === undefined ? {} : { engines: { dsh: engines } }),
      installSpec: `git+${repo.htmlUrl}.git#${repo.commit}`,
      registry: undefined,
    };
  }
  return undefined;
}

/**
 * Whether a repository actually describes a DSH plugin.
 *
 * The topic is open to anyone, so the scan also finds ordinary projects that happen to
 * carry it. Keeping an entry needs a declared bundle, a DSH engine range, or an explicit
 * DSH mention in its name, description or topics.
 */
function relevant(repo) {
  if (repo.manifest?.declaresBundle === true) return true;
  if (repo.manifest?.dshTarget !== undefined) return true;
  if (repo.owner === 'deepseek-ai') return false;
  const otherTopics = (repo.topics ?? []).filter((topic) => topic !== 'dsh-plugin');
  const haystack = [repo.repoName, repo.description, ...otherTopics].join(' ').toLowerCase();
  return /(^|[^a-z0-9])dsh([^a-z0-9]|$)/u.test(haystack)
    || haystack.includes('deepseek-harness')
    || haystack.includes('deepseek harness');
}

function entryOf(repo) {
  if (!relevant(repo)) return undefined;
  const version = versionOf(repo);
  if (version === undefined) return undefined;
  const name = packageNameOf(repo);
  const title = localized(repo.repoName);
  const description = localized(repo.manifest?.description ?? repo.description, 'No description yet.');
  const verified = repo.manifest?.declaresBundle === true;
  const category = inferCategory({
    topics: repo.topics,
    name: repo.repoName,
    description: `${repo.description} ${repo.manifest?.description ?? ''}`,
  });
  const homepage = typeof repo.homepage === 'string' && URL.canParse(repo.homepage) ? repo.homepage : undefined;

  const catalog = {
    name,
    title,
    description,
    category,
    verified,
    stars: repo.stars,
    forks: repo.forks,
    openIssues: repo.openIssues,
    language: repo.language,
    license: repo.license,
    topics: repo.topics.slice(0, 12),
    updatedAt: repo.pushedAt,
    createdAt: repo.createdAt,
    repoUrl: repo.htmlUrl,
    homepage,
    iconUrl: repo.owner === undefined ? undefined : `https://github.com/${repo.owner}.png?size=80`,
    author: repo.owner,
    version: version.version,
    installSpec: version.installSpec,
    registry: version.registry,
    sourceType: version.source.type,
    dshTarget: repo.manifest?.dshTarget,
    archived: repo.archived,
    packageName: repo.manifest?.name,
  };

  const indexEntry = {
    name,
    title: catalog.title,
    description: catalog.description,
    ...(catalog.iconUrl === undefined ? {} : { icon: catalog.iconUrl }),
    ...(catalog.author === undefined ? {} : { author: catalog.author }),
    ...(homepage === undefined ? {} : { homepage }),
    repository: { url: repo.htmlUrl },
    metadata: {
      category,
      keywords: [...new Set(repo.topics)].slice(0, 12),
      labels: verified ? ['dsh-bundle'] : ['unconfirmed'],
      sortKeys: { stars: repo.stars, updated: toSeconds(repo.pushedAt) },
    },
    versions: [{
      version: version.version,
      publishTimestamp: version.publishTimestamp,
      source: version.source,
      ...(version.engines === undefined ? { engines: {} } : { engines: version.engines }),
    }],
  };

  return { catalog, indexEntry, version };
}

function indexDocument(entries) {
  return {
    format: 1,
    title: { en: 'DSH Market Hub', zh: 'DSH 插件市场' },
    description: {
      en: 'Community DeepSeek Harness plugins, discovered from the dsh-plugin topic and verified before listing.',
      zh: '从 dsh-plugin 话题发现并校验的 DeepSeek Harness 社区插件目录。',
    },
    metadata: {
      categories: Object.fromEntries(CATEGORIES.map((category) => [category.id, { title: category.title }])),
      labels: {
        'dsh-bundle': { title: { en: 'Declares a DSH bundle', zh: '声明了 DSH 组合包' } },
        unconfirmed: { title: { en: 'Not verified yet', zh: '尚未验证' } },
      },
      sortKeys: {
        stars: { title: { en: 'Stars', zh: 'Star 数' }, order: 'desc' },
        updated: { title: { en: 'Recently updated', zh: '最近更新' }, order: 'desc' },
      },
    },
    plugins: entries,
  };
}

async function main() {
  const raw = JSON.parse(await readFile(SRC, 'utf8'));
  const entries = raw.repos
    .map(entryOf)
    .filter((entry) => entry !== undefined)
    .sort((left, right) => {
      if (left.catalog.verified !== right.catalog.verified) return left.catalog.verified ? -1 : 1;
      return right.catalog.stars - left.catalog.stars;
    });

  const built = entries.map((entry) => entry.indexEntry);
  const catalog = entries.map((entry) => entry.catalog);

  await mkdir(OUT_DIR, { recursive: true });
  const index = indexDocument(built);
  const payload = {
    generatedAt: new Date().toISOString(),
    siteUrl: SITE_URL,
    totals: {
      plugins: catalog.length,
      verified: catalog.filter((plugin) => plugin.verified).length,
      npm: catalog.filter((plugin) => plugin.sourceType === 'npm').length,
      stars: catalog.reduce((sum, plugin) => sum + plugin.stars, 0),
    },
    plugins: catalog,
  };

  await writeFile(resolve(OUT_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  await writeFile(resolve(OUT_DIR, 'catalog.json'), `${JSON.stringify(payload, null, 2)}\n`);

  process.stdout.write(`✓ ${catalog.length} plugins · verified ${payload.totals.verified} · npm ${payload.totals.npm}\n`);
  process.stdout.write('  public/api/index.json  (market index format 1)\n');
  process.stdout.write('  public/api/catalog.json (site + in-app plugin)\n');
}

await main();
