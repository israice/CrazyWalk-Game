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
                    if len(row) >= 6:
                        # NEWEST format: id, center_lat, center_lon, total_points, boundary_white_lines, coords_json
                        coords = json.loads(row[5])
                        coords_tuples = [tuple(p) for p in coords]
                        
                        polygons.append({
                            'id': row[0],
                            'coords': coords_tuples
                        })
                    elif len(row) >= 5:
                        # Old format: id, center_lat, center_lon, total_points, coords_json
                        coords = json.loads(row[4])
                        # Convert to tuples for Shapely
                        coords_tuples = [tuple(p) for p in coords]
                        
                        polygons.append({
                            'id': row[0],
                            'coords': coords_tuples
                        })
                    elif len(row) >= 4:
                        # Oldest format: id, center_lat, center_lon, coords_json
                        coords = json.loads(row[3])
                        # Convert to tuples for Shapely
                        coords_tuples = [tuple(p) for p in coords]
                        
                        polygons.append({
                            'id': row[0],
                            'coords': coords_tuples
                        })

    # Logic: Merge all polygons into one "Area"
    combined_area = None
    # Keep track of shapely objects linked to IDs for later check
    shapely_sources = []
    
    if polygons:
        try:
            for p in polygons:
                if len(p['coords']) >= 3:
                     poly_shape = Polygon(p['coords'])
                     if not poly_shape.is_valid:
                         poly_shape = poly_shape.buffer(0)
                     shapely_sources.append({'id': p['id'], 'geom': poly_shape})
            
            geo_list = [s['geom'] for s in shapely_sources]
            combined_area = unary_union(geo_list)
            
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
            
            # Find which source polygons generated this piece
            # Logic: If source polygon intersects this piece, it belongs to it.
            # Since we did a Union, the piece covers the source.
            member_ids = []
            for source in shapely_sources:
                # Use intersection check with small tolerance or area check
                if geom.intersects(source['geom']):
                     # Ensure it's not just a point touch (though for union it implies merger)
                     # For robust check: intersection area > epsilon
                     try:
                         overlap = geom.intersection(source['geom']).area
                         if overlap > 0.0000000001:
                             member_ids.append(source['id'])
                     except:
                         pass # Ignore topological errors during check

            groups.append({
                'id': f"area_{idx}",
                'coords': boundary,
                'type': 'monolith',
                'polygon_ids': member_ids
            })
    
    # CSV IO: Write Groups
    with open(os.path.join(data_dir, 'AE_create_group_of_polygons.csv'), 'w', newline='') as f:
        writer = csv.writer(f)
        # id, type, geometry_json, polygon_ids
        writer.writerow(['id', 'type', 'geometry_json', 'polygon_ids'])
        for g in groups:
            writer.writerow([g['id'], g['type'], json.dumps(g['coords']), json.dumps(g['polygon_ids'])])
        
    logger.info(f"AE: Created {len(groups)} monolithic area parts. Saved to CSV.")
    return groups
