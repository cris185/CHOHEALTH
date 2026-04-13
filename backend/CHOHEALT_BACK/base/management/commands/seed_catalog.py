"""Seed the catalog with realistic demo data.

Usage:
    python manage.py seed_catalog

Idempotent: uses `get_or_create` on name/sid so running it twice won't
duplicate rows. Does NOT assign doctors to services — that happens in
`seed_doctors` via keyword matching on `Service.name` vs `Doctor.specialization`.

Populates:
    - 10 consultation Services
    - 15 LabTests across all categories
    - 20 Medications (mix of OTC + Rx-required, with free_when_prescribed flags)
"""
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction

from base.models import Service, LabTest, Medication


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------

SERVICES = [
    {
        'name': 'General Medicine Consultation',
        'description': 'Routine consultation with a general practitioner for check-ups, diagnosis of common illnesses, and referrals.',
        'cost': Decimal('40.00'),
        'duration_minutes': 30,
    },
    {
        'name': 'Cardiology Consultation',
        'description': 'Specialist appointment for evaluation of heart conditions, chest pain, arrhythmias and cardiovascular risk assessment.',
        'cost': Decimal('80.00'),
        'duration_minutes': 45,
    },
    {
        'name': 'Pediatrics Consultation',
        'description': 'Comprehensive appointment for infants, children and adolescents, including growth monitoring and vaccination guidance.',
        'cost': Decimal('50.00'),
        'duration_minutes': 30,
    },
    {
        'name': 'Dermatology Consultation',
        'description': 'Evaluation of skin, hair and nail conditions. Includes basic skin examination and treatment recommendations.',
        'cost': Decimal('70.00'),
        'duration_minutes': 30,
    },
    {
        'name': 'Gynecology Consultation',
        'description': 'Routine gynecological check-up, reproductive health consultation and preventive screenings.',
        'cost': Decimal('75.00'),
        'duration_minutes': 45,
    },
    {
        'name': 'Orthopedics Consultation',
        'description': 'Evaluation of bone, joint and muscle conditions, sports injuries and post-surgery follow-ups.',
        'cost': Decimal('85.00'),
        'duration_minutes': 45,
    },
    {
        'name': 'Neurology Consultation',
        'description': 'Assessment of headaches, seizures, nerve pain, memory issues and other neurological disorders.',
        'cost': Decimal('95.00'),
        'duration_minutes': 60,
    },
    {
        'name': 'Urology Consultation',
        'description': 'Evaluation of urinary tract issues, kidney stones, prostate health and male reproductive concerns.',
        'cost': Decimal('80.00'),
        'duration_minutes': 45,
    },
    {
        'name': 'Psychiatry Consultation',
        'description': 'Mental health assessment, diagnosis of mood, anxiety and behavioral conditions, and medication management.',
        'cost': Decimal('100.00'),
        'duration_minutes': 60,
    },
    {
        'name': 'Ophthalmology Consultation',
        'description': 'Complete eye examination, vision assessment and diagnosis of eye diseases.',
        'cost': Decimal('70.00'),
        'duration_minutes': 30,
    },
]


LAB_TESTS = [
    # ---------- OTC (no prescription needed — patient can book directly) ----------
    {'name': 'Complete Blood Count (CBC)', 'category': 'Blood',
     'description': 'Measures red blood cells, white blood cells, hemoglobin, hematocrit and platelets.',
     'cost': Decimal('25.00'), 'duration_minutes': 15,
     'requires_prescription': False, 'free_when_prescribed': True},
    {'name': 'Basic Metabolic Panel', 'category': 'Blood',
     'description': 'Glucose, calcium and electrolytes. Screens kidney function and metabolism.',
     'cost': Decimal('35.00'), 'duration_minutes': 15,
     'requires_prescription': False, 'free_when_prescribed': True},
    {'name': 'Lipid Panel', 'category': 'Blood',
     'description': 'Total cholesterol, HDL, LDL and triglycerides for cardiovascular risk assessment.',
     'cost': Decimal('30.00'), 'duration_minutes': 15,
     'requires_prescription': False, 'free_when_prescribed': True},
    {'name': 'Hemoglobin A1c', 'category': 'Blood',
     'description': 'Average blood glucose level over the past 3 months — diabetes screening and monitoring.',
     'cost': Decimal('28.00'), 'duration_minutes': 15,
     'requires_prescription': False, 'free_when_prescribed': True},
    {'name': 'Urinalysis', 'category': 'Urine',
     'description': 'General screening for urinary tract infections, kidney disease and diabetes.',
     'cost': Decimal('20.00'), 'duration_minutes': 10,
     'requires_prescription': False, 'free_when_prescribed': True},
    {'name': 'Urine Pregnancy Test', 'category': 'Urine',
     'description': 'Detects human chorionic gonadotropin (hCG) to confirm pregnancy.',
     'cost': Decimal('15.00'), 'duration_minutes': 10,
     'requires_prescription': False, 'free_when_prescribed': True},
    {'name': 'Chest X-Ray', 'category': 'Imaging',
     'description': 'Examines lungs, heart and chest wall for abnormalities.',
     'cost': Decimal('60.00'), 'duration_minutes': 20,
     'requires_prescription': False, 'free_when_prescribed': True},
    {'name': 'COVID-19 PCR Test', 'category': 'Other',
     'description': 'Molecular test detecting SARS-CoV-2 from nasopharyngeal swab.',
     'cost': Decimal('50.00'), 'duration_minutes': 10,
     'requires_prescription': False, 'free_when_prescribed': True},

    # ---------- Rx-required (need a doctor's prescription first) ----------
    {'name': 'Thyroid Panel (TSH, T3, T4)', 'category': 'Blood',
     'description': 'Evaluates thyroid gland function. Usually ordered by an endocrinologist after symptoms or routine screening flags an issue.',
     'cost': Decimal('45.00'), 'duration_minutes': 15,
     'requires_prescription': True, 'free_when_prescribed': True},
    {'name': 'Liver Function Tests', 'category': 'Blood',
     'description': 'Measures enzymes and proteins to assess liver health.',
     'cost': Decimal('38.00'), 'duration_minutes': 15,
     'requires_prescription': True, 'free_when_prescribed': True},
    {'name': 'Urine Culture', 'category': 'Urine',
     'description': 'Identifies bacteria causing urinary tract infections — needs clinical context.',
     'cost': Decimal('35.00'), 'duration_minutes': 10,
     'requires_prescription': True, 'free_when_prescribed': True},
    {'name': 'Stool Culture', 'category': 'Stool',
     'description': 'Detects bacterial infections causing diarrhea or gastrointestinal symptoms.',
     'cost': Decimal('40.00'), 'duration_minutes': 10,
     'requires_prescription': True, 'free_when_prescribed': True},
    {'name': 'Occult Blood Test', 'category': 'Stool',
     'description': 'Screens for hidden blood in stool — colorectal cancer screening.',
     'cost': Decimal('25.00'), 'duration_minutes': 10,
     'requires_prescription': True, 'free_when_prescribed': True},
    {'name': 'Abdominal Ultrasound', 'category': 'Imaging',
     'description': 'Imaging of liver, gallbladder, kidneys, pancreas and spleen.',
     'cost': Decimal('120.00'), 'duration_minutes': 30,
     'requires_prescription': True, 'free_when_prescribed': True},
    {'name': 'Electrocardiogram (ECG)', 'category': 'Imaging',
     'description': 'Records the heart\'s electrical activity to detect arrhythmias and heart conditions.',
     'cost': Decimal('55.00'), 'duration_minutes': 20,
     'requires_prescription': True, 'free_when_prescribed': True},
]


MEDICATIONS = [
    # --- Over-the-counter (no Rx required) ---
    {'name': 'Paracetamol', 'generic_name': 'Acetaminophen', 'category': 'Painkiller',
     'dosage_form': 'Tablet', 'strength': '500 mg', 'cost': Decimal('5.00'),
     'requires_prescription': False, 'free_when_prescribed': True,
     'description': 'Mild to moderate pain relief and fever reducer. Safe when used as directed.'},
    {'name': 'Ibuprofen', 'generic_name': 'Ibuprofen', 'category': 'Anti-inflammatory',
     'dosage_form': 'Tablet', 'strength': '400 mg', 'cost': Decimal('6.00'),
     'requires_prescription': False, 'free_when_prescribed': True,
     'description': 'NSAID for pain, inflammation and fever. Take with food.'},
    {'name': 'Loratadine', 'generic_name': 'Loratadine', 'category': 'Antihistamine',
     'dosage_form': 'Tablet', 'strength': '10 mg', 'cost': Decimal('7.00'),
     'requires_prescription': False, 'free_when_prescribed': False,
     'description': 'Non-drowsy antihistamine for seasonal allergies and hives.'},
    {'name': 'Vitamin C', 'generic_name': 'Ascorbic Acid', 'category': 'Vitamin',
     'dosage_form': 'Tablet', 'strength': '1000 mg', 'cost': Decimal('8.00'),
     'requires_prescription': False, 'free_when_prescribed': False,
     'description': 'Vitamin supplement supporting immune function and antioxidant protection.'},
    {'name': 'Multivitamin Complex', 'generic_name': 'Multivitamin', 'category': 'Supplement',
     'dosage_form': 'Tablet', 'strength': 'Adult', 'cost': Decimal('12.00'),
     'requires_prescription': False, 'free_when_prescribed': False,
     'description': 'Daily multivitamin providing essential vitamins and minerals.'},
    {'name': 'Omeprazole OTC', 'generic_name': 'Omeprazole', 'category': 'Other',
     'dosage_form': 'Capsule', 'strength': '20 mg', 'cost': Decimal('9.00'),
     'requires_prescription': False, 'free_when_prescribed': True,
     'description': 'Reduces stomach acid. Used for heartburn and acid reflux.'},
    {'name': 'Aspirin', 'generic_name': 'Acetylsalicylic Acid', 'category': 'Painkiller',
     'dosage_form': 'Tablet', 'strength': '100 mg', 'cost': Decimal('4.50'),
     'requires_prescription': False, 'free_when_prescribed': True,
     'description': 'Pain relief and low-dose use for cardiovascular prevention.'},
    {'name': 'Cough Syrup', 'generic_name': 'Dextromethorphan', 'category': 'Other',
     'dosage_form': 'Liquid', 'strength': '15 mg/5 ml', 'cost': Decimal('10.00'),
     'requires_prescription': False, 'free_when_prescribed': False,
     'description': 'Cough suppressant for dry, non-productive cough.'},

    # --- Prescription required ---
    {'name': 'Amoxicillin', 'generic_name': 'Amoxicillin', 'category': 'Antibiotic',
     'dosage_form': 'Capsule', 'strength': '500 mg', 'cost': Decimal('18.00'),
     'requires_prescription': True, 'free_when_prescribed': True,
     'description': 'Broad-spectrum antibiotic for bacterial infections such as sinusitis, otitis and UTIs.'},
    {'name': 'Azithromycin', 'generic_name': 'Azithromycin', 'category': 'Antibiotic',
     'dosage_form': 'Tablet', 'strength': '500 mg', 'cost': Decimal('22.00'),
     'requires_prescription': True, 'free_when_prescribed': True,
     'description': 'Macrolide antibiotic for respiratory and skin infections.'},
    {'name': 'Ciprofloxacin', 'generic_name': 'Ciprofloxacin', 'category': 'Antibiotic',
     'dosage_form': 'Tablet', 'strength': '500 mg', 'cost': Decimal('20.00'),
     'requires_prescription': True, 'free_when_prescribed': True,
     'description': 'Fluoroquinolone antibiotic for severe bacterial infections including UTIs.'},
    {'name': 'Lisinopril', 'generic_name': 'Lisinopril', 'category': 'Antihypertensive',
     'dosage_form': 'Tablet', 'strength': '10 mg', 'cost': Decimal('15.00'),
     'requires_prescription': True, 'free_when_prescribed': True,
     'description': 'ACE inhibitor for hypertension and heart failure.'},
    {'name': 'Losartan', 'generic_name': 'Losartan Potassium', 'category': 'Antihypertensive',
     'dosage_form': 'Tablet', 'strength': '50 mg', 'cost': Decimal('17.00'),
     'requires_prescription': True, 'free_when_prescribed': True,
     'description': 'Angiotensin II receptor blocker for high blood pressure.'},
    {'name': 'Metformin', 'generic_name': 'Metformin HCl', 'category': 'Antidiabetic',
     'dosage_form': 'Tablet', 'strength': '850 mg', 'cost': Decimal('12.00'),
     'requires_prescription': True, 'free_when_prescribed': True,
     'description': 'First-line medication for type 2 diabetes. Take with meals.'},
    {'name': 'Insulin Glargine', 'generic_name': 'Insulin Glargine', 'category': 'Antidiabetic',
     'dosage_form': 'Injection', 'strength': '100 U/ml', 'cost': Decimal('65.00'),
     'requires_prescription': True, 'free_when_prescribed': True,
     'description': 'Long-acting basal insulin for type 1 and type 2 diabetes management.'},
    {'name': 'Sertraline', 'generic_name': 'Sertraline HCl', 'category': 'Antidepressant',
     'dosage_form': 'Tablet', 'strength': '50 mg', 'cost': Decimal('25.00'),
     'requires_prescription': True, 'free_when_prescribed': True,
     'description': 'SSRI for depression, anxiety and obsessive-compulsive disorder.'},
    {'name': 'Fluoxetine', 'generic_name': 'Fluoxetine HCl', 'category': 'Antidepressant',
     'dosage_form': 'Capsule', 'strength': '20 mg', 'cost': Decimal('20.00'),
     'requires_prescription': True, 'free_when_prescribed': True,
     'description': 'SSRI antidepressant for major depressive disorder and related conditions.'},
    {'name': 'Clonazepam', 'generic_name': 'Clonazepam', 'category': 'Other',
     'dosage_form': 'Tablet', 'strength': '0.5 mg', 'cost': Decimal('28.00'),
     'requires_prescription': True, 'free_when_prescribed': True,
     'description': 'Benzodiazepine for seizure disorders and panic attacks. Use with caution.'},
    {'name': 'Hydrocortisone Cream', 'generic_name': 'Hydrocortisone', 'category': 'Other',
     'dosage_form': 'Cream', 'strength': '1%', 'cost': Decimal('11.00'),
     'requires_prescription': True, 'free_when_prescribed': False,
     'description': 'Topical corticosteroid for inflammation and itching.'},
]


class Command(BaseCommand):
    help = 'Seeds the catalog with demo Services, LabTests and Medications.'

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('Seeding catalog...'))

        services_created = 0
        services_existed = 0
        for entry in SERVICES:
            _, created = Service.objects.get_or_create(
                name=entry['name'],
                defaults={
                    'description': entry['description'],
                    'cost': entry['cost'],
                    'duration_minutes': entry['duration_minutes'],
                    'is_active': True,
                    'service_type': 'Consultation',
                },
            )
            if created:
                services_created += 1
            else:
                services_existed += 1

        labtests_created = 0
        labtests_existed = 0
        for entry in LAB_TESTS:
            # `update_or_create` so existing rows pick up the new
            # `requires_prescription`, `free_when_prescribed` and
            # `duration_minutes` flags introduced for the direct-booking flow.
            # This is safe because the seed represents the canonical demo data.
            _, created = LabTest.objects.update_or_create(
                name=entry['name'],
                defaults={
                    'category': entry['category'],
                    'description': entry['description'],
                    'cost': entry['cost'],
                    'duration_minutes': entry['duration_minutes'],
                    'requires_prescription': entry['requires_prescription'],
                    'free_when_prescribed': entry['free_when_prescribed'],
                    'is_active': True,
                },
            )
            if created:
                labtests_created += 1
            else:
                labtests_existed += 1

        meds_created = 0
        meds_existed = 0
        for entry in MEDICATIONS:
            _, created = Medication.objects.get_or_create(
                name=entry['name'],
                defaults={
                    'generic_name': entry['generic_name'],
                    'description': entry['description'],
                    'category': entry['category'],
                    'dosage_form': entry['dosage_form'],
                    'strength': entry['strength'],
                    'is_active': True,
                    'cost': entry['cost'],
                    'requires_prescription': entry['requires_prescription'],
                    'free_when_prescribed': entry['free_when_prescribed'],
                },
            )
            if created:
                meds_created += 1
            else:
                meds_existed += 1

        self.stdout.write(self.style.SUCCESS(
            f'\nServices    — created: {services_created}, already existed: {services_existed}'
        ))
        self.stdout.write(self.style.SUCCESS(
            f'Lab tests   — created: {labtests_created}, already existed: {labtests_existed}'
        ))
        self.stdout.write(self.style.SUCCESS(
            f'Medications — created: {meds_created}, already existed: {meds_existed}'
        ))
        self.stdout.write(self.style.NOTICE(
            '\nNext step: run `python manage.py seed_doctors` to create demo doctors '
            'and auto-link them to matching services.'
        ))
