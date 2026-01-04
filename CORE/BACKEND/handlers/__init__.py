"""
Handler modules initialization.
"""
from .auth_handlers import handle_register, handle_login
from .session_handlers import handle_get_session
from .location_handlers import handle_locate, handle_ip_locate
from .state_handlers import (
    handle_save_location_state, handle_get_location_state,
    handle_get_game_state, handle_save_game_state
)
from .asset_handlers import (
    handle_serve_poster, handle_serve_promo, 
    handle_get_promos, handle_serve_readme
)
from .proxy_handlers import proxy_nominatim
from .game_handlers import handle_game_data
from .unified_state_handler import handle_unified_state

__all__ = [
    'handle_register', 'handle_login',
    'handle_get_session',
    'handle_locate', 'handle_ip_locate',
    'handle_save_location_state', 'handle_get_location_state',
    'handle_get_game_state', 'handle_save_game_state',
    'handle_serve_poster', 'handle_serve_promo',
    'handle_get_promos', 'handle_serve_readme',
    'proxy_nominatim',
    'handle_game_data',
    'handle_unified_state'
]
