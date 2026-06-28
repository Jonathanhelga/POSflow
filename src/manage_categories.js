import { getCategories, persistCategories } from './categories';
import { toggleModal } from './modal-handler';
import { showConfirm } from './confirm_modal';
import { showToast } from './toast';

function renderCategoryList() {
    const list = document.getElementById('js-category-list');
    const categories = getCategories();
    list.replaceChildren();

    if (categories.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'mc-empty';
        empty.textContent = 'No categories yet. Add one above.';
        list.appendChild(empty);
        return;
    }

    const frag = document.createDocumentFragment();
    categories.forEach(cat => {
        const li = document.createElement('li');
        li.className = 'mc-item';

        const name = document.createElement('span');
        name.className = 'mc-item__name';
        name.textContent = cat;

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'mc-item__delete';
        del.setAttribute('aria-label', `Delete ${cat}`);
        del.textContent = '×';
        del.addEventListener('click', () => handleDelete(cat));

        li.append(name, del);
        frag.appendChild(li);
    });
    list.appendChild(frag);
}

function showCategoryFeedback(msg) {
    document.getElementById('js-category-feedback').textContent = msg || '';
}

async function handleAdd(e) {
    e.preventDefault();
    const input = document.getElementById('js-category-input');
    const name = input.value.trim();
    showCategoryFeedback('');
    if (!name) return;

    const categories = getCategories();
    // Case-insensitive duplicate guard so the list stays clean.
    if (categories.some(c => c.toLowerCase() === name.toLowerCase())) {
        showCategoryFeedback(`"${name}" already exists.`);
        return;
    }

    const btn = document.getElementById('js-category-add-btn');
    btn.disabled = true;
    try {
        await persistCategories([...categories, name]);
        input.value = '';
        renderCategoryList();
    } catch (err) {
        console.error('Failed to add category:', err);
        showCategoryFeedback('Could not save. Please try again.');
    } finally {
        btn.disabled = false;
        input.focus();
    }
}

async function handleDelete(cat) {
    const confirmed = await showConfirm({
        title: 'Delete category?',
        message: `Remove "${cat}"? Items already using it keep the label. You just won't be able to pick it for new items.`,
        confirmText: 'Delete',
        danger: true,
    });
    if (!confirmed) return;

    try {
        await persistCategories(getCategories().filter(c => c !== cat));
        renderCategoryList();
        showToast(`Deleted category "${cat}".`);
    } catch (err) {
        console.error('Failed to delete category:', err);
        showToast('Could not delete category.', 'error');
    }
}

export function initManageCategories() {
    const openBtn = document.getElementById('manage-categories-open');
    if (!openBtn) return;

    openBtn.addEventListener('click', () => {
        toggleModal('features-modal');
        toggleModal('manage-categories-modal');
        showCategoryFeedback('');
        renderCategoryList();
    });

    document.getElementById('js-category-add-form').addEventListener('submit', handleAdd);
}
