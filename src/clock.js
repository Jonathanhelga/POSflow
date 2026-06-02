
const dateFmt = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
});

const timeFmt = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
});

function tickClock(dateEl, timeEl) {
    const now = new Date();
    dateEl.textContent = dateFmt.format(now);
    timeEl.textContent = timeFmt.format(now);
}

export function initClock() {
    const dateEl = document.getElementById('clock-date');
    const timeEl = document.getElementById('clock-time');
    if (!dateEl || !timeEl) return;

    tickClock(dateEl, timeEl);               // paint immediately, don't wait 1s
    setInterval(() => tickClock(dateEl, timeEl), 1000);
}
