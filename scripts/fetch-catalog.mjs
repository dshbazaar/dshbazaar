#!/usr/bin/env node
/**
 * Discover DSH plugins from the public GitHub topic `dsh-plugin` and record what each
 * repository declares. Writes `data/repos.json`; network failures are recorded per repo
 * instead of aborting the run.
 *
 * The scan is a fixed-size sample, not a mirror of the topic: the topic holds tens of
 * thousands of repositories while the catalogue only wants a stable, high-signal slice.
 * A repository that has been catalogued before keeps its page even after it leaves the
 * sample, so long as it still exists and is not archived. That keeps detail URLs from
 * appearing and disappearing with the sample's boundary.
 *
 * Env:
 *   GITHUB_TOKEN          optional, raises the GitHub API rate limit; never printed
 *   DSH_MARKET_TOP_STARS  sample size by stars (default 1000)
 *   DSH_MARKET_NEW_DAYS   window for newly created plugins (default 30)
 *   DSH_MARKET_NEW_TOP    repositories to take from that window (default 200)
 *   DSH_MARKET_LIMIT      hard cap on the sampled set (default 1200, max 3000)
 *   DSH_MARKET_RETAIN_MAX previously catalogued pages kept outside the sample (default 1500)
 *   DSH_MARKET_STATE      state file path (default `.catalog-state.json`)
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { fetchJson, fetchText, mapPool, sleep } from './lib/net.mjs';

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data/repos.json');

const LIMIT = Math.min(Number(process.env.DSH_MARKET_LIMIT ?? 1200) || 1200, 3000);
const TOP_STARS = Math.max(1, Number(process.env.DSH_MARKET_TOP_STARS ?? 1000) || 1000);
const NEW_DAYS = Math.max(1, Number(process.env.DSH_MARKET_NEW_DAYS ?? 30) || 30);
const NEW_TOP = Math.max(0, Number(process.env.DSH_MARKET_NEW_TOP ?? 200) || 200);
const RETAIN_MAX = Math.max(0, Number(process.env.DSH_MARKET_RETAIN_MAX ?? 1500) || 1500);
const STATE = resolve(ROOT, process.env.DSH_MARKET_STATE?.trim() || '.catalog-state.json');

/**
 * Two explicit quotas instead of a pile of overlapping windows: the overall top by
 * stars, plus a slot for whatever was created inside the recent window. Every page
 * this run produces is derived from one of them, so the sample size is predictable.
 */
function searchPlan() {
  const since = new Date(Date.now() - NEW_DAYS * 86_400_000).toISOString().slice(0, 10);
  return [
    { label: `top ${TOP_STARS} by stars`, query: 'topic:dsh-plugin', pages: Math.ceil(TOP_STARS / 100) },
    ...(NEW_TOP === 0
      ? []
      : [{ label: `new ${NEW_DAYS}d top ${NEW_TOP}`, query: `topic:dsh-plugin created:>=${since}`, pages: Math.ceil(NEW_TOP / 100) }]),
  ];
}
const TOKEN = process.env.GITHUB_TOKEN?.trim();
const TOPIC = 'dsh-plugin';

const headers = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};

function log(message) {
  process.stdout.write(`${message}\n`);
}

async function searchPage(query, page) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=100&page=${page}`;
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
    return cleanMarkdown(text).slice(0, 6000);
  }
  return undefined;
}

/** Keep the Markdown structure a detail page can render; drop badges, images and raw HTML. */
function cleanMarkdown(markdown) {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)\s*$/gm, '')
    .replace(/^\s*!\[[^\]]*\]\([^)]*\)\s*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
  const [manifest, readme] = await Promise.all([
    readManifest(item.full_name, branch),
    readReadme(item.full_name, branch),
  ]);
  const npm = await npmRelease(manifest?.name);
  // A published release already pins the install spec; only a git-only plugin needs the head commit.
  const commit = npm === undefined ? await headCommit(item.full_name) : undefined;
  return { ...normalize(item, manifest, npm, commit), readme };
}

/** Repositories catalogued by earlier runs, so their pages can outlive the sample. */
async function readState() {
  try {
    const parsed = JSON.parse(await readFile(STATE, 'utf8'));
    const names = Array.isArray(parsed) ? parsed : parsed?.repos;
    return Array.isArray(names)
      ? names.filter((name) => typeof name === 'string' && name.includes('/'))
      : [];
  } catch {
    return [];
  }
}

async function writeState(names) {
  await writeFile(STATE, `${JSON.stringify([...new Set(names)].sort(), null, 0)}\n`);
}

/**
 * One repository by name. Separates "gone" from "could not ask": a deleted or archived
 * repository retires its page, while a rate limit or network error must not.
 */
async function lookupRepo(fullName) {
  const { ok, data, status } = await fetchJson(`https://api.github.com/repos/${fullName}`, { headers });
  if (ok) return data?.archived === true ? { kind: 'gone', reason: 'archived' } : { kind: 'ok', item: data };
  if (status === 404) return { kind: 'gone', reason: 'deleted' };
  return { kind: 'error', status };
}

async function main() {
  log(`DSH Market Hub · catalog scan (topic:${TOPIC}, sample ≤${LIMIT}, keep ≤${RETAIN_MAX})`);
  const items = [];
  const seen = new Set();
  for (const step of searchPlan()) {
    for (let page = 1; page <= step.pages; page += 1) {
      const found = await searchPage(step.query, page);
      if (found.length === 0) break;
      let fresh = 0;
      for (const item of found) {
        if (seen.has(item.full_name)) continue;
        seen.add(item.full_name);
        items.push(item);
        fresh += 1;
      }
      log(`  ${step.label} p${page}: ${found.length} results, ${fresh} new`);
      if (items.length >= LIMIT || found.length < 100) break;
      await sleep(1200); // unauthenticated search allows 10 requests a minute
    }
    if (items.length >= LIMIT) break;
  }

  // Star ties come back in an arbitrary order; sorting here keeps the cutoff deterministic.
  items.sort((left, right) => (right.stargazers_count ?? 0) - (left.stargazers_count ?? 0)
    || left.full_name.localeCompare(right.full_name));
  const selected = items.slice(0, LIMIT);

  // Repositories this run will render from the sample. Names are compared case-insensitively
  // because GitHub canonicalises owner/repository casing and the state may predate a rename.
  const sampledNames = new Set(selected.map((item) => item.full_name.toLowerCase()));
  const knownKeys = new Set();
  const known = (await readState()).filter((name) => {
    const key = name.toLowerCase();
    if (sampledNames.has(key) || knownKeys.has(key)) return false;
    knownKeys.add(key);
    return true;
  });
  log(`  state: ${known.length} catalogued repositories outside this sample`);

  const retainedItems = [];
  const gone = [];
  const unreadable = [];
  await mapPool(known, 4, async (fullName, index) => {
    const result = await lookupRepo(fullName);
    if (result.kind === 'ok') retainedItems.push(result.item);
    else if (result.kind === 'gone') gone.push({ fullName, reason: result.reason });
    else unreadable.push({ fullName, status: result.status });
    if ((index + 1) % 50 === 0) log(`  checked ${index + 1}/${known.length}`);
  });

  const records = await mapPool(selected, 6, async (item, index) => {
    const record = await enrich(item);
    if ((index + 1) % 10 === 0) log(`  enriched ${index + 1}/${selected.length}`);
    return record;
  });

  const retained = await mapPool(retainedItems, 6, async (item, index) => {
    const record = await enrich(item);
    if ((index + 1) % 25 === 0) log(`  kept ${index + 1}/${retainedItems.length}`);
    return { ...record, retained: true };
  });
  retained.sort((left, right) => (right.stars ?? 0) - (left.stars ?? 0)
    || left.fullName.localeCompare(right.fullName));
  const kept = retained.slice(0, RETAIN_MAX);
  const evicted = retained.slice(RETAIN_MAX);

  const withBundle = records.filter((record) => record.manifest?.declaresBundle).length;
  const withNpm = records.filter((record) => record.npm !== undefined).length;
  const payload = {
    generatedAt: new Date().toISOString(),
    topic: TOPIC,
    totals: {
      scanned: records.length,
      retained: kept.length,
      declaresBundle: withBundle,
      publishedOnNpm: withNpm,
      retired: gone.length,
      evicted: evicted.length,
    },
    repos: [...records, ...kept],
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`);
  // Only repositories that can produce a page today earn a place in the state: an entry
  // with neither an npm release nor a pinned commit would never render.
  const installable = (record) => record.npm !== undefined || /^[0-9a-f]{40}$/u.test(record.commit ?? '');
  await writeState([...records, ...kept].filter(installable).map((record) => record.fullName));

  log(`✓ ${records.length} sampled + ${kept.length} kept pages → ${OUT}`);
  log(`  declares dsh.bundle: ${withBundle} · published on npm: ${withNpm}`);
  if (gone.length > 0) log(`  retired ${gone.length} deleted/archived: ${gone.slice(0, 3).map((entry) => entry.fullName).join(', ')}${gone.length > 3 ? ' …' : ''}`);
  if (evicted.length > 0) log(`! evicted ${evicted.length} over the ${RETAIN_MAX} retention cap, lowest stars first`);
  if (unreadable.length > 0) log(`! ${unreadable.length} repositories could not be checked (status ${unreadable[0].status}); their pages are unchanged from the last run`);
  if (records.length < selected.length) log('! some repositories could not be enriched');
}

await main();
