"""
Location handlers for CrazyWalk-Game server.
Handles geolocation via reverse geocoding and IP-based location.
"""
import json
import logging
import urllib.request
import urllib.parse

logger = logging.getLogger(__name__)


def handle_locate(handler):
    """
    Handle /api/locate request.
    Takes lat/lon, reverse geocodes to find city, 
    then optionally searches for city center to return canonical coordinates.
    Returns: { 'city': 'City Name', 'lat': 0.0, 'lon': 0.0 }
    """
    try:
        # Parse params
        parsed_path = urllib.parse.urlparse(handler.path)
        params = urllib.parse.parse_qs(parsed_path.query)
        lat = params.get('lat', [None])[0]
        lon = params.get('lon', [None])[0]

        if not lat or not lon:
            handler.send_error(400, "Missing lat or lon parameters")
            return
        
        user_lat = float(lat)
        user_lon = float(lon)
        
        # Default fallback values
        city = "Unknown City"
        target_lat = user_lat
        target_lon = user_lon
        
        headers = {'User-Agent': 'CrazyWalk/1.0'}
        api_timeout = 3  # seconds

        # 1. Reverse Geocode to get City Name
        try:
            reverse_url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&zoom=18&accept-language=en"
            req = urllib.request.Request(reverse_url, headers=headers)
            
            with urllib.request.urlopen(req, timeout=api_timeout) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode())
                    address = data.get('address', {})
                    city = address.get('city') or address.get('municipality') or address.get('town') or \
                           address.get('suburb') or address.get('village') or address.get('hamlet') or \
                           address.get('county') or address.get('state') or "Unknown City"
        except Exception as e:
            logger.warning(f"Reverse geocoding failed: {e}")

        # 2. Search for City Center
        if city != "Unknown City":
            try:
                encoded_q = urllib.parse.quote(city)
                search_url = f"https://nominatim.openstreetmap.org/search?format=json&q={encoded_q}&limit=1&accept-language=en"
                req_search = urllib.request.Request(search_url, headers=headers)
                
                with urllib.request.urlopen(req_search, timeout=api_timeout) as response:
                    if response.status == 200:
                        search_data = json.loads(response.read().decode())
                        if search_data:
                            target_lat = float(search_data[0]['lat'])
                            target_lon = float(search_data[0]['lon'])
            except Exception as e:
                logger.warning(f"City search failed: {e}")

        # Construct Response
        result = {
            "city": city.upper(),
            "lat": target_lat,
            "lon": target_lon,
            "user_lat": user_lat,
            "user_lon": user_lon
        }

        # Send Headers
        handler.send_response(200)
        handler.send_header('Content-Type', 'application/json')
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.end_headers()
        
        # Send Body
        handler.wfile.write(json.dumps(result).encode())

    except Exception as e:
        logger.error(f"Locate Fatal Error: {e}")
        handler.send_error(500, f"Server Error: {str(e)}")


def handle_ip_locate(handler):
    """
    Handle /api/ip_locate request.
    Uses ip-api.com to get approximate location from client IP.
    Returns: { 'city': 'City Name', 'lat': 0.0, 'lon': 0.0 }
    """
    try:
        # Get client IP from request
        client_ip = handler.client_address[0]
        
        # For localhost, get external IP
        if client_ip in ('127.0.0.1', '::1', 'localhost'):
            api_url = "http://ip-api.com/json/?fields=status,message,city,lat,lon"
        else:
            api_url = f"http://ip-api.com/json/{client_ip}?fields=status,message,city,lat,lon"
        
        headers = {'User-Agent': 'CrazyWalk/1.0'}
        req = urllib.request.Request(api_url, headers=headers)
        
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                
                if data.get('status') == 'success':
                    city = data.get('city')
                    logger.info(f"IP Geolocation Success: City='{city}'")
                    result = {
                        "city": (city or 'Unknown City').upper(),
                        "lat": data.get('lat', 0),
                        "lon": data.get('lon', 0)
                    }
                else:
                    # Retry without IP
                    retry_url = "http://ip-api.com/json/?fields=status,message,city,lat,lon"
                    req_retry = urllib.request.Request(retry_url, headers=headers)
                    with urllib.request.urlopen(req_retry, timeout=5) as response_retry:
                        if response_retry.status == 200:
                            data_retry = json.loads(response_retry.read().decode())
                            if data_retry.get('status') == 'success':
                                city = data_retry.get('city')
                                result = {
                                    "city": (city or 'Unknown City').upper(),
                                    "lat": data_retry.get('lat', 0),
                                    "lon": data_retry.get('lon', 0)
                                }
                            else:
                                result = {"city": "UNKNOWN CITY", "lat": 0, "lon": 0}
                        else:
                            result = {"city": "UNKNOWN CITY", "lat": 0, "lon": 0}
            else:
                result = {"city": "UNKNOWN CITY", "lat": 0, "lon": 0}
        
        # Send Response
        handler.send_response(200)
        handler.send_header('Content-Type', 'application/json')
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.end_headers()
        handler.wfile.write(json.dumps(result).encode())
        
    except Exception as e:
        logger.error(f"IP Locate Error: {e}")
        handler.send_response(200)
        handler.send_header('Content-Type', 'application/json')
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.end_headers()
        handler.wfile.write(json.dumps({"city": "UNKNOWN CITY", "lat": 0, "lon": 0}).encode())
