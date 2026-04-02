from django.contrib import admin
from .models import Invoice, InvoiceLineItem, Payment, Refund, BillingDispute


class InvoiceLineItemInline(admin.TabularInline):
    model = InvoiceLineItem
    extra = 1
    readonly_fields = ('total',)


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    readonly_fields = ('gateway_charge_id', 'gateway_response')


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ('invoice_number', 'patient', 'total', 'amount_paid', 'balance_due', 'status', 'created_at')
    list_filter = ('status',)
    search_fields = ('invoice_number', 'sid', 'patient__first_name', 'patient__first_last_name')
    readonly_fields = ('sid', 'invoice_number', 'amount_paid', 'balance_due')
    inlines = [InvoiceLineItemInline, PaymentInline]


class RefundInline(admin.TabularInline):
    model = Refund
    extra = 0


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('sid', 'invoice', 'amount', 'payment_method', 'status', 'paid_at')
    list_filter = ('status', 'payment_method')
    search_fields = ('sid', 'gateway_charge_id', 'invoice__invoice_number')
    readonly_fields = ('gateway_charge_id', 'gateway_response')
    inlines = [RefundInline]


@admin.register(Refund)
class RefundAdmin(admin.ModelAdmin):
    list_display = ('sid', 'payment', 'amount', 'reason', 'status', 'processed_at')
    list_filter = ('status', 'reason')
    search_fields = ('sid', 'gateway_refund_id')


@admin.register(BillingDispute)
class BillingDisputeAdmin(admin.ModelAdmin):
    list_display = ('sid', 'invoice', 'filed_by', 'amount_disputed', 'reason', 'status', 'created_at')
    list_filter = ('status', 'reason')
    search_fields = ('sid', 'invoice__invoice_number')