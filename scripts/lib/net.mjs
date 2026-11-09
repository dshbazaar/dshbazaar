/** Small network helpers shared by the catalog scripts. */

const DEFAULT_HEADERS = {
  'user-agent': 'dsh-bazaar-catalog/0.1',
  accept: 'application/json',
};

/** Fetch JSON with a timeout; returns `undefined` on any non-2xx answer instead of throwing. */
export async function fetchJson(url, { timeoutMs = 20000, headers = {} } = {}) {
  try {
    const response = await fetch(url, {
      headers: { ...DEFAULT_HEADERS, ...headers },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, status: response.status, data: undefined };
    }
    return { ok: true, status: response.status, data: await response.json() };
  } catch (error) {
    return { ok: false, status: 0, data: undefined, error };
  }
}

/** Fetch text with a timeout; returns `undefined` on any non-2xx answer. */
export async function fetchText(url, { timeoutMs = 20000, headers = {} } = {}) {
  try {
    const response = await fetch(url, {
      headers: { ...DEFAULT_HEADERS, ...headers },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!response.ok) {
      await response.body?.cancel();
      return undefined;
    }
    return await response.text();
  } catch {
    return undefined;
  }
}

/** Run `worker` over `items` with at most `limit` in flight, preserving result order. */
export async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
