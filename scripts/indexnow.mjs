#!/usr/bin/env node
/**
 * Submit newly catalogued URLs to IndexNow (Bing / Yandex).
 *
 * IndexNow wants changed or new URLs, not the whole site every day. The state file
 * records what has already been submitted; each run submits only the difference,
 * capped so a sudden jump cannot look like spam.
 *
 * State: `INDEXNOW_STATE` (default `.indexnow-urls.json`). A committed seed file
 * `.indexnow-urls.json` is used when the cache copy is missing.
 *
 * Flags: --all (ignore state), --dry-run (report only), --cap <n> (default 1000).
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = process.env.INDEXNOW_KEY?.trim() || '49efe927073ed458ec4e37b92935a307';
const HOST = process.env.INDEXNOW_HOST?.trim() || 'dshbazaar.io';
const STATE = resolve(ROOT, process.env.INDEXNOW_STATE?.trim() || '.indexnow-urls.json');
const SEED = resolve(ROOT, '.indexnow-urls.json');
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const args = process.argv.slice(2);
const forceAll = args.includes('--all');
const dryRun = args.includes('--dry-run');
const capIndex = args.indexOf('--cap');
const CAP = capIndex === -1 ? 1000 : Number(args[capIndex + 1]) || 1000;

const log = (message) => process.stdout.write(`${message}\n`);

async function sitemapUrls() {
  const directory = resolve(ROOT, 'public/sitemaps');
  const files = (await readdir(directory)).filter((name) => name.endsWith('.xml'));
  const urls = new Set();
  for (const file of files) {
    const xml = await readFile(resolve(directory, file), 'utf8');
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/gu)) urls.add(match[1]);
  }
  return [...urls];
}

async function readState() {
  for (const path of [STATE, SEED]) {
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8'));
      if (Array.isArray(parsed)) return new Set(parsed);
    } catch {
      // try the next one
    }
  }
  return new Set();
}

async function submit(urls) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: HOST,
      key: KEY,
      keyLocation: `https://${HOST}/${KEY}.txt`,
      urlList: urls,
    }),
    signal: AbortSignal.timeout(60000),
  });
  const text = await response.text().catch(() => '');
  return { status: response.status, body: text.slice(0, 300) };
}

async function main() {
  const current = await sitemapUrls();
  const submitted = forceAll ? new Set() : await readState();
  const pending = current.filter((url) => !submitted.has(url));
  log(`catalog ${current.length} URLs · already submitted ${submitted.size} · new ${pending.length}`);

  if (pending.length === 0) {
    log('nothing new; skipping IndexNow');
    return;
  }

  const batch = pending.slice(0, CAP);
  if (batch.length < pending.length) log(`submitting ${batch.length} of ${pending.length} (cap ${CAP}); the rest follows next run`);
  if (dryRun) {
    log(`[dry-run] would submit ${batch.length} URLs, e.g. ${batch[0]}`);
    return;
  }

  const result = await submit(batch);
  log(`IndexNow ${result.status}${result.body === '' ? '' : ` ${result.body}`}`);
  if (result.status !== 200 && result.status !== 202) process.exitCode = 1;
  else {
    for (const url of batch) submitted.add(url);
    await writeFile(STATE, `${JSON.stringify([...submitted].sort(), null, 0)}\n`);
    log(`state now holds ${submitted.size} URLs`);
  }
}

await main();
