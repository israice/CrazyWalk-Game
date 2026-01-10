# Project Function Analysis

Generated on: 2026-01-10T03:37:29.596Z

## File Statistics
> [!INFO]
> Files with 300+ lines or 10KB+ size may benefit from splitting into smaller modules.

**Total:** 33 files, 5,045 lines, 159.3 KB

### Large Files (300+ lines or 10KB+)

| Lines | Size | File |
|------:|-----:|------|
| 621 | 23.3 KB | `CORE/FRONTEND/B_map_page/components/map_controls.js` |
| 551 | 19.0 KB | `src/services/map/index.js` |
| 412 | 14.0 KB | `CORE/FRONTEND/A_home_page/login.html` |
| 329 | 9.5 KB | `src/services/map/polygonFinder.js` |
| 321 | 11.7 KB | `src/public/js/map-logic.js` |
| 273 | 10.5 KB | `CORE/FRONTEND/B_map_page/components/top_bar.html` |

### Breakdown by File Type

| Type | Files | Lines | Size |
|------|------:|------:|-----:|
| .js | 28 | 4,148 | 126.1 KB |
| .html | 5 | 897 | 33.2 KB |

---

## Entry Points / Root Functions
root: register [src/controllers/authController.js] (19 lines)
  calls: readUsers [src/controllers/authController.js] (18 lines)
  calls: appendUser [src/controllers/authController.js] (4 lines)
---
root: locate [src/controllers/locationController.js] (31 lines)
  calls: getCityFromCoords [src/services/nominatim.service.js] (21 lines)
    calls: reverseGeocode [src/services/nominatim.service.js] (12 lines)
  calls: getCityCenter [src/services/nominatim.service.js] (14 lines)
    calls: searchPlace [src/services/nominatim.service.js] (11 lines)
---
root: handleRegister [CORE/FRONTEND/A_home_page/login.html] (39 lines)
  calls: switchTab [CORE/FRONTEND/A_home_page/login.html] (23 lines)
---
root: constructor [src/public/js/game-api.js] (4 lines)
  calls: init [CORE/FRONTEND/B_map_page/components/map_controls.js] (58 lines)
    calls: addVisibilityRule [CORE/FRONTEND/B_map_page/components/map_controls.js] (5 lines)
      calls: checkVisibility [CORE/FRONTEND/B_map_page/components/map_controls.js] (32 lines)
    calls: checkVisibility [CORE/FRONTEND/B_map_page/components/map_controls.js] (32 lines)
---
root: login [src/controllers/authController.js] (23 lines)
  calls: readUsers [src/controllers/authController.js] (18 lines)
---
root: getGameState [src/controllers/gameController.js] (12 lines)
  calls: loadFromRedis [src/services/redis.service.js] (12 lines)
    calls: getRedisClient [src/services/redis.service.js] (23 lines)
---
root: getGameData [src/controllers/gameController.js] (28 lines)
  calls: generateMap [src/services/map/index.js] (125 lines)
    calls: loadFromRedis [src/services/redis.service.js] (12 lines)
      calls: getRedisClient [src/services/redis.service.js] (23 lines)
    calls: fetchRedLines [src/services/map/roadFetcher.js] (31 lines)
      calls: buildOverpassQuery [src/services/map/roadFetcher.js] (11 lines)
      calls: raceOverpassServers [src/services/map/roadFetcher.js] (20 lines)
      calls: parseOverpassResponse [src/services/map/roadFetcher.js] (31 lines)
      calls: loadFromRedis [src/services/redis.service.js] (12 lines)
        calls: getRedisClient [src/services/redis.service.js] (23 lines)
      calls: mergeRoadLines [src/services/map/roadFetcher.js] (31 lines)
        calls: normalizePath [src/services/map/roadFetcher.js] (4 lines)
      calls: saveToRedis [src/services/redis.service.js] (17 lines)
        calls: getRedisClient [src/services/redis.service.js] (23 lines)
    calls: identifyIntersections [src/services/map/intersectionFinder.js] (20 lines)
      calls: loadFromRedis [src/services/redis.service.js] (12 lines)
        calls: getRedisClient [src/services/redis.service.js] (23 lines)
      calls: buildAdjacencyFromRoads [src/services/map/intersectionFinder.js] (32 lines)
        calls: coordKey [src/utils/geometry.js] (3 lines)
      calls: findIntersectionNodes [src/services/map/intersectionFinder.js] (19 lines)
        calls: parseCoordKey [src/utils/geometry.js] (3 lines)
      calls: saveToRedis [src/services/redis.service.js] (17 lines)
        calls: getRedisClient [src/services/redis.service.js] (23 lines)
      calls: serializeAdjacency [src/services/map/intersectionFinder.js] (18 lines)
        calls: parseCoordKey [src/utils/geometry.js] (3 lines)
    calls: createGraphElements [src/services/map/graphBuilder.js] (61 lines)
      calls: loadFromRedis [src/services/redis.service.js] (12 lines)
        calls: getRedisClient [src/services/redis.service.js] (23 lines)
      calls: getRelevantNodes [src/services/map/graphBuilder.js] (11 lines)
        calls: coordKey [src/utils/geometry.js] (3 lines)
      calls: rebuildAdjacencyMap [src/services/map/graphBuilder.js] (17 lines)
        calls: coordKey [src/utils/geometry.js] (3 lines)
      calls: parseCoordKey [src/utils/geometry.js] (3 lines)
      calls: tracePath [src/services/map/graphBuilder.js] (37 lines)
        calls: parseCoordKey [src/utils/geometry.js] (3 lines)
        calls: haversineDistance [src/utils/geometry.js] (14 lines)
      calls: createGreenCirclesForPath [src/services/map/graphBuilder.js] (42 lines)
        calls: haversineDistance [src/utils/geometry.js] (14 lines)
      calls: saveToRedis [src/services/redis.service.js] (17 lines)
        calls: getRedisClient [src/services/redis.service.js] (23 lines)
    calls: findPolygons [src/services/map/polygonFinder.js] (55 lines)
      calls: loadFromRedis [src/services/redis.service.js] (12 lines)
        calls: getRedisClient [src/services/redis.service.js] (23 lines)
      calls: buildPlanarGraph [src/services/map/polygonFinder.js] (39 lines)
        calls: coordKey [src/utils/geometry.js] (3 lines)
      calls: findMinimalCycles [src/services/map/polygonFinder.js] (63 lines)
      calls: cycleToPolygonCoords [src/services/map/polygonFinder.js] (40 lines)
        calls: parseCoordKey [src/utils/geometry.js] (3 lines)
      calls: validatePolygonArea [src/services/map/polygonFinder.js] (22 lines)
      calls: createPolygonData [src/services/map/polygonFinder.js] (24 lines)
        calls: calculatePolygonCentroid [src/utils/geometry.js] (44 lines)
        calls: calculateLabelPosition [src/utils/geometry.js] (66 lines)
          calls: lineSegmentIntersection [src/utils/geometry.js] (21 lines)
      calls: assignPromoGifs [src/services/map/polygonFinder.js] (20 lines)
        calls: loadFromRedis [src/services/redis.service.js] (12 lines)
          calls: getRedisClient [src/services/redis.service.js] (23 lines)
        calls: saveToRedis [src/services/redis.service.js] (17 lines)
          calls: getRedisClient [src/services/redis.service.js] (23 lines)
      calls: saveToRedis [src/services/redis.service.js] (17 lines)
        calls: getRedisClient [src/services/redis.service.js] (23 lines)
    calls: filterOrphanedElements [src/services/map/index.js] (13 lines)
    calls: calculatePolygonPoints [src/services/map/index.js] (38 lines)
      calls: roundCoord [src/utils/geometry.js] (3 lines)
    calls: createGroups [src/services/map/groupCreator.js] (51 lines)
      calls: loadFromRedis [src/services/redis.service.js] (12 lines)
        calls: getRedisClient [src/services/redis.service.js] (23 lines)
      calls: saveToRedis [src/services/redis.service.js] (17 lines)
        calls: getRedisClient [src/services/redis.service.js] (23 lines)
      calls: polygonToTurf [src/services/map/groupCreator.js] (10 lines)
      calls: dissolvePolygons [src/services/map/groupCreator.js] (18 lines)
      calls: findContainedPolygons [src/services/map/groupCreator.js] (13 lines)
    calls: calculateConnections [src/services/map/index.js] (112 lines)
      calls: roundCoord [src/utils/geometry.js] (3 lines)
    calls: createPosterGrid [src/services/map/index.js] (95 lines)
      calls: loadFromRedis [src/services/redis.service.js] (12 lines)
        calls: getRedisClient [src/services/redis.service.js] (23 lines)
      calls: saveToRedis [src/services/redis.service.js] (17 lines)
        calls: getRedisClient [src/services/redis.service.js] (23 lines)
      calls: generateUid [src/utils/geometry.js] (3 lines)
    calls: applyModeFiltering [src/services/map/index.js] (87 lines)
      calls: roundCoord [src/utils/geometry.js] (3 lines)
    calls: saveToRedis [src/services/redis.service.js] (17 lines)
      calls: getRedisClient [src/services/redis.service.js] (23 lines)
---
root: reverseProxy [src/controllers/locationController.js] (10 lines)
  calls: reverseGeocode [src/services/nominatim.service.js] (12 lines)
---
root: searchProxy [src/controllers/locationController.js] (10 lines)
  calls: searchPlace [src/services/nominatim.service.js] (11 lines)
---
root: getLocationState [src/controllers/locationController.js] (34 lines)
  calls: loadFromRedis [src/services/redis.service.js] (12 lines)
    calls: getRedisClient [src/services/redis.service.js] (23 lines)
---
root: saveLocationState [src/controllers/locationController.js] (49 lines)
  calls: getRedisClient [src/services/redis.service.js] (23 lines)
---
root: handleLogin [CORE/FRONTEND/A_home_page/login.html] (40 lines)
---
root: getPromos [src/controllers/gameController.js] (12 lines)
---
root: getIpLocation [src/controllers/locationController.js] (46 lines)
---
root: getSession [src/controllers/sessionController.js] (7 lines)
---
root: errorHandler [src/middleware/errorHandler.js] (35 lines)
---
root: notFoundHandler [src/middleware/errorHandler.js] (3 lines)
---
root: requestLogger [src/middleware/requestLogger.js] (10 lines)
---
root: retryStrategy [src/services/redis.service.js] (5 lines)
---

## Potentially Unused Functions
> [!WARNING]
> These functions are defined but not called within the analyzed files. Verify if they are used dynamically or in external systems before deleting.

- `setSnapLines` (6 lines) ([map_controls.js](file://c:\0_PROJECTS\CrazyWalk-Game\CORE\FRONTEND\B_map_page\components\map_controls.js))
- `updateGraph` (186 lines) ([map_controls.js](file://c:\0_PROJECTS\CrazyWalk-Game\CORE\FRONTEND\B_map_page\components\map_controls.js))
- `shutdown` (7 lines) ([server.js](file://c:\0_PROJECTS\CrazyWalk-Game\server.js))
- `loadVersionBadge` (18 lines) ([map-logic.js](file://c:\0_PROJECTS\CrazyWalk-Game\src\public\js\map-logic.js))
- `revealMap` (9 lines) ([map-logic.js](file://c:\0_PROJECTS\CrazyWalk-Game\src\public\js\map-logic.js))
- `renderGameElements` (31 lines) ([map-logic.js](file://c:\0_PROJECTS\CrazyWalk-Game\src\public\js\map-logic.js))

## Large Functions (50+ lines)
> [!NOTE]
> Functions with 50+ lines may benefit from refactoring into smaller pieces.

| Lines | Function | File |
|------:|----------|------|
| 186 | `updateGraph` | components/map_controls.js |
| 125 | `generateMap` | map/index.js |
| 118 | `moveSelection` | components/map_controls.js |
| 112 | `calculateConnections` | map/index.js |
| 95 | `createPosterGrid` | map/index.js |
| 94 | `bindKeys` | components/map_controls.js |
| 87 | `applyModeFiltering` | map/index.js |
| 66 | `calculateLabelPosition` | utils/geometry.js |
| 63 | `findMinimalCycles` | map/polygonFinder.js |
| 61 | `createGraphElements` | map/graphBuilder.js |
| 58 | `init` | components/map_controls.js |
| 55 | `findPolygons` | map/polygonFinder.js |
| 52 | `getSnappedPosition` | components/map_controls.js |
| 51 | `createGroups` | map/groupCreator.js |
