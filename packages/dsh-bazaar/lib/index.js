/**
 * Host half of dsh-bazaar.
 *
 * Two same-origin routes back the browser half:
 *
 *   GET /api/dsh-bazaar/catalog    the public catalog, cached for ten minutes
 *   GET /api/dsh-bazaar/installed  the bundles this profile has, from the host plugin manager
 *
 * The browser half never fetches a third-party origin directly, and installing still goes
 * through the host plugin manager (the Plugins page owns the `install` action); this
 * plugin never runs pnpm itself.
 */

/** Default catalog produced by this repository's build. */
export const DEFAULT_CATALOG_URL = 'https://dshbazaar.io/api/catalog.json';

export const ROUTE_PREFIX = '/api/dsh-bazaar';

const CACHE_TTL_MS = 10 * 60 * 1000;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/**
 * Proxy and cache the public catalog.
 * @param {{ catalogUrl?: string, timeoutMs?: number }} config
 * @returns {{ path: string, methods: string[], fetch: () => Promise<Response> }}
 */
export function catalogRoute(config = {}) {
  const catalogUrl = config.catalogUrl ?? DEFAULT_CATALOG_URL;
  const timeoutMs = config.timeoutMs ?? 10000;
  let cache;

  return {
    path: `${ROUTE_PREFIX}/catalog`,
    methods: ['GET'],
    fetch: async () => {
      const now = Date.now();
      if (cache !== undefined && now - cache.at < CACHE_TTL_MS) return json(cache.value);
      let response;
      try {
        response = await fetch(catalogUrl, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        return json({ error: `catalog unreachable: ${catalogUrl}` }, 502);
      }
      if (!response.ok) {
        await response.body?.cancel();
        return json({ error: `catalog answered ${String(response.status)}` }, 502);
      }
      const value = await response.json().catch(() => undefined);
      if (value === undefined) return json({ error: 'catalog is not JSON' }, 502);
      cache = { at: now, value };
      return json(value);
    },
  };
}

/** Only what the browser half needs from a BundleInfo; keeps the profile's file layout out of the page. */
function slimBundle(bundle) {
  return {
    name: bundle.name,
    version: bundle.version,
    installed: bundle.installed === true,
    enabled: bundle.enabled === true,
    official: bundle.official === true,
    source: bundle.source,
    availability: bundle.availability,
    updatable: bundle.updatable === true,
    removable: bundle.removable === true,
  };
}

/**
 * Report the bundles this profile holds, so the tab can mark installed versions and find updates.
 * @param {() => Promise<Array<object>>} listBundles host plugin manager entry point
 * @returns {{ path: string, methods: string[], fetch: () => Promise<Response> }}
 */
export function installedRoute(listBundles) {
  return {
    path: `${ROUTE_PREFIX}/installed`,
    methods: ['GET'],
    fetch: async () => {
      try {
        const bundles = await listBundles();
        return json({ bundles: (Array.isArray(bundles) ? bundles : []).map(slimBundle) });
      } catch {
        return json({ error: 'plugin manager listing failed' }, 502);
      }
    },
  };
}

export function apply(ctx, config = {}) {
  ctx.inject(['connection', 'pluginManager'], (scope) => {
    scope.effect(
      () => scope.connection.fetch.register({ ...catalogRoute(config), requestBody: 'buffered' }),
      'dsh-bazaar: catalog route',
    );
    scope.effect(
      () => scope.connection.fetch.register({
        ...installedRoute(() => scope.pluginManager.listBundles()),
        requestBody: 'buffered',
      }),
      'dsh-bazaar: installed route',
    );
  });
}
