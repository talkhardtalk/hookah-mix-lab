import { catalog, families, metrics } from './catalog.mjs';
import { recipes } from './recipes.mjs';

export const feedbackTags = {
  balanced: 'Сбалансированный', vivid: 'Яркий вкус', aroma: 'Удачное сочетание', aftertaste: 'Хорошее послевкусие',
  sweet: 'Слишком сладкий', acid: 'Слишком кислый', fresh: 'Слишком холодный',
  cloying: 'Приторный', body: 'Слишком насыщенный', flat: 'Слабый вкус', conflict: 'Компоненты спорят',
};

const positive = new Set(['balanced', 'vivid', 'aroma', 'aftertaste']);
const metricKeys = Object.keys(metrics);
const catalogById = byId(catalog);

export function byId(items) {
  return new Map(items.map((item) => [item.id, item]));
}

export function isAvailable(item) {
  return Boolean(item?.inStock && item.packs > 0);
}

export function signature(parts, includeRatio = true) {
  return [...parts].sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, percent }) => includeRatio ? `${id}:${percent}` : id).join('+');
}

export function hasStock(parts, stock) {
  return parts.every(({ id }) => isAvailable(stock.get(id)));
}

export function coupleKey(a, b) {
  return [a, b].sort().join('+');
}

export function mixDetails(recipe, stock) {
  const snapshots = byId(recipe.items ?? []);
  const ingredients = recipe.parts.map(({ id, percent }) => ({
    ...(snapshots.get(id) ?? stock.get(id) ?? catalogById.get(id)), id, percent,
  })).sort((a, b) => b.percent - a.percent);
  const axes = Object.fromEntries(metricKeys.map((key) => {
    let value = ingredients.reduce((sum, item) => sum + (item.axes?.[key] ?? 2.5) * item.percent / 100, 0);
    if (key === 'fresh') {
      const cooling = ingredients.find((item) => item.id === 'ice' || item.tags?.[0] === 'cold' || item.id === 'catmint');
      if (cooling) value += Math.min(1.6, cooling.percent / (cooling.id === 'ice' ? 6 : 18));
    }
    return [key, Math.min(5, Math.round(value * 10) / 10)];
  }));
  const notes = (ingredient) => ingredient.note || families[ingredient.tags?.[0]]?.aroma || ingredient.name || 'авторский аромат';
  const text = `${ingredients.map((item, i) => `${i === 0 ? 'В основе' : i === 1 ? 'Дополнение' : 'Акцент'} — ${notes(item)}`).join('. ')}.`;
  return { ingredients, axes, text };
}

export function snapshot(recipe, stock) {
  return { ...recipe, items: mixDetails(recipe, stock).ingredients.map(({ id, name, brand, tags, note, axes }) => ({
    id, name, brand, tags, note, axes,
  })) };
}

function observe(map, key, value, weight = 1) {
  if (!weight) return;
  const entry = map.get(key) ?? { sum: 0, weight: 0 };
  entry.sum += value * weight;
  entry.weight += weight;
  map.set(key, entry);
}

export function learn(reviews, stock) {
  const flavors = new Map();
  const pairs = new Map();
  const ratios = new Map();
  const preferences = new Map();
  const impressions = new Map();
  const profiles = new Map();
  for (const item of stock.values()) {
    if (item.rating) observe(flavors, item.id, item.rating - 3, 0.9);
  }
  for (const review of reviews) {
    const { parts, profile } = review.recipe;
    const { repeat, positive = [], negative = [], liked = [], disliked = [] } = review;
    const value = review.rating - 3 + (repeat === 'yes' ? .4 : repeat === 'no' ? -.4 : 0)
      + Math.min(.35, positive.length * .12);
    observe(profiles, profile, value);
    const group = signature(parts, false);
    const examples = ratios.get(group) ?? [];
    examples.push({ value, shares: new Map(parts.map(({ id, percent }) => [id, percent])) });
    ratios.set(group, examples);
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      observe(flavors, part.id, value, part.percent / 100);
      if (liked.includes(part.id)) observe(flavors, part.id, 2, .8);
      if (disliked.includes(part.id)) observe(flavors, part.id, -2, .8);
      for (const other of parts.slice(i + 1)) {
        const harmony = value + (negative.includes('conflict') ? -.6 : positive.includes('aroma') ? .3 : 0);
        observe(pairs, coupleKey(part.id, other.id), harmony, .7);
      }
    }
    for (const tag of new Set([...positive, ...negative])) {
      impressions.set(tag, (impressions.get(tag) ?? 0) + 1);
      const key = tag === 'cloying' ? 'sweet' : tag === 'flat' ? 'body' : tag;
      if (metricKeys.includes(key)) observe(preferences, key, tag === 'flat' ? 1 : -.8, .9);
    }
  }
  return { flavors, pairs, ratios, preferences, impressions, profiles };
}

export function signal(map, key, prior = 5) {
  const entry = map.get(key);
  return entry ? entry.sum / (entry.weight + prior) : 0;
}

export function personalization(recipe, learned, stock) {
  const parts = recipe.parts;
  const rating = parts.reduce((sum, part, i) => {
    const pairScore = parts.slice(i + 1).reduce((score, other) => score + signal(learned.pairs, coupleKey(part.id, other.id)), 0);
    return sum + signal(learned.flavors, part.id) * part.percent / 100 + pairScore / 3;
  }, 0);
  const { axes } = mixDetails(recipe, stock);
  const bias = metricKeys.reduce((sum, key) => sum + signal(learned.preferences, key) * (axes[key] - 2.5) * .45, 0);
  const examples = learned.ratios.get(signature(parts, false)) ?? [];
  let ratioSum = 0;
  let ratioWeight = 0;
  for (const { shares, value } of examples) {
    const difference = parts.reduce((sum, part) => sum + Math.abs(shares.get(part.id) - part.percent), 0);
    const weight = Math.max(0, 1 - difference / 50);
    ratioSum += value * weight;
    ratioWeight += weight;
  }
  return .65 * (rating + bias + signal(learned.profiles, recipe.profile) * .35 + ratioSum / (ratioWeight + 5) * .65);
}

// У каждой схемы есть свои роли и объяснение перехода между ароматами.
const patterns = [
  ['fruit', ['fruit'], ['fruit', 'citrus', 'berry'], ['herbal', 'citrus', 'cream', 'cold'], 'Фруктовая основа даёт мякоть. Вторая нота добавляет контраст по кислоте или оттеняет спелый аромат.'],
  ['berry', ['berry'], ['berry', 'fruit', 'soda'], ['citrus', 'candy', 'cream', 'cold'], 'Ягодная основа даёт терпкость. Сочная добавка делает переход между кислотой и сладостью мягче.'],
  ['dessert', ['cream', 'bakery', 'nut'], ['cream', 'bakery', 'nut', 'berry'], ['candy', 'cream', 'nut', 'bakery'], 'Сливочная или зерновая основа связывает ароматы. Орех, ягоды или выпечка добавляют отдельный слой.'],
  ['fresh', ['fruit', 'soda', 'herbal', 'berry'], ['citrus', 'herbal', 'soda', 'fruit'], ['cold', 'herbal', 'citrus'], 'Сочная или травяная основа удерживает вкус. Цитрус, зелень или холодок дают более свежий финиш.'],
  ['unusual', ['cream', 'bakery', 'soda', 'herbal'], ['floral', 'berry', 'nut', 'herbal'], ['cream', 'citrus', 'candy'], 'Контрастная нота остаётся дополнением, поэтому исходный аромат сохраняется. Третий оттенок смягчает переход.'],
  ['unusual', ['fruit'], ['bakery'], ['cream', 'nut'], 'Сочный фрукт даёт контраст сухим злакам или тесту. Сливочный либо ореховый акцент связывает их, как начинку и корж.'],
  ['fresh', ['cream', 'soda'], ['cream', 'bakery', 'nut', 'candy', 'fruit'], ['cold'], 'Мягкая сладкая основа напоминает охлаждённый десерт. Небольшая доля холодка заметнее в послевкусии и сохраняет основной аромат.'],
  ['fresh', ['fruit', 'soda', 'berry'], ['floral', 'candy'], ['cold'], 'Сочный вкус сохраняет ощущение напитка. Цветочная сладость смягчает финиш, а дозированный холодок добавляет прохладу.'],
];

const libraryFormulas = new Set(recipes.map((recipe) => signature(recipe.parts)));

function hasTag(item, accepted) {
  return item.tags.some((tag) => accepted.includes(tag));
}

function contrastScore(a, b) {
  return 0.18 * Math.abs(a.axes.sweet - b.axes.sweet) + 0.08 * Math.abs(a.axes.acid - b.axes.acid);
}

function makeGenerated(base, other, accent, pattern, pinned) {
  const [profile, , , , reasoning] = pattern;
  if (base.id === other.id || accent?.id === base.id || accent?.id === other.id) return null;
  if (!accent && pattern[3].length === 1 && pattern[3][0] === 'cold') return null;
  if (accent?.tags.includes('cold') && [base, other].some((item) => item.id === 'ice' || item.id === 'mint' || item.id === 'catmint')) return null;
  if (base.axes.acid > 4 && other.axes.acid > 4 && (!accent || accent.axes.sweet < 3.8)) return null;
  if (base.axes.sweet > 4.2 && other.axes.sweet > 4.2 && (!accent || accent.axes.acid < 3.5)) return null;
  const accentPct = accent ? Math.min(accent.id === 'ice' ? 5 : accent.tags.includes('cold') ? 15 : 20, accent.cap) : 0;
  const second = Math.min(other.cap, accent ? 35 : 45);
  const first = Math.min(base.cap, 100 - second - accentPct);
  const remaining = 100 - first - second - accentPct;
  const extraOther = Math.min(remaining, other.cap - second, first - second);
  const extraAccent = remaining - extraOther;
  if (extraAccent && (!accent || accent.id === 'ice' || accentPct + extraAccent > Math.min(accent.cap, 30))) return null;
  const parts = [{ id: base.id, percent: first }, { id: other.id, percent: second + extraOther }];
  if (accent) parts.push({ id: accent.id, percent: accentPct + extraAccent });
  const code = signature(parts);
  if (libraryFormulas.has(code)) return null;
  const short = (item) => item.name.split(' — ')[0];
  const labels = accent && pinned.includes(accent.id) && !pinned.includes(other.id) ? [base, accent] : [base, other];
  return {
    id: `generated:${code}`, profile, parts, source: 'generated',
    name: labels.map(short).join(' + '),
    reasoning: accent ? reasoning : reasoning.split(/ Третий оттенок| Сливочный либо/)[0],
    quality: 2.4 + contrastScore(base, other) + (accent ? .2 : .32),
  };
}

function* generated(available, pinned, profile, stock) {
  const selected = pinned.map((id) => stock.get(id));
  for (const pattern of patterns) {
    const [type, bases, companions, accents] = pattern;
    if (profile && type !== profile) continue;
    const basePool = available.filter((item) => item.cap >= 40 && hasTag(item, bases));
    const companionPool = available.filter((item) => item.cap >= 25 && hasTag(item, companions));
    const accentPool = available.filter((item) => hasTag(item, accents));
    for (const base of basePool) {
      const missingBase = selected.filter((item) => item.id !== base.id);
      for (const other of missingBase.length === 2 ? missingBase : companionPool) {
        if (base.id === other.id || other.cap < 25 || !hasTag(other, companions)) continue;
        const missing = missingBase.filter((item) => item.id !== other.id);
        if (missing.length === 0) {
          const pair = makeGenerated(base, other, null, pattern, pinned);
          if (pair) yield pair;
        }
        for (const accent of missing.length ? missing : accentPool) {
          if (!hasTag(accent, accents)) continue;
          const triple = makeGenerated(base, other, accent, pattern, pinned);
          if (triple) yield triple;
        }
      }
    }
  }
}

export function recommendations({ items, custom = [], reviews = [], pinned = [], profile = '', limit = 8, random = false, onlyNew = false, seen = [] }) {
  const stock = byId(items);
  const available = items.filter(isAvailable);
  if (pinned.some((id) => !isAvailable(stock.get(id)))) return [];
  const learned = learn(reviews, stock);
  const used = new Set(seen.map((recipe) => signature(recipe.parts, false)));
  const matches = (recipe) => (!profile || recipe.profile === profile)
    && pinned.every((id) => recipe.parts.some((part) => part.id === id)) && hasStock(recipe.parts, stock)
    && !used.has(signature(recipe.parts, false));
  const fromLibrary = onlyNew ? [] : [...custom, ...recipes].filter(matches);
  const required = pinned.length ? pinned : (random || onlyNew) && available.length
    ? [available[Math.floor(Math.random() * available.length)].id] : [];
  const proposals = new Map();
  for (const recipe of generated(required.length ? available : [], required, profile, stock)) {
    const key = signature(recipe.parts, false);
    if (used.has(key)) continue;
    const old = proposals.get(key);
    const score = recipe.quality + personalization(recipe, learned, stock);
    if (!old || old.score < score) proposals.set(key, { recipe, score });
  }
  const candidates = [...fromLibrary.map((recipe) => ({ recipe, score: 4 + personalization(recipe, learned, stock) })), ...proposals.values()];
  if (!candidates.length && required.length && !pinned.length && available.length > 1) {
    const fallback = new Set();
    for (const recipe of generated(available, [], profile, stock)) {
      const key = signature(recipe.parts, false);
      if (used.has(key) || fallback.has(key)) continue;
      fallback.add(key);
      candidates.push({ recipe, score: recipe.quality + personalization(recipe, learned, stock) });
      if (candidates.length >= (random ? 24 : 40)) break;
    }
  }
  if (random) {
    const pool = candidates.map(({ recipe, score }) => ({ recipe, weight: Math.exp(Math.min(2, score - 4)) }));
    let draw = Math.random() * pool.reduce((sum, candidate) => sum + candidate.weight, 0);
    const result = pool.find((candidate) => (draw -= candidate.weight) < 0) ?? pool.at(-1);
    return result ? [result.recipe] : [];
  }

  const output = [];
  const frequencies = new Map();
  const record = (recipe) => {
    for (const id of [recipe.profile, ...recipe.parts.map((part) => part.id)]) {
      frequencies.set(id, (frequencies.get(id) ?? 0) + 1);
    }
  };
  seen.forEach(record);
  const novelty = ({ recipe, score }) => score - recipe.parts.reduce((penalty, part) =>
    penalty + (pinned.includes(part.id) ? 0 : (frequencies.get(part.id) ?? 0) * .42), 0)
    - (frequencies.get(recipe.profile) ?? 0) * .11;
  while (output.length < limit && candidates.length) {
    candidates.sort((a, b) => novelty(b) - novelty(a));
    const { recipe } = candidates.shift();
    const key = signature(recipe.parts, false);
    if (used.has(key)) continue;
    output.push(recipe);
    used.add(key);
    record(recipe);
  }
  return output;
}

export function isPositiveTag(tag) {
  return positive.has(tag);
}
