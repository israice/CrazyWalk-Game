# Plan: Refactor renderGameElements (1684 lines)

## Current Structure Analysis

The `renderGameElements` function in `map-logic.js` contains these logical blocks:

| Lines | Section | Description |
|-------|---------|-------------|
| 495-540 | Initialization | Posters, layer clearing, validation |
| 541-690 | Data Preparation | UID mapping, blue circle merging, data enrichment |
| 694-760 | Helper Functions | `mapCircleToPolys`, `attachDebugClick`, debug setup |
| 760-1127 | Polygon Rendering | Create polygon layers, promo circles, labels, debug boxes |
| 1129-1140 | Poster Masks | Restore masks for completed polygons |
| 1142-1203 | White Lines | Create white line layers with hit detection |
| 1205-1335 | Blue Circles | Render blue circles with saturation logic |
| 1337-1521 | Neighbor Propagation | Update blue circle connections after expansion |
| 1523-1612 | Green Circles | Render green circles on white lines |
| 1614-1703 | Expand Mode Updates | Update saturation for all circles after expansion |
| 1705-1877 | Finalization | Snap logic, state application, layer setup |

---

## Proposed Module Structure

```
src/public/js/modules/rendering/
├── RenderInitializer.js      # Initialization & data preparation
├── PolygonRenderer.js        # Polygon, promo, label rendering
├── WhiteLineRenderer.js      # White line layers
├── BlueCircleRenderer.js     # Blue circle rendering & saturation
├── GreenCircleRenderer.js    # Green circle rendering
├── CirclePropagation.js      # Neighbor propagation logic (expand mode)
├── RenderFinalizer.js        # Snap logic, state application, finalization
└── index.js                  # Main orchestrator (replaces renderGameElements)
```

---

## Module Details

### 1. `RenderInitializer.js` (~150 lines)
**Exports:** `initializeRender(data, mode, dependencies)`

**Responsibilities:**
- Initialize posters via `posterRenderer.initPosterGrid()`
- Clear layers based on mode (initial vs expand)
- Validate data (check polygons exist)
- Initialize `window.allItems` Map
- Merge restored blue circles with backend data
- Create UID maps via `createUIDMaps()`
- Populate `window.allItems` with lines, circles, polygons

**Dependencies passed in:**
```javascript
{
  posterRenderer,
  groupsLayer,
  detailsLayer,
  expandedLayer,
  expandedItemUids,
  expandedCircleCoords,
  clearedCircleCoords,
  gameState
}
```

---

### 2. `PolygonRenderer.js` (~400 lines)
**Exports:** `renderPolygons(data, mode, dependencies)`

**Responsibilities:**
- Iterate `localPolys` and create:
  - Polygon layer (`L.polygon`)
  - Promo circle with popup (`L.marker` with gif)
  - Percentage label (`L.marker` with divIcon)
  - Debug bounding box
- Calculate `savedCount` from `gameState.collectedCircles`
- Setup `polygonState` Map entries
- Handle completed polygons (move to `completedPolygonsLayer`)
- Attach debug click handlers

**Returns:** Updated `polygonState` Map

---

### 3. `WhiteLineRenderer.js` (~80 lines)
**Exports:** `renderWhiteLines(localWhiteLines, dependencies)`

**Responsibilities:**
- Create visual line layer (dashed white)
- Create hit layer (thick transparent)
- Build composite proxy with `setStyle()`
- Populate `lineLayerMap`
- Attach debug click handlers

**Returns:** Updated `lineLayerMap`

---

### 4. `BlueCircleRenderer.js` (~200 lines)
**Exports:** `renderBlueCircles(localBlueCircles, localPolys, dependencies)`

**Responsibilities:**
- Create blue circle markers with saturation colors
- Handle existing circles in expand mode (merge data)
- Populate `circleLayerMap` and `blueCircleLayerMap`
- Bind tooltips with connection count
- Update `window.allItems` with circle data

**Returns:** Updated `circleLayerMap`, `blueCircleLayerMap`

---

### 5. `GreenCircleRenderer.js` (~100 lines)
**Exports:** `renderGreenCircles(localGreenCircles, localPolys, dependencies)`

**Responsibilities:**
- Create visual (small) and hit (large) circle layers
- Build composite proxy
- Populate `greenCirclesByLine` Map
- Handle existing circles in expand mode

**Returns:** Updated `greenCirclesByLine`

---

### 6. `CirclePropagation.js` (~200 lines)
**Exports:** `propagateCircleConnections(data, mode, dependencies)`

**Responsibilities:**
- Update blue circle `connected_polygon_ids` after expansion
- Recalculate `stats_connected_lines`, `stats_connected_polygons`
- Update saturation state and visual colors
- Final safety check: rebuild blue circle data from white lines

---

### 7. `RenderFinalizer.js` (~150 lines)
**Exports:** `finalizeRender(data, mode, dependencies)`

**Responsibilities:**
- Restore poster masks for completed polygons
- Initial snap to nearest active circle
- Apply collected state from `gameState.collectedCircles`
- Setup progress hiding via `setupProgressHiding()`
- Add layers to map
- Save state in expand mode
- Clear restoration flag

---

### 8. `index.js` (Orchestrator, ~80 lines)
**Exports:** `renderGameElements(data, mode, allDependencies)`

```javascript
import { initializeRender } from './RenderInitializer.js';
import { renderPolygons } from './PolygonRenderer.js';
import { renderWhiteLines } from './WhiteLineRenderer.js';
import { renderBlueCircles } from './BlueCircleRenderer.js';
import { renderGreenCircles } from './GreenCircleRenderer.js';
import { propagateCircleConnections } from './CirclePropagation.js';
import { finalizeRender } from './RenderFinalizer.js';

export async function renderGameElements(data, mode, deps) {
    console.log("DEBUG: Starting Render with Progress Tracking...");

    // 1. Initialize
    const { localBlueCircles, lineIdMap, polyIdMap } = initializeRender(data, mode, deps);

    // 2. Render Polygons
    renderPolygons(data.polygons, mode, deps);

    // 3. Render White Lines
    renderWhiteLines(data.white_lines, deps);

    // 4. Render Blue Circles
    renderBlueCircles(localBlueCircles, data.polygons, deps);

    // 5. Propagate connections (expand mode)
    propagateCircleConnections(data, mode, deps);

    // 6. Render Green Circles
    renderGreenCircles(data.green_circles, data.polygons, deps);

    // 7. Finalize
    await finalizeRender(data, mode, deps);
}
```

---

## Implementation Order

1. **Create `RenderInitializer.js`** - Extract lines 495-690
2. **Create `PolygonRenderer.js`** - Extract lines 760-1127
3. **Create `WhiteLineRenderer.js`** - Extract lines 1142-1203
4. **Create `BlueCircleRenderer.js`** - Extract lines 1205-1335
5. **Create `GreenCircleRenderer.js`** - Extract lines 1523-1612
6. **Create `CirclePropagation.js`** - Extract lines 1337-1521, 1614-1703
7. **Create `RenderFinalizer.js`** - Extract lines 1129-1140, 1705-1877
8. **Create `index.js`** - Orchestrator
9. **Update `map-logic.js`** - Import and use new `renderGameElements`

---

## Dependencies Object Structure

```javascript
const renderDependencies = {
    // Layers
    map,
    groupsLayer,
    detailsLayer,
    expandedLayer,
    completedPolygonsLayer,
    postersLayer,

    // State Maps (persist across renders)
    circleLayerMap,
    blueCircleLayerMap,
    lineLayerMap,
    greenCirclesByLine,
    polygonState,
    circleToPolyMap,
    visiblePolygonIds,

    // Tracking Sets
    expandedItemUids,
    expandedCircleCoords,
    clearedCircleCoords,

    // External Components
    posterRenderer,
    debugHandler,
    controls,
    userMarker,
    stateSaver,
    gameState,

    // Helper Functions
    updateAndSaveUserPosition,
    debouncedSavePosition,
    updatePolygonVisuals,
    mapCircleToPolys,
    attachDebugClick
};
```

---

## Benefits

1. **Testability** - Each module can be unit tested independently
2. **Readability** - Each file focuses on one responsibility
3. **Maintainability** - Changes to blue circles don't affect polygon rendering
4. **Reusability** - Renderers can be used in other contexts
5. **Debugging** - Easier to isolate issues to specific modules

---

## Estimated File Sizes After Refactor

| File | Lines |
|------|-------|
| RenderInitializer.js | ~150 |
| PolygonRenderer.js | ~400 |
| WhiteLineRenderer.js | ~80 |
| BlueCircleRenderer.js | ~200 |
| GreenCircleRenderer.js | ~100 |
| CirclePropagation.js | ~200 |
| RenderFinalizer.js | ~150 |
| index.js | ~80 |
| **Total** | **~1360** |

Note: Some reduction from removing duplicate code and comments.
