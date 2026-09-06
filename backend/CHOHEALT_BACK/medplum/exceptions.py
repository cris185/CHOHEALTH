class MedplumError(Exception):
    """Base exception for Medplum integration errors."""


class MedplumUnavailable(MedplumError):
    """Medplum could not be reached, timed out, or the circuit breaker is open.

    Callers should treat this as a 503-shaped failure and let the rest of the
    app (appointments, payments, prescriptions) keep working — nothing outside
    the medplum/ app should ever import Medplum internals directly.
    """
