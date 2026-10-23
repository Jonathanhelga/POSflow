// Item button themes: the tagColor value stored on each item, its display name and its swatch color.
export const THEMES = [
    { token: 'primary',    name: 'Muted Cobalt',  color: '#4E7397' },
    { token: 'success',    name: 'Sage Green',    color: '#86A38C' },
    { token: 'neutral',    name: 'Soft Blue',     color: '#6E9BC5' },
    { token: 'priority',   name: 'Dusty Rose',    color: '#C58B8B' },
    { token: 'legibility', name: 'Deep Charcoal', color: '#2D3748' },
    { token: 'pink',       name: 'Baby Pink',     color: '#ea8cd1' },
    { token: 'yellow',     name: 'Yellow Butter', color: '#ebdfa4' },
];

export function swatchFor(tagColor) {
    const theme = THEMES.find(t => t.token === tagColor);
    return theme ? theme.color : 'var(--clr-border)';
}

export function themeName(token) {
    return (THEMES.find(t => t.token === token) || {}).name || token || '—';
}

// Fills `container` with one round button per theme; the active one is the picker's value.
export function buildThemeSwatches(container, nameEl) {
    const frag = document.createDocumentFragment();
    THEMES.forEach(theme => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'c-swatch';
        btn.dataset.theme = theme.token;
        btn.title = theme.name;
        btn.style.backgroundColor = theme.color;
        btn.addEventListener('click', () => setActiveTheme(container, theme.token, nameEl));
        frag.appendChild(btn);
    });
    container.replaceChildren(frag);
}

// `nameEl` is optional: when given, it shows the selected theme's name.
export function setActiveTheme(container, token, nameEl) {
    container.querySelectorAll('.c-swatch').forEach(sw => {
        sw.classList.toggle('c-swatch--active', sw.dataset.theme === token);
    });
    if (nameEl) nameEl.textContent = themeName(token);
}

export function getActiveTheme(container) {
    const active = container.querySelector('.c-swatch--active');
    return active ? active.dataset.theme : 'primary';
}
