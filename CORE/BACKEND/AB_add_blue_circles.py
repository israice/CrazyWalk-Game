import logging
import csv
import os
import json
from .redis_tools import save_to_redis, load_from_redis, KEY_RED_LINES, KEY_BLUE_CIRCLES, KEY_ADJACENCY

logger = logging.getLogger(__name__)

def create_blue_circles(red_lines=None):
    """
    Identifies intersections (nodes where >2 segments meet) as Blue Circles.
    Reads from AA_temp_red_lines.csv if red_lines is None.
    Writes to AB_add_blue_circles.csv and AB_adjacency.csv.
    """
    logger.info("AB: Identifying Blue Circles (Intersections)")
    
    data_dir = os.path.dirname(__file__)

    # 1. Read Input (if not provided)
    if red_lines is None:
        red_lines = []
        
        # Try Redis first
        cached_red_lines = load_from_redis(KEY_RED_LINES)
        if cached_red_lines:
             logger.info("AB: Loaded Red Lines from Redis.")
             for visual in cached_red_lines:
                 # visual is list of [lat, lon]
                 for i in range(len(visual) - 1):
                     p1 = (float(visual[i][0]), float(visual[i][1]))
                     p2 = (float(visual[i+1][0]), float(visual[i+1][1]))
                     red_lines.append((p1, p2))
        else:
            # Fallback to CSV
            input_path = os.path.join(data_dir, 'AA_temp_red_lines.csv')
            if os.path.exists(input_path):
                logger.info("AB: Loading Red Lines from CSV (Fallback).")
                with open(input_path, 'r') as f:
                    reader = csv.reader(f)
                    header = next(reader, None)
                    
                    for row in reader:
                        if len(row) >= 1:
                            try:
                                coords = json.loads(row[0])
                                for i in range(len(coords) - 1):
                                    p1 = (float(coords[i][0]), float(coords[i][1]))
                                    p2 = (float(coords[i+1][0]), float(coords[i+1][1]))
                                    red_lines.append((p1, p2))
                            except json.JSONDecodeError:
                                logger.warning(f"AB: Failed to decode JSON in row: {row}")
                                continue
            else:
                 logger.warning("AB: Input file AA_temp_red_lines.csv not found.")
    
    # Count node occurrences
    node_counts = {}
    
    # Store adjacency for white lines later: node -> set(neighbor_node)
    adjacency = {} 
    
    
    logger.info(f"AB: Processing {len(red_lines)} red segments for intersections.")
    
    for start, end in red_lines:
        # Normalize keys for dict
        s_key = start
        e_key = end
        
        node_counts[s_key] = node_counts.get(s_key, 0) + 1
        node_counts[e_key] = node_counts.get(e_key, 0) + 1
        
        if s_key not in adjacency: adjacency[s_key] = set()
        if e_key not in adjacency: adjacency[e_key] = set()
        
        adjacency[s_key].add(e_key)
        adjacency[e_key].add(s_key)

    # Filter intersections (Blue Circles)
    blue_circles = []
    relevant_nodes = set()
    
    for node, count in node_counts.items():
        # degree != 2 means it's an endpoint or a junction
        if count != 2: 
            blue_circles.append({
                'id': f"{node[0]}_{node[1]}",
                'lat': node[0],
                'lon': node[1],
                'connections': count
            })
            relevant_nodes.add(node)
            
    # CSV IO: Write Blue Circles
    with open(os.path.join(data_dir, 'AB_add_blue_circles.csv'), 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'lat', 'lon', 'connections'])
        for circle in blue_circles:
            writer.writerow([circle['id'], circle['lat'], circle['lon'], circle['connections']])
            
    # CSV IO: Write Adjacency (Edge List)
    visited_edges = set()
    adj_export = [] # For Redis
    
    with open(os.path.join(data_dir, 'AB_adjacency.csv'), 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['u_lat', 'u_lon', 'v_lat', 'v_lon'])
        for u, neighbors in adjacency.items():
            for v in neighbors:
                edge = tuple(sorted((u, v)))
                if edge not in visited_edges:
                    visited_edges.add(edge)
                    writer.writerow([u[0], u[1], v[0], v[1]])
                    adj_export.append([u, v])

    logger.info(f"AB: Created {len(blue_circles)} blue circles. Saved to CSV.")
    
    # Redis IO: Save Data
    save_to_redis(KEY_BLUE_CIRCLES, blue_circles)
    save_to_redis(KEY_ADJACENCY, adj_export) # Save as list of edge pairs [[u, v], ...]
    
    return blue_circles, adjacency, relevant_nodes
