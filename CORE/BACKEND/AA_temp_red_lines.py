import requests
import json
import logging
import csv
import os
from .redis_tools import save_to_redis, load_from_redis, KEY_RED_LINES, KEY_META

logger = logging.getLogger(__name__)

def create_red_lines(lat, lon, region_size=0.005, reuse_existing=False):
    """
    Fetches roads from Overpass API and returns them as 'Red Lines'.
    region_size: rough degrees for bounding box (0.005 ~ 500m)
    """
    logger.info(f"AA: Fetching Red Lines for {lat}, {lon}")
    
    # META: Check for existing data
    meta_path = os.path.join(os.path.dirname(__file__), 'generation_meta.json')
    csv_path = os.path.join(os.path.dirname(__file__), 'AA_temp_red_lines.csv')
    
    # Try Redis first if reuse requested
    if reuse_existing:
        meta = load_from_redis(KEY_META)
        if meta:
            last_lat = meta.get('lat', 0)
            last_lon = meta.get('lon', 0)
            if abs(last_lat - lat) < 0.0005 and abs(last_lon - lon) < 0.0005:
                cached_lines = load_from_redis(KEY_RED_LINES)
                if cached_lines:
                    logger.info("AA: Reusing existing red lines data from Redis.")
                    return [], cached_lines

    # Fallback to CSV check (legacy support)
    if reuse_existing and os.path.exists(meta_path) and os.path.exists(csv_path):
        try:
            with open(meta_path, 'r') as f:
                meta = json.load(f)
                
            last_lat = meta.get('lat', 0)
            last_lon = meta.get('lon', 0)
            
            if abs(last_lat - lat) < 0.0005 and abs(last_lon - lon) < 0.0005:
                logger.info("AA: Reusing existing red lines data (CSV match).")
                visual_lines = []
                with open(csv_path, 'r', newline='') as f:
                    reader = csv.reader(f)
                    header = next(reader, None) # Skip header
                    for row in reader:
                        if row:
                            visual_lines.append(json.loads(row[0]))
                
                # Sync back to Redis for next time
                save_to_redis(KEY_META, {'lat': lat, 'lon': lon})
                save_to_redis(KEY_RED_LINES, visual_lines)
                
                return [], visual_lines
                
        except Exception as e:
            logger.warning(f"AA: Failed to read metadata for reuse: {e}. Proceeding to fetch.")
            
    # Define bounding box
    min_lat = lat - region_size
    max_lat = lat + region_size
    min_lon = lon - region_size
    max_lon = lon + region_size
    
    # Overpass Query
    query = f"""
    [out:json][timeout:25];
    (
      way["highway"~"^(residential|primary|secondary|tertiary|unclassified|pedestrian|path|footway|living_street)$"]({min_lat},{min_lon},{max_lat},{max_lon});
    );
    out body;
    >;
    out skel qt;
    """
    
    headers = {
        'User-Agent': 'CrazyWalk-Game/1.0 (contact@crazywalk.org)'
    }

    # List of Overpass servers to try
    overpass_servers = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
    ]
    
    import time
    
    response = None
    data = None
    
    for attempt in range(len(overpass_servers) * 2): # Try servers twice
        server_url = overpass_servers[attempt % len(overpass_servers)]
        try:
            logger.info(f"AA: Requesting roads from {server_url} (Attempt {attempt+1})")
            response = requests.post(server_url, data=query, headers=headers, timeout=30)
            response.raise_for_status()
            data = response.json()
            logger.info("AA: Overpass request successful.")
            break
        except Exception as e:
            logger.warning(f"AA: Failed to fetch from {server_url}: {e}")
            time.sleep(1) # Brief pause before retry
            
    if not data:
        logger.error("AA: All Overpass servers failed. Returning empty.")
        return [], []
        
    try:
        # Process Nodes
        nodes = {node['id']: (node['lat'], node['lon']) for node in data['elements'] if node['type'] == 'node'}
        
        red_lines_segments = [] # For Graph Logic: pairs of points
        red_lines_visual = []   # For Display: lists of points
        
        # Process Ways
        for element in data['elements']:
            if element['type'] == 'way':
                way_nodes = element.get('nodes', [])
                
                # Construct visual polyline
                way_coords = []
                for node_id in way_nodes:
                    if node_id in nodes:
                        way_coords.append(nodes[node_id])
                
                if len(way_coords) > 1:
                    red_lines_visual.append(way_coords)
                    
                # Create segments for graph
                for i in range(len(way_nodes) - 1):
                    start_node = way_nodes[i]
                    end_node = way_nodes[i+1]
                    
                    if start_node in nodes and end_node in nodes:
                        c1 = nodes[start_node]
                        c2 = nodes[end_node]
                        red_lines_segments.append((c1, c2))
        
        # CSV IO: Write Red Lines (Legacy + Debug)
        data_dir = os.path.dirname(__file__)
        csv_path = os.path.join(data_dir, 'AA_temp_red_lines.csv')
        with open(csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['coordinates_json'])
            for visual in red_lines_visual:
                writer.writerow([json.dumps(visual)])

        logger.info(f"AA: Found {len(red_lines_visual)} visual ways. Saved to AA_temp_red_lines.csv.")
        
        # Redis IO: Save Data
        save_to_redis(KEY_META, {'lat': lat, 'lon': lon})
        save_to_redis(KEY_RED_LINES, red_lines_visual)
        
        # Save Metadata (Legacy)
        try:
            with open(meta_path, 'w') as f:
                json.dump({'lat': lat, 'lon': lon}, f)
        except Exception as e:
            logger.warning(f"AA: Failed to save metadata: {e}")

        return [], red_lines_visual

    except Exception as e:
        logger.error(f"AA: Failed to fetch red lines: {e}")
        return [], []
    """
    Fetches roads from Overpass API and returns them as 'Red Lines'.
    region_size: rough degrees for bounding box (0.005 ~ 500m)
    """
    logger.info(f"AA: Fetching Red Lines for {lat}, {lon}")
    
    # META: Check for existing data
    meta_path = os.path.join(os.path.dirname(__file__), 'generation_meta.json')
    csv_path = os.path.join(os.path.dirname(__file__), 'AA_temp_red_lines.csv')
    
    if reuse_existing and os.path.exists(meta_path) and os.path.exists(csv_path):
        try:
            with open(meta_path, 'r') as f:
                meta = json.load(f)
                
            # Tolerance Check (e.g. 0.0001 is roughly 10 meters)
            # If we are close to the last generation point, we can reuse.
            # However, user request implies "Initial Load" -> Reuse, "GPS" -> Rebuild.
            # So if reuse_existing is True, we generally want to reuse if the data is valid.
            # Let's enforce a small tolerance to be safe, so we don't show wrong city data.
            last_lat = meta.get('lat', 0)
            last_lon = meta.get('lon', 0)
            
            if abs(last_lat - lat) < 0.0005 and abs(last_lon - lon) < 0.0005:
                logger.info("AA: Reusing existing red lines data (Location match).")
                
                # We need to read the CSV to return the visual lines, 
                # as the caller expects them (though A_create currently ignores the return for logic, 
                # it uses the side-effect CSV. But let's return correctly to be robust).
                visual_lines = []
                with open(csv_path, 'r', newline='') as f:
                    reader = csv.reader(f)
                    header = next(reader, None) # Skip header
                    for row in reader:
                        if row:
                            visual_lines.append(json.loads(row[0]))
                
                return [], visual_lines
                
        except Exception as e:
            logger.warning(f"AA: Failed to read metadata for reuse: {e}. Proceeding to fetch.")
            
    # Define bounding box
    min_lat = lat - region_size
    max_lat = lat + region_size
    min_lon = lon - region_size
    max_lon = lon + region_size
    
    # Overpass Query
    # [timeout:25] tells the server to work for up to 25 seconds.
    # Overpass Query
    # [timeout:25] tells the server to work for up to 25 seconds.
    query = f"""
    [out:json][timeout:25];
    (
      way["highway"~"^(residential|primary|secondary|tertiary|unclassified|pedestrian|path|footway|living_street)$"]({min_lat},{min_lon},{max_lat},{max_lon});
    );
    out body;
    >;
    out skel qt;
    """
    
    headers = {
        'User-Agent': 'CrazyWalk-Game/1.0 (contact@crazywalk.org)'
    }

    # List of Overpass servers to try
    overpass_servers = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
    ]
    
    import time
    
    response = None
    data = None
    
    for attempt in range(len(overpass_servers) * 2): # Try servers twice
        server_url = overpass_servers[attempt % len(overpass_servers)]
        try:
            logger.info(f"AA: Requesting roads from {server_url} (Attempt {attempt+1})")
            response = requests.post(server_url, data=query, headers=headers, timeout=30)
            response.raise_for_status()
            data = response.json()
            # If successful, break loop
            logger.info("AA: Overpass request successful.")
            break
        except Exception as e:
            logger.warning(f"AA: Failed to fetch from {server_url}: {e}")
            time.sleep(1) # Brief pause before retry
            
    if not data:
        logger.error("AA: All Overpass servers failed. Returning empty.")
        return [], []
        
    try:
        # Process Nodes
        nodes = {node['id']: (node['lat'], node['lon']) for node in data['elements'] if node['type'] == 'node'}
        
        red_lines_segments = [] # For Graph Logic: pairs of points
        red_lines_visual = []   # For Display: lists of points
        
        # Process Ways
        for element in data['elements']:
            if element['type'] == 'way':
                way_nodes = element.get('nodes', [])
                
                # Construct visual polyline
                way_coords = []
                for node_id in way_nodes:
                    if node_id in nodes:
                        way_coords.append(nodes[node_id])
                
                if len(way_coords) > 1:
                    red_lines_visual.append(way_coords)
                    
                # Create segments for graph
                for i in range(len(way_nodes) - 1):
                    start_node = way_nodes[i]
                    end_node = way_nodes[i+1]
                    
                    if start_node in nodes and end_node in nodes:
                        c1 = nodes[start_node]
                        c2 = nodes[end_node]
                        
                        # Store as ((lat1, lon1), (lat2, lon2))
                        red_lines_segments.append((c1, c2))
        
        # CSV IO: Write Red Lines (Visual Only)
        data_dir = os.path.dirname(__file__)
        
        # Write "Visible Zone" (Visual Polylines) to the single requested file
        csv_path = os.path.join(data_dir, 'AA_temp_red_lines.csv')
        with open(csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['coordinates_json'])
            for visual in red_lines_visual:
                writer.writerow([json.dumps(visual)])

        logger.info(f"AA: Found {len(red_lines_visual)} visual ways. Saved to AA_temp_red_lines.csv.")
        
        # Save Metadata
        try:
            with open(meta_path, 'w') as f:
                json.dump({'lat': lat, 'lon': lon}, f)
        except Exception as e:
            logger.warning(f"AA: Failed to save metadata: {e}")

        # Return visual lines for orchestrator (it uses 'red_visual' for valid output)
        # We can return empty segments for the first arg since AB will now read the file/visuals itself.
        return [], red_lines_visual

    except Exception as e:
        logger.error(f"AA: Failed to fetch red lines: {e}")
        return [], []
