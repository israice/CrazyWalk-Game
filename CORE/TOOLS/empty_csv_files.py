import csv
import os

FILES = {
    'js/balloons.csv': ['lat', 'lng'],
    'js/cross.csv': ['lat', 'lng', 'count'],
    'js/polygons.csv': ['id', 'geometry'],
    'js/roads.csv': ['id', 'type', 'geometry'],
}

def reset_data():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    for relative_path, headers in FILES.items():
        file_path = os.path.join(base_dir, relative_path)
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        try:
            with open(file_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(headers)
            print(f"Successfully reset {relative_path}")
        except Exception as e:
            print(f"Error resetting {relative_path}: {e}")

if __name__ == "__main__":
    reset_data()
