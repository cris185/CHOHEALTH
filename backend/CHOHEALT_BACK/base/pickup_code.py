"""Pickup code + QR helpers for `MedicineOrder`.

Kept tiny and dependency-light because this is a portfolio-grade flow, not a
production fulfilment pipeline. The pickup code is a short alphanumeric string
prefixed with `CHO-`; the QR encodes the same string.
"""
import io
import secrets
import string

import qrcode

from .models import MedicineOrder


# Characters we allow in a pickup code. We exclude 0/O and 1/I/L to keep it
# unambiguous when the staff types it by hand instead of scanning.
_CODE_ALPHABET = ''.join(
    c for c in string.ascii_uppercase + string.digits if c not in 'O0I1L'
)
_CODE_LENGTH = 6  # ~30^6 = ~700M combinations — more than enough for a demo


def generate_unique_pickup_code() -> str:
    """Return a new, unused pickup code like `CHO-4A9B2F`.

    Retries on the (extremely unlikely) collision. If the caller races another
    request with the same code, the DB `unique` constraint will raise; the
    caller should be inside a transaction that rolls back on IntegrityError.
    """
    for _ in range(10):
        suffix = ''.join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LENGTH))
        code = f'CHO-{suffix}'
        if not MedicineOrder.objects.filter(pickup_code=code).exists():
            return code
    # Very unlikely: 10 collisions in a row. Raise so the caller can decide.
    raise RuntimeError('Could not generate a unique pickup code after 10 attempts.')


def generate_qr_png_bytes(payload: str) -> bytes:
    """Render a QR code image as PNG bytes.

    `box_size` controls the pixel density (10 gives ~290x290 PNG, good for
    emails without bloating the attachment). `border` is the quiet zone.
    """
    img = qrcode.make(payload, box_size=10, border=4)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()
