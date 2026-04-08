from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT


def generate_invoice_pdf(invoice) -> bytes:
    """Generate a professional PDF invoice and return as bytes."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=50,
        leftMargin=50,
        topMargin=40,
        bottomMargin=40,
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='Brand', fontSize=24, fontName='Helvetica-Bold', textColor=colors.HexColor('#2563EB')))
    styles.add(ParagraphStyle(name='InvoiceTitle', fontSize=14, fontName='Helvetica-Bold', alignment=TA_RIGHT, textColor=colors.HexColor('#1e293b')))
    styles.add(ParagraphStyle(name='SectionTitle', fontSize=11, fontName='Helvetica-Bold', textColor=colors.HexColor('#1e293b'), spaceBefore=12))
    styles.add(ParagraphStyle(name='InfoText', fontSize=9, fontName='Helvetica', textColor=colors.HexColor('#64748b'), leading=14))
    styles.add(ParagraphStyle(name='FooterText', fontSize=8, fontName='Helvetica', textColor=colors.HexColor('#94a3b8'), alignment=TA_CENTER))

    elements = []

    # Header
    elements.append(Table(
        [[Paragraph('CHO Health', styles['Brand']), Paragraph('INVOICE', styles['InvoiceTitle'])]],
        colWidths=[3.5 * inch, 3.5 * inch],
    ))
    elements.append(Spacer(1, 4))
    elements.append(Table(
        [[Paragraph('Medical Appointment Management', styles['InfoText']),
          Paragraph(f'#{invoice.invoice_number}', ParagraphStyle('InvNum', fontSize=10, fontName='Helvetica-Bold', alignment=TA_RIGHT))]],
        colWidths=[3.5 * inch, 3.5 * inch],
    ))
    elements.append(Spacer(1, 8))
    elements.append(HRFlowable(width='100%', thickness=1, color=colors.HexColor('#e2e8f0')))
    elements.append(Spacer(1, 16))

    # Invoice info + Patient info
    issued = invoice.issued_at.strftime('%b %d, %Y') if invoice.issued_at else 'N/A'
    status = invoice.status

    info_data = [
        [Paragraph('<b>Bill To:</b>', styles['InfoText']), Paragraph('<b>Invoice Details:</b>', styles['InfoText'])],
        [Paragraph(invoice.patient.full_name, styles['InfoText']),
         Paragraph(f'Date: {issued}', styles['InfoText'])],
        [Paragraph(invoice.patient.user.email, styles['InfoText']),
         Paragraph(f'Status: {status}', styles['InfoText'])],
    ]
    if hasattr(invoice, 'appointment') and invoice.appointment:
        appt = invoice.appointment
        doctor_name = f'Dr. {appt.doctor.first_name} {appt.doctor.first_last_name}'
        info_data.append([
            Paragraph(f'Phone: {invoice.patient.phone or "N/A"}', styles['InfoText']),
            Paragraph(f'Doctor: {doctor_name}', styles['InfoText']),
        ])

    info_table = Table(info_data, colWidths=[3.5 * inch, 3.5 * inch])
    info_table.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    elements.append(info_table)
    elements.append(Spacer(1, 20))

    # Line items table
    elements.append(Paragraph('Services', styles['SectionTitle']))
    elements.append(Spacer(1, 8))

    line_items = invoice.line_items.all()
    table_data = [['Description', 'Qty', 'Unit Price', 'Total']]
    for item in line_items:
        table_data.append([
            item.description,
            str(item.quantity),
            f'${item.unit_price:.2f}',
            f'${item.total:.2f}',
        ])

    items_table = Table(table_data, colWidths=[3.5 * inch, 0.8 * inch, 1.2 * inch, 1.2 * inch])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#475569')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LINEBELOW', (0, 0), (-1, 0), 1, colors.HexColor('#e2e8f0')),
        ('LINEBELOW', (0, -1), (-1, -1), 1, colors.HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fafafa')]),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 16))

    # Totals
    totals_data = [
        ['', '', 'Subtotal:', f'${invoice.subtotal:.2f}'],
    ]
    if invoice.discount_amount > 0:
        totals_data.append(['', '', 'Discount:', f'-${invoice.discount_amount:.2f}'])
    if invoice.tax_amount > 0:
        totals_data.append(['', '', f'Tax ({invoice.tax_rate * 100:.1f}%):', f'${invoice.tax_amount:.2f}'])
    totals_data.append(['', '', 'Total:', f'${invoice.total:.2f}'])
    totals_data.append(['', '', 'Amount Paid:', f'${invoice.amount_paid:.2f}'])
    totals_data.append(['', '', 'Balance Due:', f'${invoice.balance_due:.2f}'])

    totals_table = Table(totals_data, colWidths=[3.5 * inch, 0.8 * inch, 1.2 * inch, 1.2 * inch])
    totals_table.setStyle(TableStyle([
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('FONTNAME', (2, -3), (2, -3), 'Helvetica-Bold'),
        ('FONTNAME', (3, -3), (3, -3), 'Helvetica-Bold'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LINEABOVE', (2, -3), (-1, -3), 1, colors.HexColor('#1e293b')),
    ]))
    elements.append(totals_table)
    elements.append(Spacer(1, 40))

    # Footer
    elements.append(HRFlowable(width='100%', thickness=0.5, color=colors.HexColor('#e2e8f0')))
    elements.append(Spacer(1, 8))
    elements.append(Paragraph('Thank you for choosing CHO Health', styles['FooterText']))
    elements.append(Paragraph('This is a computer-generated invoice and does not require a signature.', styles['FooterText']))

    doc.build(elements)
    return buffer.getvalue()
