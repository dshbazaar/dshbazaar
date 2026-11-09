/** Client-side filtering and sorting for the catalog grid. */
(() => {
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
      const haystack = card.dataset.search ?? '';
      const matchesText = query === '' || haystack.includes(query);
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
