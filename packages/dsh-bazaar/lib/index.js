/**
 * Host half of dsh-bazaar.
 *
 * The browser half must not fetch a third-party origin directly (CORS, offline, and
 * privacy), so the host serves the catalog same-origin under /api/dsh-bazaar and
 * caches it. Installing still goes through the host plugin manager, which the Plugins
 * page owns; this plugin never runs pnpm itself.
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
 * @param {{ catalogUrl?: string, timeoutMs?: number }} config
 * @returns {{ path: string, methods: string[], fetch: (request: Request) => Promise<Response> }}
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

export function apply(ctx, config = {}) {
  ctx.inject(['connection'], (scope) => {
    scope.effect(
      () => scope.connection.fetch.register({ ...catalogRoute(config), requestBody: 'buffered' }),
      'dsh-bazaar: catalog route',
    );
  });
}
