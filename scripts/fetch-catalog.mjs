#!/usr/bin/env node
/**
 * Discover DSH plugins from the public GitHub topic `dsh-plugin` and record what each
 * repository declares. Writes `data/repos.json`; network failures are recorded per repo
 * instead of aborting the run.
 *
 * Env:
 *   GITHUB_TOKEN      optional, raises the GitHub API rate limit; never printed
 *   DSH_MARKET_LIMIT  repositories to keep (default 100, max 1000; the search API caps at 1000)
 *   DSH_MARKET_PAGES  search pages to walk (default 1, 100 repos per page, max 10)
 */
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { fetchJson, fetchText, mapPool, sleep } from './lib/net.mjs';

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data/repos.json');

const LIMIT = Math.min(Number(process.env.DSH_MARKET_LIMIT ?? 100) || 100, 1000);
const PAGES = Math.min(Number(process.env.DSH_MARKET_PAGES ?? 1) || 1, 10);
const TOKEN = process.env.GITHUB_TOKEN?.trim();
const TOPIC = 'dsh-plugin';

const headers = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};

function log(message) {
  process.stdout.write(`${message}\n`);
}

async function searchPage(page) {
  const url = `https://api.github.com/search/repositories?q=topic:${TOPIC}&sort=stars&order=desc&per_page=100&page=${page}`;
  const { ok, data, status } = await fetchJson(url, { headers });
  if (!ok) {
    log(`! search page ${page} failed (status ${status})`);
    return [];
  }
  return data.items ?? [];
}

/** The default branch head commit, without spending GitHub API quota. */
async function headCommit(fullName) {
  try {
    const { stdout } = await run('git', ['ls-remote', `https://github.com/${fullName}.git`, 'HEAD'], {
      timeout: 20000,
      maxBuffer: 1024 * 1024,
    });
    const sha = stdout.trim().split(/\s+/)[0] ?? '';
    return /^[0-9a-f]{40}$/.test(sha) ? sha : undefined;
  } catch {
    return undefined;
  }
}

/** Plain text of a repository README, trimmed to a size a detail page can show. */
async function readReadme(fullName, branch) {
  for (const name of ['README.md', 'README.zh.md', 'README.zh-CN.md', 'readme.md', 'Readme.md']) {
    const text = await fetchText(`https://raw.githubusercontent.com/${fullName}/${branch}/${name}`);
    if (text === undefined || text.trim() === '') continue;
    return toPlainText(text).slice(0, 4000);
  }
  return undefined;
}

/** Strip the Markdown scaffolding a README carries; keep headings and sentences. */
function toPlainText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/^\s*[-=]{3,}\s*$/gm, ' ')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readManifest(fullName, branch) {
  const text = await fetchText(`https://raw.githubusercontent.com/${fullName}/${branch}/package.json`);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Latest published version of a package on the public npm registry. */
async function npmRelease(name) {
  if (typeof name !== 'string' || name === '') return undefined;
  const { ok, data } = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(name).replace('%40', '@')}`);
  if (!ok || data === undefined) return undefined;
  const latest = data['dist-tags']?.latest;
  if (typeof latest !== 'string') return undefined;
  const publishedAt = data.time?.[latest];
  const timestamp = publishedAt === undefined ? undefined : Math.floor(Date.parse(publishedAt) / 1000);
  return {
    version: latest,
    publishedAt: Number.isFinite(timestamp) ? timestamp : undefined,
    registry: 'https://registry.npmjs.org/',
  };
}

function dshTargetOf(manifest) {
  if (manifest === undefined) return undefined;
  const range = manifest.engines?.dsh;
  if (typeof range === 'string') return range;
  const peers = Object.entries(manifest.peerDependencies ?? {})
    .filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
    .map(([, value]) => value);
  return peers[0];
}

function declaresBundle(manifest) {
  return typeof manifest?.dsh?.bundle?.patch === 'string' && manifest.dsh.bundle.patch !== '';
}

function normalize(repo, manifest, npm, commit) {
  const topics = Array.isArray(repo.topics) ? repo.topics : [];
  return {
    fullName: repo.full_name,
    owner: repo.owner?.login,
    repoName: repo.name,
    htmlUrl: repo.html_url,
    description: repo.description ?? '',
    homepage: repo.homepage ?? undefined,
    defaultBranch: repo.default_branch ?? 'main',
    archived: Boolean(repo.archived),
    license: repo.license?.spdx_id ?? undefined,
    language: repo.language ?? undefined,
    stars: repo.stargazers_count ?? 0,
    forks: repo.forks_count ?? 0,
    openIssues: repo.open_issues_count ?? 0,
    createdAt: repo.created_at,
    pushedAt: repo.pushed_at,
    topics,
    manifest: manifest === undefined ? undefined : {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: typeof manifest.author === 'string' ? manifest.author : manifest.author?.name,
      homepage: manifest.homepage,
      license: manifest.license,
      declaresBundle: declaresBundle(manifest),
      dshTarget: dshTargetOf(manifest),
      engines: manifest.engines,
    },
    npm,
    commit,
  };
}

async function enrich(item) {
  const branch = item.default_branch ?? 'main';
  const [manifest, commit, readme] = await Promise.all([
    readManifest(item.full_name, branch),
    headCommit(item.full_name),
    readReadme(item.full_name, branch),
  ]);
  const npm = await npmRelease(manifest?.name);
  return { ...normalize(item, manifest, npm, commit), readme };
}

async function main() {
  log(`DSH Market Hub · catalog scan (topic:${TOPIC}, limit ${LIMIT})`);
  const items = [];
  for (let page = 1; page <= PAGES; page += 1) {
    const found = await searchPage(page);
    log(`  search page ${page}: ${found.length} repositories`);
    items.push(...found);
    if (found.length < 100) break;
    await sleep(1200); // unauthenticated search allows 10 requests a minute
  }

  const seen = new Set();
  const unique = items.filter((item) => {
    if (seen.has(item.full_name)) return false;
    seen.add(item.full_name);
    return true;
  });
  const selected = unique.slice(0, LIMIT);

  const records = await mapPool(selected, 6, async (item, index) => {
    const record = await enrich(item);
    if ((index + 1) % 10 === 0) log(`  enriched ${index + 1}/${selected.length}`);
    return record;
  });

  const withBundle = records.filter((record) => record.manifest?.declaresBundle).length;
  const withNpm = records.filter((record) => record.npm !== undefined).length;
  const payload = {
    generatedAt: new Date().toISOString(),
    topic: TOPIC,
    totals: { scanned: records.length, declaresBundle: withBundle, publishedOnNpm: withNpm },
    repos: records,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`);
  log(`✓ ${records.length} repositories → ${OUT}`);
  log(`  declares dsh.bundle: ${withBundle} · published on npm: ${withNpm}`);
  if (records.length < selected.length) log('! some repositories could not be enriched');
}

await main();
