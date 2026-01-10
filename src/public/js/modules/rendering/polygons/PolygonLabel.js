/**
 * PolygonLabel.js
 * 
 * Handles the creation of percentage labels on polygons.
 */

/**
 * Create percentage label circle
 * @param {Object} poly - Polygon data
 * @param {Array<number>} centerPos - Center coordinates [lat, lon]
 * @param {number} offsetX - X offset for label position
 * @param {number} offsetY - Y offset for label position
 * @param {number} savedCount - Number of saved circles
 * @param {boolean} isCompleted - Whether polygon is completed
 * @param {L.LayerGroup} targetLayer - Layer to add content to
 * @param {Object} gameState - Game state object
 * @param {Object} debugHandler - Debug interaction handler
 * @param {L.Polygon} pLayer - The parent polygon layer
 * @param {Object} direction - Label direction object
 * @returns {L.Marker|null} The created label marker or null
 */
export function createPercentageLabel(poly, centerPos, offsetX, offsetY, savedCount, isCompleted, targetLayer, gameState, debugHandler, pLayer, direction) {
    if (isCompleted && !gameState.isPostersDebugActive) {
        return null;
    }

    const initialPercent = poly.total_points > 0 ? Math.floor((savedCount / poly.total_points) * 100) : 0;

    const pLabel = L.marker([centerPos[0], centerPos[1]], {
        icon: L.divIcon({
            className: 'poly-label',
            html: `<div style="background:white; border-radius:50%; width:30px; height:30px; text-align:center; line-height:30px; color:black; font-size:10px; opacity: 0.8; font-weight:bold; pointer-events: auto;">${initialPercent}%</div>`,
            iconSize: [30, 30],
            iconAnchor: [15 - offsetX, 15 - offsetY]
        }),
        interactive: true
    }).addTo(targetLayer);

    // Setup UID and debug data
    const whiteCircleUid = `WHITE_CIRCLE_${poly.uid.replace('POLYGON_', '')}`;
    pLabel.uid = whiteCircleUid;

    const labelDebugData = {
        uid: whiteCircleUid,
        parent_polygon_uid: poly.uid,
        boundary_white_lines: poly.boundary_white_lines,
        center: poly.center,
        label_direction: direction,
        label_angle_degrees: direction.angle ? (direction.angle * 180 / Math.PI) : 0,
        coords: poly.coords,
        total_points: poly.total_points,
        blue_circles_count: poly.blue_circles_count || 0,
        merge_count: poly.merge_count || 1,
        poster_ids: poly.poster_ids || [],
        neighbor_polygon_ids: poly.neighbor_polygon_ids || [],
        neighbor_polygons_count: poly.neighbor_polygons_count || 0,
        missing_polygons: poly.missing_polygons || 0
    };
    if (window.allItems) {
        window.allItems.set(labelDebugData.uid, labelDebugData);
    }

    pLabel.visualSibling = pLayer;

    // Add setStyle polyfill for debug highlighting
    pLabel.setStyle = function (style) {
        const icon = this.options.icon;
        let html = icon.options.html;

        if (style.color === 'red') {
            if (!html.includes('border: 3px solid red')) {
                html = html.replace('background:white;', 'background:white; border: 3px solid red;');
            }
        } else {
            html = html.replace('border: 3px solid red;', '');
        }

        if (html !== icon.options.html) {
            icon.options.html = html;
            this.setIcon(icon);
        }
    };

    debugHandler.attachDebugClick(pLabel, labelDebugData, 'Polygon Label');

    return pLabel;
}
