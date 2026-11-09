#!/usr/bin/env node
/**
 * Validate public/api/index.json with the same validator DSH ships.
 *
 * The validator is not published as a standalone CLI, so point this at the copy inside
 * your DSH install (or any checkout that has @deepseek-ai/dsh-plugin-market-index):
 *
 *   DSH_MARKET_INDEX_VALIDATOR=/path/to/dsh-plugin-market-index/lib/index.js \
 *     node scripts/validate-index.mjs
 *
 * The module imports `semver`; run it where that resolves, or set NODE_PATH first.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VALIDATOR = process.env.DSH_MARKET_INDEX_VALIDATOR;

if (VALIDATOR === undefined || VALIDATOR === '') {
  process.stderr.write('DSH_MARKET_INDEX_VALIDATOR is not set.\n');
  process.stderr.write('Example:\n  DSH_MARKET_INDEX_VALIDATOR=/Applications/DeepSeek\\ Harness.app/Contents/Resources/app.asar.unpacked/dsh/node_modules/@deepseek-ai/dsh-plugin-market-index/lib/index.js node scripts/validate-index.mjs\n');
  process.exit(2);
}

const { parseMarketIndex, marketInstallTarget } = await import(pathToFileURL(resolve(VALIDATOR)).href);
const document = JSON.parse(await readFile(resolve(ROOT, 'public/api/index.json'), 'utf8'));
const siteUrl = process.env.DSH_MARKET_SITE_URL ?? 'https://dshbazaar.io';

try {
  const parsed = parseMarketIndex(document, `${siteUrl}/api/index.json`);
  process.stdout.write(`✓ valid market index format 1 · ${parsed.plugins.length} plugins\n`);
  for (const plugin of parsed.plugins.slice(0, 3)) {
    const target = marketInstallTarget(plugin.name, plugin.versions[0]);
    process.stdout.write(`  ${plugin.name} → ${target.spec}${target.registry === undefined ? '' : ` (${target.registry})`}\n`);
  }
} catch (error) {
  process.stderr.write(`✗ ${error.name ?? 'Error'} at ${error.path ?? '?'}: ${error.reason ?? error.message}\n`);
  process.exit(1);
}
