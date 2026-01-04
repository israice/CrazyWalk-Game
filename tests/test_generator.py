"""
Smoke tests for LocationPolygonsGenerator.
Tests basic functionality without requiring external services.
"""
import pytest
import math


class TestGeneratorImport:
    """Test that generator can be imported correctly."""

    def test_import_generator(self, project_root):
        """Test that LocationPolygonsGenerator can be imported."""
        import sys
        sys.path.insert(0, project_root)
        
        from CORE.BACKEND.LocationPolygonsGenerator import LocationPolygonsGenerator
        
        generator = LocationPolygonsGenerator()
        assert generator is not None

    def test_haversine_distance(self, project_root):
        """Test haversine distance calculation."""
        import sys
        sys.path.insert(0, project_root)
        
        from CORE.BACKEND import geometry_utils
        
        # Test distance between two known points
        # Kyiv coordinates
        coord1 = (50.4501, 30.5234)
        # Nearby point (approximately 1km away)
        coord2 = (50.4591, 30.5234)
        
        distance = geometry_utils.haversine_distance(coord1, coord2)
        
        # Should be approximately 1000 meters (1km)
        assert 900 < distance < 1100


class TestGeneratorHelpers:
    """Test helper functions in the generator."""

    def test_can_fit_circle(self, project_root):
        """Test _can_fit_circle with a simple polygon."""
        import sys
        sys.path.insert(0, project_root)
        
        from CORE.BACKEND import geometry_utils
        
        # A large square polygon (should fit a circle)
        # Coordinates in [lat, lon] format
        large_polygon = [
            [50.45, 30.52],
            [50.45, 30.53],
            [50.46, 30.53],
            [50.46, 30.52],
            [50.45, 30.52]  # Close the polygon
        ]
        
        result = geometry_utils.can_fit_circle(large_polygon, radius_meters=10)
        assert result is True

    def test_cannot_fit_circle_in_tiny_polygon(self, project_root):
        """Test _can_fit_circle returns False for tiny polygon."""
        import sys
        sys.path.insert(0, project_root)
        
        from CORE.BACKEND import geometry_utils
        
        # A very small polygon (should NOT fit a 15m circle)
        tiny_polygon = [
            [50.4500, 30.5200],
            [50.4500, 30.5201],
            [50.4501, 30.5201],
            [50.4501, 30.5200],
            [50.4500, 30.5200]
        ]
        
        result = geometry_utils.can_fit_circle(tiny_polygon, radius_meters=100)
        assert result is False
