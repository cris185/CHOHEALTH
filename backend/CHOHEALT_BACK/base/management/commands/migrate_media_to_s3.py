import requests
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand

from base.models import LabResult, LabTest, Medication, Service
from doctor.models import Doctor, DoctorQualification
from patient.models import Patient

# (modelo, campo, tipo de recurso en Cloudinary)
FIELDS = [
    (Patient, 'image', 'image'),
    (Doctor, 'image', 'image'),
    (DoctorQualification, 'certificate', 'raw'),
    (Service, 'image', 'image'),
    (Medication, 'image', 'image'),
    (LabTest, 'image', 'image'),
    (LabResult, 'result_file', 'raw'),
]


class Command(BaseCommand):
    help = 'Copia los archivos historicos servidos por Cloudinary hacia el storage S3/MinIO actual.'

    def handle(self, *args, **options):
        cloud_name = settings.CLOUDINARY_CLOUD_NAME
        if not cloud_name:
            self.stderr.write('CLOUDINARY_CLOUD_NAME no esta configurado, no puedo construir las URLs de origen.')
            return

        seen = set()
        migrated = 0
        skipped = 0
        failed = 0

        for model, field_name, resource_type in FIELDS:
            queryset = model.objects.exclude(**{field_name: ''}).exclude(**{f'{field_name}__isnull': True})
            for obj in queryset:
                name = getattr(obj, field_name).name
                if not name or name in seen:
                    continue
                seen.add(name)

                if default_storage.exists(name):
                    self.stdout.write(f'  ya existe en S3, salto: {name}')
                    skipped += 1
                    continue

                url = f'https://res.cloudinary.com/{cloud_name}/{resource_type}/upload/{name}'
                resp = requests.get(url, timeout=30)
                if resp.status_code != 200:
                    self.stderr.write(f'  fallo descarga ({resp.status_code}): {name}')
                    failed += 1
                    continue

                default_storage.save(name, ContentFile(resp.content))
                self.stdout.write(self.style.SUCCESS(f'  migrado: {name} ({len(resp.content)} bytes)'))
                migrated += 1

        self.stdout.write(self.style.SUCCESS(
            f'\nListo. migrados={migrated} ya_existian={skipped} fallidos={failed}'
        ))
