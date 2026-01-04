"""
Tests for uid_utils module.

Verifies UID generation consistency and format.
"""
import pytest


class TestUIDUtils:
    """Tests for UID generation utilities."""
    
    def test_import_uid_utils(self):
        """Test that uid_utils can be imported."""
        from CORE.BACKEND.uid_utils import generate_uid, UIDPrefix
        assert generate_uid is not None
        assert UIDPrefix is not None
    
    def test_generate_uid_format(self):
        """Test that generated UIDs have correct format."""
        from CORE.BACKEND.uid_utils import generate_uid
        
        uid = generate_uid('TEST')
        
        # Format: PREFIX_xxxxxxxx (8 hex chars)
        assert uid.startswith('TEST_')
        suffix = uid.split('_')[1]
        assert len(suffix) == 8
        # Verify it's valid hex
        int(suffix, 16)
    
    def test_generate_uid_unique(self):
        """Test that generated UIDs are unique."""
        from CORE.BACKEND.uid_utils import generate_uid
        
        uids = [generate_uid('TEST') for _ in range(100)]
        assert len(set(uids)) == 100  # All unique
    
    def test_uid_prefix_constants(self):
        """Test that UIDPrefix has all required constants."""
        from CORE.BACKEND.uid_utils import UIDPrefix
        
        assert UIDPrefix.WHITE_LINE == "WHITE_LINE"
        assert UIDPrefix.BLUE_CIRCLE == "BLUE_CIRCLE"
        assert UIDPrefix.GREEN_CIRCLE == "GREEN_CIRCLE"
        assert UIDPrefix.POLYGON == "POLYGON"
        assert UIDPrefix.POSTER == "POSTER"
        assert UIDPrefix.GROUP == "GROUP"
    
    def test_convenience_functions(self):
        """Test convenience UID generation functions."""
        from CORE.BACKEND.uid_utils import (
            white_line_uid, blue_circle_uid, green_circle_uid,
            polygon_uid, poster_uid, group_uid
        )
        
        assert white_line_uid().startswith('WHITE_LINE_')
        assert blue_circle_uid().startswith('BLUE_CIRCLE_')
        assert green_circle_uid().startswith('GREEN_CIRCLE_')
        assert polygon_uid().startswith('POLYGON_')
        assert poster_uid().startswith('POSTER_')
        assert group_uid().startswith('GROUP_')
