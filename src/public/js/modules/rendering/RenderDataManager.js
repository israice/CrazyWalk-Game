/**
 * RenderDataManager.js
 * Handles stateful data operations for rendering
 */

/**
 * Merge backend blue circles with restored state
 * @param {Array} backendBlueCircles 
 * @param {Array} restoredBlueCircles 
 * @param {string} mode 
 * @returns {Array} Merged blue circles
 */
export function mergeBlueCircles(backendBlueCircles, restoredBlueCircles, mode) {
    let localBlueCircles = backendBlueCircles || [];

    if (mode === 'initial' && restoredBlueCircles && restoredBlueCircles.length > 0) {
        const backendBlueCoords = new Set(
            localBlueCircles.map(bc => `${bc.lat.toFixed(7)},${bc.lon.toFixed(7)}`)
        );

        restoredBlueCircles.forEach(restoredCircle => {
            const coordKey = `${restoredCircle.lat.toFixed(7)},${restoredCircle.lon.toFixed(7)}`;
            if (!backendBlueCoords.has(coordKey)) {
                localBlueCircles.push(restoredCircle);
            }
        });

        console.log(`DEBUG: Merged blue circles - Backend: ${backendBlueCircles?.length || 0}, Restored: ${restoredBlueCircles.length}, Total: ${localBlueCircles.length}`);
    }

    return localBlueCircles;
}

/**
 * Initialize or cleanup global item storage
 * @param {string} mode 
 */
export function initGlobalStorage(mode) {
    if (mode !== 'expand') {
        window.allItems = new Map();
    } else if (!window.allItems) {
        window.allItems = new Map();
    }
}

/**
 * Update global item storage with new data
 * @param {Object} data - Contains white_lines, green_circles, polygons
 * @param {Set} expandedItemUids 
 * @param {string} mode 
 */
export function updateGlobalStorage(data, expandedItemUids, mode) {
    if (data.white_lines) {
        data.white_lines.forEach(line => {
            window.allItems.set(line.uid, line);
            if (mode === 'expand' && !expandedItemUids.has(line.uid)) {
                expandedItemUids.add(line.uid);
            }
        });
    }

    if (data.green_circles) {
        data.green_circles.forEach(circle => {
            window.allItems.set(circle.uid, circle);
            if (mode === 'expand' && !expandedItemUids.has(circle.uid)) {
                expandedItemUids.add(circle.uid);
            }
        });
    }

    if (data.polygons) {
        data.polygons.forEach(poly => {
            window.allItems.set(poly.uid, poly);
            if (mode === 'expand' && !expandedItemUids.has(poly.uid)) {
                expandedItemUids.add(poly.uid);
            }
        });
    }
}
