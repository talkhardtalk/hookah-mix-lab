import { families, metrics, profiles } from './catalog.mjs';
import { isAvailable } from './engine.mjs';
import { empty, icon, safe, searchBox } from './views.mjs';

export function dialogFrame(title, subtitle, content) {
  return `<div class="modal-top"><div><h2 id="dialog-title">${safe(title)}</h2>${subtitle ? `<p>${safe(subtitle)}</p>` : ''}</div><button class="icon-button" data-action="close" aria-label="Закрыть">${icon('close')}</button></div>${content}`;
}

function fieldsError() {
  return '<p class="form-error" data-error role="alert" hidden></p>';
}

function formEnd(label, extra = '') {
  return `${fieldsError()}<div class="modal-actions">${extra}<button class="button primary" type="submit">${label}</button></div>`;
}

export function pickerDialog() {
  return dialogFrame('Выбрать вкус', 'Поиск среди вкусов, которые есть в коллекции.', `${searchBox('pick-search', '', 'Вкус или производитель')}<div class="pick-list" id="pick-results"></div>`);
}

export function recipePickerDialog() {
  return dialogFrame('Изменить рецепт', '', `${searchBox('recipe-pick-search', '', 'Название рецепта')}<div class="pick-list" id="recipe-pick-results"></div>`);
}

export function recipePickerList(choices) {
  return choices.length ? choices.map(({ recipe, group }) => {
    const profile = profiles[recipe.profile];
    return `<button class="pick-item" data-action="open-recipe-editor" data-id="${safe(recipe.id)}"><span class="flavor-dot" style="--tint:${profile.color}"></span><span><b>${safe(recipe.name)}</b><small>${group} · ${profile.name}</small></span>${icon('edit')}</button>`;
  }).join('') : empty('Рецепты не найдены', 'Попробуй другое название.', 'search');
}

export function pickerList(items, query, excluded) {
  const normalized = query.trim().toLocaleLowerCase('ru');
  const visible = items.filter((item) => isAvailable(item) && item.id !== excluded && `${item.name} ${item.brand}`.toLocaleLowerCase('ru').includes(normalized));
  return visible.length ? visible.map((item) => `<button class="pick-item" data-action="pin" data-id="${safe(item.id)}"><span class="flavor-dot" style="--tint:${families[item.tags[0]].color}"></span><span><b>${safe(item.name)}</b><small>${safe(item.brand || families[item.tags[0]].name)}</small></span>${icon('plus')}</button>`).join('') : empty('Вкусы не найдены', 'Проверь запрос или наличие в коллекции.', 'search');
}

export function itemDialog(item) {
  const choices = (item?.tags ?? ['fruit']);
  return dialogFrame(item ? 'Редактировать вкус' : 'Добавить вкус', 'Вкусовые характеристики влияют на автоматический подбор.', `<form data-form="item">
    <div class="form-grid"><label>Название<input name="name" required maxlength="90" value="${safe(item?.name)}"></label><label>Производитель<input name="brand" maxlength="90" value="${safe(item?.brand)}"></label></div>
    <label>Описание аромата<input name="note" maxlength="250" value="${safe(item?.note)}" placeholder="Например, груша и цедра"></label>
    <fieldset><legend>Вкусовые группы</legend><div class="tag-options">${Object.entries(families).map(([key, family]) => `<label><input type="checkbox" name="tags" value="${key}"${choices.includes(key) ? ' checked' : ''}> ${family.name}</label>`).join('')}</div></fieldset>
    <div class="form-grid">${Object.entries(metrics).map(([key, metric]) => `<label>${metric.name} (0–5)<input name="${key}" type="number" inputmode="decimal" min="0" max="5" step="0.1" required value="${item?.axes[key] ?? 2.5}"></label>`).join('')}</div>
    <div class="form-grid"><label>Упаковок<input name="packs" type="number" min="0" max="999" step="1" inputmode="numeric" required value="${item?.packs ?? 1}"></label>
    <label>Личная оценка<select name="rating"><option value="0">Без оценки</option>${[1, 2, 3, 4, 5].map((rating) => `<option value="${rating}"${item?.rating === rating ? ' selected' : ''}>${rating} из 5</option>`).join('')}</select></label>
    <label>Максимальная доля в подборе, %<input name="cap" type="number" min="5" max="100" required value="${item?.cap ?? 75}"></label></div>
    <label class="check-inline"><input type="checkbox" name="inStock"${item?.inStock === false ? '' : ' checked'}> В наличии</label>
    ${formEnd('Сохранить', item ? '<button class="button danger" type="button" data-action="delete-item">Удалить вкус</button>' : '')}</form>`);
}

export function recipeLine(part, items, index) {
  return `<div class="recipe-line"><label><span class="sr-only">Ингредиент ${index + 1}</span><select name="ingredient" required><option value="">Выбрать ингредиент</option>${items.map((item) => `<option value="${safe(item.id)}"${part.id === item.id ? ' selected' : ''}>${safe(item.name)}${item.brand ? ` · ${safe(item.brand)}` : ''}</option>`).join('')}</select></label><label><span class="sr-only">Доля ингредиента ${index + 1}, %</span><input type="number" name="percent" min="1" max="99" inputmode="numeric" value="${part.percent || ''}" required></label><button class="icon-button" type="button" data-action="remove-line" aria-label="Удалить ингредиент ${index + 1}">${icon('close')}</button></div>`;
}

export function recipeDialog(recipe, items) {
  const parts = recipe?.parts ?? [{ id: '', percent: 60 }, { id: '', percent: 40 }];
  const own = recipe?.source === 'custom';
  return dialogFrame(recipe ? 'Редактор пропорций' : 'Свой рецепт', recipe && !own ? 'Изменённая формула сохранится в разделе «Мои рецепты».' : 'Выбери от двух до шести вкусов. Сумма долей должна быть 100%.',
    `<form data-form="recipe"><label>Название<input name="name" maxlength="190" required value="${safe(recipe?.name || '')}"></label><label>Профиль<select name="profile">${Object.entries(profiles).map(([id, profile]) => `<option value="${id}"${recipe?.profile === id ? ' selected' : ''}>${profile.name}</option>`).join('')}</select></label>
    <fieldset><legend>Состав и доли, %</legend><div id="recipe-lines">${parts.map((part, index) => recipeLine(part, items, index)).join('')}</div><div class="composition-footer"><button class="button subtle" type="button" data-action="add-line">${icon('plus')} Ингредиент</button><output id="recipe-sum" aria-live="polite">Сумма ${parts.reduce((sum, part) => sum + part.percent, 0)}%</output></div></fieldset>
    <label>Почему сочетаются<textarea name="reasoning" maxlength="1500" rows="3" placeholder="Какая нота станет основой и что её дополнит?">${safe(recipe?.reasoning)}</textarea></label>
    ${formEnd('Сохранить рецепт', own ? '<button class="button danger" type="button" data-action="delete-recipe">Удалить рецепт</button>' : '')}</form>`);
}

export function reviewDialog(recipe, review) {
  return dialogFrame(review ? 'Изменить оценку' : 'Оценить микс', recipe.name, `<form data-form="review">
    <fieldset><legend>Оценка</legend><div class="star-input">${[1, 2, 3, 4, 5].map((star) => `<label><input type="radio" name="rating" value="${star}" required${review?.rating === star ? ' checked' : ''}><span aria-hidden="true">★</span><span class="sr-only">${star} из 5</span></label>`).join('')}</div></fieldset>
    ${formEnd('Сохранить оценку', review ? '<button class="button danger" type="button" data-action="delete-review">Удалить оценку</button>' : '')}</form>`);
}
