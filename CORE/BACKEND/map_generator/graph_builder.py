import logging
import networkx as nx
from CORE.BACKEND.redis_tools import (
    save_to_redis, load_from_redis,
    KEY_RED_LINES, KEY_BLUE_CIRCLES, KEY_ADJACENCY,
    KEY_WHITE_LINES, KEY_GREEN_CIRCLES
)
from CORE.BACKEND.uid_utils import generate_uid, UIDPrefix
from .geometry_utils import haversine_distance

logger = logging.getLogger(__name__)

def identify_intersections():
    """Step 2: Blue Circles"""
    logger.info("GraphBuilder: Step 2 - Identifing Intersections")
    
    red_lines = []
    # Load from Redis (we utilize the side-effect of Step 1 saving to Redis)
    cached = load_from_redis(KEY_RED_LINES)
    if cached:
        for visual in cached:
            # Handle both old (list) and new (dict) formats
            coords = visual['path'] if isinstance(visual, dict) and 'path' in visual else visual
            if not isinstance(coords, list):
                continue

            for i in range(len(coords) - 1):
                p1 = (float(coords[i][0]), float(coords[i][1]))
                p2 = (float(coords[i+1][0]), float(coords[i+1][1]))
                red_lines.append((p1, p2))
    
    node_counts = {}
    adjacency = {}
    
    for start, end in red_lines:
        node_counts[start] = node_counts.get(start, 0) + 1
        node_counts[end] = node_counts.get(end, 0) + 1
        
        if start not in adjacency:
            adjacency[start] = set()
        if end not in adjacency:
            adjacency[end] = set()
        adjacency[start].add(end)
        adjacency[end].add(start)
        
    blue_circles = []
    relevant_nodes = set()

    # Create blue circles only for intersections/endpoints (count != 2)
    for node, count in node_counts.items():
        if count != 2:
            blue_circles.append({
                'id': generate_uid(UIDPrefix.BLUE_CIRCLE),
                'lat': node[0], 'lon': node[1],
                'connections': count
            })
            relevant_nodes.add(node)
    
    # Redis Save
    save_to_redis(KEY_BLUE_CIRCLES, blue_circles)
    
    # Serialize adjacency for potential legacy needs or debug
    adj_list = []
    visited_edges = set()
    for u, neighbors in adjacency.items():
        for v in neighbors:
            edge = tuple(sorted((u, v)))
            if edge not in visited_edges:
                visited_edges.add(edge)
                adj_list.append([u, v])
    save_to_redis(KEY_ADJACENCY, adj_list)
    
    return blue_circles, adjacency, relevant_nodes

def create_graph_elements():
    """Step 3: White Lines & Green Circles"""
    logger.info("GraphBuilder: Step 3 - Creating Graph Elements")
    
    blue_circles = load_from_redis(KEY_BLUE_CIRCLES)
    adj_raw = load_from_redis(KEY_ADJACENCY)
    
    relevant_nodes = set()
    coord_to_id = {}
    if blue_circles:
        for bc in blue_circles:
            node = (bc['lat'], bc['lon'])
            relevant_nodes.add(node)
            coord_to_id[node] = bc['id']
    
    adjacency = {}
    if adj_raw:
        for pair in adj_raw:
            u = tuple(pair[0])
            v = tuple(pair[1])
            if u not in adjacency:
                adjacency[u] = set()
            if v not in adjacency:
                adjacency[v] = set()
            adjacency[u].add(v)
            adjacency[v].add(u)

    white_lines = []
    green_circles = []
    visited = set()
    
    relevant_set = set(relevant_nodes)
    
    # Sort for deterministic iteration
    sorted_relevant_nodes = sorted(list(relevant_nodes))
    
    for start_node in sorted_relevant_nodes:
        if start_node not in adjacency:
            continue
        
        # Sort neighbors for deterministic path finding
        neighbors = sorted(list(adjacency[start_node]))
        for neighbor in neighbors:
            edge_key = tuple(sorted((start_node, neighbor)))
            if edge_key in visited:
                continue
            
            path = [start_node, neighbor]
            curr = neighbor
            prev = start_node
            dist = haversine_distance(start_node, neighbor)
            
            while curr not in relevant_set and len(adjacency.get(curr, [])) == 2:
                neighbors = adjacency[curr]
                next_node = next((n for n in neighbors if n != prev), None)
                if next_node:
                    visited.add(tuple(sorted((curr, next_node))))
                    path.append(next_node)
                    dist += haversine_distance(curr, next_node)
                    prev = curr
                    curr = next_node
                else:
                    break
            
            visited.add(edge_key)
            
            if curr in relevant_set and curr != start_node:
                wl = {
                    'id': generate_uid(UIDPrefix.WHITE_LINE),
                    'start': start_node,
                    'end': curr,
                    'start_blue_circle_id': coord_to_id.get(start_node),
                    'end_blue_circle_id': coord_to_id.get(curr),
                    'path': path,
                    'length': dist,
                    'green_count': 0
                }
                
                # Green Circles
                target_spacing = 15.0
                num = max(1, int(round(dist / target_spacing)))
                if num > 1:
                    step = dist / num
                    targets = [step * k for k in range(1, num)]
                    t_idx = 0
                    curr_dist = 0
                    
                    count = 0
                    for i in range(len(path) - 1):
                        p1, p2 = path[i], path[i+1]
                        seg = haversine_distance(p1, p2)
                        while t_idx < len(targets) and (curr_dist + seg) >= targets[t_idx]:
                            rem = targets[t_idx] - curr_dist
                            ratio = rem / seg if seg > 0 else 0
                            nlat = p1[0] + (p2[0] - p1[0]) * ratio
                            nlon = p1[1] + (p2[1] - p1[1]) * ratio
                            green_circles.append({
                                'id': generate_uid(UIDPrefix.GREEN_CIRCLE),
                                'lat': nlat, 'lon': nlon, 
                                'line_id': wl['id']
                            })
                            count += 1
                            t_idx += 1
                        curr_dist += seg
                    wl['green_count'] = count
                
                white_lines.append(wl)
                
    save_to_redis(KEY_WHITE_LINES, white_lines)
    save_to_redis(KEY_GREEN_CIRCLES, green_circles)
    
    return white_lines, green_circles
