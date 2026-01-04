import logging
import concurrent.futures
import requests
from CORE.BACKEND.redis_tools import (
    save_to_redis, load_from_redis, 
    KEY_META, KEY_RED_LINES
)

logger = logging.getLogger(__name__)

def fetch_red_lines(lat, lon, region_size, reuse_existing, mode='initial'):
    """Step 1: Fetch from Overpass or Redis"""
    logger.info(f"OverpassProvider: Step 1 - Fetching Red Lines for {lat}, {lon} (mode={mode})")
    
    # Reuse Logic (Only if NOT expanding and reuse is requested)
    if mode == 'initial' and reuse_existing:
        meta = load_from_redis(KEY_META)
        if meta and abs(meta.get('lat', 0) - lat) < 0.0005 and abs(meta.get('lon', 0) - lon) < 0.0005:
            cached_lines = load_from_redis(KEY_RED_LINES)
            if cached_lines:
                 logger.info("OverpassProvider: Reusing red lines (Redis match).")
                 return [], cached_lines
        
    # Fetch New
    min_lat, max_lat = lat - region_size, lat + region_size
    min_lon, max_lon = lon - region_size, lon + region_size
    
    query = f"""
    [out:json][timeout:25];
    (
      way["highway"~"^(residential|primary|secondary|tertiary|unclassified|pedestrian|path|footway|living_street)$"]({min_lat},{min_lon},{max_lat},{max_lon});
    );
    out body;
    >;
    out skel qt;
    """
    
    headers = {'User-Agent': 'CrazyWalk-Game/1.0 (contact@crazywalk.org)'}
    servers = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
    ]
    
    data = None
    
    # Parallel Fetching: Race the servers!
    def fetch_from_server(url):
        try:
            # logger.info(f"Starting request to {url}...")
            resp = requests.post(url, data=query, headers=headers, timeout=15)
            resp.raise_for_status()
            return resp.json(), url
        except Exception as e:
            # logger.warning(f"Request to {url} failed: {e}")
            raise e

    logger.info(f"Racing {len(servers)} Overpass servers simultaneously...")
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(servers)) as executor:
        future_to_url = {executor.submit(fetch_from_server, url): url for url in servers}
        
        for future in concurrent.futures.as_completed(future_to_url):
            url = future_to_url[future]
            try:
                data, successful_url = future.result()
                logger.info(f"🏆 WINNER: {successful_url} returned data first!")
                
                # Cancel other futures (best effort)
                for f in future_to_url:
                    if f != future:
                        f.cancel()
                break # Stop waiting
            except Exception as e:
                logger.warning(f"❌ Server {url} failed or timed out: {e}")
    
    if not data:
        logger.error("OverpassProvider: All Overpass servers failed.")
        return [], []

    # Process
    nodes = {n['id']: (n['lat'], n['lon']) for n in data['elements'] if n['type'] == 'node'}
    new_red_visual = []
    new_red_segments = []
    
    for el in data['elements']:
        if el['type'] == 'way':
            way_nodes = el.get('nodes', [])
            coords = [nodes[nid] for nid in way_nodes if nid in nodes]
            
            if len(coords) > 1:
                # SIMPLIFIED: Store only path (list of coordinates)
                # No street names saved.
                
                new_red_visual.append(coords)
                
                for i in range(len(coords) - 1):
                    new_red_segments.append((coords[i], coords[i+1]))

    # MERGING LOGIC
    final_red_visual = new_red_visual
    if mode == 'expand':
        existing_lines = load_from_redis(KEY_RED_LINES) or []
        logger.info(f"Expansion: Merging {len(new_red_visual)} new lines with {len(existing_lines)} existing lines.")
        
        # Simple deduplication strategy: Convert paths to tuples of tuples
        
        # Normalize for set comparison: tuple of tuples
        seen_paths = set()
        
        def normalize_path(path):
            if isinstance(path, dict) and 'path' in path:
                    path = path['path']
            return tuple((p[0], p[1]) for p in path)

        combined_visual = []
        
        # Add existing
        for line in existing_lines:
            try:
                norm = normalize_path(line)
                if norm not in seen_paths:
                    seen_paths.add(norm)
                    combined_visual.append(line)
            except Exception:
                pass
        
        # Add new
        new_added_count = 0
        for line in new_red_visual:
            try:
                norm = normalize_path(line)
                if norm not in seen_paths:
                    seen_paths.add(norm)
                    combined_visual.append(line)
                    new_added_count += 1
            except Exception:
                pass
        
        logger.info(f"Expansion Result: {len(combined_visual)} total lines (added {new_added_count} unique new lines).")
        final_red_visual = combined_visual

    save_to_redis(KEY_META, {'lat': lat, 'lon': lon})
    save_to_redis(KEY_RED_LINES, final_red_visual)
    
    return new_red_segments, final_red_visual
