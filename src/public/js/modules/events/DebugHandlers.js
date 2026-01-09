/**
 * DebugHandlers.js
 * 
 * Handles debug mode toggle events.
 * Extracted from map-logic.js for better code organization.
 */

/**
 * Setup debug mode event handlers
 * @param {Object} params - Handler parameters
 * @param {Object} params.gameState - Game state object
 * @param {Function} params.updatePostersVisibility - Function to update poster visibility
 */
export function setupDebugHandlers({ gameState, updatePostersVisibility }) {
    // Handle Debug Mode Toggles (via map_controls.js or top bar)
    document.addEventListener('debug-mode-change', (e) => {
        gameState.isDebugActive = e.detail.active;
        const postersBtn = document.getElementById('btn-debug-posters');
        if (gameState.isDebugActive) {
            postersBtn.style.display = 'flex';
        } else {
            postersBtn.style.display = 'none';
            gameState.isPostersDebugActive = false;
            postersBtn.classList.remove('active');
            updatePostersVisibility();
        }
    });

    console.log('DEBUG: Debug event handlers initialized');
}
