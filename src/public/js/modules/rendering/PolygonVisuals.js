/**
 * PolygonVisuals - Handles visual updates for polygon completion
 */

/**
 * Creates a polygon visuals updater with dependencies
 * @param {Object} deps - Dependencies
 * @returns {Function} updatePolygonVisuals function
 */
export function createPolygonVisualsUpdater(deps) {
    const {
        detailsLayer,
        expandedLayer,
        completedPolygonsLayer,
        circleLayerMap,
        posterRenderer,
        gameState
    } = deps;

    /**
     * Update polygon visual state based on collection progress
     * @param {Object} state - Polygon state object
     * @param {Map} lineMap - Line layer map (unused but kept for API compatibility)
     */
    return function updatePolygonVisuals(state, lineMap) {
        const pct = Math.floor((state.current / state.total) * 100);

        // Update Label
        if (state.label) {
            const icon = state.label.options.icon;
            icon.options.html = icon.options.html.replace(/>\d+%</, `>${pct}%<`);
            state.label.setIcon(icon);
        }

        // Check Completion
        if (state.current >= state.total) {
            console.log("DEBUG: Polygon Completed! Moving to Persistent Layer.");

            // Move to Persistent Layer
            if (detailsLayer.hasLayer(state.layer)) {
                detailsLayer.removeLayer(state.layer);
            } else {
                state.layer.remove();
            }

            if (!completedPolygonsLayer.hasLayer(state.layer)) {
                completedPolygonsLayer.addLayer(state.layer);
            }

            state.layer.setStyle({
                color: 'transparent',
                fillColor: 'transparent',
                fillOpacity: 0,
                stroke: false
            });

            // Reveal poster part
            posterRenderer.revealPolygonPart(state.coords);

            // Remove label and promo
            if (state.label) {
                if (!gameState.isPostersDebugActive) {
                    if (detailsLayer.hasLayer(state.label)) {
                        detailsLayer.removeLayer(state.label);
                    } else if (expandedLayer.hasLayer(state.label)) {
                        expandedLayer.removeLayer(state.label);
                    } else {
                        state.label.remove();
                    }
                    state.label = null;
                }
            }
            if (state.promo) {
                if (!gameState.isPostersDebugActive) {
                    if (detailsLayer.hasLayer(state.promo)) {
                        detailsLayer.removeLayer(state.promo);
                    } else if (expandedLayer.hasLayer(state.promo)) {
                        expandedLayer.removeLayer(state.promo);
                    } else {
                        state.promo.remove();
                    }
                    state.promo = null;
                }
            }

            // Hide circles at polygon vertices
            if (state.coords && circleLayerMap) {
                state.coords.forEach(coord => {
                    const key = `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;
                    const circleLayer = circleLayerMap.get(key);
                    if (circleLayer && !gameState.isPostersDebugActive) {
                        if (typeof circleLayer.setStyle === 'function') {
                            circleLayer.setStyle({ opacity: 0, fillOpacity: 0 });
                        }
                    }
                });
            }
        }
    };
}
