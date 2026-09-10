import hashlib
import hmac
from datetime import timedelta

import jwt
from django.conf import settings
from django.utils import timezone

JITSI_PROVIDER = 'jitsi'


def build_room_name(appointment) -> str:
    """Deterministic, unguessable Jitsi room name for an appointment.

    Derived from `sid` via HMAC rather than using `sid` directly, since `sid`
    already travels in URLs and API payloads. Lowercased because Prosody
    normalizes room JIDs to lowercase — an uppercase `room` claim in the JWT
    would silently fail to match.
    """
    digest = hmac.new(
        settings.JITSI_ROOM_SALT.encode(), appointment.sid.encode(), hashlib.sha256
    ).hexdigest()
    return f'cho-{digest[:32]}'


def ensure_meeting_link(appointment) -> list:
    """Set `meeting_link`/`meeting_provider` on a Virtual appointment in memory
    if not already set. Returns the list of changed field names (empty if the
    appointment isn't Virtual or already has a link) so callers can pass it
    straight to `save(update_fields=...)`. Idempotent.
    """
    if appointment.mode != 'Virtual' or appointment.meeting_link:
        return []
    appointment.meeting_link = f'{settings.FRONTEND_URL}/join/{appointment.sid}'
    appointment.meeting_provider = JITSI_PROVIDER
    return ['meeting_link', 'meeting_provider']


def build_join_token(appointment, *, user_id, display_name, email, avatar, is_moderator):
    """Sign a short-lived Jitsi JWT for one participant joining this
    appointment's room. Returns (token, expires_at).
    """
    room = build_room_name(appointment)
    now = timezone.now()
    expires_at = now + timedelta(minutes=settings.JITSI_JWT_TTL_MINUTES)

    payload = {
        'iss': settings.JITSI_APP_ID,
        'aud': settings.JITSI_JWT_AUDIENCE,
        'sub': settings.JITSI_JWT_SUB,
        'room': room,
        'iat': now,
        'nbf': now - timedelta(seconds=60),
        'exp': expires_at,
        'context': {
            'user': {
                'id': str(user_id),
                'name': str(display_name),
                'email': str(email),
                'avatar': str(avatar),
                'moderator': 'true' if is_moderator else 'false',
            },
            'features': {
                'livestreaming': False,
                'recording': False,
                'transcription': False,
                'outbound-call': False,
            },
        },
    }
    token = jwt.encode(payload, settings.JITSI_APP_SECRET, algorithm='HS256')
    return token, expires_at


def build_join_url(appointment, token) -> str:
    room = build_room_name(appointment)
    return f'{settings.JITSI_BASE_URL}/{room}?jwt={token}'
