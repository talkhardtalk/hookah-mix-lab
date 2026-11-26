import { catalog, families, metrics, profiles } from './catalog.mjs';
import { feedbackTags, isPositiveTag } from './engine.mjs';

export const FORMAT = 'hookah-mix-lab';
export const VERSION = 2;
export const DEFAULT_SETTINGS = { profile: '', pinned: [], onlyNew: false, adult: false };
const scope = globalThis.location?.pathname.replace(/index\.html$/, '').replace(/\/$/, '') || '/';
const storageKey = `${FORMAT}:${scope}`;

export function initialState() {
  return { collection: structuredClone(catalog), custom: [], favorites: [], reviews: [], settings: structuredClone(DEFAULT_SETTINGS) };
}

function fail(label) {
  throw new Error(`Некорректные данные: ${label}.`);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label);
  return value;
}

function list(value, label, max = 20000) {
  if (!Array.isArray(value) || value.length > max) fail(label);
  return value;
}

function string(value, label, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(label);
  return value.trim();
}

function number(value, label, min, max, integer = false) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(label);
  return value;
}

function flag(value, label) {
  if (typeof value !== 'boolean') fail(label);
  return value;
}

function id(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9:+-]{0,359}$/i.test(value)) fail(label);
  return value;
}

function flavorId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,59}$/i.test(value)) fail('идентификатор вкуса');
  return value;
}

function tenths(value, label, min, max) {
  if (!Number.isInteger(number(value, label, min, max) * 10)) fail(label);
  return value;
}

function unique(values, label) {
  if (new Set(values).size !== values.length) fail(label);
  return values;
}

function known(value, dictionary, label) {
  if (!Object.hasOwn(dictionary, value)) fail(label);
  return value;
}

function itemSnapshot(raw) {
  const value = object(raw, 'карточка вкуса');
  const axes = object(value.axes, 'характеристики вкуса');
  const tags = unique(list(value.tags, 'группы вкуса', 4).map((tag) => known(tag, families, 'группа вкуса')), 'группы вкуса');
  if (!tags.length) fail('группы вкуса');
  return {
    id: flavorId(value.id), name: string(value.name, 'название вкуса', 90, true),
    brand: string(value.brand, 'производитель', 90), note: string(value.note, 'описание аромата', 250), tags,
    axes: Object.fromEntries(Object.keys(metrics).map((key) => [key, tenths(axes[key], 'характеристика вкуса', 0, 5)])),
  };
}

function item(raw, previousVersion) {
  const profile = itemSnapshot(raw);
  const inStock = flag(raw.inStock, 'наличие');
  return {
    ...profile, cap: number(raw.cap, 'доля в подборе', 5, 100, true),
    packs: number(raw.packs, 'упаковки', 0, 999, true),
    inStock: inStock && (!previousVersion || raw.grams !== 0), rating: number(raw.rating, 'оценка вкуса', 0, 5, true),
  };
}

function recipe(raw) {
  const value = object(raw, 'рецепт');
  const parts = list(value.parts, 'состав', 6).map((part) => {
    object(part, 'ингредиент');
    return { id: flavorId(part.id), percent: number(part.percent, 'доля', 1, 99, true) };
  });
  const partIds = unique(parts.map((part) => part.id), 'повторяющийся ингредиент');
  if (parts.length < 2 || parts.reduce((sum, part) => sum + part.percent, 0) !== 100) fail('сумма долей');
  const items = list(value.items, 'снимок состава', 6).map(itemSnapshot);
  const snapshotIds = unique(items.map((entry) => entry.id), 'снимок состава');
  if (items.length !== parts.length || !partIds.every((key) => snapshotIds.includes(key))) fail('снимок состава');
  if (!['custom', 'library', 'generated'].includes(value.source)) fail('источник рецепта');
  return {
    id: id(value.id, 'идентификатор рецепта'), name: string(value.name, 'название рецепта', 190, true),
    profile: known(value.profile, profiles, 'профиль'), parts, items, source: value.source,
    reasoning: string(value.reasoning, 'объяснение сочетания', 1500),
  };
}

function review(raw) {
  const value = object(raw, 'оценка');
  const saved = recipe(value.recipe);
  const entryDate = string(value.date, 'дата оценки', 35, true);
  if (!Number.isFinite(Date.parse(entryDate))) fail('дата оценки');
  const core = {
    id: id(value.id, 'идентификатор отзыва'), recipe: saved, date: entryDate,
    rating: number(value.rating, 'звёзды', 1, 5, true),
  };
  const legacyFields = ['repeat', 'positive', 'negative', 'liked', 'disliked', 'comment'];
  if (!legacyFields.some((key) => Object.hasOwn(value, key))) return core;
  if (!['yes', 'no', 'unknown'].includes(value.repeat)) fail('желание повторить');
  const componentList = (entries) => unique(list(entries, 'оценки компонентов', 6).map((key) => {
    if (!saved.parts.some((part) => part.id === key)) fail('оценки компонентов');
    return key;
  }), 'оценки компонентов');
  const tags = (entries, isPositive) => unique(list(entries, 'отметки', 12).map((tag) => {
    if (isPositiveTag(known(tag, feedbackTags, 'отметка')) !== isPositive) fail('отметка');
    return tag;
  }), 'отметки');
  return {
    ...core, repeat: value.repeat,
    positive: tags(value.positive, true), negative: tags(value.negative, false), liked: componentList(value.liked),
    disliked: componentList(value.disliked), comment: string(value.comment, 'комментарий', 2000),
  };
}

export function validateState(raw, version = VERSION) {
  const value = object(raw, 'резервная копия');
  const collection = list(value.collection, 'коллекция', 2000).map((entry) => item(entry, version === 1));
  const custom = list(value.custom, 'свои рецепты').map(recipe);
  const favorites = list(value.favorites, 'избранное').map(recipe);
  const reviews = list(value.reviews, 'оценки').map(review);
  for (const records of [collection, custom, favorites, reviews]) unique(records.map((record) => record.id), 'повторяющийся идентификатор');
  if (custom.some((entry) => entry.source !== 'custom')) fail('свой рецепт');
  const settings = object(value.settings, 'настройки');
  const pinned = unique(list(settings.pinned, 'выбранные вкусы', 2).map(flavorId), 'выбранные вкусы');
  return { collection, custom, favorites, reviews, settings: {
    adult: flag(settings.adult, 'подтверждение возраста'),
    onlyNew: flag(settings.onlyNew, 'режим подбора'), pinned: pinned.filter((key) => collection.some((entry) => entry.id === key)),
    profile: settings.profile === '' ? '' : known(settings.profile, profiles, 'профиль'),
  } };
}

export function encodeBackup(state) {
  return JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), data: state }, null, 2);
}

export function decodeBackup(text) {
  let envelope;
  try { envelope = JSON.parse(text); } catch { throw new Error('Файл должен содержать корректный JSON.'); }
  if (envelope?.format !== FORMAT || ![1, VERSION].includes(envelope.version)) {
    throw new Error('Нужна резервная копия Hookah Mix Lab версии 1 или 2.');
  }
  return validateState(envelope.data, envelope.version);
}

// Контракт чтения и записи состояния позволяет добавить синхронизацию поверх версионного формата.
export const stateRepository = {
  read() {
    const raw = localStorage.getItem(storageKey);
    return raw === null ? initialState() : decodeBackup(raw);
  },
  write(value) {
    localStorage.setItem(storageKey, encodeBackup(value));
  },
};
