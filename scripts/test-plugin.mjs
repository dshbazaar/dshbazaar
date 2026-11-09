#!/usr/bin/env node
/**
 * Smoke-test both halves of the market plugin without a DSH process.
 *
 * It proves three things the bundle contract requires:
 *   1. client.js loads through the `window.__ModuleLoader__` wrapper and exports apply/inject;
 *   2. apply() registers a `plugins.tab` entry and registers its dictionaries;
 *   3. the host half registers its catalog route and that route serves the catalog JSON.
 *
 * It does not prove the tab renders inside the real Plugins page.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = resolve(ROOT, 'packages/dsh-bazaar/client/client.js');
const HOST = resolve(ROOT, 'packages/dsh-bazaar/lib/index.js');

/* ---------- client bundle ---------- */

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [initial, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
};

const registered = [];
const dictionaries = [];
const sandbox = {
  console,
  fetch: () => Promise.reject(new Error('render does not fetch in this test')),
  window: {},
};
sandbox.window.__ModuleLoader__ = {
  load: ({ id, factory }) => {
    sandbox.__loaded = { id, exports: factory((name) => (name === 'react' ? fakeReact : {})) };
  },
};
vm.createContext(sandbox);
vm.runInContext(readFileSync(CLIENT, 'utf8'), sandbox);

assert.equal(sandbox.__loaded.id, 'dsh-bazaar', 'bundle id must equal the package name');
const client = sandbox.__loaded.exports;
assert.equal(typeof client.apply, 'function', 'client must export apply');
assert.ok(Array.isArray(client.inject), 'client must export its injected services');

client.apply({
  effect: (fn) => { fn(); },
  locale: {
    register: (namespace, table) => dictionaries.push({ namespace, table }),
    bind: (namespace) => (key) => dictionaries.find((entry) => entry.namespace === namespace)?.table.en[key] ?? key,
  },
  slots: {
    inject: (name, factory) => factory(),
    register: (definition, component) => {
      registered.push({ definition, component });
      return () => {};
    },
  },
});

assert.equal(registered.length, 1, 'apply must register exactly one slot entry');
assert.equal(registered[0].definition.name, 'plugins.tab', 'entry belongs to the plugins tab slot');
assert.equal(registered[0].definition.id, 'hub');
assert.equal(typeof registered[0].definition.label, 'function');
assert.equal(dictionaries.length, 1, 'dictionaries are registered once');
assert.equal(dictionaries[0].table.zh.title, '市场');
process.stdout.write('✓ client bundle: loads, registers plugins.tab, registers zh/en dictionaries\n');

/* ---------- host half ---------- */

const catalogBody = readFileSync(resolve(ROOT, 'public/api/catalog.json'));
const catalogServer = createServer((request, response) => {
  if (request.url === '/api/catalog.json') {
    response.writeHead(200, { 'content-type': 'application/json' }).end(catalogBody);
    return;
  }
  response.writeHead(404).end();
});
await new Promise((done) => catalogServer.listen(0, '127.0.0.1', done));
const catalogUrl = `http://127.0.0.1:${catalogServer.address().port}/api/catalog.json`;

try {
  const host = await import(HOST);
  assert.equal(typeof host.apply, 'function');

  const routes = [];
  host.apply({
    inject: (_services, factory) => factory({
      effect: (fn) => { fn(); },
      connection: { fetch: { register: (route) => { routes.push(route); return () => {}; } } },
    }),
  }, { catalogUrl });

  assert.equal(routes.length, 1, 'host must register one route');
  assert.equal(routes[0].path, '/api/dsh-bazaar/catalog');
  assert.deepEqual(routes[0].methods, ['GET']);
  process.stdout.write('✓ host half: registered GET /api/dsh-bazaar/catalog\n');

  const response = await routes[0].fetch(new Request('http://localhost/api/dsh-bazaar/catalog'));
  assert.equal(response.status, 200, 'route must answer 200 while the catalog is reachable');
  const body = await response.json();
  assert.ok(Array.isArray(body.plugins) && body.plugins.length > 0, 'route must return catalog plugins');
  process.stdout.write(`✓ route: served ${body.plugins.length} plugins from a local catalog fixture\n`);
} finally {
  await new Promise((done) => catalogServer.close(done));
}
