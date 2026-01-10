/**
 * PolygonPromo.js
 * 
 * Handles the creation and interaction of promo circles on polygons.
 */

/**
 * Create promo circle with GIF
 * @param {Object} poly - Polygon data
 * @param {Array<number>} centerPos - Center coordinates [lat, lon]
 * @param {boolean} isCompleted - Whether polygon is completed
 * @param {L.LayerGroup} targetLayer - Layer to add content to
 * @param {Map} lineLayerMap - Map of line layers
 * @param {L.Map} map - Leaflet map instance
 * @param {Object} gameState - Game state object
 * @param {Object} debugHandler - Debug interaction handler
 * @returns {L.Marker|null} The created promo marker or null
 */
export function createPromoCircle(poly, centerPos, isCompleted, targetLayer, lineLayerMap, map, gameState, debugHandler) {
    const gifFile = poly.promo_gif;
    if (!gifFile || (isCompleted && !gameState.isPostersDebugActive)) {
        return null;
    }

    const pPromo = L.marker([centerPos[0], centerPos[1]], {
        icon: L.divIcon({
            className: 'poly-promo',
            html: `<div style="background:white; border-radius:50%; width:60px; height:60px; overflow:hidden; border:2px solid white; box-shadow:0 0 5px rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center;">
                <img src="/GAME_PROMOS/${gifFile}" style="width:100%; height:100%; object-fit:cover;">
            </div>`,
            iconSize: [60, 60],
            iconAnchor: [30, 30]
        }),
        interactive: true
    }).addTo(targetLayer);

    // Create popup content
    const popupContent = createPromoPopupContent(poly);
    pPromo.bindPopup(popupContent, { minWidth: 300, maxWidth: 350 });

    // Line highlighting on popup
    setupPopupLineHighlighting(pPromo, poly, lineLayerMap, map);

    // Setup debug data
    const largeWhiteCircleUid = `LARGE_WHITE_CIRCLE_${poly.uid.replace('POLYGON_', '')}`;
    const promoDebugData = {
        uid: largeWhiteCircleUid,
        parent_polygon_uid: poly.uid,
        gif: gifFile,
        neighbor_polygons_count: poly.neighbor_polygons_count
    };
    if (window.allItems) {
        window.allItems.set(promoDebugData.uid, promoDebugData);
    }
    debugHandler.attachDebugClick(pPromo, promoDebugData, 'Promo Circle');

    return pPromo;
}

/**
 * Create popup content for promo circle
 * @private
 */
function createPromoPopupContent(poly) {
    const popupContent = document.createElement('div');
    popupContent.innerHTML = `
        <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #333; font-size: 13px; padding: 5px;">
            <div style="margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 5px;">
                <b>Polygon ID:</b> ${poly.uid || poly.id}
            </div>
            <div style="margin-bottom: 15px;">
                <div style="font-weight: bold; color: #0078d4; margin-bottom: 5px;">Local Sponsor:</div>
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                    <div style="width: 50px; height: 50px; background: #f0f0f0; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #888;">GIF</div>
                    <div>
                        Next Start: <b>20.01.2026 - 18:00</b><br>
                        Next End: <b>20.02.2026 - 18:00</b><br>
                        Price: <b>2 USD</b>
                    </div>
                </div>
            </div>
            <div style="margin-bottom: 15px;">
                <div style="font-weight: bold; color: #d13438; margin-bottom: 5px;">Global Sponsor:</div>
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                    <div style="width: 50px; height: 50px; background: #f0f0f0; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #888;">GIF</div>
                    <div>
                        Next Start: <b>16.01.2026 - 4:00</b><br>
                        Next End: <b>16.02.2026 - 4:00</b><br>
                        Price: <b>150 USD</b>
                    </div>
                </div>
            </div>
            <div>
                <div style="font-weight: bold; margin-bottom: 5px;">Local Sponsor History:</div>
                <table style="width:100%; border-collapse: collapse; font-size: 11px; text-align: left;">
                    <tr style="border-bottom: 1px solid #ccc; background: #f9f9f9;">
                        <th style="padding: 4px;">GIF</th>
                        <th style="padding: 4px;">Company</th>
                        <th style="padding: 4px;">Start</th>
                        <th style="padding: 4px;">End</th>
                        <th style="padding: 4px;">Price</th>
                    </tr>
                    <tr>
                        <td style="padding: 4px;">GIF</td>
                        <td style="padding: 4px;">Some Company</td>
                        <td style="padding: 4px;">20.01.2026<br>18:00</td>
                        <td style="padding: 4px;">20.01.2026<br>18:00</td>
                        <td style="padding: 4px;">1 USD</td>
                    </tr>
                </table>
            </div>
        </div>
    `;
    return popupContent;
}

/**
 * Setup line highlighting on popup open/close
 * @private
 */
function setupPopupLineHighlighting(pPromo, poly, lineLayerMap, map) {
    pPromo.on('popupopen', () => {
        if (poly.boundary_white_lines && lineLayerMap) {
            if (!pPromo._tempHighlightLines) pPromo._tempHighlightLines = [];

            poly.boundary_white_lines.forEach(lineId => {
                const composite = lineLayerMap.get(String(lineId));
                if (composite && composite.visual) {
                    const tempLine = L.polyline(composite.visual.getLatLngs(), {
                        color: '#ff0000',
                        weight: 4,
                        opacity: 1,
                        interactive: false,
                        pane: 'blueCirclesPane'
                    }).addTo(map);

                    const path = tempLine.getElement();
                    if (path) {
                        path.style.transition = "transform 0.15s ease-out";
                        requestAnimationFrame(() => {
                            path.style.transform = "translate(5px, -5px)";
                        });
                    }

                    pPromo._tempHighlightLines.push(tempLine);
                }
            });
        }
    });

    pPromo.on('popupclose', () => {
        if (pPromo._tempHighlightLines) {
            pPromo._tempHighlightLines.forEach(l => l.remove());
            pPromo._tempHighlightLines = [];
        }
    });
}
