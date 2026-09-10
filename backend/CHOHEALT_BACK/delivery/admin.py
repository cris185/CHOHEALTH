from django.contrib import admin
from .models import DeliveryPerson, DeliveryShift, DeliveryBreak, DeliveryOffer


class DeliveryBreakInline(admin.TabularInline):
    model = DeliveryBreak
    extra = 0


@admin.register(DeliveryPerson)
class DeliveryPersonAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'phone', 'on_duty_status', 'location_updated_at')
    search_fields = ('first_name', 'first_last_name', 'user__email', 'phone')
    list_filter = ('on_duty_status',)


@admin.register(DeliveryShift)
class DeliveryShiftAdmin(admin.ModelAdmin):
    list_display = ('delivery_person', 'clock_in_at', 'clock_out_at')
    search_fields = ('delivery_person__first_name', 'delivery_person__first_last_name')
    list_filter = ('clock_in_at',)
    inlines = [DeliveryBreakInline]


@admin.register(DeliveryOffer)
class DeliveryOfferAdmin(admin.ModelAdmin):
    list_display = ('delivery', 'delivery_person', 'status', 'offered_at', 'expires_at')
    search_fields = ('delivery_person__first_name', 'delivery_person__first_last_name', 'delivery__sid')
    list_filter = ('status',)
