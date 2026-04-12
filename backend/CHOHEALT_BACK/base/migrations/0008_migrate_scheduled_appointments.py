"""
Data migration: convert existing appointments with status='Scheduled' to either:
  - 'Confirmed' if they have a Paid invoice (real booking, just mislabeled)
  - 'Unpaid' otherwise (abandoned bookings from the pre-Unpaid era)

This runs BEFORE the schema migration that removes 'Scheduled' from the choices,
so that no row is left in an invalid state after the column choices change.
"""

from django.db import migrations


def forwards(apps, schema_editor):
    Appointment = apps.get_model('base', 'Appointment')
    Invoice = apps.get_model('billing', 'Invoice')

    scheduled = Appointment.objects.filter(status='Scheduled')
    for appt in scheduled:
        try:
            invoice = Invoice.objects.get(appointment=appt)
            if invoice.status == 'Paid':
                appt.status = 'Confirmed'
            else:
                appt.status = 'Unpaid'
        except Invoice.DoesNotExist:
            appt.status = 'Unpaid'
        appt.save(update_fields=['status'])


def backwards(apps, schema_editor):
    # Best-effort reverse: move Confirmed-with-Paid-invoice and Unpaid back to Scheduled.
    # We can't fully reverse because we don't know which ones were originally Scheduled,
    # so this is a no-op. Reversing this migration is not supported in practice.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('base', '0007_appointment_unpaid_status'),
        ('billing', '0003_initial'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
