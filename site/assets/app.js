/** Copy-to-clipboard buttons, plus client-side filtering and sorting for the catalog grid. */
(() => {
  const themeToggle = document.querySelector('[data-theme-toggle]');
  if (themeToggle !== null) {
    const sync = () => {
      const dark = document.documentElement.dataset.theme === 'dark';
      themeToggle.textContent = dark ? themeToggle.dataset.lightLabel : themeToggle.dataset.darkLabel;
    };
    sync();
    themeToggle.addEventListener('click', () => {
      const dark = document.documentElement.dataset.theme !== 'dark';
      if (dark) document.documentElement.dataset.theme = 'dark';
      else delete document.documentElement.dataset.theme;
      try { localStorage.setItem('dshbazaar-theme', dark ? 'dark' : 'light'); } catch {}
      sync();
    });
  }

  for (const button of document.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy ?? '');
      } catch {
        return;
      }
      const label = button.textContent;
      button.textContent = button.dataset.copiedLabel ?? label;
      button.disabled = true;
      setTimeout(() => {
        button.textContent = label;
        button.disabled = false;
      }, 1500);
    });
  }

  // Search page: filter the whole catalog client-side against a slim per-language index.
  const searchPage = document.querySelector('[data-search-page]');
  if (searchPage !== null) {
    const lang = document.documentElement.lang.startsWith('en') ? 'en' : 'zh';
    const input = searchPage.querySelector('[data-search-input]');
    const results = searchPage.querySelector('[data-search-results]');
    const empty = searchPage.querySelector('[data-search-empty]');
    const params = new URLSearchParams(location.search);
    const initial = params.get('q') ?? '';
    if (input !== null) input.value = initial;

    const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const render = async (query) => {
      const text = query.trim().toLowerCase();
      if (text === '') { results.innerHTML = ''; empty.hidden = true; return; }
      const response = await fetch(`/api/search.${lang}.json`);
      const rows = await response.json();
      const hits = rows.filter((row) => [row.t, row.d, row.n, row.c].join(' ').toLowerCase().includes(text)).slice(0, 60);
      results.innerHTML = hits.map((row) => `<a class="card" href="/${lang}/p/${escape(row.r)}/">
  <div class="top"><h3>${escape(row.t)}</h3></div>
  <p class="desc">${escape(row.d)}</p>
  <div class="foot"><span class="cat-tag">${escape(row.c)}</span>${row.v ? '<span class="badge ok">✓</span>' : ''}<span>★ ${Number(row.s) || 0}</span></div>
</a>`).join('');
      empty.hidden = hits.length !== 0;
    };

    if (initial !== '') render(initial);
    input?.addEventListener('input', (event) => render(event.target.value));
  }

  const grid = document.querySelector('[data-grid]');
  if (grid === null) return;

  const cards = [...grid.querySelectorAll('[data-card]')];
  const search = document.querySelector('[data-search]');
  const sort = document.querySelector('[data-sort]');
  const verified = document.querySelector('[data-verified]');
  const empty = document.querySelector('[data-empty]');
  const count = document.querySelector('[data-count]');

  const params = new URLSearchParams(location.search);
  if (params.get('q') !== null && search !== null) search.value = params.get('q');

  const apply = () => {
    const query = (search?.value ?? '').trim().toLowerCase();
    let shown = 0;
    for (const card of cards) {
      const matchesText = query === '' || (card.dataset.search ?? '').includes(query);
      const matchesVerified = verified === null || !verified.checked || card.dataset.verified === 'true';
      const visible = matchesText && matchesVerified;
      card.hidden = !visible;
      if (visible) shown += 1;
    }

    if (sort !== null) {
      const mode = sort.value;
      const sorted = [...cards].sort((left, right) => {
        if (mode === 'name') return (left.dataset.name ?? '').localeCompare(right.dataset.name ?? '');
        if (mode === 'updated') return Number(right.dataset.updated ?? 0) - Number(left.dataset.updated ?? 0);
        return Number(right.dataset.stars ?? 0) - Number(left.dataset.stars ?? 0);
      });
      for (const card of sorted) grid.append(card);
    }

    if (empty !== null) empty.hidden = shown !== 0;
    if (count !== null) count.textContent = String(shown);
  };

  search?.addEventListener('input', apply);
  sort?.addEventListener('change', apply);
  verified?.addEventListener('change', apply);
  apply();
})();
