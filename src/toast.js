export function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `c-toast c-toast--${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('is-hiding');
        toast.addEventListener('animationend', () => toast.remove());
    }, 2000);
}
