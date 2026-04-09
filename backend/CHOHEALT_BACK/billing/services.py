from decimal import Decimal
from django.db import transaction
from .models import Invoice, InvoiceLineItem


@transaction.atomic
def create_invoice_for_appointment(appointment, tax_rate=Decimal('0')):
    """
    Creates a Draft invoice from a completed appointment.
    Snapshots current prices from Service and LabOrders.
    """
    invoice = Invoice.objects.create(
        appointment=appointment,
        patient=appointment.patient,
        tax_rate=tax_rate,
        status='Draft',
    )

    order = 0

    # Line item for the service
    if appointment.service:
        InvoiceLineItem.objects.create(
            invoice=invoice,
            description=appointment.service.name,
            quantity=1,
            unit_price=appointment.service.cost,
            total=appointment.service.cost,
            service=appointment.service,
            order=order,
        )
        order += 1

    # Line items for lab orders (iterate items within each order)
    if hasattr(appointment, 'medical_record'):
        for lab_order in appointment.medical_record.lab_orders.prefetch_related('items__test').all():
            for item in lab_order.items.all():
                InvoiceLineItem.objects.create(
                    invoice=invoice,
                    description=item.test.name,
                    quantity=1,
                    unit_price=item.test.cost,
                    total=item.test.cost,
                    lab_order_item=item,
                    order=order,
                )
                order += 1

    _recompute_totals(invoice)
    return invoice


def recompute_invoice_balance(invoice):
    """
    Recalculates amount_paid and balance_due based on completed payments and refunds.
    """
    completed_payments = invoice.payments.filter(status='Completed')
    total_paid = sum(p.amount for p in completed_payments)

    total_refunded = Decimal('0')
    for payment in completed_payments:
        total_refunded += sum(
            r.amount for r in payment.refunds.filter(status='Completed')
        )

    invoice.amount_paid = total_paid - total_refunded
    invoice.balance_due = invoice.total - invoice.amount_paid

    if invoice.status == 'Void':
        pass
    elif invoice.balance_due <= 0 and invoice.amount_paid > 0:
        invoice.status = 'Paid'
    elif invoice.amount_paid > 0:
        invoice.status = 'Partially Paid'
    elif invoice.status not in ('Draft',):
        invoice.status = 'Issued'

    invoice.save()


def _recompute_totals(invoice):
    """Recalculates subtotal, tax, total, and balance from line items."""
    line_items = invoice.line_items.all()
    invoice.subtotal = sum(item.total for item in line_items)
    taxable = invoice.subtotal - invoice.discount_amount
    invoice.tax_amount = (taxable * invoice.tax_rate).quantize(Decimal('0.01'))
    invoice.total = taxable + invoice.tax_amount
    invoice.balance_due = invoice.total - invoice.amount_paid
    invoice.save()
