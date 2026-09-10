from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('base', '0039_medicinedelivery_dest_latitude_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='medicineorder',
            name='delivery_latitude',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True),
        ),
        migrations.AddField(
            model_name='medicineorder',
            name='delivery_longitude',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True),
        ),
    ]
