import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalog, metrics, profiles } from '../public/assets/catalog.mjs';
import { byId, hasStock, isAvailable, learn, mixDetails, personalization, recommendations, signature, snapshot } from '../public/assets/engine.mjs';
import { recipes } from '../public/assets/recipes.mjs';
import { suggestFlavorProfile } from '../public/assets/flavor-profile.mjs';
import { decodeBackup, encodeBackup, initialState } from '../public/assets/storage.mjs';

const stock = byId(catalog);

test('Профиль нового вкуса определяется по названию и описанию', () => {
  const lime = suggestFlavorProfile('Лайм', 'Кислый лайм с мятой');
  assert.deepEqual(lime.tags, ['citrus', 'cold']);
  assert.equal(lime.axes.acid, 4.2);
  assert.equal(lime.cap, 50);
  const lemonade = suggestFlavorProfile('Лимонад', 'Ягодный лимонад');
  assert.deepEqual(lemonade.tags, ['soda', 'berry']);
  assert.ok(lemonade.recognized);
  const candy = suggestFlavorProfile('Кислые леденцы', '');
  assert.deepEqual(candy.tags, ['candy']);
  assert.equal(candy.axes.acid, 4.2);
  const unknown = suggestFlavorProfile('Формула X', '');
  assert.ok(!unknown.recognized);
  assert.ok(Object.values(unknown.axes).every((value) => value === 2.5));
});

test('Новый вкус с предложенным профилем участвует в генерации до окончания упаковки', () => {
  const name = 'Манго с лаймом';
  const note = 'Сладкое манго';
  const { tags, axes, cap } = suggestFlavorProfile(name, note);
  const item = { id: 'new-mango', name, note, brand: '', tags, axes, cap, packs: 1, inStock: true, rating: 0 };
  const options = { items: [...catalog, item], pinned: [item.id], onlyNew: true };
  const generated = recommendations(options);
  assert.equal(generated.length, 8);
  assert.ok(generated.every((recipe) => recipe.source === 'generated' && recipe.parts.some((part) => part.id === item.id)));
  assert.deepEqual(recommendations({ ...options, items: [...catalog, { ...item, packs: 0 }] }), []);
});

test('47 вкусов, 51 упаковка и четыре позиции по две упаковки', () => {
  assert.equal(stock.size, 47);
  assert.equal(catalog.reduce((sum, item) => sum + item.packs, 0), 51);
  assert.deepEqual(catalog.filter((item) => item.packs === 2).map((item) => item.id), ['meadow', 'cookie', 'caramel', 'marmelade']);
  assert.ok(catalog.every(isAvailable));
});

test('200 разных формул, все вкусы задействованы, по 40 рецептов на профиль', () => {
  assert.equal(recipes.length, 200);
  assert.equal(new Set(recipes.map((recipe) => signature(recipe.parts, false))).size, 200);
  assert.equal(new Set(recipes.flatMap((recipe) => recipe.parts.map((part) => part.id))).size, 47);
  for (const profile of Object.keys(profiles)) assert.equal(recipes.filter((recipe) => recipe.profile === profile).length, 40);
  for (const recipe of recipes) {
    assert.equal(recipe.source, 'library');
    assert.ok(recipe.reasoning.length > 25);
    assert.equal(recipe.parts.reduce((sum, part) => sum + part.percent, 0), 100);
    for (const part of recipe.parts) assert.ok(part.percent > 0 && part.percent <= stock.get(part.id).cap, `${recipe.name}: ${part.id}`);
    const { axes, text } = mixDetails(recipe, stock);
    assert.ok(text.length > 20);
    for (const key of Object.keys(metrics)) assert.ok(axes[key] >= 0 && axes[key] <= 5);
  }
});

test('Фруктовый профиль показывает все 40 доступных рецептов порциями без повторов', () => {
  const seen = [];
  const options = { items: catalog, profile: 'fruit', limit: 7, seen };
  let batch;
  do {
    batch = recommendations(options);
    seen.push(...batch.slice(0, 6));
  } while (batch.length > 6);
  assert.equal(seen.length, 40);
  assert.equal(new Set(seen.map((recipe) => recipe.id)).size, 40);
  assert.ok(seen.every((recipe) => recipe.profile === 'fruit'));
  assert.deepEqual(recommendations(options), []);
});

test('Для каждого одиночного вкуса есть восемь различных предложений', () => {
  for (const { id } of catalog) {
    const list = recommendations({ items: catalog, pinned: [id] });
    assert.equal(list.length, 8, id);
    assert.ok(list.every((recipe) => recipe.parts.some((part) => part.id === id)));
    assert.equal(new Set(list.map((recipe) => signature(recipe.parts, false))).size, 8);
  }
});

test('Два закреплённых вкуса, выбранный профиль и генерация нового', () => {
  const options = { items: catalog, pinned: ['alova', 'pear'], profile: 'fresh', onlyNew: true };
  const list = recommendations(options);
  const next = recommendations({ ...options, seen: list });
  assert.ok(list.length >= 5 && list.length <= 10);
  assert.ok(next.length > 0);
  const combined = [...list, ...next];
  assert.equal(new Set(combined.map((recipe) => signature(recipe.parts, false))).size, combined.length);
  for (const recipe of combined) {
    assert.equal(recipe.profile, 'fresh');
    assert.equal(recipe.source, 'generated');
    assert.ok(['alova', 'pear'].every((id) => recipe.parts.some((part) => part.id === id)));
    assert.ok(!recipes.some((saved) => signature(saved.parts) === signature(recipe.parts)));
  }
});

test('Отсутствие, ноль упаковок и удалённый вкус исключают неподходящие формулы', () => {
  const changed = catalog.filter((item) => item.id !== 'pear').map((item) => item.id === 'lemon' ? { ...item, packs: 0 }
    : item.id === 'mint' ? { ...item, inStock: false } : item);
  assert.equal(recommendations({ items: changed, pinned: ['lemon'] }).length, 0);
  assert.equal(recommendations({ items: changed, pinned: ['pear'] }).length, 0);
  assert.ok(recommendations({ items: changed, pinned: ['alova'] }).every((recipe) => hasStock(recipe.parts, byId(changed))));
  assert.equal(recommendations({ items: changed, pinned: ['alova'], profile: 'fruit', random: true }).length, 1);
});

test('Следующий случайный микс учитывает фильтры и исключает показанный состав', () => {
  const options = { items: catalog, pinned: ['alova', 'pear'], profile: 'fresh', onlyNew: true, random: true };
  const first = recommendations(options);
  const next = recommendations({ ...options, seen: first });
  assert.equal(first.length, 1);
  assert.equal(next.length, 1);
  assert.notEqual(signature(first[0].parts, false), signature(next[0].parts, false));
  assert.equal(next[0].profile, 'fresh');
  assert.equal(next[0].source, 'generated');
  assert.ok(options.pinned.every((id) => next[0].parts.some((part) => part.id === id)));

  const single = { items: catalog.filter((item) => ['kiwi', 'pear'].includes(item.id)), profile: 'fruit', random: true };
  const shown = recommendations(single);
  assert.equal(shown.length, 1);
  assert.deepEqual(recommendations({ ...single, seen: shown }), []);
});

test('Одна оценка меняет сигнал ограниченно, повторения усиливают его', () => {
  const recipe = snapshot(recipes[0], stock);
  const feedback = { recipe, rating: 5 };
  assert.equal(personalization(recipe, learn([], stock), stock), 0);
  const first = personalization(recipe, learn([feedback], stock), stock);
  const repeated = personalization(recipe, learn(Array(8).fill(feedback), stock), stock);
  assert.ok(first > 0 && first < 1);
  assert.ok(repeated > first * 2);
  const close = { ...recipe, parts: recipe.parts.map((part, index) => ({ ...part, percent: part.percent + [5, -5, 0][index] })) };
  assert.ok(personalization(close, learn([feedback], stock), stock) > 0);
});

test('Резервная копия сохраняет оценки и снимки удалённых ингредиентов', () => {
  const state = initialState();
  const recipe = snapshot(recipes[0], stock);
  const review = { id: 'review-1', recipe, rating: 4, date: '2026-11-26T12:00:00.000Z' };
  state.collection = state.collection.filter((item) => item.id !== 'yuzu');
  state.favorites = [recipe];
  state.reviews = [review];
  const restored = decodeBackup(encodeBackup(state));
  assert.deepEqual(restored, state);
  assert.equal(mixDetails(restored.reviews[0].recipe, byId(restored.collection)).ingredients.at(-1).name, 'Yuzu');
});

test('Копия версии 1 убирает веса, сохраняет прежние отзывы и отмечает закончившиеся вкусы', () => {
  const data = initialState();
  data.settings.total = 18;
  data.collection[0].grams = 0;
  data.collection[1].grams = 15.5;
  const recipe = snapshot(recipes[0], stock);
  data.reviews = [{ id: 'review-1', recipe, rating: 4, repeat: 'yes', date: '2026-11-26T12:00:00.000Z', total: 18.1,
    positive: ['balanced'], negative: ['sweet'], liked: ['alova'], disliked: ['yuzu'], comment: 'Сменить акцент.' }];
  const restored = decodeBackup(JSON.stringify({ format: 'hookah-mix-lab', version: 1, data }));
  assert.equal(restored.settings.total, undefined);
  assert.ok(restored.collection.every((item) => !Object.hasOwn(item, 'grams')));
  assert.ok(!isAvailable(restored.collection[0]) && isAvailable(restored.collection[1]));
  assert.equal(restored.reviews[0].total, undefined);
  assert.equal(restored.reviews[0].comment, 'Сменить акцент.');
  assert.deepEqual(restored.reviews[0].liked, ['alova']);
  assert.deepEqual(decodeBackup(encodeBackup(restored)), restored);
});

test('Повреждённый, посторонний или некорректный импорт отклоняется', () => {
  assert.throws(() => decodeBackup('nope'), /JSON/);
  assert.throws(() => decodeBackup('{"format":"hookah-mix-lab","version":4}'), /версии 1, 2 или 3/);
  const state = initialState();
  state.collection.push(state.collection[0]);
  assert.throws(() => decodeBackup(encodeBackup(state)), /повторяющийся/);
});

test('Копия версии 2 сохраняет настройки подбора при удалении флага стартового окна', () => {
  const expected = initialState();
  expected.settings = { profile: 'fruit', pinned: ['alova'], onlyNew: true };
  const data = { ...expected, settings: { ...expected.settings, adult: false } };
  const restored = decodeBackup(JSON.stringify({ format: 'hookah-mix-lab', version: 2, data }));
  assert.deepEqual(restored, expected);
  assert.equal(JSON.parse(encodeBackup(restored)).version, 3);
});
