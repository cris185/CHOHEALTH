"""Seed the database with demo doctors and their schedules.

Usage:
    python manage.py seed_doctors

Idempotent: uses `get_or_create` on email so re-running won't duplicate.
Auto-links each doctor to the `Service` whose name contains their
specialization keyword (e.g. `Cardiology` -> `Cardiology Consultation`).

All doctors share the same password `Test1234!` so you can log in with
any of them during testing. Schedule: Monday-Friday 9:00-17:00 with a
12:00-13:00 break.
"""
import random
from datetime import time
from django.core.management.base import BaseCommand
from django.db import transaction

from userauths.models import User
from doctor.models import Doctor, DoctorSchedule, DoctorQualification
from base.models import Service, LabTest


DEFAULT_PASSWORD = 'Test1234!'

# Each entry represents one doctor. `keywords` is the list of substrings that
# should match a Service name (case-insensitive) to auto-link the doctor to
# that service.
DOCTORS = [
    {
        'email': 'elena.rodriguez@chohealth.test',
        'first_name': 'Elena', 'first_last_name': 'Rodriguez',
        'specialization': 'General Medicine',
        'years_of_experience': 12,
        'country': 'United States',
        'mobile': '+15550100001',
        'bio': 'Family physician with over a decade of experience in preventive care, chronic disease management and acute illness. Committed to building lasting relationships with patients of all ages.',
        'keywords': ['general medicine'],
    },
    {
        'email': 'marcus.chen@chohealth.test',
        'first_name': 'Marcus', 'first_last_name': 'Chen',
        'specialization': 'Cardiology',
        'years_of_experience': 18,
        'country': 'United States',
        'mobile': '+15550100002',
        'bio': 'Board-certified cardiologist focused on preventive cardiology, heart failure and non-invasive imaging.',
        'keywords': ['cardiology'],
    },
    {
        'email': 'sarah.okonkwo@chohealth.test',
        'first_name': 'Sarah', 'first_last_name': 'Okonkwo',
        'specialization': 'Pediatrics',
        'years_of_experience': 9,
        'country': 'United Kingdom',
        'mobile': '+15550100003',
        'bio': 'Pediatrician passionate about child development, vaccination advocacy and family-centered care.',
        'keywords': ['pediatrics'],
    },
    {
        'email': 'david.mueller@chohealth.test',
        'first_name': 'David', 'first_last_name': 'Mueller',
        'specialization': 'Dermatology',
        'years_of_experience': 15,
        'country': 'Germany',
        'mobile': '+15550100004',
        'bio': 'Dermatologist specializing in skin cancer screening, acne treatment and cosmetic procedures.',
        'keywords': ['dermatology'],
    },
    {
        'email': 'aisha.patel@chohealth.test',
        'first_name': 'Aisha', 'first_last_name': 'Patel',
        'specialization': 'Gynecology',
        'years_of_experience': 11,
        'country': 'United States',
        'mobile': '+15550100005',
        'bio': 'Obstetrician-gynecologist providing comprehensive reproductive health care and prenatal services.',
        'keywords': ['gynecology'],
    },
    {
        'email': 'roberto.silva@chohealth.test',
        'first_name': 'Roberto', 'first_last_name': 'Silva',
        'specialization': 'Orthopedics',
        'years_of_experience': 20,
        'country': 'Brazil',
        'mobile': '+15550100006',
        'bio': 'Orthopedic surgeon with expertise in sports medicine, joint replacement and musculoskeletal rehabilitation.',
        'keywords': ['orthopedics'],
    },
    {
        'email': 'hannah.schmidt@chohealth.test',
        'first_name': 'Hannah', 'first_last_name': 'Schmidt',
        'specialization': 'Neurology',
        'years_of_experience': 14,
        'country': 'Austria',
        'mobile': '+15550100007',
        'bio': 'Neurologist treating headache disorders, epilepsy, movement disorders and neurodegenerative diseases.',
        'keywords': ['neurology'],
    },
    {
        'email': 'james.okafor@chohealth.test',
        'first_name': 'James', 'first_last_name': 'Okafor',
        'specialization': 'Psychiatry',
        'years_of_experience': 10,
        'country': 'Nigeria',
        'mobile': '+15550100008',
        'bio': 'Psychiatrist focused on mood disorders, anxiety, and adult ADHD with an integrative approach to mental wellness.',
        'keywords': ['psychiatry'],
    },
    # Lab staff — represented as Doctor rows with specialization 'Laboratory'
    # so they can hold a DoctorSchedule. Auto-assigned to all LabTests below.
    {
        'email': 'lab.staff.alpha@chohealth.test',
        'first_name': 'Alex', 'first_last_name': 'Vargas',
        'specialization': 'Laboratory',
        'years_of_experience': 7,
        'country': 'Mexico',
        'mobile': '+15550100009',
        'bio': 'Senior medical laboratory technologist specializing in clinical chemistry and hematology.',
        'keywords': [],  # Doesn't match any consultation Service
        'is_lab_staff': True,
    },
    {
        'email': 'lab.staff.beta@chohealth.test',
        'first_name': 'Beatriz', 'first_last_name': 'Lima',
        'specialization': 'Laboratory',
        'years_of_experience': 4,
        'country': 'Portugal',
        'mobile': '+15550100010',
        'bio': 'Phlebotomist and lab technologist focused on patient comfort and accurate sample collection.',
        'keywords': [],
        'is_lab_staff': True,
    },
]


# Standard weekly schedule for all demo doctors:
# Monday through Friday, 9:00-17:00 with a 12:00-13:00 lunch break.
STANDARD_SCHEDULE = [
    (0, time(9, 0), time(17, 0), time(12, 0), time(13, 0)),   # Monday
    (1, time(9, 0), time(17, 0), time(12, 0), time(13, 0)),   # Tuesday
    (2, time(9, 0), time(17, 0), time(12, 0), time(13, 0)),   # Wednesday
    (3, time(9, 0), time(17, 0), time(12, 0), time(13, 0)),   # Thursday
    (4, time(9, 0), time(17, 0), time(12, 0), time(13, 0)),   # Friday
]


# Pool of qualifications — each doctor gets 1-2 random ones assigned.
QUALIFICATIONS_POOL = [
    ('MD', 'Harvard Medical School', 2008),
    ('MD', 'Johns Hopkins School of Medicine', 2010),
    ('MD', 'Stanford School of Medicine', 2012),
    ('MD', 'Yale School of Medicine', 2011),
    ('MD', 'University of Oxford', 2009),
    ('MBBS', 'All India Institute of Medical Sciences', 2013),
    ('MD', 'Karolinska Institutet', 2014),
    ('MD', 'University of Toronto', 2010),
    ('Board Certification', 'American Board of Internal Medicine', 2016),
    ('Fellowship', 'Mayo Clinic', 2017),
    ('Residency', 'Massachusetts General Hospital', 2015),
]


class Command(BaseCommand):
    help = (
        'Seeds the database with demo doctors, their schedules and '
        'auto-links them to matching services by specialization keywords.'
    )

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('Seeding doctors...'))

        created_count = 0
        existed_count = 0

        # Preload services + lab tests for matching
        all_services = list(Service.objects.filter(service_type='Consultation'))
        all_lab_tests = list(LabTest.objects.filter(is_active=True))

        for entry in DOCTORS:
            email = entry['email']
            user, user_created = User.objects.get_or_create(
                email=email,
                defaults={
                    'user_type': 'Doctor',
                    'is_active': True,
                },
            )
            # Always (re)set the password so tests are reproducible. For an
            # already-existing user this resets to the known password — fine
            # for a dev/demo seed, remove this line if you want to preserve
            # existing passwords.
            if user_created:
                user.set_password(DEFAULT_PASSWORD)
                user.save()

            doctor, doctor_created = Doctor.objects.get_or_create(
                user=user,
                defaults={
                    'first_name': entry['first_name'],
                    'first_last_name': entry['first_last_name'],
                    'specialization': entry['specialization'],
                    'years_of_experience': entry['years_of_experience'],
                    'country': entry['country'],
                    'mobile': entry['mobile'],
                    'bio': entry['bio'],
                },
            )

            if doctor_created:
                created_count += 1
                # Create schedule
                for dow, start, end, bs, be in STANDARD_SCHEDULE:
                    DoctorSchedule.objects.create(
                        doctor=doctor,
                        day_of_week=dow,
                        start_time=start,
                        end_time=end,
                        break_start=bs,
                        break_end=be,
                        is_active=True,
                    )

                # Assign 1-2 random qualifications
                for degree, institution, year in random.sample(QUALIFICATIONS_POOL, k=2):
                    DoctorQualification.objects.create(
                        doctor=doctor,
                        degree=degree,
                        institution=institution,
                        year=year,
                    )
            else:
                existed_count += 1

            # Link services by keyword match (idempotent — .add() is safe).
            # Lab staff get linked to ALL active LabTests instead of services.
            linked = []
            if entry.get('is_lab_staff'):
                for lab in all_lab_tests:
                    lab.staff.add(doctor)
                    linked.append(lab.name)
            else:
                for service in all_services:
                    name_lower = service.name.lower()
                    if any(k.lower() in name_lower for k in entry['keywords']):
                        service.doctors.add(doctor)
                        linked.append(service.name)

            status_label = 'CREATED' if doctor_created else 'EXISTS '
            linked_str = (
                f'{len(linked)} lab tests' if entry.get('is_lab_staff')
                else (', '.join(linked) if linked else '(no matching service)')
            )
            self.stdout.write(f'  [{status_label}] Dr. {doctor.first_name} {doctor.first_last_name} — {entry["specialization"]} -> {linked_str}')

        self.stdout.write(self.style.SUCCESS(
            f'\nDoctors — created: {created_count}, already existed: {existed_count}'
        ))
        self.stdout.write(self.style.NOTICE(
            f'\nAll doctors share password: {DEFAULT_PASSWORD}\n'
            'Log in with any of the emails above, e.g. elena.rodriguez@chohealth.test'
        ))
