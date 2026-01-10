/**
 * Version Badge Loader
 * Fetches version from README.md and displays it
 */

/**
 * Load and display version badge from README.md
 */
export function loadVersionBadge() {
    const versionBadge = document.getElementById('version-badge');
    if (!versionBadge) return;

    (async () => {
        try {
            const response = await fetch('/README.md?t=' + Date.now());
            if (!response.ok) throw new Error('README.md not found');

            const text = await response.text();
            const match = text.match(/git commit -m "(v[\d.]+)/m);
            if (!match) throw new Error('Version not found in README.md');

            versionBadge.textContent = match[1];
            versionBadge.style.opacity = '1';
        } catch (err) {
            console.warn('DEBUG: Failed to load version badge:', err.message);
            versionBadge.style.display = 'none';
        }
    })();
}
