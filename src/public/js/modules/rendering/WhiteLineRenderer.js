/**
 * WhiteLineRenderer.js
 * Handles rendering of white lines with hit detection
 */

/**
 * Render all white lines
 * @param {Array} localWhiteLines - White line data array
 * @param {Object} deps - Dependencies object
 */
export function renderWhiteLines(localWhiteLines, deps) {
    const {
        detailsLayer,
        expandedLayer,
        lineLayerMap,
        controls,
        userMarker,
        updateAndSaveUserPosition,
        gameState,
        debugHandler,
        mode
    } = deps;

    if (!localWhiteLines || localWhiteLines.length === 0) return;

    const targetLayer = (mode === 'expand') ? expandedLayer : detailsLayer;

    // Set snap lines for controls
    controls.setSnapLines(localWhiteLines);

    localWhiteLines.forEach(line => {
        // Skip if line already exists
        if (lineLayerMap.has(String(line.id))) {
            console.log(`DEBUG: White line ${line.id} already exists, skipping creation`);
            return;
        }

        // Visual layer (thin, dashed, non-interactive)
        const visual = L.polyline(line.path, {
            color: 'white',
            weight: 2,
            dashArray: '5, 5',
            interactive: false,
            pane: 'blueCirclesPane'
        }).addTo(targetLayer);

        // Hit layer (thick, solid, transparent, interactive)
        const hit = L.polyline(line.path, {
            color: 'white',
            weight: 15,
            opacity: 0,
            interactive: true,
            pane: 'blueCirclesPane'
        }).addTo(targetLayer);

        // Attach debug click
        debugHandler.attachDebugClick(hit, line, 'White Line');

        // Composite proxy for logic handling
        const composite = {
            visual: visual,
            hit: hit,
            setStyle: function(style) {
                this.visual.setStyle(style);
                if (style.opacity === 0) {
                    this.hit.setStyle({ interactive: false });
                } else {
                    this.hit.setStyle({ interactive: true });
                }
            }
        };

        if (line.id !== undefined) {
            lineLayerMap.set(String(line.id), composite);
        }
    });

    // Update user position after lines are created
    const currentPos = userMarker.getLatLng();
    updateAndSaveUserPosition(userMarker, currentPos.lat, currentPos.lng, gameState.isGpsActive);
}
