from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from .models import Review


@receiver(post_save, sender=Review)
@receiver(post_delete, sender=Review)
def update_doctor_rating_aggregates(sender, instance, **kwargs):
    if instance.doctor_id:
        instance.doctor.recalculate_rating()
