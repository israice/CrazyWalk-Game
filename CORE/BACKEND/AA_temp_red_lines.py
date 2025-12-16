import requests
import json
import logging
import csv
import os

logger = logging.getLogger(__name__)

def create_red_lines(lat, lon, region_size=0.005):
    """
    Fetches roads from Overpass API and returns them as 'Red Lines'.
    region_size: rough degrees for bounding box (0.005 ~ 500m)
    """
    logger.info(f"AA: Fetching Red Lines for {lat}, {lon}")
    
    # Define bounding box
    min_lat = lat - region_size
    max_lat = lat + region_size
    min_lon = lon - region_size
    max_lon = lon + region_size
    
    # Overpass Query
    # [timeout:25] tells the server to work for up to 25 seconds.
    overpass_url = "https://overpass-api.de/api/interpreter"
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

    try:
        response = requests.post(overpass_url, data=query, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()
        
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
        
        # Return visual lines for orchestrator (it uses 'red_visual' for valid output)
        # We can return empty segments for the first arg since AB will now read the file/visuals itself.
        return [], red_lines_visual

    except Exception as e:
        logger.error(f"AA: Failed to fetch red lines: {e}")
        return [], []
