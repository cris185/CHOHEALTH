"""Lazy, idempotent provisioning of FHIR Patient/Practitioner resources.

Called on first use (e.g. when a messaging thread is opened), never from the
registration flow — signup must not depend on an external service being up.
"""
from .client import MedplumClient

IDENTIFIER_SYSTEM = 'https://chohealth.co/fhir/sid'


def _find_by_sid(client, resource_type, sid):
    bundle = client.search(resource_type, {'identifier': f'{IDENTIFIER_SYSTEM}|{sid}'})
    entries = bundle.get('entry') or []
    if entries:
        return entries[0]['resource']['id']
    return None


def _human_name(first, second, last, second_last):
    given = [n for n in (first, second) if n]
    family = ' '.join(n for n in (last, second_last) if n)
    name = {}
    if given:
        name['given'] = given
    if family:
        name['family'] = family
    return name


def _telecom(phone, email):
    entries = []
    if phone:
        entries.append({'system': 'phone', 'value': phone})
    if email:
        entries.append({'system': 'email', 'value': email})
    return entries


def ensure_patient_resource(patient):
    """Return the Medplum Patient id for a `patient.Patient`, creating it
    (or recovering it via the `sid` identifier) if needed.
    """
    if patient.medplum_patient_id:
        return patient.medplum_patient_id

    client = MedplumClient()

    existing_id = _find_by_sid(client, 'Patient', patient.sid)
    if existing_id:
        patient.medplum_patient_id = existing_id
        patient.save(update_fields=['medplum_patient_id'])
        return existing_id

    payload = {
        'resourceType': 'Patient',
        'identifier': [{'system': IDENTIFIER_SYSTEM, 'value': patient.sid}],
        'name': [_human_name(patient.first_name, patient.second_name,
                              patient.first_last_name, patient.second_last_name)],
        'telecom': _telecom(patient.phone, patient.user.email),
    }
    if patient.gender:
        payload['gender'] = patient.gender.lower()
    if patient.date_of_birth:
        payload['birthDate'] = patient.date_of_birth.isoformat()

    created = client.create('Patient', payload)
    patient.medplum_patient_id = created['id']
    patient.save(update_fields=['medplum_patient_id'])
    return created['id']


def ensure_practitioner_resource(doctor):
    """Return the Medplum Practitioner id for a `doctor.Doctor`, creating it
    (or recovering it via the `sid` identifier) if needed.
    """
    if doctor.medplum_practitioner_id:
        return doctor.medplum_practitioner_id

    client = MedplumClient()

    existing_id = _find_by_sid(client, 'Practitioner', doctor.sid)
    if existing_id:
        doctor.medplum_practitioner_id = existing_id
        doctor.save(update_fields=['medplum_practitioner_id'])
        return existing_id

    payload = {
        'resourceType': 'Practitioner',
        'identifier': [{'system': IDENTIFIER_SYSTEM, 'value': doctor.sid}],
        'name': [_human_name(doctor.first_name, doctor.second_name,
                              doctor.first_last_name, doctor.second_last_name)],
        'telecom': _telecom(doctor.mobile, doctor.user.email),
    }

    created = client.create('Practitioner', payload)
    doctor.medplum_practitioner_id = created['id']
    doctor.save(update_fields=['medplum_practitioner_id'])
    return created['id']
