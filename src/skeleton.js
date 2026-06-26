// Shared loading-skeleton helpers. Pair with styles/skeleton.css.
// Build placeholder elements that mirror real list rows while data loads,
// so the layout doesn't jump when content arrives.

// A single shimmering placeholder bar standing in for one line of text.  
export function skeletonBar(width, height) {
    const bar = document.createElement('div');
    bar.className = 'skeleton-bar';
    bar.style.width = width;
    bar.style.height = height;
    return bar;
}
