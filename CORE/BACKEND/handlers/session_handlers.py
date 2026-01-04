"""
Session handler for CrazyWalk-Game server.
Returns server session information for frontend state management.
"""
import json
import logging

logger = logging.getLogger(__name__)


def handle_get_session(handler, session_id, start_time):
    """
    Returns server session information.
    This allows frontend to detect server restarts and reset in-memory state.
    Returns: { 'session_id': 'uuid', 'start_time': timestamp }
    """
    try:
        handler.send_response(200)
        handler.send_header('Content-Type', 'application/json')
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.end_headers()

        response = {
            'session_id': session_id,
            'start_time': start_time
        }

        handler.wfile.write(json.dumps(response).encode())
        logger.info(f"Session info sent: {session_id}")
    except Exception as e:
        logger.error(f"Error handling session request: {e}")
        handler.send_error(500, f"Server Error: {str(e)}")
