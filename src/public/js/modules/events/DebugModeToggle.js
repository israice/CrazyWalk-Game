/**
 * Debug Mode Toggle Handler
 * Handles debug mode activation and UI updates
 */

/**
 * Setup debug mode toggle handler
 * @param {Object} options - Configuration
 * @param {Object} options.gameState - Game state object
 * @param {Object} options.posterRenderer - Poster renderer instance
 */
export function setupDebugModeToggle({ gameState, posterRenderer }) {
    document.addEventListener('debug-mode-change', (e) => {
        gameState.isDebugActive = e.detail.active;
        const postersBtn = document.getElementById('btn-debug-posters');

        if (gameState.isDebugActive) {
            postersBtn.style.display = 'flex';
        } else {
            postersBtn.style.display = 'none';
            gameState.isPostersDebugActive = false;
            postersBtn.classList.remove('active');
            posterRenderer.updatePostersVisibility();
        }
    });
}
