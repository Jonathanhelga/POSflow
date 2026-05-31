const FIELD_TYPE_LABELS = {
    choice: 'Multiple Choice',
    date: 'Date',
    time: 'Time',
};
const FIELD_BODY_TEMPLATES = {
    date: 'js-checkout-field-body-date-template',
    time: 'js-checkout-field-body-time-template',
    choice: 'js-checkout-field-body-choice-template',
};
const MAX_CHOICE_OPTIONS = 5;

export function initCustomFields() {
    const addBtn = document.getElementById('js-checkout-add-field');
    const typeMenu = document.getElementById('js-checkout-type-menu');
    if (!addBtn || !typeMenu) return;

    addBtn.addEventListener('click', toggleTypeMenu);
    for (const option of typeMenu.querySelectorAll('.c-checkout__type-option')) { option.addEventListener('click', handleTypeSelect); }//tiap type menu dikasih event listener
    document.addEventListener('click', handleOutsideMenuClick); // to close the type menu when we click on something else
}

// --- Type menu ---

function toggleTypeMenu() {
    const menu = document.getElementById('js-checkout-type-menu');
    if (menu) menu.classList.toggle('is-hidden');
}

function closeTypeMenu() {
    const menu = document.getElementById('js-checkout-type-menu');
    if (menu) menu.classList.add('is-hidden');
}

function handleOutsideMenuClick(e) { 
    if (!e.target.closest('.c-checkout__add-wrap')) { closeTypeMenu(); } 
}

// Build a whole field card (header + body) from the templates, append it, and close the menu.
function handleTypeSelect(e) {
    const type = e.currentTarget.dataset.fieldType;
    const container = document.getElementById('js-checkout-fields');
    if (!container) return;

    const card = document.getElementById('js-checkout-field-card-template').content.firstElementChild.cloneNode(true);
    card.dataset.fieldType = type;
    card.querySelector('.c-checkout__field-card-type').textContent = FIELD_TYPE_LABELS[type] || type;
    card.querySelector('.c-checkout__field-remove').addEventListener('click', handleFieldRemove);

    const bodyTemplate = document.getElementById(FIELD_BODY_TEMPLATES[type]);
    if (bodyTemplate) {
        card.querySelector('.c-checkout__field-card-body').appendChild(bodyTemplate.content.cloneNode(true));
        if (type === 'choice') {
            card.querySelector('.c-checkout__option-add-btn').addEventListener('click', handleOptionTrigger);
            card.querySelector('.c-checkout__option-input').addEventListener('keydown', handleOptionTrigger);
        }
    }
    
    container.appendChild(card);
    closeTypeMenu();
}

function handleFieldRemove(e) {
    const card = e.target.closest('.c-checkout__field-card');
    if (card) card.remove();
}

// Shared by the "+" button (click) and the text input (Enter key).
function handleOptionTrigger(e) {
    if (e.type === 'keydown') {
        if (e.key !== 'Enter') return;
        e.preventDefault();
    }
    addOptionFromInput(e.currentTarget.closest('.c-checkout__field-card'));
}

function addOptionFromInput(card) {
    const input = card.querySelector('.c-checkout__option-input');
    const options = card.querySelector('.c-checkout__options');
    const value = input.value.trim();
    if (!value || options.children.length >= MAX_CHOICE_OPTIONS) return;

    // ignore duplicates (case-insensitive)
    for (const text of options.querySelectorAll('.c-checkout__option-text')) {
        if (text.textContent.toLowerCase() === value.toLowerCase() ) { input.value = ''; return; }
    }
    
    const option = document.getElementById('js-checkout-option-template').content.firstElementChild.cloneNode(true);
    option.querySelector('.c-checkout__option-text').textContent = value;
    option.querySelector('.c-checkout__option-pick').addEventListener('click', handleOptionSelect);
    option.querySelector('.c-checkout__option-remove').addEventListener('click', handleOptionRemove);
    options.appendChild(option);

    if (!options.querySelector('.c-checkout__option.is-selected')) selectOption(option);
    input.value = '';
    input.focus();
    updateOptionLimit(card);
}

function handleOptionSelect(e) {
    selectOption(e.currentTarget.closest('.c-checkout__option'));
}

function selectOption(option) {
    for (const sibling of option.parentElement.children) sibling.classList.remove('is-selected');
    option.classList.add('is-selected');
}

function handleOptionRemove(e) {
    const option = e.currentTarget.closest('.c-checkout__option');
    const card = option.closest('.c-checkout__field-card');
    const options = option.parentElement;
    const wasSelected = option.classList.contains('is-selected');
    option.remove();
    if (wasSelected && options.firstElementChild) selectOption(options.firstElementChild);
    updateOptionLimit(card);
}

function updateOptionLimit(card) {
    const options = card.querySelector('.c-checkout__options');
    const input = card.querySelector('.c-checkout__option-input');
    const addBtn = card.querySelector('.c-checkout__option-add-btn');
    const hint = card.querySelector('.c-checkout__choice-hint');
    const atMax = options.children.length >= MAX_CHOICE_OPTIONS;

    input.disabled = atMax;
    addBtn.disabled = atMax;
    if (hint) hint.textContent = atMax ? '(max reached)' : '(max 5)';
}

export function resetCustomFields() {
    const container = document.getElementById('js-checkout-fields');
    if (container) container.replaceChildren();
    closeTypeMenu();
}

// --- Read values for checkout (Phase 3) ---

// Walk every field card and build the queryable `customFields` map (spec §3.2),
// keyed by a stable slug derived from the label. Incomplete cards are skipped.
export function collectCustomFields() {
    const container = document.getElementById('js-checkout-fields');
    const result = {};
    if (!container) return result;

    for (const card of container.querySelectorAll('.c-checkout__field-card')) {
        const type = card.dataset.fieldType;
        const label = (card.querySelector('.c-checkout__field-label')?.value || '').trim();
        const value = readCardValue(card, type);
        if (!label || !value) continue;

        result[uniqueSlug(slugify(label), result)] = { label, type, value };
    }
    return result;
}

function readCardValue(card, type) {
    if (type === 'choice') {
        const selected = card.querySelector('.c-checkout__option.is-selected .c-checkout__option-text');
        return selected ? selected.textContent : '';
    }
    return (card.querySelector('.c-checkout__field-value')?.value || '').trim();
}

function slugify(label) {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return slug || 'field';
}

function uniqueSlug(base, existing) {
    if (!(base in existing)) return base;
    let n = 2;
    while (`${base}_${n}` in existing) n++;
    return `${base}_${n}`;
}
