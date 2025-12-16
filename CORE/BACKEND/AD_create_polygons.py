import logging
import csv
import os
import json
import networkx as nx
from shapely.geometry import Polygon, Point

logger = logging.getLogger(__name__)

def create_polygons(white_lines=None):
    """
    Finds Polygons (Minimum Cycles) in the White Line Graph.
    Adds White Circles in the center with percentage.
    Reads from AC_create_white_lines.csv if None.
    Writes to AD_create_polygons.csv.
    """
    logger.info("AD: Finding Polygons")
    
    data_dir = os.path.dirname(__file__)
    
    # 1. Read Inputs
    if white_lines is None:
        white_lines = []
        input_path = os.path.join(data_dir, 'AC_create_white_lines.csv')
        if os.path.exists(input_path):
            with open(input_path, 'r') as f:
                reader = csv.reader(f)
                next(reader, None)
                for row in reader:
                    if len(row) >= 7:
                        # New format: start_lat, start_lon, end_lat, end_lon, length, green_count, path_json
                        start = (float(row[0]), float(row[1]))
                        end = (float(row[2]), float(row[3]))
                        green_count = int(row[5])
                        path = json.loads(row[6])
                        path_tuples = [tuple(p) for p in path]
                        
                        white_lines.append({
                            'start': start,
                            'end': end,
                            'path': path_tuples,
                            'green_count': green_count
                        })
                    elif len(row) >= 6:
                        # Old format fallback
                        start = (float(row[0]), float(row[1]))
                        end = (float(row[2]), float(row[3]))
                        green_count = 0
                        path = json.loads(row[5])
                        path_tuples = [tuple(p) for p in path]
                        
                        white_lines.append({
                            'start': start,
                            'end': end,
                            'path': path_tuples,
                            'green_count': 0
                        })
    
    # Build NetworkX Graph
    G = nx.Graph()
    
    # white_lines contain 'start' and 'end' tuples
    for line in white_lines:
        u = line['start']
        v = line['end']
        # Add edge with geometry as attribute
        G.add_edge(u, v, path=line['path'], green_count=line.get('green_count', 0))
        
    polygons_data = []
    
    # Use minimum_cycle_basis to find "holes" (regions)
    try:
        cycles = nx.minimum_cycle_basis(G)
        
        for cycle in cycles:
            # cycle is a list of nodes: [n1, n2, n3, ...]
            if len(cycle) < 3: continue
            
            # Construct polygon geometry by stitching edge paths
            coords = []
            
            total_green_circles = 0
            
            # Iterate through the cycle edges
            # Cycle is [n1, n2, n3, ...]. We need edges (n1,n2), (n2,n3), ..., (last, n1)
            # Add implicit closure for iteration
            cycle_closed = cycle + [cycle[0]]
            
            for i in range(len(cycle_closed) - 1):
                u = cycle_closed[i]
                v = cycle_closed[i+1]
                
                # Get edge data (specifically the path)
                edge_data = G.get_edge_data(u, v)
                if not edge_data or 'path' not in edge_data:
                    # Fallback to straight line if path missing (shouldn't happen)
                    logger.warning(f"AD: Missing path for edge {u}-{v}, utilizing straight line.")
                    current_segment = [u, v]
                else:
                    path = edge_data['path'] # List of (lat, lon) tuples
                    total_green_circles += edge_data.get('green_count', 0)
                    
                    # Check direction.
                    p_start = path[0]
                    p_end = path[-1]
                    
                    if p_start == u:
                        # Path is u -> v.
                        current_segment = path[:-1]
                    elif p_end == u:
                        # Path is v -> u (reversed).
                        rev_path = path[::-1]
                        current_segment = rev_path[:-1]
                    else:
                        current_segment = path[:-1]
                
                coords.extend(current_segment)
            
            # Close the loop explicitly by adding the very first point again
            if coords:
                coords.append(coords[0])
            
            # Create Shapely Polygon for calculations
            poly = Polygon(coords)
            
            if not poly.is_valid:
                 poly = poly.buffer(0)

            # Center (Centroid)
            center = poly.centroid
            
            # Calculate 100% Value
            # Sum of Green Circles on edges + Number of Blue Circles (Vertices)
            # len(cycle) gives number of unique vertices in the simple cycle
            total_points = total_green_circles + len(cycle)
            
            polygons_data.append({
                'id': f"poly_{len(polygons_data)}",
                'coords': coords,
                'center': (center.x, center.y),
                'percentage': 0, # Current progress (0 initially)
                'total_points': total_points
            })
            
    except Exception as e:
        logger.error(f"AD: Cycle basis error: {e}")

    # CSV IO: Write Polygons
    with open(os.path.join(data_dir, 'AD_create_polygons.csv'), 'w', newline='') as f:
        writer = csv.writer(f)
        # id, center_lat, center_lon, total_points, coords_json
        writer.writerow(['id', 'center_lat', 'center_lon', 'total_points', 'coords_json'])
        for poly in polygons_data:
            writer.writerow([
                poly['id'], 
                poly['center'][0], 
                poly['center'][1], 
                poly['total_points'],
                json.dumps(poly['coords'])
            ])

    logger.info(f"AD: Created {len(polygons_data)} polygons. Saved to CSV.")
    return polygons_data
