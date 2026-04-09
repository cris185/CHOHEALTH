import shortuuid
from django.db import models
from django.conf import settings
from django.utils import timezone


# ============================================================================
# Invoice
# ============================================================================

INVOICE_STATUS = (
    ('Draft', 'Draft'),
    ('Issued', 'Issued'),
    ('Partially Paid', 'Partially Paid'),
    ('Paid', 'Paid'),
    ('Void', 'Void'),
    ('Refunded', 'Refunded'),
)


class Invoice(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    invoice_number = models.CharField(max_length=20, unique=True, editable=False)
    appointment = models.OneToOneField('base.Appointment', on_delete=models.PROTECT, related_name='invoice')
    patient = models.ForeignKey('patient.Patient', on_delete=models.PROTECT, related_name='invoices')

    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=4, default=0)
    tax_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    balance_due = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    status = models.CharField(max_length=20, choices=INVOICE_STATUS, default='Draft')
    notes = models.TextField(blank=True)
    issued_at = models.DateTimeField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            self.invoice_number = self._generate_invoice_number()
        super().save(*args, **kwargs)

    @staticmethod
    def _generate_invoice_number():
        today = timezone.now().strftime('%Y%m%d')
        prefix = f'INV-{today}-'
        last = Invoice.objects.filter(invoice_number__startswith=prefix).order_by('-invoice_number').first()
        if last:
            last_seq = int(last.invoice_number.split('-')[-1])
            seq = last_seq + 1
        else:
            seq = 1
        return f'{prefix}{seq:04d}'

    def __str__(self):
        return f'{self.invoice_number} - {self.patient.full_name}'


# ============================================================================
# Invoice Line Item (snapshot de precios)
# ============================================================================

class InvoiceLineItem(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='line_items')
    description = models.CharField(max_length=300)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total = models.DecimalField(max_digits=10, decimal_places=2)

    service = models.ForeignKey('base.Service', on_delete=models.SET_NULL, null=True, blank=True)
    lab_order_item = models.ForeignKey('base.LabOrderItem', on_delete=models.SET_NULL, null=True, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def save(self, *args, **kwargs):
        self.total = self.quantity * self.unit_price
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.description} x{self.quantity} = {self.total}'


# ============================================================================
# Payment
# ============================================================================

PAYMENT_METHOD = (
    ('cash', 'Cash'),
    ('card', 'Card'),
    ('bank_transfer', 'Bank Transfer'),
    ('stripe', 'Stripe'),
    ('paypal', 'PayPal'),
    ('other', 'Other'),
)

PAYMENT_STATUS = (
    ('Pending', 'Pending'),
    ('Completed', 'Completed'),
    ('Failed', 'Failed'),
)


class Payment(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name='payments')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_method = models.CharField(max_length=30, choices=PAYMENT_METHOD)
    gateway_charge_id = models.CharField(max_length=255, blank=True)
    gateway_response = models.JSONField(default=dict, blank=True)

    status = models.CharField(max_length=20, choices=PAYMENT_STATUS, default='Pending')
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)

    def __str__(self):
        return f'Payment {self.sid[:8]} - {self.amount} ({self.status})'


# ============================================================================
# Refund
# ============================================================================

REFUND_REASON = (
    ('appointment_cancelled', 'Appointment Cancelled'),
    ('patient_request', 'Patient Request'),
    ('billing_error', 'Billing Error'),
    ('duplicate_charge', 'Duplicate Charge'),
    ('service_not_rendered', 'Service Not Rendered'),
    ('other', 'Other'),
)

REFUND_STATUS = (
    ('Pending', 'Pending'),
    ('Completed', 'Completed'),
    ('Rejected', 'Rejected'),
)


class Refund(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name='refunds')
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    reason = models.CharField(max_length=50, choices=REFUND_REASON)
    reason_detail = models.TextField(blank=True)
    gateway_refund_id = models.CharField(max_length=255, blank=True)
    gateway_response = models.JSONField(default=dict, blank=True)

    status = models.CharField(max_length=20, choices=REFUND_STATUS, default='Pending')
    processed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    def clean(self):
        from django.core.exceptions import ValidationError
        completed_refunds = self.payment.refunds.filter(status='Completed').exclude(pk=self.pk)
        total_refunded = sum(r.amount for r in completed_refunds)
        if self.status == 'Completed' and (total_refunded + self.amount) > self.payment.amount:
            raise ValidationError('Total refunds cannot exceed the payment amount.')

    def __str__(self):
        return f'Refund {self.sid[:8]} - {self.amount} ({self.status})'


# ============================================================================
# Billing Dispute
# ============================================================================

DISPUTE_REASON = (
    ('incorrect_charge', 'Incorrect Charge'),
    ('service_not_received', 'Service Not Received'),
    ('duplicate_charge', 'Duplicate Charge'),
    ('quality_issue', 'Quality Issue'),
    ('other', 'Other'),
)

DISPUTE_STATUS = (
    ('Open', 'Open'),
    ('Under Review', 'Under Review'),
    ('Resolved', 'Resolved'),
    ('Closed', 'Closed'),
)


class BillingDispute(models.Model):
    sid = models.CharField(max_length=22, unique=True, default=shortuuid.uuid, editable=False)
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name='disputes')
    filed_by = models.ForeignKey('patient.Patient', on_delete=models.PROTECT, related_name='billing_disputes')
    amount_disputed = models.DecimalField(max_digits=10, decimal_places=2)

    reason = models.CharField(max_length=50, choices=DISPUTE_REASON)
    description = models.TextField()

    status = models.CharField(max_length=20, choices=DISPUTE_STATUS, default='Open')
    resolution_notes = models.TextField(blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    refund = models.ForeignKey(Refund, on_delete=models.SET_NULL, null=True, blank=True, related_name='dispute')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f'Dispute {self.sid[:8]} - {self.invoice.invoice_number} ({self.status})'
