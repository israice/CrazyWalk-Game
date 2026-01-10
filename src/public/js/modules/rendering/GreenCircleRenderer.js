/**
 * GreenCircleRenderer.js
 * Handles rendering of green circles on white lines
 */

/**
 * Render all green circles
 * @param {Array} localGreenCircles - Green circle data array
 * @param {Array} localPolys - Polygon data array
 * @param {Object} deps - Dependencies object
 */
export function renderGreenCircles(localGreenCircles, localPolys, deps) {
    const {
        detailsLayer,
        expandedLayer,
        circleLayerMap,
        greenCirclesByLine,
        expandedCircleCoords,
        gameState,
        debugHandler,
        mapCircleToPolys,
        mode
    } = deps;

    if (!localGreenCircles || localGreenCircles.length === 0) return;

    const targetLayer = (mode === 'expand') ? expandedLayer : detailsLayer;

    localGreenCircles.forEach(circle => {
        const coordKey = `${circle.lat.toFixed(6)},${circle.lon.toFixed(6)}`;

        // Skip if already rendered
        if (circleLayerMap.has(coordKey)) {
            updateExistingGreenCircle(circle, coordKey, localPolys, deps);
            return;
        }

        const isCollected = gameState.collectedCircles.has(coordKey);

        // Track expanded circle coordinates
        if (mode === 'expand') {
            expandedCircleCoords.add(coordKey);
        }

        // Visual layer (small)
        const visual = L.circleMarker([circle.lat, circle.lon], {
            radius: 4,
            color: 'green',
            fillColor: '#00ff00',
            fillOpacity: isCollected && !gameState.isPostersDebugActive ? 0 : 1,
            opacity: isCollected && !gameState.isPostersDebugActive ? 0 : 1,
            interactive: false,
            pane: 'blueCirclesPane'
        }).addTo(targetLayer);

        // Style if collected but debug active
        if (isCollected && gameState.isPostersDebugActive) {
            visual.setStyle({ color: '#555', opacity: 0.5 });
        }

        // Hit layer (large, invisible, interactive)
        const hit = L.circleMarker([circle.lat, circle.lon], {
            radius: 12,
            stroke: false,
            fillOpacity: 0,
            interactive: !isCollected,
            pane: 'blueCirclesPane'
        }).addTo(targetLayer);

        hit.visualSibling = visual;

        // Attach debug click
        debugHandler.attachDebugClick(hit, circle, 'Green Circle');

        // Composite proxy
        const composite = {
            visual: visual,
            hit: hit,
            get options() { return this.visual.options; },
            setStyle: function(style) {
                this.visual.setStyle(style);
                if (style.opacity === 0) {
                    this.hit.setStyle({ interactive: false });
                } else {
                    this.hit.setStyle({ interactive: true });
                }
            },
            getTooltip: function() { return this.visual.getTooltip(); },
            unbindTooltip: function() { return this.visual.unbindTooltip(); }
        };

        // Add to circle layer map
        circleLayerMap.set(coordKey, composite);

        // Map to polygons
        mapCircleToPolys(circle.lat, circle.lon, localPolys, circle.line_id || -1);

        // Track by line ID for polygon completion hiding
        if (circle.line_id !== undefined) {
            if (!greenCirclesByLine.has(circle.line_id)) {
                greenCirclesByLine.set(circle.line_id, []);
            }
            greenCirclesByLine.get(circle.line_id).push(visual);
        }
    });
}

/**
 * Update existing green circle in expand mode
 */
function updateExistingGreenCircle(circle, coordKey, localPolys, deps) {
    const { circleLayerMap, greenCirclesByLine, mapCircleToPolys } = deps;

    // Update polygon mapping
    mapCircleToPolys(circle.lat, circle.lon, localPolys, circle.line_id || -1);

    // Ensure it's in greenCirclesByLine map
    if (circle.line_id !== undefined) {
        const existingLayer = circleLayerMap.get(coordKey);
        if (existingLayer && existingLayer.visual) {
            if (!greenCirclesByLine.has(circle.line_id)) {
                greenCirclesByLine.set(circle.line_id, []);
            }
            const circles = greenCirclesByLine.get(circle.line_id);
            if (!circles.includes(existingLayer.visual)) {
                circles.push(existingLayer.visual);
            }
        }
    }
}
