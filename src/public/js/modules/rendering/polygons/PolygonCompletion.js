/**
 * PolygonCompletion.js
 * 
 * Handles logic for when a polygon is fully completed (all circles collected).
 */

/**
 * Handle completed polygon - move to persistent layer and update UI
 * @param {Object} pState - Polygon state object
 * @param {L.LayerGroup} detailsLayer - Temporary layer (cleared on move)
 * @param {L.LayerGroup} completedPolygonsLayer - Persistent layer
 * @param {Object} posterRenderer - Renderer for posters
 * @param {L.Marker} pLabel - Label marker
 * @param {L.Marker} pPromo - Promo marker
 * @param {Object} gameState - Game state object
 */
export function handleCompletedPolygon(pState, detailsLayer, completedPolygonsLayer, posterRenderer, pLabel, pPromo, gameState) {
    console.log(`DEBUG: Restoring Completed Polygon ${pState.id} to Persistent Layer`);

    if (detailsLayer.hasLayer(pState.layer)) {
        detailsLayer.removeLayer(pState.layer);
    }
    completedPolygonsLayer.addLayer(pState.layer);

    pState.layer.setStyle({
        color: 'transparent',
        fillColor: 'transparent',
        fillOpacity: 0,
        stroke: false
    });

    if (pLabel && detailsLayer.hasLayer(pLabel)) {
        detailsLayer.removeLayer(pLabel);
    }
    if (pPromo && detailsLayer.hasLayer(pPromo)) {
        detailsLayer.removeLayer(pPromo);
    }
    pState.label = null;
    pState.promo = null;

    posterRenderer.revealPolygonPart(pState.coords);
}

/**
 * Restore poster masks for completed polygons
 * @param {Map} polygonState - Map of polygon states
 * @param {Object} posterRenderer - Renderer for posters
 */
export function restorePosterMasks(polygonState, posterRenderer) {
    console.log("DEBUG: Checking for completed polygons to restore poster masks...");
    let restoredMasksCount = 0;

    polygonState.forEach(state => {
        if (state.current >= state.total && state.coords) {
            console.log(`DEBUG: Restoring poster mask for completed polygon ${state.id}`);
            posterRenderer.revealPolygonPart(state.coords);
            restoredMasksCount++;
        }
    });

    console.log(`DEBUG: Restored ${restoredMasksCount} poster masks for completed polygons`);
}
