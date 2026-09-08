# Split from 0034: Postgres refuses to ALTER TABLE a table that still has
# pending deferred trigger events from a DELETE ... CASCADE earlier in the
# same transaction (the duplicate-thread merge in 0034 deletes rows via
# CASCADE onto ThreadMessage/ThreadRead). Running the constraint in its own
# migration gives it its own transaction.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('base', '0034_messaging_reactivation'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='messagethread',
            constraint=models.UniqueConstraint(fields=('patient', 'doctor'), name='unique_thread_per_patient_doctor'),
        ),
    ]
