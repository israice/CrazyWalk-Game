/**
 * DebugHighlighter.js
 * Handles element highlighting for debug mode
 */

import { resetSelection, addToSelection, getSelectedLayers } from './DebugMode.js';

/**
 * Highlights a layer with red color and saves original style
 */
function highlightLayer(layer, styleOverrides = {}) {
    if (!layer || typeof layer.setStyle !== 'function') return false;

    const selectedLayers = getSelectedLayers();
    if (selectedLayers.includes(layer)) return false;

    const originalStyle = {
        color: layer.options.color,
        weight: layer.options.weight || 1,
        fillColor: layer.options.fillColor,
        fillOpacity: layer.options.fillOpacity,
        dashArray: layer.options.dashArray,
        opacity: layer.options.opacity
    };

    addToSelection(layer, originalStyle);
    layer.setStyle({
        color: 'red',
        weight: styleOverrides.weight || 3,
        dashArray: null,
        opacity: 1,
        ...styleOverrides
    });

    return true;
}

/**
 * Highlights polygon with its boundary elements
 */
export function highlightPolygon(data, targetLayer, layerMaps) {
    const { lineLayerMap, greenCirclesByLine, blueCircleLayerMap } = layerMaps;
    const selectedLayers = getSelectedLayers();

    resetSelection();

    // 1. Highlight polygon boundary
    highlightLayer(targetLayer);

    // 2. Highlight white lines
    if (lineLayerMap && data.boundary_white_lines) {
        data.boundary_white_lines.forEach(lineId => {
            const lineLayers = lineLayerMap.get(String(lineId));
            if (lineLayers?.visual) {
                highlightLayer(lineLayers.visual, { weight: 3 });
            }
        });
    }

    // 3. Highlight green circles on boundary lines
    if (greenCirclesByLine && data.boundary_white_lines) {
        data.boundary_white_lines.forEach(lineId => {
            const circles = greenCirclesByLine.get(String(lineId));
            circles?.forEach(circleLayer => highlightLayer(circleLayer));
        });
    }

    // 4. Highlight blue circles at vertices (fuzzy match)
    if (blueCircleLayerMap && data.coords) {
        data.coords.forEach(coord => {
            const [targetLat, targetLon] = coord;

            for (const [key, blueCircle] of blueCircleLayerMap) {
                const [lat, lon] = key.split(',').map(Number);
                const distance = Math.sqrt(
                    Math.pow(lat - targetLat, 2) + Math.pow(lon - targetLon, 2)
                );

                // ~0.00005 degrees ≈ 5 meters
                if (distance < 0.00005 && !selectedLayers.includes(blueCircle)) {
                    highlightLayer(blueCircle, { weight: 4 });
                    break;
                }
            }
        });
    }
}

/**
 * Highlights white line with its endpoints and circles
 */
export function highlightWhiteLine(data, layerMaps) {
    const { lineLayerMap, greenCirclesByLine, blueCircleLayerMap } = layerMaps;
    const selectedLayers = getSelectedLayers();

    resetSelection();

    // 1. Highlight the line itself
    if (lineLayerMap) {
        const lineComposite = lineLayerMap.get(String(data.uid));
        if (lineComposite?.visual) {
            highlightLayer(lineComposite.visual, { weight: 4 });
        }
    }

    // 2. Highlight blue circles at endpoints
    if (blueCircleLayerMap && data.start && data.end) {
        const startKey = `${data.start[0].toFixed(6)},${data.start[1].toFixed(6)}`;
        const endKey = `${data.end[0].toFixed(6)},${data.end[1].toFixed(6)}`;

        [startKey, endKey].forEach(key => {
            const blueCircle = blueCircleLayerMap.get(key);
            if (blueCircle && !selectedLayers.includes(blueCircle)) {
                highlightLayer(blueCircle, { weight: 4 });
            }
        });
    }

    // 3. Highlight green circles on this line
    if (greenCirclesByLine) {
        const greenCircles = greenCirclesByLine.get(String(data.uid));
        greenCircles?.forEach(circleLayer => {
            if (!selectedLayers.includes(circleLayer)) {
                highlightLayer(circleLayer);
            }
        });
    }
}

/**
 * Highlights a generic element (circle, line, polygon)
 */
export function highlightGeneric(targetLayer, type) {
    resetSelection();

    if (typeof targetLayer.setStyle !== 'function') return;

    if (type.includes('Circle')) {
        highlightLayer(targetLayer, { weight: 4 });
    } else if (type.includes('Line')) {
        highlightLayer(targetLayer, { weight: 4 });
    } else if (type.includes('Polygon')) {
        highlightLayer(targetLayer, { weight: 3 });
    }
}

/**
 * Highlights the label marker itself
 */
export function highlightLabel(layer) {
    const selectedLayers = getSelectedLayers();
    if (layer && typeof layer.setStyle === 'function' && !selectedLayers.includes(layer)) {
        addToSelection(layer, { color: 'original' });
        layer.setStyle({ color: 'red', weight: 3 });
    }
}
