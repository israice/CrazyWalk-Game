import logging
import csv
import os
import json
from shapely.geometry import Polygon
from shapely.ops import unary_union

logger = logging.getLogger(__name__)

def create_groups_of_polygons(polygons=None):
    """
    Groups polygons into a monolithic area.
    Reads from AD_create_polygons.csv if None.
    Writes to AE_create_group_of_polygons.csv.
    """
    logger.info("AE: Grouping Polygons into Monolith")
    data_dir = os.path.dirname(__file__)
    
    # 1. Read Inputs
    if polygons is None:
        polygons = []
        input_path = os.path.join(data_dir, 'AD_create_polygons.csv')
        if os.path.exists(input_path):
            with open(input_path, 'r') as f:
                reader = csv.reader(f)
                next(reader, None)
                for row in reader:
                    if len(row) >= 5:
                        # New format: id, center_lat, center_lon, total_points, coords_json
                        coords = json.loads(row[4])
                        # Convert to tuples for Shapely
                        coords_tuples = [tuple(p) for p in coords]
                        
                        polygons.append({
                            'id': row[0],
                            'coords': coords_tuples
                        })
                    elif len(row) >= 4:
                        # Old format: id, center_lat, center_lon, coords_json
                        coords = json.loads(row[3])
                        # Convert to tuples for Shapely
                        coords_tuples = [tuple(p) for p in coords]
                        
                        polygons.append({
                            'id': row[0],
                            'coords': coords_tuples
                        })

    # Logic: Merge all polygons into one "Area"
    combined_area = None
    if polygons:
        try:
            shapely_polys = [Polygon(p['coords']) for p in polygons if len(p['coords']) >= 3]
            # Validate
            shapely_polys = [p if p.is_valid else p.buffer(0) for p in shapely_polys]
            
            combined_area = unary_union(shapely_polys)
            
        except Exception as e:
            logger.error(f"AE: Error merging polygons: {e}")

    # Prepare logic for output
    # If it's a Multipolygon, we might want to split or keep as is?
    # Let's verify type.
    
    groups = []
    if combined_area:
        # Simplify slightly to reduce points?
        # combined_area = combined_area.simplify(0.00001)
        
        # Extract coordinates. 
        # CAREFUL: MultiPolygon vs Polygon
        geoms = []
        if combined_area.geom_type == 'Polygon':
            geoms = [combined_area]
        elif combined_area.geom_type == 'MultiPolygon':
            geoms = list(combined_area.geoms)
            
        for idx, geom in enumerate(geoms):
            # Outer boundary
            boundary = list(geom.exterior.coords)
            groups.append({
                'id': f"area_{idx}",
                'coords': boundary,
                'type': 'monolith'
            })
    
    # CSV IO: Write Groups
    with open(os.path.join(data_dir, 'AE_create_group_of_polygons.csv'), 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'type', 'geometry_json'])
        for g in groups:
            writer.writerow([g['id'], g['type'], json.dumps(g['coords'])])
        
    logger.info(f"AE: Created {len(groups)} monolithic area parts. Saved to CSV.")
    return groups
