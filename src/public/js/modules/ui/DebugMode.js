/**
 * DebugMode.js
 * 
 * Debug mode utilities and selection management.
 * Extracted from map-logic.js (lines 269-277)
 */

/**
 * State for selected layers and their original styles
 */
let selectedLayers = [];
let originalStyles = [];

/**
 * Reset all selected layers to their original styles
 * Used when exiting debug mode or closing popups
 */
export function resetSelection() {
    selectedLayers.forEach((layer, i) => {
        if (layer && originalStyles[i] && typeof layer.setStyle === 'function') {
            layer.setStyle(originalStyles[i]);
        }
    });
    selectedLayers = [];
    originalStyles = [];
}

/**
 * Add a layer to the selection tracking
 * @param {Object} layer - Leaflet layer object
 * @param {Object} style - Original style to restore later
 */
export function addToSelection(layer, style) {
    selectedLayers.push(layer);
    originalStyles.push(style);
}

/**
 * Get current selected layers
 * @returns {Array} Array of selected layers
 */
export function getSelectedLayers() {
    return selectedLayers;
}

/**
 * Clear selection tracking without resetting styles
 */
export function clearSelection() {
    selectedLayers = [];
    originalStyles = [];
}
