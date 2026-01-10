/**
 * DebugPopupBuilder.js
 * Creates debug popup with stats and copy functionality
 */

/**
 * Prepares data object for JSON display
 * Adds neighbor info for polygons if available
 */
export function prepareContentObject(data, type) {
    const contentObj = { ...data };

    // Ensure UID is visible
    if (data.uid) contentObj.uid = data.uid;

    // Add neighbor IDs for polygons
    if ((type === 'Polygon Label' || type === 'Polygon') && data.neighbor_polygon_ids?.length > 0) {
        contentObj.neighbor_polygon_ids = data.neighbor_polygon_ids;
        contentObj.stats_connected_lines = data.stats_connected_lines || 0;
        contentObj.stats_missing_lines = data.stats_missing_lines || 0;
    }

    return contentObj;
}

/**
 * Creates the popup HTML container with stats and copy button
 */
export function createPopupContent(type, data, statsHtml) {
    const contentObj = prepareContentObject(data, type);
    const prettyJSON = JSON.stringify(contentObj, null, 2);

    const idDisplay = contentObj.uid
        ? `<b>ID:</b> ${contentObj.uid}<br>`
        : (contentObj.id ? `<b>ID:</b> ${contentObj.id}<br>` : '');

    const container = document.createElement('div');
    container.innerHTML = `
        <div style="font-size: 11px; line-height: 1.2; color: #333;">
            ${idDisplay}
            <b>Type:</b> ${type}<br>
            ${statsHtml}
            <details>
                <summary style="cursor:pointer; color:#0066cc; margin:4px 0;">Show Raw Data</summary>
                <pre style="background:#f0f0f0; padding:4px; border-radius:4px; max-height:150px; overflow:auto; margin:4px 0;">${prettyJSON}</pre>
            </details>
            <button style="width:100%; cursor:pointer; padding:4px;">Copy Data</button>
        </div>
    `;

    // Attach copy handler
    const btn = container.querySelector('button');
    btn.onclick = () => {
        navigator.clipboard.writeText(prettyJSON).then(() => {
            btn.innerText = "Copied!";
            setTimeout(() => btn.innerText = "Copy Data", 2000);
        });
    };

    return container;
}

/**
 * Opens a debug popup on the map at the specified location
 */
export function openDebugPopup(map, latlng, type, data, statsHtml) {
    const container = createPopupContent(type, data, statsHtml);

    L.popup({ minWidth: 200 })
        .setLatLng(latlng)
        .setContent(container)
        .openOn(map);
}
