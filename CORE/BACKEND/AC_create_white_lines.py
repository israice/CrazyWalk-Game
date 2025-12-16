import logging
import math
import csv
import os
import json

logger = logging.getLogger(__name__)

def haversine_distance(coord1, coord2):
    R = 6371000 # meters
    lat1, lon1 = math.radians(coord1[0]), math.radians(coord1[1])
    lat2, lon2 = math.radians(coord2[0]), math.radians(coord2[1])
    
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def create_white_lines(blue_circles_list=None, adjacency=None, relevant_nodes=None):
    """
    Creates White Lines connecting Blue Circles.
    Also adds Green Circles along them.
    Reads from AB_add_blue_circles.csv and AB_adjacency.csv if inputs are None.
    Writes to AC_create_white_lines.csv and AC_green_circles.csv.
    """
    logger.info("AC: Creating White Lines and Green Circles")
    data_dir = os.path.dirname(__file__)
    
    # 1. Read Inputs (if not provided)
    if blue_circles_list is None or adjacency is None or relevant_nodes is None:
        blue_circles_list = []
        relevant_nodes = set()
        adjacency = {}
        
        # Read Blue Circles
        circles_path = os.path.join(data_dir, 'AB_add_blue_circles.csv')
        if os.path.exists(circles_path):
            with open(circles_path, 'r') as f:
                reader = csv.reader(f)
                next(reader, None)
                for row in reader:
                    if len(row) >= 4:
                        lat, lon = float(row[1]), float(row[2])
                        blue_circles_list.append({
                            'id': row[0],
                            'lat': lat,
                            'lon': lon,
                            'connections': int(row[3])
                        })
                        relevant_nodes.add((lat, lon))
        
        # Read Adjacency
        adj_path = os.path.join(data_dir, 'AB_adjacency.csv')
        if os.path.exists(adj_path):
            with open(adj_path, 'r') as f:
                reader = csv.reader(f)
                next(reader, None)
                for row in reader:
                    if len(row) >= 4:
                        u = (float(row[0]), float(row[1]))
                        v = (float(row[2]), float(row[3]))
                        
                        if u not in adjacency: adjacency[u] = set()
                        if v not in adjacency: adjacency[v] = set()
                        
                        adjacency[u].add(v)
                        adjacency[v].add(u)
    
    white_lines = []
    green_circles = []
    
    # ... (Existing logic for traversal) ...
    
    # Convert list to set for fast lookup
    relevant_set = set(relevant_nodes)
    visited_paths = set()
    
    # Visited edges (u, v)
    visited_edges = set()
    
    for start_node in relevant_nodes:
        if start_node not in adjacency: continue
        
        for neighbor in adjacency[start_node]:
             # Sort edge to avoid distinct direction
            edge_key = tuple(sorted((start_node, neighbor)))
            if edge_key in visited_edges:
                continue
            
            # Start tracing
            path = [start_node, neighbor]
            current = neighbor
            prev = start_node
            dist = haversine_distance(start_node, neighbor)
            
            # Walk until we hit a relevant node or dead end
            while current not in relevant_set and len(adjacency.get(current, [])) == 2:
                # Find 'next' node that isn't 'prev'
                neighbors = adjacency[current]
                next_node = None
                for n in neighbors:
                    if n != prev:
                        next_node = n
                        break
                
                if next_node:
                    edge_to_mark = tuple(sorted((current, next_node)))
                    visited_edges.add(edge_to_mark)
                    
                    path.append(next_node)
                    dist += haversine_distance(current, next_node)
                    
                    prev = current
                    current = next_node
                else:
                    break # Should not happen if degree is 2
            
            # Mark the initial edge as visited
            visited_edges.add(edge_key)
            
            # Now 'current' is the end node.
            # If current is relevant, we have a valid White Line between start_node and current.
            if current in relevant_set and current != start_node:
                 white_lines.append({
                     'start': start_node,
                     'end': current,
                     'path': path,
                     'length': dist
                 })
                 
                 # Add Green Circles (Equidistant)
                 # Target ~50m spacing.
                 total_length = dist
                 target_spacing = 50.0
                 
                 # Calculate number of segments
                 # e.g. 140m / 50 = 2.8 -> 3 segments -> 46.6m each
                 num_segments = int(round(total_length / target_spacing))
                 if num_segments < 1: num_segments = 1
                 
                 if num_segments > 1:
                     step = total_length / num_segments
                     # Target distances: step, 2*step, ... (num_segments-1)*step
                     target_dists = [step * k for k in range(1, num_segments)]
                     
                     current_path_dist = 0
                     target_idx = 0
                     
                     # Traverse path to place circles
                     for i in range(len(path) - 1):
                         p1 = path[i]
                         p2 = path[i+1]
                         seg_len = haversine_distance(p1, p2)
                         
                         while target_idx < len(target_dists) and (current_path_dist + seg_len) >= target_dists[target_idx]:
                             # Interpolate position
                             target = target_dists[target_idx]
                             remainder = target - current_path_dist
                             # Avoid division by zero if seg_len is tiny (shouldn't happen with valid coords)
                             ratio = remainder / seg_len if seg_len > 0 else 0
                             
                             new_lat = p1[0] + (p2[0] - p1[0]) * ratio
                             new_lon = p1[1] + (p2[1] - p1[1]) * ratio
                             
                             green_circles.append({'lat': new_lat, 'lon': new_lon})
                             target_idx += 1
                         
                         current_path_dist += seg_len

    # CSV IO: Write Outputs
    # 1. White Lines
    with open(os.path.join(data_dir, 'AC_create_white_lines.csv'), 'w', newline='') as f:
        writer = csv.writer(f)
        # start_lat, start_lon, end_lat, end_lon, length, path_json
        writer.writerow(['start_lat', 'start_lon', 'end_lat', 'end_lon', 'length', 'path_json'])
        for wl in white_lines:
            s = wl['start']
            e = wl['end']
            writer.writerow([s[0], s[1], e[0], e[1], wl['length'], json.dumps(wl['path'])])
            
    # 2. Green Circles
    with open(os.path.join(data_dir, 'AC_green_circles.csv'), 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['lat', 'lon'])
        for gc in green_circles:
            writer.writerow([gc['lat'], gc['lon']])

    logger.info(f"AC: Created {len(white_lines)} white lines and {len(green_circles)} green circles. Saved to CSV.")
    return white_lines, green_circles
