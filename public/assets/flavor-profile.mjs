import { metrics } from './catalog.mjs';

// Группа, начала слов, сладость, кислотность, свежесть, насыщенность и предельная доля.
const presets = [
  ['fruit', 'фрукт яблок груш манго киви ананас персик банан слив абрикос алыч гуав фейхо маракуй личи гранат дын арбуз виноград mango apple pear kiwi pineapple peach banana plum guava watermelon melon grape passionfruit lychee fruit', [3.7, 2.4, 2.4, 3.4], 75],
  ['berry', 'ягод клубник малин ежев черник голубик смородин клюкв брусник крыжов вишн черешн земляник strawberry raspberry blackberry blueberry blackcurrant cranberry gooseberry cherry berry berries', [3.4, 3.4, 2.3, 3.9], 70],
  ['citrus', 'цитрус лимон лайм апельс мандарин грейпфрут юдзу помело бергамот цедр citrus lemon lime orange mandarin grapefruit yuzu pomelo bergamot zest', [2.2, 4.3, 3.8, 3.8], 50],
  ['cream', 'сливоч сливк молок молоч йогур пломбир морожен чизкейк сгущ ваниль cream milk yogurt yoghurt vanilla cheesecake gelato', [4, .6, 1, 3.8], 65],
  ['bakery', 'печень бисквит пирог вафл торт попкорн злак мюсли рис крекер cookie biscuit cake waffle pastry popcorn cereal rice cracker', [3.3, .5, .7, 4], 60],
  ['nut', 'орех фисташ миндал фундук кокос кедр nut pistachio almond hazelnut coconut', [3.2, .5, .9, 3.9], 55],
  ['herbal', 'трав алоэ лемонграс чай улун базилик тархун розмарин тимьян шалфей herbal aloe lemongrass tea oolong basil tarragon rosemary sage', [2.1, 1.4, 3.4, 3.4], 35],
  ['floral', 'цветоч лаванд ромаш жасмин розов гибискус шафран floral lavender chamomile jasmine rose hibiscus saffron', [2.8, 1.2, 2.8, 3.6], 40],
  ['soda', 'лимонад газиров кола байкал тоник спритц lemonade soda cola tonic spritz', [3.8, 2.5, 3.4, 3.6], 70],
  ['cold', 'ментол холод лед мят кулер охлаж прохлад эвкалипт айс menthol cold ice mint cooling eucalyptus', [1.5, .4, 4.8, 3.8], 25],
  ['candy', 'конфет мармелад карамель леденец леденц жвач сироп десерт мед candy marmelade marmalade caramel gum syrup honey', [4.5, 1.3, 1.1, 4], 50],
].map(([group, stems, axes, cap]) => ({ group, stems: stems.split(' '), axes, cap }));

function words(text) {
  return text.toLocaleLowerCase('ru').replaceAll('ё', 'е').match(/\p{L}+/gu) ?? [];
}

export function suggestFlavorProfile(name, note) {
  const hits = new Map();
  for (const [text, weight] of [[name, 2], [note, 1]]) {
    for (const word of new Set(words(text))) {
      let bestLength = 0;
      let bestPreset;
      for (const preset of presets) {
        for (const stem of preset.stems) {
          if (stem.length > bestLength && word.startsWith(stem)) {
            bestPreset = preset;
            bestLength = stem.length;
          }
        }
      }
      if (bestPreset) hits.set(bestPreset, (hits.get(bestPreset) ?? 0) + weight);
    }
  }

  const ranked = [...hits.keys()].sort((a, b) => hits.get(b) - hits.get(a)).slice(0, 4);
  const main = ranked[0];
  const traits = words(`${name} ${note}`);
  const axes = Object.fromEntries(Object.keys(metrics).map((key, i) => {
    if (!main) return [key, 2.5];
    const secondary = ranked.slice(1);
    const blend = secondary.length ? main.axes[i] * .75 + secondary.reduce((sum, item) => sum + item.axes[i], 0) / secondary.length * .25 : main.axes[i];
    return [key, Math.round(blend * 10) / 10];
  }));
  if (traits.some((word) => word.startsWith('кисл'))) axes.acid = Math.max(axes.acid, 4.2);
  if (traits.some((word) => word.startsWith('слад'))) axes.sweet = Math.max(axes.sweet, 4);

  return {
    tags: main ? ranked.map(({ group }) => group) : ['fruit'],
    axes, cap: main?.cap ?? 75, recognized: Boolean(main),
  };
}
