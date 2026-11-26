import { catalog, metrics } from './catalog.mjs';
import { byId, hasStock, isAvailable, recommendations, snapshot } from './engine.mjs';
import { recipes } from './recipes.mjs';
import { decodeBackup, encodeBackup, initialState, stateRepository } from './storage.mjs';
import { dialogFrame, itemDialog, pickerDialog, pickerList, recipeDialog, recipeLine, recipePickerDialog, recipePickerList, reviewDialog } from './dialogs.mjs';
import { collectionPage, empty, historyPage, icon, libraryPage, mixPage, nav, pages, rail, recipeCard, statsPage, stockCard, topbar } from './views.mjs';

const $ = (selector) => document.querySelector(selector);
const main = $('#main');
const modal = $('#modal');
const PAGE_SIZE = 12;
const ui = {
  stockQuery: '', stockTab: 'all', libraryTab: 'all', libraryQuery: '', libraryProfile: '', stockOnly: false,
  limit: PAGE_SIZE, mode: 'initial', results: [], moreResults: false, visibleRecipes: new Map(), modal: null,
};

let state;
let noticeTimer;
let persisted = true;
try {
  state = stateRepository.read();
} catch {
  state = initialState();
  notify('Сохранённые данные недоступны. Можно восстановить их из JSON-копии.');
}

const route = () => Object.hasOwn(pages, location.hash.slice(1)) ? location.hash.slice(1) : 'mix';
const stock = () => byId(state.collection);
const lookup = (id) => ui.visibleRecipes.get(id) ?? state.custom.find((recipe) => recipe.id === id)
  ?? state.favorites.find((recipe) => recipe.id === id) ?? recipes.find((recipe) => recipe.id === id);
const normalized = (value) => value.trim().toLocaleLowerCase('ru').replaceAll('ё', 'е');

function notify(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => toast.classList.remove('visible'), 4600);
}

function mergeChanges(base, next, latest) {
  const merged = { ...latest, settings: { ...latest.settings } };
  for (const key of Object.keys(next.settings)) {
    if (next.settings[key] !== base.settings[key]) merged.settings[key] = next.settings[key];
  }
  for (const key of ['collection', 'custom', 'favorites', 'reviews']) {
    if (next[key] === base[key]) continue;
    const before = byId(base[key]);
    const after = byId(next[key]);
    const current = byId(latest[key]);
    for (const id of before.keys()) if (!after.has(id)) current.delete(id);
    for (const [id, entry] of after) if (before.get(id) !== entry) current.set(id, entry);
    merged[key] = [...current.values()];
  }
  return merged;
}

function commit(next, message, replace = false) {
  const before = state;
  state = next;
  try {
    if (!replace && persisted) {
      let latest;
      try { latest = stateRepository.read(); } catch { latest = before; }
      state = mergeChanges(before, next, latest);
    }
    stateRepository.write(state);
    persisted = true;
    if (message) notify(message);
  } catch {
    persisted = false;
    notify('Изменения действуют до закрытия страницы. Экспортируй данные, чтобы их сохранить.');
  }
}

function setSettings(patch) {
  commit({ ...state, settings: { ...state.settings, ...patch } });
}

function recalculate({ append = false } = {}) {
  const pageSize = ui.mode === 'initial' ? 6 : ui.mode === 'random' ? 1 : 8;
  const seen = append ? ui.results : [];
  const batch = recommendations({
    items: state.collection, custom: state.custom, reviews: state.reviews,
    pinned: ui.mode === 'initial' ? [] : state.settings.pinned,
    profile: state.settings.profile, limit: pageSize + 1, random: ui.mode === 'random',
    onlyNew: ui.mode !== 'initial' && state.settings.onlyNew, seen,
  });
  const visible = batch.slice(0, pageSize);
  ui.results = [...seen, ...visible];
  ui.moreResults = batch.length > pageSize;
  return visible;
}

function cardMarkup(list) {
  const available = stock();
  return list.map((recipe) => recipeCard(recipe, state, available, hasStock(recipe.parts, available))).join('');
}

function showCards(list) {
  ui.visibleRecipes = byId(list);
  return `<div class="recipes-grid">${cardMarkup(list)}</div>`;
}

function renderResults() {
  const element = $('#results');
  const title = ui.mode === 'initial' ? 'Идеи из коллекции' : ui.mode === 'random' ? 'Случайный микс' : 'Подобранные сочетания';
  element.innerHTML = `<div class="result-heading"><div><h2 id="results-title" tabindex="-1">${title}</h2><p>${ui.mode === 'initial' ? 'Экспериментальные рецепты из доступных вкусов.' : 'Характеристики вкуса ориентировочные.'}</p></div>${ui.results.length ? `<span class="count" id="results-count" aria-live="polite">Показано ${ui.results.length}</span>` : ''}</div>
  ${ui.results.length ? showCards(ui.results) : empty('Подходящих сочетаний пока нет', 'Попробуй изменить профиль или один из выбранных вкусов.')}
  ${ui.moreResults ? '<div class="load-more"><button class="button secondary" data-action="more-mixes">Показать ещё</button></div>' : ''}`;
}

function libraryResults() {
  const available = stock();
  const source = ui.libraryTab === 'all' ? recipes : state[ui.libraryTab];
  const query = normalized(ui.libraryQuery);
  const list = source.filter((recipe) => {
    if (ui.libraryProfile && recipe.profile !== ui.libraryProfile) return false;
    if (ui.stockOnly && !hasStock(recipe.parts, available)) return false;
    if (!query) return true;
    const ingredients = recipe.items ?? recipe.parts.map((part) => available.get(part.id) ?? catalog.find((item) => item.id === part.id));
    return normalized([recipe.name, ...ingredients.flatMap((item) => [item?.name, item?.brand])].join(' ')).includes(query);
  });
  const visible = list.slice(0, ui.limit);
  $('#library-results').innerHTML = list.length ? `<div class="result-heading"><span class="count">${visible.length} из ${list.length}</span></div>${showCards(visible)}${visible.length < list.length ? `<div class="load-more"><button class="button secondary" data-action="more">Показать ещё ${Math.min(PAGE_SIZE, list.length - visible.length)}</button></div>` : ''}` :
    empty(ui.libraryTab === 'favorites' ? 'Избранное пусто' : 'Рецепты не найдены', ui.libraryTab === 'custom' ? 'Создай свой рецепт или измени пропорции готового микса.' : 'Измени фильтры или добавь рецепт в избранное.', 'grid');
}

function stockResults() {
  const query = normalized(ui.stockQuery);
  const items = state.collection.filter((item) => (ui.stockTab === 'all' || isAvailable(item) === (ui.stockTab === 'yes'))
    && normalized(`${item.name} ${item.brand} ${item.note}`).includes(query));
  $('#stock-results').innerHTML = items.length ? items.map(stockCard).join('') : empty('Вкусы не найдены', 'Проверь фильтр или добавь новый вкус.', 'box');
}

function render() {
  const page = route();
  const items = stock();
  $('#rail').innerHTML = rail(page);
  $('#mobile-nav').innerHTML = nav(page, true);
  $('#topbar').innerHTML = topbar(page, state.collection.filter(isAvailable).length);
  document.title = page === 'mix' ? 'Hookah Mix Lab' : `${pages[page].title} · Hookah Mix Lab`;
  ui.visibleRecipes = new Map();
  switch (page) {
    case 'mix':
      main.innerHTML = mixPage(state, items);
      renderResults();
      break;
    case 'base':
      main.innerHTML = libraryPage(ui);
      libraryResults();
      break;
    case 'stock':
      main.innerHTML = collectionPage(state, ui);
      stockResults();
      break;
    case 'history':
      main.innerHTML = historyPage(state, items);
      break;
    case 'stats':
      main.innerHTML = statsPage(state, items);
      break;
  }
}

function showModal(content, data) {
  const opener = modal.open ? ui.modal?.opener : document.activeElement;
  ui.modal = { ...data, opener };
  modal.innerHTML = content;
  if (!modal.open) modal.showModal();
  modal.scrollTop = 0;
}

function closeModal() {
  if (!modal.open) return;
  const opener = ui.modal?.opener;
  modal.close();
  ui.modal = null;
  if (opener?.isConnected) opener.focus({ preventScroll: true });
}

function pickResults() {
  const excluded = state.settings.pinned[ui.modal.slot === 0 ? 1 : 0];
  $('#pick-results').innerHTML = pickerList(state.collection, $('#pick-search').value, excluded);
}

function recipePickerResults() {
  const query = normalized($('#recipe-pick-search').value);
  const matches = [...ui.modal.choices.values()].filter(({ recipe }) => normalized(recipe.name).includes(query));
  $('#recipe-pick-results').innerHTML = recipePickerList(matches);
}

function updateRecipeSum() {
  const inputs = [...modal.querySelectorAll('[name="percent"]')];
  const sum = inputs.reduce((total, input) => total + Number(input.value), 0);
  const output = $('#recipe-sum');
  output.textContent = `Сумма ${sum}%`;
  output.classList.toggle('complete', sum === 100);
  modal.querySelectorAll('[data-action="remove-line"]').forEach((button) => { button.disabled = inputs.length <= 2; });
  modal.querySelector('[data-action="add-line"]').disabled = inputs.length >= 6;
}

function editRecipe(recipe) {
  const items = byId(recipe ? snapshot(recipe, stock()).items : []);
  for (const item of state.collection) items.set(item.id, item);
  const entries = [...items.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  if (entries.length < 2) {
    notify('Для своего рецепта нужны хотя бы два вкуса в коллекции.');
    return;
  }
  showModal(recipeDialog(recipe, entries), { kind: 'recipe', recipe, items: entries });
  updateRecipeSum();
}

function openReview(recipe, review) {
  showModal(reviewDialog(recipe, review), { kind: 'review', recipe, review });
}

function updateCollection(collection, message) {
  const items = byId(collection);
  const pinned = state.settings.pinned.filter((id) => isAvailable(items.get(id)));
  commit({ ...state, collection, settings: { ...state.settings, pinned } }, message);
  recalculate();
  render();
}

function confirmDelete(kind, id, name) {
  const detail = kind === 'item' ? 'Удалённый вкус исчезнет из коллекции. Записи об опробованных миксах сохранятся.'
    : kind === 'recipe' ? 'Рецепт будет удалён из своих рецептов и избранного. Оценки останутся в журнале.' : 'Отзыв будет удалён из журнала и перестанет влиять на рекомендации.';
  showModal(dialogFrame('Подтвердить удаление', name, `<p class="confirm-copy">${detail}</p><div class="modal-actions"><button class="button secondary" data-action="close">Отмена</button><button class="button danger-solid" data-action="confirm-delete">Удалить</button></div>`), { kind: 'delete', target: kind, id });
}

function confirmImport(next) {
  const count = `${next.collection.length} вкусов, ${next.custom.length} своих рецептов и ${next.reviews.length} оценок.`;
  showModal(dialogFrame('Импорт данных', count, '<p class="confirm-copy">Резервная копия заменит данные в этом браузере.</p><div class="modal-actions"><button class="button secondary" data-action="close">Отмена</button><button class="button primary" data-action="confirm-import">Заменить данные</button></div>'), { kind: 'import', next });
}

function exportData() {
  const url = URL.createObjectURL(new Blob([encodeBackup(state)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `hookah-mix-lab-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('Резервная копия скачивается.');
}

function showRecommendations(mode) {
  ui.mode = mode;
  recalculate();
  renderResults();
  $('#results-title').focus({ preventScroll: true });
  $('#results').scrollIntoView({ block: 'start' });
}

function changePins(pinned) {
  setSettings({ pinned });
  ui.mode = 'initial';
  recalculate();
  render();
}

const actions = {
  close: closeModal,
  pick(button) {
    const slot = Number(button.dataset.id);
    showModal(pickerDialog(), { kind: 'pick', slot });
    pickResults();
    if (matchMedia('(pointer: fine)').matches) $('#pick-search').focus();
  },
  pin(button) {
    const pinned = [...state.settings.pinned];
    pinned[ui.modal.slot] = button.dataset.id;
    const slot = ui.modal.slot;
    closeModal();
    changePins(pinned.filter(Boolean));
    main.querySelector(`[data-action="pick"][data-id="${Math.min(slot, state.settings.pinned.length - 1)}"]`)?.focus({ preventScroll: true });
  },
  unpin(button) { changePins(state.settings.pinned.filter((id) => id !== button.dataset.id)); },
  profile(button) {
    setSettings({ profile: button.dataset.id });
    ui.mode = ui.mode !== 'initial' && state.settings.pinned.length ? 'recommend' : 'initial';
    recalculate();
    for (const chip of main.querySelectorAll('[data-action="profile"]')) chip.setAttribute('aria-pressed', chip === button);
    renderResults();
  },
  recommend() { showRecommendations('recommend'); },
  random() { showRecommendations('random'); },
  'more-mixes'(button) {
    const grid = $('#results .recipes-grid');
    const firstNewIndex = ui.results.length;
    const added = recalculate({ append: true });
    grid.insertAdjacentHTML('beforeend', cardMarkup(added));
    ui.visibleRecipes = byId(ui.results);
    $('#results-count').textContent = `Показано ${ui.results.length}`;
    button.closest('.load-more').hidden = !ui.moreResults;
    const firstNew = grid.children[firstNewIndex];
    if (firstNew) {
      firstNew.tabIndex = -1;
      firstNew.focus({ preventScroll: true });
      firstNew.scrollIntoView({ block: 'start' });
    } else if (!ui.moreResults) $('#results-title').focus();
  },
  favorite(button) {
    const id = button.dataset.id;
    const current = state.favorites.some((entry) => entry.id === id);
    const recipe = lookup(id);
    if (!recipe) return;
    const favorites = current ? state.favorites.filter((entry) => entry.id !== id) : [...state.favorites, snapshot(recipe, stock())];
    commit({ ...state, favorites }, current ? 'Микс удалён из избранного.' : 'Микс добавлен в избранное.');
    if (route() === 'base' && ui.libraryTab === 'favorites') libraryResults();
    else {
      button.classList.toggle('active', !current);
      button.setAttribute('aria-pressed', !current);
      button.setAttribute('aria-label', current ? 'Добавить в избранное' : 'Удалить из избранного');
    }
  },
  'library-tab'(button) { ui.libraryTab = button.dataset.id; ui.limit = PAGE_SIZE; render(); },
  'library-profile'(button) { ui.libraryProfile = button.dataset.id; ui.limit = PAGE_SIZE; render(); },
  more() {
    const firstNew = ui.limit;
    ui.limit += PAGE_SIZE;
    libraryResults();
    const nextCard = $('#library-results').querySelectorAll('.recipe-card')[firstNew];
    if (nextCard) { nextCard.tabIndex = -1; nextCard.focus({ preventScroll: true }); }
  },
  'stock-tab'(button) { ui.stockTab = button.dataset.id; render(); },
  'new-item'() { showModal(itemDialog(), { kind: 'item' }); },
  'edit-item'(button) {
    const item = stock().get(button.dataset.id);
    showModal(itemDialog(item), { kind: 'item', item });
  },
  'toggle-stock'(button) {
    const item = stock().get(button.dataset.id);
    if (!item) return;
    const inStock = !isAvailable(item);
    if (inStock && !item.packs) {
      showModal(itemDialog({ ...item, inStock, packs: 1 }), { kind: 'item', item });
      return;
    }
    updateCollection(state.collection.map((entry) => entry.id === item.id ? { ...entry, inStock } : entry), inStock ? 'Вкус снова в наличии.' : 'Вкус исключён из подбора.');
  },
  'new-recipe'() { editRecipe(); },
  'choose-recipe-to-edit'() {
    const choices = new Map();
    for (const [group, entries] of [['Мой рецепт', state.custom], ['Избранное', state.favorites], ['Стартовый рецепт', recipes]]) {
      for (const recipe of entries) {
        if (!choices.has(recipe.id)) choices.set(recipe.id, { recipe, group });
      }
    }
    showModal(recipePickerDialog(), { kind: 'pick-recipe', choices });
    recipePickerResults();
    if (matchMedia('(pointer: fine)').matches) $('#recipe-pick-search').focus();
  },
  'open-recipe-editor'(button) {
    const choice = ui.modal.choices.get(button.dataset.id);
    if (!choice) return;
    editRecipe(choice.recipe);
    modal.querySelector('.modal-top button').focus({ preventScroll: true });
  },
  'add-line'() {
    const list = $('#recipe-lines');
    if (list.children.length >= 6) return;
    list.insertAdjacentHTML('beforeend', recipeLine({}, ui.modal.items, list.children.length));
    list.lastElementChild.querySelector('select').focus();
    updateRecipeSum();
  },
  'remove-line'(button) {
    if ($('#recipe-lines').children.length <= 2) return;
    const line = button.closest('.recipe-line');
    const neighbor = line.nextElementSibling ?? line.previousElementSibling;
    line.remove();
    const lines = [...$('#recipe-lines').children];
    lines.forEach((entry, index) => {
      entry.querySelector('select').previousElementSibling.textContent = `Ингредиент ${index + 1}`;
      entry.querySelector('[name="percent"]').previousElementSibling.textContent = `Доля ингредиента ${index + 1}, %`;
      entry.querySelector('[data-action="remove-line"]').setAttribute('aria-label', `Удалить ингредиент ${index + 1}`);
    });
    neighbor?.querySelector('select').focus();
    updateRecipeSum();
  },
  review(button) {
    const recipe = lookup(button.dataset.id);
    if (recipe) openReview(recipe);
  },
  'edit-review'(button) {
    const review = state.reviews.find((entry) => entry.id === button.dataset.id);
    if (review) openReview(review.recipe, review);
  },
  'delete-item'() { confirmDelete('item', ui.modal.item.id, ui.modal.item.name); },
  'delete-recipe'() { confirmDelete('recipe', ui.modal.recipe.id, ui.modal.recipe.name); },
  'delete-review'() { confirmDelete('review', ui.modal.review.id, ui.modal.review.recipe.name); },
  'confirm-delete'() {
    const { target, id } = ui.modal;
    closeModal();
    if (target === 'item') {
      updateCollection(state.collection.filter((entry) => entry.id !== id), 'Вкус удалён.');
      return;
    }
    if (target === 'recipe') commit({ ...state, custom: state.custom.filter((entry) => entry.id !== id), favorites: state.favorites.filter((entry) => entry.id !== id) }, 'Рецепт удалён.');
    else commit({ ...state, reviews: state.reviews.filter((entry) => entry.id !== id) }, 'Оценка удалена.');
    recalculate();
    render();
  },
  export: exportData,
  import() { $('#backup-file').click(); },
  'confirm-import'() {
    const next = ui.modal.next;
    closeModal();
    commit(next, 'Резервная копия восстановлена.', true);
    ui.mode = 'initial';
    recalculate();
    render();
  },
};

function saveItem(data) {
  const previous = ui.modal.item;
  const tags = data.getAll('tags');
  if (!data.get('name').trim()) throw new Error('Введи название вкуса.');
  if (!tags.length || tags.length > 4) throw new Error('Выбери от одной до четырёх вкусовых групп.');
  // Сохраняем исходную основную группу, если пользователь её оставил.
  const priorTags = previous?.tags.filter((tag) => tags.includes(tag)) ?? [];
  const item = {
    id: previous?.id ?? `item-${crypto.randomUUID()}`, name: data.get('name').trim(), brand: data.get('brand').trim(), note: data.get('note').trim(),
    tags: [...new Set([...priorTags, ...tags])], cap: Number(data.get('cap')), packs: Number(data.get('packs')),
    rating: Number(data.get('rating')), inStock: data.has('inStock'),
    axes: Object.fromEntries(Object.keys(metrics).map((key) => [key, Number(data.get(key))])),
  };
  if (item.packs === 0) item.inStock = false;
  closeModal();
  updateCollection(previous ? state.collection.map((entry) => entry.id === item.id ? item : entry) : [...state.collection, item], 'Вкус сохранён.');
}

function saveRecipe(data) {
  const previous = ui.modal.recipe?.source === 'custom' ? ui.modal.recipe : null;
  const ids = data.getAll('ingredient');
  const shares = data.getAll('percent').map(Number);
  if (!data.get('name').trim()) throw new Error('Введи название рецепта.');
  if (new Set(ids).size !== ids.length) throw new Error('Один и тот же вкус можно добавить только один раз.');
  if (shares.reduce((sum, value) => sum + value, 0) !== 100) throw new Error('Сумма долей должна быть 100%.');
  const recipe = snapshot({
    id: previous?.id ?? `recipe-${crypto.randomUUID()}`, name: data.get('name').trim(), profile: data.get('profile'),
    parts: ids.map((id, index) => ({ id, percent: shares[index] })), reasoning: data.get('reasoning').trim(), source: 'custom',
  }, byId(ui.modal.items));
  const exists = state.custom.some((entry) => entry.id === recipe.id);
  const custom = exists ? state.custom.map((entry) => entry.id === recipe.id ? recipe : entry) : [...state.custom, recipe];
  const favorites = state.favorites.map((entry) => entry.id === recipe.id ? recipe : entry);
  commit({ ...state, custom, favorites }, 'Рецепт сохранён в разделе «Мои рецепты».');
  closeModal();
  if (route() === 'mix') recalculate();
  if (route() === 'base') {
    ui.libraryTab = 'custom';
    ui.libraryQuery = '';
    ui.libraryProfile = '';
    ui.stockOnly = false;
  }
  render();
}

function saveReview(data) {
  const { recipe, review: previous } = ui.modal;
  const review = {
    ...previous,
    id: previous?.id ?? `review-${crypto.randomUUID()}`, recipe: previous?.recipe ?? snapshot(recipe, stock()), date: previous?.date ?? new Date().toISOString(),
    rating: Number(data.get('rating')),
  };
  commit({ ...state, reviews: previous ? state.reviews.map((entry) => entry.id === review.id ? review : entry) : [...state.reviews, review] }, 'Оценка сохранена в журнале.');
  closeModal();
  render();
}

document.addEventListener('click', (event) => {
  if (event.target.closest('.skip-link')) {
    event.preventDefault();
    main.focus();
    main.scrollIntoView();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (button) actions[button.dataset.action]?.(button);
});

document.addEventListener('input', (event) => {
  const target = event.target;
  if (target.id === 'pick-search') pickResults();
  if (target.id === 'recipe-pick-search') recipePickerResults();
  if (target.id === 'library-search') { ui.libraryQuery = target.value; ui.limit = PAGE_SIZE; libraryResults(); }
  if (target.id === 'stock-search') { ui.stockQuery = target.value; stockResults(); }
  if (target.name === 'percent' && ui.modal?.kind === 'recipe') updateRecipeSum();
});

document.addEventListener('change', async (event) => {
  const target = event.target;
  if (target.id === 'in-stock-only') { ui.stockOnly = target.checked; ui.limit = PAGE_SIZE; libraryResults(); }
  if (target.id === 'only-new') {
    setSettings({ onlyNew: target.checked });
    if (ui.mode === 'recommend') { recalculate(); renderResults(); }
  }
  if (target.id === 'backup-file' && target.files.length) {
    const file = target.files[0];
    target.value = '';
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Выбери JSON-копию до 20 МБ.');
      confirmImport(decodeBackup(await file.text()));
    } catch (error) { notify(error.message || 'Не удалось прочитать резервную копию.'); }
  }
});

modal.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const save = { item: saveItem, recipe: saveRecipe, review: saveReview }[form.dataset.form];
  try { save?.(data); }
  catch (error) {
    const message = form.querySelector('[data-error]');
    message.hidden = false;
    message.textContent = error.message;
    message.scrollIntoView({ block: 'nearest' });
  }
});

modal.addEventListener('cancel', (event) => { event.preventDefault(); closeModal(); });
window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
  if (!modal.open) main.focus({ preventScroll: true });
});
window.addEventListener('storage', () => {
  if (modal.open || !persisted) return;
  try {
    state = stateRepository.read();
    recalculate();
    render();
  } catch { notify('Не удалось обновить данные из другой вкладки.'); }
});

recalculate();
render();
