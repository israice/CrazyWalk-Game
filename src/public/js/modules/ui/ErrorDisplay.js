/**
 * ErrorDisplay.js
 * 
 * Error screen management and display utilities.
 * Extracted from map-logic.js (lines 755-770)
 */

/**
 * Show error screen with message
 * Hides the map and loading elements, shows error screen with retry button
 * 
 * @param {string} msg - HTML error message to display
 */
export function showError(msg) {
    const loadingGif = document.getElementById('loading-gif');
    const mapElement = document.getElementById('map');
    const topBarContainer = document.getElementById('top-bar-container');
    const errorScreen = document.getElementById('error-screen');
    const errorMessage = document.getElementById('error-message');
    const retryBtn = document.getElementById('retry-btn');

    // Hide map and loading
    if (loadingGif) loadingGif.style.display = 'none';
    if (mapElement) mapElement.style.display = 'none';
    if (topBarContainer) topBarContainer.style.display = 'none';

    // Show error screen
    if (errorScreen) errorScreen.style.display = 'flex';
    if (errorMessage) errorMessage.innerHTML = msg;

    // Setup retry button
    if (retryBtn) {
        retryBtn.onclick = () => {
            window.location.reload();
        };
    }
}
