"""Best-effort address -> (lat, lng) lookup via Nominatim (OpenStreetMap),
the same free, no-API-key provider already used for the map tiles. Used once
per delivery, at creation time, to plot a destination pin and give the
"arrived" geofence check something real to compare against.
"""
import logging

import requests

logger = logging.getLogger(__name__)

NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
# Nominatim's usage policy requires a real identifying User-Agent.
NOMINATIM_USER_AGENT = 'CHOHEALTH-delivery/1.0 (https://chohealth.cristianpuentes.com)'

# Nominatim's `place_rank` scale: higher = more specific. When it can't match
# a street number it silently falls back to whatever broader feature it *can*
# match — e.g. a whole neighbourhood (rank ~24, easily a 1-2 km wide area)
# instead of erroring. A wrong-but-confident-looking coordinate is worse than
# none: it makes the "arrived" geofence flag a courier as "far away" even
# when they're standing at the door. 26 is street/road level (a single
# segment, tens to a couple hundred meters) — the loosest match still tight
# enough to be worth keeping.
MIN_PLACE_RANK = 26


def geocode_address(address):
    """Returns (lat, lng) as floats, or None if the address couldn't be
    resolved precisely enough (or at all) or the service is unreachable.
    Never raises — geocoding is an enrichment, not something that should be
    able to block a payment or a delivery from being created.
    """
    if not address:
        return None
    try:
        response = requests.get(
            NOMINATIM_URL,
            params={'q': address, 'format': 'json', 'limit': 1},
            headers={'User-Agent': NOMINATIM_USER_AGENT},
            timeout=5,
        )
        response.raise_for_status()
        results = response.json()
        if not results:
            return None
        result = results[0]
        if int(result.get('place_rank', 0)) < MIN_PLACE_RANK:
            logger.warning(
                'Geocoding for address %r only matched a broad area (%s, rank %s) — discarding.',
                address, result.get('addresstype'), result.get('place_rank'),
            )
            return None
        return float(result['lat']), float(result['lon'])
    except Exception:
        logger.warning('Geocoding failed for address %r', address, exc_info=True)
        return None
