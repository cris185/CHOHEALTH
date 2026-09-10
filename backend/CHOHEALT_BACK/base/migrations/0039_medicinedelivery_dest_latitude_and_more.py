from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('base', '0038_medicinedelivery_simplify_stages'),
    ]

    operations = [
        migrations.AddField(
            model_name='medicinedelivery',
            name='dest_latitude',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True),
        ),
        migrations.AddField(
            model_name='medicinedelivery',
            name='dest_longitude',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True),
        ),
    ]
