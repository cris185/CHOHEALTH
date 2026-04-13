"""PDF generator for a `Prescription`.

Returns raw bytes; the caller (view) wraps them in an HttpResponse with the
right Content-Disposition. Layout is inspired by Colombian EPS "Fórmula
Médica" documents but trimmed to the fields we actually store:
    - Header with logo + title + order number + date.
    - Patient block and clinic/doctor block side by side.
    - Diagnosis line.
    - Medications table (code, name, route, dosage, duration, indications).
    - Barcode + QR at the bottom with the prescription sid for traceability.
    - Electronic signature line for the prescribing doctor.
"""
from io import BytesIO
from pathlib import Path

import qrcode
from reportlab.graphics.barcode import code128
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    HRFlowable, Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)


LOGO_PATH = Path(__file__).resolve().parent.parent.parent / 'static' / 'logo.png'

BRAND_COLOR = colors.HexColor('#2563EB')
INK = colors.HexColor('#0f172a')
MUTED = colors.HexColor('#64748b')
RULE = colors.HexColor('#cbd5e1')
HEADER_BG = colors.HexColor('#f1f5f9')
ACCENT_BG = colors.HexColor('#eff6ff')


def _qr_image(payload: str, size_px: int = 80) -> Image:
    """Render the QR payload into a BytesIO Image usable by reportlab."""
    img = qrcode.make(payload, box_size=4, border=2)
    buf = BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return Image(buf, width=size_px, height=size_px)


def _short_code(sid: str) -> str:
    """Synthetic order number from the prescription sid. Uppercased, grouped."""
    s = sid.upper()
    return f'CHO-RX-{s[:4]}-{s[4:8]}'


def _styles():
    base = getSampleStyleSheet()
    styles = {
        'brand': ParagraphStyle(
            'brand', parent=base['Normal'], fontSize=18, fontName='Helvetica-Bold',
            textColor=BRAND_COLOR,
        ),
        'title': ParagraphStyle(
            'title', parent=base['Normal'], fontSize=16, fontName='Helvetica-Bold',
            alignment=TA_RIGHT, textColor=INK,
        ),
        'subtitle': ParagraphStyle(
            'subtitle', parent=base['Normal'], fontSize=9, fontName='Helvetica',
            alignment=TA_RIGHT, textColor=MUTED,
        ),
        'section': ParagraphStyle(
            'section', parent=base['Normal'], fontSize=8, fontName='Helvetica-Bold',
            textColor=MUTED, spaceBefore=0, spaceAfter=3,
        ),
        'info_label': ParagraphStyle(
            'info_label', parent=base['Normal'], fontSize=7.5, fontName='Helvetica',
            textColor=MUTED, leading=9,
        ),
        'info_value': ParagraphStyle(
            'info_value', parent=base['Normal'], fontSize=9.5, fontName='Helvetica-Bold',
            textColor=INK, leading=12,
        ),
        'diagnosis': ParagraphStyle(
            'diagnosis', parent=base['Normal'], fontSize=9.5, fontName='Helvetica',
            textColor=INK, leading=13,
        ),
        'th': ParagraphStyle(
            'th', parent=base['Normal'], fontSize=8, fontName='Helvetica-Bold',
            textColor=INK, leading=10,
        ),
        'td': ParagraphStyle(
            'td', parent=base['Normal'], fontSize=8.5, fontName='Helvetica',
            textColor=INK, leading=11,
        ),
        'td_bold': ParagraphStyle(
            'td_bold', parent=base['Normal'], fontSize=8.5, fontName='Helvetica-Bold',
            textColor=INK, leading=11,
        ),
        'footer': ParagraphStyle(
            'footer', parent=base['Normal'], fontSize=7.5, fontName='Helvetica',
            textColor=MUTED, alignment=TA_CENTER, leading=10,
        ),
        'signature_label': ParagraphStyle(
            'signature_label', parent=base['Normal'], fontSize=7.5, fontName='Helvetica',
            textColor=MUTED, alignment=TA_CENTER, leading=10,
        ),
        'signature_name': ParagraphStyle(
            'signature_name', parent=base['Normal'], fontSize=9, fontName='Helvetica-Bold',
            textColor=INK, alignment=TA_CENTER, leading=11,
        ),
    }
    return styles


def _info_cell(label: str, value: str, styles) -> Table:
    """Render a mini two-row block: small uppercase label + bold value."""
    return Table(
        [[Paragraph(label.upper(), styles['info_label'])],
         [Paragraph(value or '—', styles['info_value'])]],
        style=TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]),
    )


def _header(prescription, styles):
    order_code = _short_code(prescription.sid)
    issued = prescription.created_at

    logo_cell = Paragraph('CHO Health', styles['brand'])
    if LOGO_PATH.exists():
        logo_cell = Image(str(LOGO_PATH), width=0.9 * inch, height=0.9 * inch)

    right_cell = [
        Paragraph('MEDICAL PRESCRIPTION', styles['title']),
        Spacer(1, 10),
        Paragraph(
            f'<b>Order No.</b> {order_code}<br/>'
            f'<b>Date of visit:</b> {issued.strftime("%m/%d/%Y %H:%M")}',
            styles['subtitle'],
        ),
    ]

    return Table(
        [[logo_cell, right_cell]],
        colWidths=[3.25 * inch, 3.75 * inch],
        style=TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ]),
    )


def _patient_and_doctor_block(prescription, styles):
    """Two-column band: patient info on the left, doctor/clinic on the right."""
    record = prescription.medical_record
    patient = record.patient
    doctor = record.doctor

    patient_rows = [
        [_info_cell('Patient', patient.full_name, styles),
         _info_cell('Phone', patient.phone or '—', styles)],
        [_info_cell('Email', patient.user.email, styles),
         _info_cell('Gender', patient.gender or '—', styles)],
    ]
    if patient.date_of_birth:
        patient_rows.append([
            _info_cell('Date of birth', patient.date_of_birth.strftime('%m/%d/%Y'), styles),
            _info_cell('Blood type', patient.blood_group or '—', styles),
        ])

    patient_block = Table(
        [[Paragraph('PATIENT INFO', styles['section'])]] +
        [[Table([row], colWidths=[1.55 * inch, 1.55 * inch])] for row in patient_rows],
        colWidths=[3.2 * inch],
        style=TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]),
    )

    doctor_name = f'Dr. {doctor.first_name} {doctor.first_last_name}' if doctor else '—'
    doctor_rows = [
        [_info_cell('Doctor', doctor_name, styles),
         _info_cell('License', f'CHO-{doctor.sid[:6].upper()}' if doctor else '—', styles)],
        [_info_cell('Specialization', doctor.specialization if doctor else '—', styles),
         _info_cell('Years of exp.', str(doctor.years_of_experience) if doctor else '—', styles)],
    ]
    if record.appointment.branch:
        doctor_rows.append([
            _info_cell('Branch', record.appointment.branch.name, styles),
            _info_cell('Address', record.appointment.branch.address or '—', styles),
        ])

    doctor_block = Table(
        [[Paragraph('PROVIDER / BRANCH', styles['section'])]] +
        [[Table([row], colWidths=[1.55 * inch, 1.55 * inch])] for row in doctor_rows],
        colWidths=[3.2 * inch],
        style=TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]),
    )

    return Table(
        [[patient_block, doctor_block]],
        colWidths=[3.5 * inch, 3.5 * inch],
        style=TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOX', (0, 0), (-1, -1), 0.5, RULE),
            ('INNERGRID', (0, 0), (-1, -1), 0.3, RULE),
            ('BACKGROUND', (0, 0), (-1, -1), colors.white),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ]),
    )


def _diagnosis_band(record, styles):
    text = record.diagnosis or '—'
    return Table(
        [[Paragraph('<b>Diagnosis:</b> ' + text, styles['diagnosis'])]],
        colWidths=[7 * inch],
        style=TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), ACCENT_BG),
            ('BOX', (0, 0), (-1, -1), 0.5, RULE),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]),
    )


def _medications_table(prescription, styles):
    header = [
        Paragraph('Code', styles['th']),
        Paragraph('Medication / Presentation', styles['th']),
        Paragraph('Dosage', styles['th']),
        Paragraph('Frequency', styles['th']),
        Paragraph('Duration', styles['th']),
        Paragraph('Instructions', styles['th']),
    ]
    rows = [header]

    for idx, item in enumerate(prescription.items.all(), start=1):
        code = f'RX-{str(idx).zfill(3)}'
        name_html = f'<b>{item.medication_name}</b>'
        if item.medication and item.medication.generic_name:
            name_html += f'<br/><font size="7" color="#64748b">{item.medication.generic_name}</font>'
        if item.medication and item.medication.dosage_form:
            name_html += f'<br/><font size="7" color="#64748b">{item.medication.dosage_form}</font>'

        rows.append([
            Paragraph(code, styles['td']),
            Paragraph(name_html, styles['td']),
            Paragraph(item.dosage or '—', styles['td']),
            Paragraph(item.frequency or '—', styles['td']),
            Paragraph(f'{item.duration_days} days', styles['td']),
            Paragraph(item.instructions or '—', styles['td']),
        ])

    table = Table(
        rows,
        colWidths=[0.7 * inch, 2.1 * inch, 0.9 * inch, 1.1 * inch, 0.7 * inch, 1.5 * inch],
        repeatRows=1,
    )
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (0, 0), (0, -1), 'CENTER'),
        ('ALIGN', (4, 0), (4, -1), 'CENTER'),
        ('INNERGRID', (0, 0), (-1, -1), 0.3, RULE),
        ('BOX', (0, 0), (-1, -1), 0.5, RULE),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fafafa')]),
    ]))
    return table


def _traceability_band(prescription, styles):
    """Bottom band: barcode on the left, QR on the right, metadata in the middle."""
    payload = _short_code(prescription.sid)

    # Code128 is a Flowable — we can drop it straight into a Table cell.
    bc = code128.Code128(payload, barHeight=12 * mm, barWidth=0.4)

    qr_img = _qr_image(payload, size_px=80)

    meta = [
        Paragraph(f'<b>Order No.</b> {payload}', styles['td_bold']),
        Spacer(1, 4),
        Paragraph(
            f'Issued on {prescription.created_at.strftime("%m/%d/%Y %H:%M")}',
            styles['info_label'],
        ),
        Spacer(1, 2),
        Paragraph('Valid document. Keep this code to claim your medication.', styles['info_label']),
    ]

    return Table(
        [[bc, meta, qr_img]],
        colWidths=[2.6 * inch, 2.8 * inch, 1.6 * inch],
        style=TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (2, 0), (2, -1), 'RIGHT'),
            ('BOX', (0, 0), (-1, -1), 0.5, RULE),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ]),
    )


def _signature_band(prescription, styles):
    doctor = prescription.medical_record.doctor
    name = f'Dr. {doctor.first_name} {doctor.first_last_name}' if doctor else '—'
    specialization = doctor.specialization if doctor else ''

    return Table(
        [[
            Table(
                [[HRFlowable(width=2.6 * inch, thickness=0.7, color=INK)],
                 [Paragraph(name, styles['signature_name'])],
                 [Paragraph(specialization, styles['signature_label'])],
                 [Paragraph('Electronically signed', styles['signature_label'])]],
                colWidths=[2.6 * inch],
                style=TableStyle([
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('TOPPADDING', (0, 0), (-1, -1), 2),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
                ]),
            ),
        ]],
        colWidths=[7 * inch],
        style=TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ]),
    )


def generate_prescription_pdf(prescription) -> bytes:
    """Render the given `Prescription` as a PDF and return the bytes."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=32,
        bottomMargin=32,
    )
    styles = _styles()

    elements = []
    elements.append(_header(prescription, styles))
    elements.append(Spacer(1, 10))
    elements.append(HRFlowable(width='100%', thickness=1, color=RULE))
    elements.append(Spacer(1, 10))
    elements.append(_patient_and_doctor_block(prescription, styles))
    elements.append(Spacer(1, 10))
    elements.append(_diagnosis_band(prescription.medical_record, styles))
    elements.append(Spacer(1, 12))
    elements.append(Paragraph('PRESCRIBED MEDICATIONS', styles['section']))
    elements.append(Spacer(1, 4))
    elements.append(_medications_table(prescription, styles))

    if prescription.additional_notes:
        elements.append(Spacer(1, 8))
        elements.append(Paragraph(
            f'<b>Additional notes:</b> {prescription.additional_notes}',
            styles['diagnosis'],
        ))

    elements.append(Spacer(1, 16))
    elements.append(_signature_band(prescription, styles))
    elements.append(Spacer(1, 14))
    elements.append(_traceability_band(prescription, styles))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph(
        '© CHO Health — Document issued electronically. '
        'Keep the order code to claim your medication.',
        styles['footer'],
    ))

    doc.build(elements)
    return buffer.getvalue()
