"""
Unified UID generation utilities for CrazyWalk-Game.

All game element IDs are generated through this module ensuring consistent format:
    PREFIX_xxxxxxxx (8 hex characters)

Examples:
    - WHITE_LINE_a1b2c3d4
    - BLUE_CIRCLE_f9e8d7c6
    - GREEN_CIRCLE_12ab34cd
    - POLYGON_5678efab
    - POSTER_abcd1234
"""
import secrets


def generate_uid(prefix: str) -> str:
    """
    Generate a unique ID with consistent format.
    
    Args:
        prefix: Element type prefix (e.g., 'WHITE_LINE', 'POLYGON')
    
    Returns:
        UID in format PREFIX_xxxxxxxx (8 hex characters)
    
    Examples:
        >>> generate_uid('WHITE_LINE')
        'WHITE_LINE_a1b2c3d4'
        >>> generate_uid('POLYGON')
        'POLYGON_f9e8d7c6'
    """
    return f"{prefix}_{secrets.token_hex(4)}"


# Predefined prefixes for type safety
class UIDPrefix:
    """Standard prefixes for game elements."""
    WHITE_LINE = "WHITE_LINE"
    BLUE_CIRCLE = "BLUE_CIRCLE"
    GREEN_CIRCLE = "GREEN_CIRCLE"
    POLYGON = "POLYGON"
    POSTER = "POSTER"
    GROUP = "GROUP"


# Convenience functions
def white_line_uid() -> str:
    """Generate WHITE_LINE_xxxxxxxx"""
    return generate_uid(UIDPrefix.WHITE_LINE)


def blue_circle_uid() -> str:
    """Generate BLUE_CIRCLE_xxxxxxxx"""
    return generate_uid(UIDPrefix.BLUE_CIRCLE)


def green_circle_uid() -> str:
    """Generate GREEN_CIRCLE_xxxxxxxx"""
    return generate_uid(UIDPrefix.GREEN_CIRCLE)


def polygon_uid() -> str:
    """Generate POLYGON_xxxxxxxx"""
    return generate_uid(UIDPrefix.POLYGON)


def poster_uid() -> str:
    """Generate POSTER_xxxxxxxx"""
    return generate_uid(UIDPrefix.POSTER)


def group_uid() -> str:
    """Generate GROUP_xxxxxxxx"""
    return generate_uid(UIDPrefix.GROUP)
