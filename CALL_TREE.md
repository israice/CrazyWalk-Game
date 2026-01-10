# Project Function Analysis

Generated on: 2026-01-10T07:01:24.222Z

## File Statistics
> [!NOTE]
> Files with 300+ lines or 10KB+ size may benefit from splitting into smaller modules.

**Total:** 95 files, 10,764 lines, 363.9 KB

### Breakdown by File Type

| Type | Files | Lines | Size |
|------|------:|------:|-----:|
| .js | 92 | 10,485 | 352.1 KB |
| .html | 3 | 279 | 11.7 KB |

---

## Import Graph
> [!TIP]
> Shows dependencies between files. Useful for understanding module coupling.

### server.js
- 📦 `express` → `express`
- 📦 `cors` → `cors`
- 📦 `path` → `path`
- 📦 `fs` → `fs`
- 📦 `uuid` → `v4`
- 📦 `./src/routes` → `apiRoutes`, `authRoutes`
- 📦 `./src/services/redis` → `getRedisClient`, `flushDatabase`

### config/constants.js
- 📦 `path` → `path`

### controllers/authController.js
- 📦 `fs` → `fs`
- 📦 `csv-parse/sync` → `parse`
- 📦 `../config/constants` → `PATHS`

### controllers/gameController.js
- 📦 `path` → `path`
- 📦 `fs` → `fs`
- 📦 `../config` → `config`
- 📦 `../config/constants` → `REDIS_KEYS`, `PATHS`
- 📦 `../services/redis.service` → `getRedisClient`, `loadFromRedis`
- 📦 `../services/map` → `generateMap`

### controllers/index.js
- 📦 `./sessionController` → `sessionController`
- 📦 `./locationController` → `locationController`
- 📦 `./gameController` → `gameController`
- 📦 `./authController` → `authController`

### controllers/locationController.js
- 📦 `axios` → `axios`
- 📦 `../config` → `config`
- 📦 `../config/constants` → `REDIS_KEYS`
- 📦 `../services/redis.service` → `getRedisClient`, `saveToRedis`, `loadFromRedis`
- 📦 `../services/nominatim.service` → `getCityFromCoords`, `getCityCenter`, `reverseGeocode`, `searchPlace`

### middleware/errorHandler.js
- 📦 `../config/constants` → `HTTP_STATUS`

### middleware/index.js
- 📦 `./asyncHandler` → `asyncHandler`
- 📦 `./errorHandler` → `AppError`, `NotFoundError`, `BadRequestError`, `ValidationError`, `errorHandler`, `notFoundHandler`
- 📦 `./requestLogger` → `requestLogger`

### js/map-logic.js
- 🔷 `./modules/utils/CoordinateUtils.js` → `getLocationKey`, `parseLocationKey`, `getCoordinateKey`, `parseCoordinateKey`
- 🔷 `./modules/utils/UIDGenerator.js` → `generateUID`, `createUIDMaps`
- 🔷 `./modules/utils/GeometryUtils.js` → `euclideanDistance`, `isWithinDistance`
- 🔷 `./modules/ui/ErrorDisplay.js` → `showError`
- 🔷 `./modules/ui/TopBarHandler.js` → `initTopBarEvents`
- 🔷 `./modules/ui/DebugMode.js` → `resetSelection`, `addToSelection`, `getSelectedLayers`, `clearSelection`
- 🔷 `./modules/ui/VersionBadge.js` → `loadVersionBadge`
- 🔷 `./components/TopBar.js` → `TopBar`
- 🔷 `./modules/state/GameState.js` → `gameState`, `resetGameState`, `getCurrentPosition`, `setCurrentPosition`, `isCircleCollected`, `collectCircle`, `isCircleExpanded`, `markCircleExpanded`
- 🔷 `./modules/rendering/PosterRenderer.js` → `PosterRenderer`
- 🔷 `./modules/rendering/index.js` → `renderGameElements`
- 🔷 `./modules/rendering/PolygonVisuals.js` → `createPolygonVisualsUpdater`
- 🔷 `./modules/api/StateLoader.js` → `loadGlobalState`, `loadLocationState`
- 🔷 `./modules/api/StateSaver.js` → `StateSaver`
- 🔷 `./modules/api/StateRestorer.js` → `renderFromSavedState`
- 🔷 `./modules/api/GameDataLoader.js` → `createGameDataLoader`
- 🔷 `./modules/events/MovementHandlers.js` → `setupMovementHandlers`
- 🔷 `./modules/events/DebugHandlers.js` → `setupDebugHandlers`
- 🔷 `./modules/events/MarkerDirectionHandler.js` → `setupMarkerDirectionHandler`
- 🔷 `./modules/events/DebugModeToggle.js` → `setupDebugModeToggle`
- 🔷 `./modules/debug/IntersectionDebug.js` → `lineIntersectsRect`, `updateDebugBoxIntersections`, `resetWhiteLineColors`
- 🔷 `./modules/logic/ProgressManager.js` → `setupProgressHiding`, `findNearestActiveCircle`
- 🔷 `./modules/ui/DebugInteractionHandler.js` → `DebugInteractionHandler`
- 🔷 `./modules/core/GameInitializer.js` → `createGameInitializer`

### api/GameDataLoader.js
- 🔷 `../utils/CoordinateUtils.js` → `getLocationKey`
- 🔷 `../ui/ErrorDisplay.js` → `showError`

### core/GameInitializer.js
- 🔷 `../api/StateLoader.js` → `loadGlobalState`
- 🔷 `../api/StateRestorer.js` → `renderFromSavedState`

### logic/ProgressManager.js
- 🔷 `../state/GameState.js` → `gameState`

### rendering/index.js
- 🔷 `./RenderInitializer.js` → `initializeRender`
- 🔷 `./PolygonRenderer.js` → `renderPolygons`
- 🔷 `./WhiteLineRenderer.js` → `renderWhiteLines`
- 🔷 `./BlueCircleRenderer.js` → `renderBlueCircles`
- 🔷 `./GreenCircleRenderer.js` → `renderGreenCircles`
- 🔷 `./CirclePropagation.js` → `propagateCircleConnections`, `updateEndpointPolygonIds`
- 🔷 `./RenderFinalizer.js` → `finalizeRender`

### rendering/PolygonRenderer.js
- 🔷 `./polygons/PolygonPromo.js` → `createPromoCircle`
- 🔷 `./polygons/PolygonLabel.js` → `createPercentageLabel`
- 🔷 `./polygons/PolygonCompletion.js` → `handleCompletedPolygon`, `restorePosterMasks`

### rendering/PosterRenderer.js
- 🔷 `./posters/PosterMaskController.js` → `PosterMaskController`
- 🔷 `./posters/PosterSVGRenderer.js` → `PosterSVGRenderer`
- 🔷 `./posters/PosterDebugController.js` → `PosterDebugController`

### rendering/RenderFinalizer.js
- 🔷 `../logic/ProgressManager.js` → `setupProgressHiding`, `findNearestActiveCircle`
- 🔷 `../debug/IntersectionDebug.js` → `updateDebugBoxIntersections`

### rendering/RenderInitializer.js
- 🔷 `../utils/UIDGenerator.js` → `createUIDMaps`
- 🔷 `../ui/ErrorDisplay.js` → `showError`
- 🔷 `./RenderDataEnricher.js` → `enrichBlueCircleCounts`, `enrichWhiteLineRelations`, `buildBlueCircleDataMap`, `ensureNeighborArrays`
- 🔷 `./RenderDataManager.js` → `mergeBlueCircles`, `initGlobalStorage`, `updateGlobalStorage`

### ui/DebugHighlighter.js
- 🔷 `./DebugMode.js` → `resetSelection`, `addToSelection`, `getSelectedLayers`

### ui/DebugInteractionHandler.js
- 🔷 `./DebugMode.js` → `resetSelection`
- 🔷 `./DebugHighlighter.js` → `highlightPolygon`, `highlightWhiteLine`, `highlightGeneric`, `highlightLabel`
- 🔷 `./DebugStatsBuilder.js` → `getElementStatus`, `getStatsHtml`
- 🔷 `./DebugPopupBuilder.js` → `openDebugPopup`

### routes/api.routes.js
- 📦 `express` → `express`
- 📦 `../middleware` → `asyncHandler`
- 📦 `../controllers` → `sessionController`, `locationController`, `gameController`

### routes/auth.routes.js
- 📦 `express` → `express`
- 📦 `../middleware` → `asyncHandler`
- 📦 `../controllers` → `authController`

### routes/index.js
- 📦 `./api.routes` → `apiRoutes`
- 📦 `./auth.routes` → `authRoutes`

### map/cacheManager.js
- 📦 `../../config` → `config`
- 📦 `../redis.service` → `saveToRedis`, `loadFromRedis`

### map/connectionCalculator.js
- 📦 `../../utils/geometry` → `roundCoord`

### map/graphBuilder.js
- 📦 `../../config` → `config`
- 📦 `../../config/constants` → `REDIS_KEYS`
- 📦 `../redis.service` → `saveToRedis`, `loadFromRedis`
- 📦 `../../utils/geometry` → `haversineDistance`, `coordKey`, `parseCoordKey`

### map/groupCreator.js
- 📦 `@turf/turf` → `turf`
- 📦 `../../config/constants` → `REDIS_KEYS`
- 📦 `../redis.service` → `saveToRedis`, `loadFromRedis`

### map/index.js
- 📦 `./cacheManager` → `checkCache`, `saveCache`
- 📦 `./regionProcessor` → `processRegion`

### map/intersectionFinder.js
- 📦 `../../config/constants` → `REDIS_KEYS`
- 📦 `../redis.service` → `saveToRedis`, `loadFromRedis`
- 📦 `../../utils/geometry` → `coordKey`, `parseCoordKey`

### map/mapHelpers.js
- 📦 `../../utils/geometry` → `roundCoord`

### map/modeFilter.js
- 📦 `../../utils/geometry` → `roundCoord`

### map/planarGraphBuilder.js
- 📦 `../../utils/geometry` → `coordKey`

### map/polygonFinder.js
- 📦 `@turf/turf` → `turf`
- 📦 `../../config/constants` → `REDIS_KEYS`
- 📦 `../redis.service` → `saveToRedis`, `loadFromRedis`
- 📦 `../../utils/geometry` → `calculatePolygonCentroid`, `calculateLabelPosition`, `parseCoordKey`
- 📦 `./planarGraphBuilder` → `buildPlanarGraph`
- 📦 `./promoAssigner` → `assignPromoGifs`

### map/posterGridCreator.js
- 📦 `path` → `path`
- 📦 `fs` → `fs`
- 📦 `../../config/constants` → `PATHS`
- 📦 `../redis.service` → `saveToRedis`, `loadFromRedis`
- 📦 `../../utils/geometry` → `generateUid`

### map/promoAssigner.js
- 📦 `fs` → `fs`
- 📦 `../../config/constants` → `PATHS`
- 📦 `../redis.service` → `saveToRedis`, `loadFromRedis`

### map/regionProcessor.js
- 📦 `./roadFetcher` → `fetchRedLines`
- 📦 `./intersectionFinder` → `identifyIntersections`
- 📦 `./graphBuilder` → `createGraphElements`
- 📦 `./polygonFinder` → `findPolygons`
- 📦 `./groupCreator` → `createGroups`
- 📦 `./connectionCalculator` → `calculateConnections`
- 📦 `./posterGridCreator` → `createPosterGrid`
- 📦 `./modeFilter` → `applyModeFiltering`
- 📦 `./mapHelpers` → `filterOrphanedElements`, `calculatePolygonPoints`

### map/roadFetcher.js
- 📦 `axios` → `axios`
- 📦 `../../config` → `config`
- 📦 `../../config/constants` → `REDIS_KEYS`
- 📦 `../redis.service` → `saveToRedis`, `loadFromRedis`

### services/nominatim.service.js
- 📦 `axios` → `axios`
- 📦 `../config` → `config`

### services/redis.js
- 📦 `ioredis` → `Redis`

### services/redis.service.js
- 📦 `ioredis` → `Redis`
- 📦 `../config` → `config`
- 📦 `../config/constants` → `REDIS_KEYS`

### utils/geometry.js
- 📦 `crypto` → `crypto`

### tools/analyze_calls.js
- 📦 `fs` → `fs`
- 📦 `path` → `path`
- 📦 `./parsers` → `analyzeJsContent`, `extractImports`, `PATTERNS`
- 📦 `./call-graph` → `buildCallGraph`, `buildImportGraph`, `findRootsAndUnused`
- 📦 `./report-generator` → `generateMarkdownReport`, `generateJsonReport`
- 📦 `./file-scanner` → `getFilesToAnalyze`
- 📦 `./cli-handler` → `parseArgs`, `showHelp`

### AUTOUPDATE_WEBHOOK_FROM_GITHUB/webhook.js
- 📦 `http` → `http`
- 📦 `crypto` → `crypto`
- 📦 `child_process` → `exec`

### tools/call-graph.js
- 📦 `path` → `path`

### tools/file-scanner.js
- 📦 `fs` → `fs`
- 📦 `path` → `path`

### tools/markdown-generator.js
- 📦 `path` → `path`

### tools/parsers.js
- 🔷 `module` → `a`, `b`
- 🔷 `module` → `name`

### tools/report-generator.js
- 📦 `./markdown-generator` → `generateMarkdownReport`, `printTreeBuffer`
- 📦 `./json-generator` → `generateJsonReport`

---

## Entry Points / Root Functions
root: register [src/controllers/authController.js] (19 lines) [C:3]
  calls: readUsers [src/controllers/authController.js] (18 lines) [C:2]
  calls: appendUser [src/controllers/authController.js] (4 lines) [C:1]
---
root: locate [src/controllers/locationController.js] (31 lines) [C:5]
  calls: getCityFromCoords [src/services/nominatim.service.js] (21 lines) [C:2]
    calls: reverseGeocode [src/services/nominatim.service.js] (12 lines) [C:2]
  calls: getCityCenter [src/services/nominatim.service.js] (14 lines) [C:3]
    calls: searchPlace [src/services/nominatim.service.js] (11 lines) [C:2]
---
root: constructor [src/middleware/errorHandler.js] (8 lines) [C:1]
  calls: init [src/public/js/components/map/map_controls.js] (47 lines) [C:3]
    calls: addVisibilityRule [src/public/js/components/map/map_controls.js] (5 lines) [C:1]
      calls: checkVisibility [src/public/js/components/map/map_controls.js] (27 lines) [C:8]
    calls: checkVisibility [src/public/js/components/map/map_controls.js] (27 lines) [C:8]
  calls: loadStyles [src/public/js/components/TopBar.js] (12 lines) [C:5]
---
root: login [src/controllers/authController.js] (23 lines) [C:3]
  calls: readUsers [src/controllers/authController.js] (18 lines) [C:2]
---
root: getGameState [src/controllers/gameController.js] (12 lines) [C:2]
  calls: loadFromRedis [src/services/redis.service.js] (12 lines) [C:3]
    calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
---
root: getGameData [src/controllers/gameController.js] (28 lines) [C:6]
  calls: generateMap [src/services/map/index.js] (44 lines) [C:8]
    calls: checkCache [src/services/map/cacheManager.js] (14 lines) [C:6]
      calls: getCacheKey [src/services/map/cacheManager.js] (5 lines) [C:1]
      calls: loadFromRedis [src/services/redis.service.js] (12 lines) [C:3]
        calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
    calls: processRegion [src/services/map/regionProcessor.js] (94 lines) [C:4]
      calls: fetchRedLines [src/services/map/roadFetcher.js] (31 lines) [C:4]
        calls: buildOverpassQuery [src/services/map/roadFetcher.js] (11 lines) [C:1]
        calls: raceOverpassServers [src/services/map/roadFetcher.js] (20 lines) [C:2]
        calls: parseOverpassResponse [src/services/map/roadFetcher.js] (31 lines) [C:8]
        calls: loadFromRedis [src/services/redis.service.js] (12 lines) [C:3]
          calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
        calls: mergeRoadLines [src/services/map/roadFetcher.js] (31 lines) [C:7]
          calls: normalizePath [src/services/map/roadFetcher.js] (4 lines) [C:1]
        calls: saveToRedis [src/services/redis.service.js] (17 lines) [C:3]
          calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
      calls: identifyIntersections [src/services/map/intersectionFinder.js] (20 lines) [C:2]
        calls: loadFromRedis [src/services/redis.service.js] (12 lines) [C:3]
          calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
        calls: buildAdjacencyFromRoads [src/services/map/intersectionFinder.js] (32 lines) [C:7]
          calls: coordKey [src/utils/geometry.js] (3 lines) [C:1]
        calls: findIntersectionNodes [src/services/map/intersectionFinder.js] (19 lines) [C:3]
          calls: parseCoordKey [src/utils/geometry.js] (3 lines) [C:1]
        calls: saveToRedis [src/services/redis.service.js] (17 lines) [C:3]
          calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
        calls: serializeAdjacency [src/services/map/intersectionFinder.js] (18 lines) [C:4]
          calls: parseCoordKey [src/utils/geometry.js] (3 lines) [C:1]
      calls: createGraphElements [src/services/map/graphBuilder.js] (61 lines) [C:6]
        calls: loadFromRedis [src/services/redis.service.js] (12 lines) [C:3]
          calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
        calls: getRelevantNodes [src/services/map/graphBuilder.js] (11 lines) [C:3]
          calls: coordKey [src/utils/geometry.js] (3 lines) [C:1]
        calls: rebuildAdjacencyMap [src/services/map/graphBuilder.js] (17 lines) [C:5]
          calls: coordKey [src/utils/geometry.js] (3 lines) [C:1]
        calls: parseCoordKey [src/utils/geometry.js] (3 lines) [C:1]
        calls: tracePath [src/services/map/graphBuilder.js] (37 lines) [C:5]
          calls: parseCoordKey [src/utils/geometry.js] (3 lines) [C:1]
          calls: haversineDistance [src/utils/geometry.js] (14 lines) [C:1]
        calls: createGreenCirclesForPath [src/services/map/graphBuilder.js] (42 lines) [C:5]
          calls: haversineDistance [src/utils/geometry.js] (14 lines) [C:1]
        calls: saveToRedis [src/services/redis.service.js] (17 lines) [C:3]
          calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
      calls: findPolygons [src/services/map/polygonFinder.js] (55 lines) [C:10]
        calls: loadFromRedis [src/services/redis.service.js] (12 lines) [C:3]
          calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
        calls: buildPlanarGraph [src/services/map/planarGraphBuilder.js] (39 lines) [C:5]
          calls: coordKey [src/utils/geometry.js] (3 lines) [C:1]
        calls: findMinimalCycles [src/services/map/polygonFinder.js] (63 lines) [C:13]
        calls: cycleToPolygonCoords [src/services/map/polygonFinder.js] (40 lines) [C:6]
          calls: parseCoordKey [src/utils/geometry.js] (3 lines) [C:1]
        calls: validatePolygonArea [src/services/map/polygonFinder.js] (22 lines) [C:6]
        calls: createPolygonData [src/services/map/polygonFinder.js] (24 lines) [C:1]
          calls: calculatePolygonCentroid [src/utils/geometry.js] (44 lines) [C:6]
          calls: calculateLabelPosition [src/utils/geometry.js] (66 lines) [C:11]
            calls: lineSegmentIntersection [src/utils/geometry.js] (21 lines) [C:3]
        calls: assignPromoGifs [src/services/map/promoAssigner.js] (20 lines) [C:5]
          calls: loadFromRedis [src/services/redis.service.js] (12 lines) [C:3]
            calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
          calls: saveToRedis [src/services/redis.service.js] (17 lines) [C:3]
            calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
        calls: saveToRedis [src/services/redis.service.js] (17 lines) [C:3]
          calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
      calls: filterOrphanedElements [src/services/map/mapHelpers.js] (13 lines) [C:1]
      calls: calculatePolygonPoints [src/services/map/mapHelpers.js] (38 lines) [C:8]
        calls: roundCoord [src/utils/geometry.js] (3 lines) [C:1]
      calls: createGroups [src/services/map/groupCreator.js] (51 lines) [C:7]
        calls: loadFromRedis [src/services/redis.service.js] (12 lines) [C:3]
          calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
        calls: saveToRedis [src/services/redis.service.js] (17 lines) [C:3]
          calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
        calls: polygonToTurf [src/services/map/groupCreator.js] (10 lines) [C:3]
        calls: dissolvePolygons [src/services/map/groupCreator.js] (18 lines) [C:5]
        calls: findContainedPolygons [src/services/map/groupCreator.js] (13 lines) [C:4]
      calls: calculateConnections [src/services/map/connectionCalculator.js] (24 lines) [C:1]
        calls: buildNodeData [src/services/map/connectionCalculator.js] (16 lines) [C:4]
        calls: filterBlueCircles [src/services/map/connectionCalculator.js] (11 lines) [C:1]
        calls: mapLinesToPolygons [src/services/map/connectionCalculator.js] (15 lines) [C:5]
        calls: enrichWhiteLines [src/services/map/connectionCalculator.js] (7 lines) [C:2]
        calls: enrichGreenCircles [src/services/map/connectionCalculator.js] (7 lines) [C:2]
        calls: enrichBlueCircles [src/services/map/connectionCalculator.js] (41 lines) [C:10]
          calls: roundCoord [src/utils/geometry.js] (3 lines) [C:1]
        calls: findPolygonNeighbors [src/services/map/connectionCalculator.js] (19 lines) [C:7]
      calls: createPosterGrid [src/services/map/posterGridCreator.js] (95 lines) [C:14]
        calls: loadFromRedis [src/services/redis.service.js] (12 lines) [C:3]
          calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
        calls: saveToRedis [src/services/redis.service.js] (17 lines) [C:3]
          calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
        calls: generateUid [src/utils/geometry.js] (3 lines) [C:1]
      calls: applyModeFiltering [src/services/map/modeFilter.js] (87 lines) [C:15]
        calls: roundCoord [src/utils/geometry.js] (3 lines) [C:1]
    calls: saveCache [src/services/map/cacheManager.js] (7 lines) [C:2]
      calls: getCacheKey [src/services/map/cacheManager.js] (5 lines) [C:1]
      calls: saveToRedis [src/services/redis.service.js] (17 lines) [C:3]
        calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
---
root: reverseProxy [src/controllers/locationController.js] (10 lines) [C:2]
  calls: reverseGeocode [src/services/nominatim.service.js] (12 lines) [C:2]
---
root: searchProxy [src/controllers/locationController.js] (10 lines) [C:2]
  calls: searchPlace [src/services/nominatim.service.js] (11 lines) [C:2]
---
root: getLocationState [src/controllers/locationController.js] (34 lines) [C:5]
  calls: loadFromRedis [src/services/redis.service.js] (12 lines) [C:3]
    calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
---
root: saveLocationState [src/controllers/locationController.js] (49 lines) [C:5]
  calls: getRedisClient [src/services/redis.service.js] (23 lines) [C:3]
---
root: loadIPLocation [src/public/js/components/home/home.js] (28 lines) [C:3]
  calls: revealContent [src/public/js/components/home/home.js] (7 lines) [C:1]
---
root: isWithinDistance [src/public/js/modules/utils/GeometryUtils.js] (3 lines) [C:1]
  calls: euclideanDistance [src/public/js/modules/utils/GeometryUtils.js] (5 lines) [C:1]
---
root: handleRegister [src/public/js/pages/login.js] (39 lines) [C:10]
  calls: switchTab [src/public/js/pages/login.js] (23 lines) [C:9]
---
root: getPromos [src/controllers/gameController.js] (12 lines) [C:2]
---
root: getIpLocation [src/controllers/locationController.js] (46 lines) [C:4]
---
root: getSession [src/controllers/sessionController.js] (7 lines) [C:1]
---
root: errorHandler [src/middleware/errorHandler.js] (35 lines) [C:6]
---
root: notFoundHandler [src/middleware/errorHandler.js] (3 lines) [C:1]
---
root: requestLogger [src/middleware/requestLogger.js] (10 lines) [C:2]
---
root: resetGameState [src/public/js/modules/state/GameState.js] (18 lines) [C:1]
---
root: isCircleCollected [src/public/js/modules/state/GameState.js] (3 lines) [C:1]
---
root: collectCircle [src/public/js/modules/state/GameState.js] (3 lines) [C:1]
---
root: isCircleExpanded [src/public/js/modules/state/GameState.js] (3 lines) [C:1]
---
root: markCircleExpanded [src/public/js/modules/state/GameState.js] (3 lines) [C:1]
---
root: clearSelection [src/public/js/modules/ui/DebugMode.js] (4 lines) [C:1]
---
root: closeMenu [src/public/js/modules/ui/TopBarHandler.js] (5 lines) [C:2]
---
root: parseLocationKey [src/public/js/modules/utils/CoordinateUtils.js] (4 lines) [C:1]
---
root: getCoordinateKey [src/public/js/modules/utils/CoordinateUtils.js] (3 lines) [C:1]
---
root: parseCoordinateKey [src/public/js/modules/utils/CoordinateUtils.js] (4 lines) [C:1]
---
root: handleLogin [src/public/js/pages/login.js] (38 lines) [C:7]
---
root: retryStrategy [src/services/redis.js] (5 lines) [C:2]
---
root: def [tools/markdown-generator.js] (2 lines) [C:1]
---

## Potentially Unused Functions
> [!WARNING]
> These functions are defined but not called within the analyzed files. Verify if they are used dynamically or in external systems before deleting.

- `shutdown` (7 lines) [C:2] ([server.js](file://c:\0_PROJECTS\CrazyWalk-Game\server.js))
- `runUpdate` (38 lines) [C:11] ([webhook.js](file://c:\0_PROJECTS\CrazyWalk-Game\tools\AUTOUPDATE_WEBHOOK_FROM_GITHUB\webhook.js))
- `requestHandler` (29 lines) [C:3] ([webhook.js](file://c:\0_PROJECTS\CrazyWalk-Game\tools\AUTOUPDATE_WEBHOOK_FROM_GITHUB\webhook.js))

## Large Functions (50+ lines)
> [!NOTE]
> Functions with high line counts may benefit from refactoring into smaller pieces.

| Lines | Complexity | Function | File |
|------:|-----------:|----------|------|
| 157 | 24 | `generateMarkdownReport` | tools/markdown-generator.js |
| 101 | 7 | `finalizeRender` | rendering/RenderFinalizer.js |
| 100 | 12 | `renderPolygons` | rendering/PolygonRenderer.js |
| 98 | 14 | `main` | tools/analyze_calls.js |
| 95 | 12 | `renderGreenCircles` | rendering/GreenCircleRenderer.js |
| 95 | 14 | `createPosterGrid` | map/posterGridCreator.js |
| 94 | 4 | `processRegion` | map/regionProcessor.js |
| 91 | 11 | `renderBlueCircles` | rendering/BlueCircleRenderer.js |
| 91 | 18 | `createPolygonVisualsUpdater` | rendering/PolygonVisuals.js |
| 87 | 15 | `applyModeFiltering` | map/modeFilter.js |
| 84 | 4 | `renderGameElements` | rendering/index.js |
| 76 | 6 | `createGameInitializer` | core/GameInitializer.js |
| 76 | 12 | `updateDebugBoxIntersections` | debug/IntersectionDebug.js |
| 75 | 17 | `updatePolygonVisuals` | rendering/PolygonVisuals.js |
| 72 | 8 | `buildPolygonStats` | ui/DebugStatsBuilder.js |
| 71 | 19 | `moveSelection` | map/KeyboardNavigation.js |
| 71 | 9 | `renderWhiteLines` | rendering/WhiteLineRenderer.js |
| 68 | 16 | `applyCollectedState` | rendering/RenderFinalizer.js |
| 67 | 11 | `initPosterGrid` | rendering/PosterRenderer.js |
| 67 | 5 | `initializeRender` | rendering/RenderInitializer.js |
| 67 | 6 | `generateJsonReport` | tools/json-generator.js |
| 66 | 7 | `createPercentageLabel` | polygons/PolygonLabel.js |
| 66 | 11 | `calculateLabelPosition` | utils/geometry.js |
| 65 | 10 | `createGameDataLoader` | api/GameDataLoader.js |
| 63 | 13 | `findMinimalCycles` | map/polygonFinder.js |
| 61 | 6 | `createGraphElements` | map/graphBuilder.js |
| 57 | 18 | `propagateCircleConnections` | rendering/CirclePropagation.js |
| 55 | 5 | `initializeGame` | core/GameInitializer.js |
| 55 | 10 | `findPolygons` | map/polygonFinder.js |
| 52 | 2 | `createPromoPopupContent` | polygons/PolygonPromo.js |
| 51 | 7 | `createGroups` | map/groupCreator.js |

## High Complexity Functions (10+)
> [!CAUTION]
> Functions with cyclomatic complexity ≥10 are harder to test and maintain.

| Complexity | Lines | Function | File |
|-----------:|------:|----------|------|
| 24 | 157 | `generateMarkdownReport` | tools/markdown-generator.js |
| 19 | 71 | `moveSelection` | map/KeyboardNavigation.js |
| 18 | 27 | `getDirection` | map/KeyboardNavigation.js |
| 18 | 57 | `propagateCircleConnections` | rendering/CirclePropagation.js |
| 18 | 91 | `createPolygonVisualsUpdater` | rendering/PolygonVisuals.js |
| 17 | 75 | `updatePolygonVisuals` | rendering/PolygonVisuals.js |
| 16 | 49 | `bind` | map/KeyboardNavigation.js |
| 16 | 68 | `applyCollectedState` | rendering/RenderFinalizer.js |
| 15 | 39 | `updateAllCircleSaturation` | rendering/CirclePropagation.js |
| 15 | 40 | `getElementStatus` | ui/DebugStatsBuilder.js |
| 15 | 87 | `applyModeFiltering` | map/modeFilter.js |
| 14 | 95 | `createPosterGrid` | map/posterGridCreator.js |
| 14 | 98 | `main` | tools/analyze_calls.js |
| 13 | 24 | `showError` | ui/ErrorDisplay.js |
| 13 | 39 | `updateEndpointPolygonIds` | rendering/CirclePropagation.js |
| 13 | 47 | `highlightPolygon` | ui/DebugHighlighter.js |
| 13 | 63 | `findMinimalCycles` | map/polygonFinder.js |
| 12 | 76 | `updateDebugBoxIntersections` | debug/IntersectionDebug.js |
| 12 | 95 | `renderGreenCircles` | rendering/GreenCircleRenderer.js |
| 12 | 100 | `renderPolygons` | rendering/PolygonRenderer.js |
| 11 | 42 | `restoreState` | api/GameDataLoader.js |
| 11 | 91 | `renderBlueCircles` | rendering/BlueCircleRenderer.js |
| 11 | 67 | `initPosterGrid` | rendering/PosterRenderer.js |
| 11 | 37 | `highlightWhiteLine` | ui/DebugHighlighter.js |
| 11 | 66 | `calculateLabelPosition` | utils/geometry.js |
| 11 | 38 | `runUpdate` | AUTOUPDATE_WEBHOOK_FROM_GITHUB/webhook.js |
| 10 | 65 | `createGameDataLoader` | api/GameDataLoader.js |
| 10 | 28 | `updateGlobalStorage` | rendering/RenderDataManager.js |
| 10 | 39 | `handleRegister` | pages/login.js |
| 10 | 41 | `enrichBlueCircles` | map/connectionCalculator.js |
| 10 | 55 | `findPolygons` | map/polygonFinder.js |
| 10 | 26 | `parseArgs` | tools/cli-handler.js |
