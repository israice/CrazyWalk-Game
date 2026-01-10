/**
 * PosterDebugController.js
 * 
 * Manages the visibility of other game elements (circles, lines) when the poster debug mode is active.
 */

export class PosterDebugController {
    constructor() {
        // Stateless helpers
    }

    /**
     * Toggle visibility of hidden/collected elements in debug mode
     * @param {boolean} show - Whether to show hidden elements
     * @param {Object} layers - Map of layers { circleLayerMap, lineLayerMap }
     * @param {Object} gameState - Game state object { collectedCircles, polygonState }
     */
    toggleHiddenDebug(show, layers, gameState) {
        const { circleLayerMap, lineLayerMap } = layers;
        const { collectedCircles, polygonState } = gameState;

        if (!circleLayerMap || !polygonState || !lineLayerMap) return;

        console.log(`DEBUG: Toggling hidden elements: ${show ? 'SHOW ALL' : 'RESTORE HIDDEN'}`);

        // 1. Handle Collected Circles
        collectedCircles.forEach(key => {
            const layer = circleLayerMap.get(key);
            if (layer) {
                if (show) {
                    // Reveal
                    const isBlue = layer.options.color === 'blue' || (layer.options.fillColor === '#00ccff');
                    layer.setStyle({
                        opacity: 1,
                        fillOpacity: isBlue ? 0.8 : 1
                    });

                    // Restore Blue Circle Tooltip (Number)
                    if (layer.connections !== undefined && !layer.getTooltip()) {
                        layer.bindTooltip(String(layer.connections), {
                            permanent: true,
                            direction: 'center',
                            className: 'circle-label'
                        });
                    }
                } else {
                    // Re-hide
                    layer.setStyle({ opacity: 0, fillOpacity: 0 });

                    // Remove tooltip again if it was restored
                    if (layer.getTooltip()) {
                        layer.unbindTooltip();
                    }
                }
            }
        });

        // 2. Handle Lines from Completed Polygons
        polygonState.forEach(state => {
            if (state.current >= state.total && state.lines) {
                state.lines.forEach(lid => {
                    const lineLayer = lineLayerMap.get(String(lid));
                    if (lineLayer) {
                        if (show) {
                            lineLayer.setStyle({ opacity: 1, fillOpacity: 1 });
                        } else {
                            lineLayer.setStyle({ opacity: 0, fillOpacity: 0 });
                        }
                    }
                });
            }
        });
    }
}
