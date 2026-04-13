"""PDF generator for a `LabOrder`.

Same visual language as `pdf_prescription.py` — we reuse its styling helpers
so both documents look like a coherent document family in the patient's
download folder.
"""
from io import BytesIO

from reportlab.graphics.barcode import code128
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

from .pdf_prescription import (
    _qr_image, _styles, _header as _prescription_header, _patient_and_doctor_block,
    _diagnosis_band, _signature_band, HEADER_BG, RULE, INK,
)


def _short_code(sid: str) -> str:
    s = sid.upper()
    return f'CHO-LAB-{s[:4]}-{s[4:8]}'


def _lab_header(lab_order, styles):
    """Identical layout to the Rx header but with a Lab-specific title."""
    # We borrow the Rx header and mutate the title at call time: easier to
    # just inline here so the order number shows the LAB prefix.
    from reportlab.lib.units import inch as _inch
    from reportlab.platypus import Image
    from pathlib import Path

    LOGO_PATH = Path(__file__).resolve().parent.parent.parent / 'static' / 'logo.png'

    order_code = _short_code(lab_order.sid)
    issued = lab_order.ordered_at

    logo_cell = Paragraph('CHO Health', styles['brand'])
    if LOGO_PATH.exists():
        logo_cell = Image(str(LOGO_PATH), width=0.9 * _inch, height=0.9 * _inch)

    right_cell = [
        Paragraph('LAB TEST ORDER', styles['title']),
        Spacer(1, 10),
        Paragraph(
            f'<b>Order No.</b> {order_code}<br/>'
            f'<b>Order date:</b> {issued.strftime("%m/%d/%Y %H:%M")}',
            styles['subtitle'],
        ),
    ]

    return Table(
        [[logo_cell, right_cell]],
        colWidths=[3.25 * _inch, 3.75 * _inch],
        style=TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ]),
    )


def _tests_table(lab_order, styles):
    header = [
        Paragraph('Code', styles['th']),
        Paragraph('Test', styles['th']),
        Paragraph('Category', styles['th']),
        Paragraph('Preparation / Notes', styles['th']),
    ]
    rows = [header]

    for idx, item in enumerate(lab_order.items.select_related('test').all(), start=1):
        code = f'LAB-{str(idx).zfill(3)}'
        name_html = f'<b>{item.test.name}</b>'
        if item.test.description:
            # Clip the description so rows stay reasonable.
            desc = item.test.description
            if len(desc) > 120:
                desc = desc[:117] + '…'
            name_html += f'<br/><font size="7" color="#64748b">{desc}</font>'

        rows.append([
            Paragraph(code, styles['td']),
            Paragraph(name_html, styles['td']),
            Paragraph(item.test.category, styles['td']),
            Paragraph(item.notes or '—', styles['td']),
        ])

    table = Table(
        rows,
        colWidths=[0.8 * inch, 2.8 * inch, 1.2 * inch, 2.2 * inch],
        repeatRows=1,
    )
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (0, 0), (0, -1), 'CENTER'),
        ('INNERGRID', (0, 0), (-1, -1), 0.3, RULE),
        ('BOX', (0, 0), (-1, -1), 0.5, RULE),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#fafafa')]),
    ]))
    return table


def _lab_traceability_band(lab_order, styles):
    payload = _short_code(lab_order.sid)

    bc = code128.Code128(payload, barHeight=12 * mm, barWidth=0.4)

    qr_img = _qr_image(payload, size_px=80)

    meta = [
        Paragraph(f'<b>Order No.</b> {payload}', styles['td_bold']),
        Spacer(1, 4),
        Paragraph(
            f'Issued on {lab_order.ordered_at.strftime("%m/%d/%Y %H:%M")}',
            styles['info_label'],
        ),
        Spacer(1, 2),
        Paragraph('Show this code to the laboratory staff.', styles['info_label']),
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


def generate_lab_order_pdf(lab_order) -> bytes:
    """Render the given `LabOrder` as a PDF and return the bytes."""
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
    elements.append(_lab_header(lab_order, styles))
    elements.append(Spacer(1, 10))
    elements.append(HRFlowable(width='100%', thickness=1, color=RULE))
    elements.append(Spacer(1, 10))

    # The prescription helper already knows how to read a `Prescription`
    # record — we pass the fake adapter so it renders patient + doctor info
    # against the LabOrder's medical_record instead.
    # Simplest path: construct a lightweight wrapper that exposes the same
    # attributes the helper reads (`medical_record` and `created_at`).
    class _RxLike:
        def __init__(self, order):
            self.medical_record = order.medical_record
            self.created_at = order.ordered_at
            self.sid = order.sid
            self.items = []
            self.additional_notes = ''

    elements.append(_patient_and_doctor_block(_RxLike(lab_order), styles))
    elements.append(Spacer(1, 10))
    elements.append(_diagnosis_band(lab_order.medical_record, styles))
    elements.append(Spacer(1, 12))
    elements.append(Paragraph('REQUESTED TESTS', styles['section']))
    elements.append(Spacer(1, 4))
    elements.append(_tests_table(lab_order, styles))

    if lab_order.notes:
        elements.append(Spacer(1, 8))
        elements.append(Paragraph(
            f'<b>Additional notes:</b> {lab_order.notes}',
            styles['diagnosis'],
        ))

    elements.append(Spacer(1, 16))
    elements.append(_signature_band(_RxLike(lab_order), styles))
    elements.append(Spacer(1, 14))
    elements.append(_lab_traceability_band(lab_order, styles))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph(
        '© CHO Health — Document issued electronically. '
        'Keep the order code to pick up your results.',
        styles['footer'],
    ))

    doc.build(elements)
    return buffer.getvalue()
