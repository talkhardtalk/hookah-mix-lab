import { families, metrics, profiles } from './catalog.mjs';
import { feedbackTags, isAvailable, learn, mixDetails, signal, signature } from './engine.mjs';
import { recipes } from './recipes.mjs';

const icons = {
  tune: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="var(--icon-bg,#191b1f)"/><circle cx="15" cy="17" r="2" fill="var(--icon-bg,#191b1f)"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1.2"/><rect x="14" y="4" width="6" height="6" rx="1.2"/><rect x="4" y="14" width="6" height="6" rx="1.2"/><rect x="14" y="14" width="6" height="6" rx="1.2"/>',
  box: '<path d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8Zm0 0 2-4h12l2 4M9 12h6"/>',
  book: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h3"/>',
  chart: '<path d="M4 19h16M7 15v-4m5 4V5m5 10V8"/>',
  shuffle: '<path d="M4 7h3c4 0 6 10 10 10h3m-3-3 3 3-3 3M4 17h3c1.2 0 2.3-1 3.3-2.3M14 9.3C15 8 16 7 17 7h3m-3-3 3 3-3 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  heart: '<path d="M20.7 5.5a4.6 4.6 0 0 0-6.5 0L12 7.7 9.8 5.5a4.6 4.6 0 0 0-6.5 6.5L12 20.7l8.7-8.7a4.6 4.6 0 0 0 0-6.5Z"/>',
  sparkle: '<path d="M12 3c1.2 5.5 3.5 7.8 9 9-5.5 1.2-7.8 3.5-9 9-1.2-5.5-3.5-7.8-9-9 5.5-1.2 7.8-3.5 9-9Z"/>',
  star: '<path d="m12 3 2.8 5.8 6.4.9-4.6 4.6 1.1 6.4-5.7-3-5.7 3 1.1-6.4-4.6-4.6 6.4-.9L12 3Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/>',
  edit: '<path d="m13.5 6.5 4 4M4 20l4.9-1.1L20 7.8a1.7 1.7 0 0 0 0-2.4l-1.4-1.4a1.7 1.7 0 0 0-2.4 0L5.1 15.1 4 20Z"/>',
  flask: '<path d="M9 4h6m-5 0v6l-5 8a1.3 1.3 0 0 0 1 2h12a1.3 1.3 0 0 0 1-2l-5-8V4M8 15h8"/>',
  download: '<path d="M12 4v11m-4-4 4 4 4-4M5 16v4h14v-4"/>',
  upload: '<path d="M12 16V5m-4 4 4-4 4 4M5 16v4h14v-4"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 2.5 7.6 7 10 4.5-2.4 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};

export const icon = (key, className = '') => `<svg class="icon ${className}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key] ?? ''}</svg>`;
export const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export const fmt = new Intl.NumberFormat('ru', { maximumFractionDigits: 1 }).format;
export const readableDate = new Intl.DateTimeFormat('ru', { dateStyle: 'medium' }).format;
const plural = new Intl.PluralRules('ru');
const ratingCount = (count) => `${count} ${{ one: 'оценка', few: 'оценки', many: 'оценок' }[plural.select(count)]}`;

export const pages = {
  mix: { title: 'Подбор миксов', short: 'Подбор', icon: 'compass' },
  base: { title: 'База рецептов', short: 'Рецепты', icon: 'grid' },
  stock: { title: 'Моя коллекция', short: 'Коллекция', icon: 'box' },
  history: { title: 'Журнал оценок', short: 'Журнал', icon: 'book' },
  stats: { title: 'Мои предпочтения', short: 'Профиль', icon: 'chart' },
};

function brand() {
  return `<a class="brand" href="#mix" aria-label="Hookah Mix Lab — подбор"><img src="./assets/icon.svg" width="37" height="37" alt=""><span>Hookah <strong>Mix Lab</strong></span></a>`;
}

export function nav(page, mobile = false) {
  return Object.entries(pages).map(([id, item]) => `<a href="#${id}"${page === id ? ' aria-current="page"' : ''}>${icon(item.icon)}<span>${mobile ? item.short : item.title}</span></a>`).join('');
}

export function rail(page) {
  return `${brand()}<nav class="rail-links" aria-label="Разделы">${nav(page)}</nav>
    <div class="rail-footer">${icon('shield')}<div><strong>Для взрослых 18+</strong><small>Данные в этом браузере</small></div></div>`;
}

export function topbar(page, available) {
  return `<div class="mobile-brand">${brand()}</div><div class="location">${icon(pages[page].icon)} <span>${pages[page].title}</span></div>
    <a class="stock-link" href="#stock"><span></span><b>${available}</b><span class="stock-link-label"> в наличии</span></a>`;
}

export function heading(title, description, action = '') {
  return `<section class="page-heading"><div><h1>${title}</h1>${description ? `<p>${description}</p>` : ''}</div>${action}</section>`;
}

export function empty(title, detail, glyph = 'flask', action = '') {
  return `<div class="empty">${icon(glyph)}<strong>${title}</strong><p>${detail}</p>${action}</div>`;
}

export function profileChips(selected, action) {
  return `<div class="chips" aria-label="Вкусовой профиль">${[['', { name: 'Любой' }], ...Object.entries(profiles)].map(([id, profile]) =>
    `<button class="chip" data-action="${action}" data-id="${id}" aria-pressed="${id === selected}"${profile.color ? ` style="--chip-color:${profile.color}"` : ''}>${profile.color ? '<span class="chip-dot"></span>' : ''}${profile.name}</button>`,
  ).join('')}</div>`;
}

function hero() {
  return `<section class="hero"><div class="hero-body"><h1>Найди свой<br><em>идеальный микс</em></h1>
    <p>Выбери любимые вкусы. Лаборатория подберёт сочетания из твоей коллекции.</p>
    <button class="button secondary hero-button" data-action="random">${icon('shuffle')} Случайный микс</button></div>
    <div class="hero-visual" aria-hidden="true"><div class="graph-grid"></div><div class="orbit orbit-outer"></div><div class="orbit orbit-mid"></div><div class="orbit orbit-inner"></div>
      <div class="planet"></div><i class="orbit-point point-a"></i><i class="orbit-point point-b"></i><i class="orbit-point point-c"></i></div></section>`;
}

export function mixPage(state, stock) {
  const { settings } = state;
  const selected = settings.pinned.map((id) => stock.get(id)).filter(isAvailable);
  return `${hero()}<section class="panel builder" aria-labelledby="builder-title">
    <div class="section-title"><span class="section-icon">${icon('tune')}</span><div><h2 id="builder-title">Собери свой микс</h2><p>Добавь один или два вкуса, которые хочешь использовать.</p></div></div>
    <div class="flavor-selection">${[0, 1].map((index) => {
        const item = selected[index];
        return `<div class="flavor-slot${item ? ' filled' : ''}"><button class="slot-main" data-action="pick" data-id="${index}">${item ?
          `<span class="flavor-dot" style="--tint:${families[item.tags[0]].color}"></span><span><b>${safe(item.name)}</b><small>${safe(item.brand || families[item.tags[0]].name)}</small></span>` :
          `${icon('plus')}<span><b>${index ? 'Добавить второй вкус' : 'Выбрать вкус'}</b><small>${index ? 'По желанию' : 'Из моей коллекции'}</small></span>`}</button>${item ? `<button class="icon-button remove-choice" data-action="unpin" data-id="${safe(item.id)}" aria-label="Убрать ${safe(item.name)}">${icon('close')}</button>` : ''}</div>`;
    }).join('')}</div>
    <div class="builder-footer"><div class="profile-choice"><span class="field-label">Профиль вкуса</span>${profileChips(settings.profile, 'profile')}</div>
    <div class="builder-actions"><label class="check-inline"><input type="checkbox" id="only-new"${settings.onlyNew ? ' checked' : ''}> Только новые идеи</label><button class="button primary" data-action="recommend"${selected.length ? '' : ' disabled'}>${icon('sparkle')} Подобрать миксы</button></div></div>
  </section><section id="results" class="results" aria-labelledby="results-title"></section>`;
}

export function axesBars(axes) {
  return `<div class="axes">${Object.entries(metrics).map(([key, metric]) =>
    `<div class="axis"><div><span>${metric.name}</span><b>${fmt(axes[key])}</b></div><div class="axis-track" aria-hidden="true"><span style="--length:${axes[key] * 20}%;--axis:${metric.color}"></span></div></div>`,
  ).join('')}</div>`;
}

export function recipeCard(recipe, state, stock, canUse) {
  const { ingredients, axes, text } = mixDetails(recipe, stock);
  const profile = profiles[recipe.profile];
  const saved = state.favorites.some((favorite) => favorite.id === recipe.id);
  const formula = signature(recipe.parts);
  const reviews = state.reviews.filter((review) => review.recipe.id === recipe.id && signature(review.recipe.parts) === formula);
  const rating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  const palette = [profile.color, '#b4a0e6', '#eac67d', '#91d4a7', '#85c5e9', '#da8f9e'];
  return `<article class="recipe-card" style="--accent:${profile.color}">
    <div class="recipe-top"><span class="recipe-profile"><i></i>${profile.name}</span><button class="icon-button favorite${saved ? ' active' : ''}" data-action="favorite" data-id="${safe(recipe.id)}" aria-pressed="${saved}" aria-label="${saved ? 'Удалить из избранного' : 'Добавить в избранное'}">${icon('heart')}</button></div>
    <h3>${safe(recipe.name)}</h3>
    <div class="recipe-status${reviews.length ? ' scored' : ''}">${reviews.length ? `${icon('star')} ${fmt(rating)} · ${ratingCount(reviews.length)}` : `${icon('flask')} Экспериментальный${recipe.source === 'generated' ? ' · Новая идея' : recipe.source === 'custom' ? ' · Свой рецепт' : ''}`}</div>
    <div class="ratio" aria-label="Пропорции">${ingredients.map((item, index) => `<span style="--ratio:${item.percent};--part-color:${palette[index]}"></span>`).join('')}</div>
    <ul class="ingredients">${ingredients.map((item, index) => `<li><i style="--part-color:${palette[index]}"></i><span>${safe(item.name || 'Удалённый вкус')}</span><b>${item.percent}%</b></li>`).join('')}</ul>
    <p class="recipe-text">${safe(text)}</p>
    ${axesBars(axes)}
    <details class="why"><summary>Почему сочетаются</summary><p>${safe(recipe.reasoning || 'Совместимость этого авторского рецепта можно уточнить после оценки.')}</p></details>
    <div class="recipe-actions"><button class="button subtle" data-action="edit-recipe" data-id="${safe(recipe.id)}" aria-label="Пропорции — ${safe(recipe.name)}">${icon('edit')} Пропорции</button>
    <button class="button compact" data-action="review" data-id="${safe(recipe.id)}" aria-label="Оценить — ${safe(recipe.name)}">${icon('star')} Оценить</button></div>
    ${canUse ? '' : '<p class="stock-warning">Часть ингредиентов сейчас отсутствует.</p>'}</article>`;
}

export function searchBox(id, value, placeholder) {
  return `<label class="search">${icon('search')}<input type="search" id="${id}" value="${safe(value)}" placeholder="${placeholder}" aria-label="${placeholder}" autocomplete="off"></label>`;
}

export function libraryPage(ui) {
  const tabs = { all: 'Вся база', favorites: 'Избранное', custom: 'Мои рецепты' };
  return `${heading('База рецептов', `${recipes.length} стартовых рецептов с ориентирами по вкусу и пропорциям.`, `<button class="button primary" data-action="new-recipe">${icon('plus')} Свой рецепт</button>`)}
  <section class="panel toolbar"><div class="tabs" aria-label="Рецепты">${Object.entries(tabs).map(([id, title]) => `<button data-action="library-tab" data-id="${id}" aria-pressed="${ui.libraryTab === id}">${title}</button>`).join('')}</div>
  <div class="filter-row">${searchBox('library-search', ui.libraryQuery, 'Найти рецепт или вкус')}<label class="check-inline"><input type="checkbox" id="in-stock-only"${ui.stockOnly ? ' checked' : ''}> Есть в наличии</label></div>
  ${profileChips(ui.libraryProfile, 'library-profile')}</section><section id="library-results" class="results" aria-label="Рецепты"></section>`;
}

export function collectionPage(state, ui) {
  const available = state.collection.filter(isAvailable);
  const packs = available.reduce((sum, item) => sum + item.packs, 0);
  return `${heading('Моя коллекция', 'В подбор попадают только вкусы в наличии.', `<button class="button primary" data-action="new-item">${icon('plus')} Добавить вкус</button>`)}
  <div class="numbers collection-numbers"><div><b>${state.collection.length}</b><span>Вкусов в коллекции</span></div><div><b>${available.length}</b><span>В наличии</span></div><div><b>${packs}</b><span>Упаковок в наличии</span></div></div>
  <section class="panel toolbar"><div class="filter-row">${searchBox('stock-search', ui.stockQuery, 'Вкус или производитель')}
  <div class="tabs" aria-label="Наличие">${[['all', 'Все'], ['yes', 'В наличии'], ['no', 'Закончились']].map(([id, title]) => `<button data-action="stock-tab" data-id="${id}" aria-pressed="${ui.stockTab === id}">${title}</button>`).join('')}</div></div></section>
  <div class="stock-grid" id="stock-results"></div>`;
}

export function stockCard(item) {
  const family = families[item.tags[0]];
  const available = isAvailable(item);
  return `<article class="stock-card panel" style="--accent:${family.color}"><div class="stock-card-top"><span class="section-icon">${icon('flask')}</span>
    <span class="availability${available ? ' on' : ''}"><i></i>${available ? 'В наличии' : 'Нет в наличии'}</span></div><h3>${safe(item.name)}</h3>
    <p>${safe(item.brand || 'Производитель не указан')} · ${family.name}</p><p class="stock-note">${safe(item.note || 'Аромат не описан')}</p>
    <div class="stock-summary"><span>${item.packs} уп.</span>${item.rating ? `<span class="stock-rating">${icon('star')} ${item.rating}/5</span>` : ''}</div>
    <div class="stock-actions"><button class="button subtle" data-action="toggle-stock" data-id="${safe(item.id)}">${available ? 'Отметить отсутствие' : 'Вернуть в наличие'}</button><button class="icon-button" data-action="edit-item" data-id="${safe(item.id)}" aria-label="Редактировать — ${safe(item.name)}">${icon('edit')}</button></div>
  </article>`;
}

export function historyPage(state, stock) {
  const reviews = [...state.reviews].sort((a, b) => b.date.localeCompare(a.date));
  return `${heading('Журнал оценок', 'Впечатления от миксов помогают точнее подбирать следующие сочетания.')}${reviews.length ?
    `<div class="history-list">${reviews.map((review) => {
      const { ingredients } = mixDetails(review.recipe, stock);
      const { positive = [], negative = [], liked = [], disliked = [], repeat } = review;
      const hasTags = positive.length || negative.length || ['yes', 'no'].includes(repeat);
      const nameList = (ids) => ingredients.filter((item) => ids.includes(item.id)).map((item) => safe(item.name)).join(', ');
      return `<article class="panel history-card"><div class="history-top"><div><time datetime="${safe(review.date)}">${readableDate(new Date(review.date))}</time><h2>${safe(review.recipe.name)}</h2></div>
      <span class="history-rating" aria-label="${review.rating} из 5">${'★'.repeat(review.rating)}<span>${'★'.repeat(5 - review.rating)}</span></span></div>
      <p class="history-parts">${ingredients.map((part) => `${safe(part.name)} ${part.percent}%`).join('<span> / </span>')}</p>
      ${review.comment ? `<p class="history-comment">${safe(review.comment)}</p>` : ''}
      ${hasTags ? `<div class="history-tags">${[...positive, ...negative].map((tag) => `<span>${feedbackTags[tag]}</span>`).join('')}${repeat === 'yes' ? '<span>Хочу повторить</span>' : repeat === 'no' ? '<span>Не повторю</span>' : ''}</div>` : ''}
      ${liked.length ? `<p class="history-notes"><b>Понравились</b> ${nameList(liked)}</p>` : ''}${disliked.length ? `<p class="history-notes"><b>Не понравились</b> ${nameList(disliked)}</p>` : ''}
      <div class="history-actions"><button class="button subtle" data-action="edit-review" data-id="${safe(review.id)}">${icon('edit')} Изменить оценку</button></div></article>`;
    }).join('')}</div>` : empty('Пока нет оценок', 'Оцени опробованный микс в карточке рецепта.', 'book', '<a class="button secondary" href="#base">Открыть рецепты</a>')}`;
}

export function statsPage(state, stock) {
  const learned = learn(state.reviews, stock);
  const rating = state.reviews.length ? fmt(state.reviews.reduce((sum, review) => sum + review.rating, 0) / state.reviews.length) : '—';
  const chart = Object.entries(profiles).map(([id, profile]) => {
    const count = state.reviews.filter((review) => review.recipe.profile === id).length;
    return `<div><span>${profile.name}</span><span class="axis-track"><span style="--axis:${profile.color};--length:${100 * count / (state.reviews.length || 1)}%"></span></span><b>${count}</b></div>`;
  }).join('');
  const appearances = new Map();
  for (const review of state.reviews) {
    for (const part of review.recipe.parts) appearances.set(part.id, (appearances.get(part.id) ?? 0) + 1);
  }
  const favorites = [...learned.flavors].map(([id]) => [stock.get(id), signal(learned.flavors, id)])
    .filter(([item, score]) => item && score > .06 && (item.rating >= 4 || appearances.get(item.id) >= 2))
    .sort((a, b) => b[1] - a[1]).slice(0, 5);
  const pairs = [...learned.pairs].filter(([, values]) => values.weight >= 1.39).map(([id]) => [id, signal(learned.pairs, id)]).filter(([, score]) => score > .1).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const notes = [...learned.impressions].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const names = new Map([...state.reviews.flatMap((review) => review.recipe.items), ...stock.values()].map((item) => [item.id, item.name]));
  const pairName = (key) => key.split('+').map((id) => names.get(id)).filter(Boolean).join(' + ');
  return `${heading('Мои предпочтения', 'Рекомендации учитывают оценки вкусов и удачные пропорции.')}
  <div class="numbers"><div><b>${state.reviews.length}</b><span>Оценок миксов</span></div><div><b>${rating}</b><span>Средняя оценка</span></div><div><b>${new Set(state.reviews.map((review) => review.recipe.id)).size}</b><span>Опробовано рецептов</span></div></div>
  <div class="stats-grid${notes.length ? '' : ' no-notes'}"><section class="panel stats-panel"><h2>Оценённые профили</h2><div class="chart">${chart}</div></section>
  <section class="panel stats-panel"><h2>Вкусы с положительными оценками</h2>${favorites.length ? `<ul class="stat-list">${favorites.map(([item]) => `<li>${safe(item.name)}<small>${safe(item.brand)}</small></li>`).join('')}</ul>` : '<p>Здесь появятся вкусы с высокой личной оценкой или несколькими удачными отзывами о миксах.</p>'}</section>
  <section class="panel stats-panel"><h2>Удачные сочетания</h2>${pairs.length ? `<ul class="stat-list">${pairs.map(([id]) => `<li>${safe(pairName(id))}</li>`).join('')}</ul>` : '<p>Пары появятся после нескольких удачных оценок.</p>'}</section>
  ${notes.length ? `<section class="panel stats-panel"><h2>Частые впечатления</h2><ul class="stat-list">${notes.map(([tag, count]) => `<li>${feedbackTags[tag]} <small>${count}</small></li>`).join('')}</ul></section>` : ''}</div>
  <section class="panel data-panel"><div><h2>Перенос данных</h2><p>JSON-копия содержит коллекцию, рецепты, оценки, избранное и настройки.</p></div>
  <div class="data-actions"><button class="button secondary" data-action="export">${icon('download')} Экспорт</button><button class="button secondary" data-action="import">${icon('upload')} Импорт</button><input type="file" id="backup-file" accept=".json,application/json" hidden></div></section>`;
}
