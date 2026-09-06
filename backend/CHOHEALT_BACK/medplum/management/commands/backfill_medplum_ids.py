"""Backfill Medplum Patient/Practitioner resources for existing rows.

Usage:
    python manage.py backfill_medplum_ids --dry-run
    python manage.py backfill_medplum_ids

Idempotent: only touches Patient/Doctor rows with an empty medplum_*_id, and
ensure_patient_resource/ensure_practitioner_resource recover an existing FHIR
resource via its `sid` identifier before creating a new one.
"""
from django.core.management.base import BaseCommand

from doctor.models import Doctor
from patient.models import Patient

from medplum.exceptions import MedplumError
from medplum.sync import ensure_patient_resource, ensure_practitioner_resource


class Command(BaseCommand):
    help = 'Backfill Medplum Patient/Practitioner resources for Patients/Doctors that do not have one yet.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Only report how many rows are pending; make no Medplum calls.',
        )

    def handle(self, *args, **options):
        patients = Patient.objects.filter(medplum_patient_id='')
        doctors = Doctor.objects.filter(medplum_practitioner_id='')

        self.stdout.write(f'{patients.count()} patient(s) and {doctors.count()} doctor(s) pending sync.')

        if options['dry_run']:
            self.stdout.write(self.style.WARNING('Dry run: no changes made.'))
            return

        synced, failed = 0, 0

        for patient in patients:
            try:
                ensure_patient_resource(patient)
                synced += 1
            except MedplumError as exc:
                failed += 1
                self.stderr.write(self.style.ERROR(f'Patient {patient.sid}: {exc}'))

        for doctor in doctors:
            try:
                ensure_practitioner_resource(doctor)
                synced += 1
            except MedplumError as exc:
                failed += 1
                self.stderr.write(self.style.ERROR(f'Doctor {doctor.sid}: {exc}'))

        style = self.style.SUCCESS if failed == 0 else self.style.WARNING
        self.stdout.write(style(f'Synced {synced}, failed {failed}.'))
