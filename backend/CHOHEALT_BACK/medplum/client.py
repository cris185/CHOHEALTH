"""Thin HTTP client for the self-hosted Medplum FHIR server.

Authenticates with the OAuth2 client_credentials grant, caches the access
token, and trips a short-lived circuit breaker after repeated failures so a
Medplum outage degrades to MedplumUnavailable instead of hanging requests.
"""
import time

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from django.conf import settings
from django.core.cache import cache

from .exceptions import MedplumError, MedplumUnavailable

TOKEN_CACHE_KEY = 'medplum:token'
TOKEN_LOCK_KEY = 'medplum:token:lock'
CIRCUIT_OPEN_KEY = 'medplum:circuit_open'
CIRCUIT_FAILURES_KEY = 'medplum:circuit_failures'
CIRCUIT_FAILURE_THRESHOLD = 3
CIRCUIT_COOLDOWN_SECONDS = 60


def _build_session():
    session = requests.Session()
    retry = Retry(
        total=2,
        backoff_factor=0.5,
        status_forcelist=[429, 502, 503, 504],
        allowed_methods=['GET', 'POST', 'PUT'],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('https://', adapter)
    session.mount('http://', adapter)
    return session


class MedplumClient:
    def __init__(self):
        self.base_url = settings.MEDPLUM_BASE_URL.rstrip('/')
        self.session = _build_session()

    # -- circuit breaker -----------------------------------------------

    def _circuit_is_open(self):
        return bool(cache.get(CIRCUIT_OPEN_KEY, False))

    def _record_failure(self):
        failures = cache.get(CIRCUIT_FAILURES_KEY, 0) + 1
        cache.set(CIRCUIT_FAILURES_KEY, failures, CIRCUIT_COOLDOWN_SECONDS)
        if failures >= CIRCUIT_FAILURE_THRESHOLD:
            cache.set(CIRCUIT_OPEN_KEY, True, CIRCUIT_COOLDOWN_SECONDS)

    def _record_success(self):
        cache.delete(CIRCUIT_FAILURES_KEY)
        cache.delete(CIRCUIT_OPEN_KEY)

    # -- auth -------------------------------------------------------------

    def _get_token(self):
        if not settings.MEDPLUM_ENABLED:
            raise MedplumUnavailable('Medplum integration is disabled (MEDPLUM_ENABLED=False).')
        if self._circuit_is_open():
            raise MedplumUnavailable('Medplum circuit breaker is open (recent failures).')

        token = cache.get(TOKEN_CACHE_KEY)
        if token:
            return token

        got_lock = cache.add(TOKEN_LOCK_KEY, '1', timeout=10)
        if not got_lock:
            # Another worker/thread is already fetching a token. Give it a
            # moment, then just retry the cache once instead of stampeding.
            time.sleep(0.3)
            token = cache.get(TOKEN_CACHE_KEY)
            if token:
                return token

        try:
            resp = self.session.post(
                f'{self.base_url}/oauth2/token',
                data={
                    'grant_type': 'client_credentials',
                    'client_id': settings.MEDPLUM_CLIENT_ID,
                    'client_secret': settings.MEDPLUM_CLIENT_SECRET,
                },
                timeout=settings.MEDPLUM_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            token = data['access_token']
            expires_in = data.get('expires_in', 3600)
            cache.set(TOKEN_CACHE_KEY, token, max(expires_in - 60, 30))
            self._record_success()
            return token
        except (requests.RequestException, KeyError, ValueError) as exc:
            self._record_failure()
            raise MedplumUnavailable(f'Could not authenticate with Medplum: {exc}') from exc
        finally:
            if got_lock:
                cache.delete(TOKEN_LOCK_KEY)

    # -- requests -----------------------------------------------------

    def _request(self, method, path, **kwargs):
        token = self._get_token()
        headers = kwargs.pop('headers', {})
        headers.setdefault('Authorization', f'Bearer {token}')
        headers.setdefault('Content-Type', 'application/fhir+json')

        try:
            resp = self.session.request(
                method, f'{self.base_url}{path}', headers=headers,
                timeout=settings.MEDPLUM_TIMEOUT, **kwargs,
            )
        except requests.RequestException as exc:
            self._record_failure()
            raise MedplumUnavailable(f'Medplum request failed: {exc}') from exc

        if resp.status_code >= 500:
            self._record_failure()
            raise MedplumUnavailable(f'Medplum returned {resp.status_code} for {method} {path}')
        if resp.status_code >= 400:
            raise MedplumError(f'Medplum error {resp.status_code} for {method} {path}: {resp.text}')

        self._record_success()
        return resp

    def search(self, resource_type, params):
        return self._request('GET', f'/fhir/R4/{resource_type}', params=params).json()

    def create(self, resource_type, payload):
        return self._request('POST', f'/fhir/R4/{resource_type}', json=payload).json()

    def read(self, resource_type, resource_id):
        return self._request('GET', f'/fhir/R4/{resource_type}/{resource_id}').json()

    def create_binary(self, content, content_type):
        """Upload raw bytes as a FHIR `Binary`. Returns the created resource
        (has `id`, `contentType`); the file lives at `Binary/<id>`.
        """
        return self._request('POST', '/fhir/R4/Binary', data=content, headers={'Content-Type': content_type}).json()

    def read_binary(self, binary_id):
        """Fetch a `Binary`'s raw bytes. Returns (content: bytes, content_type: str)."""
        resp = self._request('GET', f'/fhir/R4/Binary/{binary_id}', headers={'Accept': '*/*'})
        return resp.content, resp.headers.get('Content-Type', 'application/octet-stream')
