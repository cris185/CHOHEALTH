"""Seed the database with demo branches (sedes / ubicaciones).

Usage:
    python manage.py seed_branches

Idempotent: uses `get_or_create` on name so running it twice won't duplicate.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from base.models import Branch


BRANCHES = [
    {
        'name': 'CHO Health — Downtown',
        'address': '123 Main St, Downtown, New York, NY 10001',
        'phone': '+1 212 555 0101',
        'email': 'downtown@chohealth.com',
    },
    {
        'name': 'CHO Health — Midtown',
        'address': '456 5th Ave, Midtown, New York, NY 10018',
        'phone': '+1 212 555 0202',
        'email': 'midtown@chohealth.com',
    },
    {
        'name': 'CHO Health — Brooklyn',
        'address': '789 Flatbush Ave, Brooklyn, NY 11226',
        'phone': '+1 718 555 0303',
        'email': 'brooklyn@chohealth.com',
    },
    {
        'name': 'CHO Health — Queens',
        'address': '321 Queens Blvd, Queens, NY 11375',
        'phone': '+1 718 555 0404',
        'email': 'queens@chohealth.com',
    },
    {
        'name': 'CHO Health — Miami',
        'address': '500 Biscayne Blvd, Miami, FL 33132',
        'phone': '+1 305 555 0505',
        'email': 'miami@chohealth.com',
    },
]


class Command(BaseCommand):
    help = 'Seed the database with demo branches.'

    @transaction.atomic
    def handle(self, *args, **options):
        created_count = 0
        skipped_count = 0

        for data in BRANCHES:
            branch, created = Branch.objects.get_or_create(
                name=data['name'],
                defaults={
                    'address': data['address'],
                    'phone': data['phone'],
                    'email': data['email'],
                    'is_active': True,
                },
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'Created: {branch.name}'))
            else:
                skipped_count += 1
                self.stdout.write(self.style.WARNING(f'Skipped (exists): {branch.name}'))

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f'Done. Created {created_count} branch(es), skipped {skipped_count}.'
        ))
