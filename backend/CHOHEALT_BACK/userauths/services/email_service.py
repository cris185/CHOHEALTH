import base64
import logging
from pathlib import Path
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import (
    Mail, Attachment, FileContent, FileName, FileType, Disposition, ContentId,
)
from django.conf import settings

from .pdf_invoice import generate_invoice_pdf

logger = logging.getLogger(__name__)

LOGO_PATH = Path(__file__).resolve().parent.parent.parent / 'static' / 'logo.png'


def _get_logo_b64() -> str:
    """Return base64-encoded logo, cached at module level."""
    if not hasattr(_get_logo_b64, '_cache'):
        try:
            _get_logo_b64._cache = base64.b64encode(LOGO_PATH.read_bytes()).decode()
        except Exception:
            _get_logo_b64._cache = ''
    return _get_logo_b64._cache


def _logo_attachment() -> Attachment | None:
    """Create a SendGrid inline attachment for the logo (CID: logo)."""
    b64 = _get_logo_b64()
    if not b64:
        return None
    att = Attachment()
    att.file_content = FileContent(b64)
    att.file_name = FileName('logo.png')
    att.file_type = FileType('image/png')
    att.disposition = Disposition('inline')
    att.content_id = ContentId('logo')
    return att


def send_email(to_email, subject, html_content, attachments=None):
    """Send an email via SendGrid. Fire-and-forget — never raises."""
    message = Mail(
        from_email=settings.DEFAULT_FROM_EMAIL,
        to_emails=to_email,
        subject=subject,
        html_content=html_content,
    )
    if attachments:
        for att in attachments:
            message.add_attachment(att)
    try:
        sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
        response = sg.send(message)
        logger.info(f'Email sent to {to_email}, status={response.status_code}')
        return response
    except Exception as e:
        logger.error(f'Failed to send email to {to_email}: {e}')
        return None


def send_password_reset_email(user, token):
    """Send password reset email with a secure link."""
    reset_url = f'{settings.FRONTEND_URL}/reset-password?token={token}&email={user.email}'

    html = f'''
    <div style="font-family: Inter, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
            <img src="cid:logo" alt="CHO Health" style="height: 120px; width: auto; margin-bottom: 8px;" />
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; text-align: center;">
            <h2 style="color: #1e293b; font-size: 20px; margin: 0 0 8px;">Reset Your Password</h2>
            <p style="color: #64748b; font-size: 14px; margin: 0 0 24px; line-height: 1.6;">
                We received a request to reset your password. Click the button below to choose a new one.
            </p>

            <a href="{reset_url}" style="display: inline-block; background: #2563EB; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                Reset Password
            </a>

            <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; line-height: 1.5;">
                This link expires in 1 hour.<br>
                If you didn't request this, you can safely ignore this email.
            </p>
        </div>

        <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin-top: 24px;">
            &copy; {__import__("datetime").datetime.now().year} CHO Health. All rights reserved.
        </p>
    </div>
    '''

    send_email(
        to_email=user.email,
        subject='CHO Health - Reset Your Password',
        html_content=html,
        attachments=[a for a in [_logo_attachment()] if a],
    )


def send_appointment_confirmation_email(appointment, invoice):
    """Send appointment confirmation with PDF invoice attached."""
    patient = appointment.patient
    doctor = appointment.doctor
    service = appointment.service

    # Format appointment details
    appt_date = appointment.date.strftime('%A, %B %d, %Y')
    appt_time = appointment.date.strftime('%I:%M %p')
    doctor_name = f'Dr. {doctor.first_name} {doctor.first_last_name}' if doctor else 'Lab Service'
    mode = appointment.mode
    branch_info = ''
    if mode == 'In-Person' and appointment.branch:
        branch_info = f'''
        <tr>
            <td style="color: #64748b; padding: 6px 0; font-size: 14px;">Location</td>
            <td style="color: #1e293b; padding: 6px 0; font-size: 14px; text-align: right; font-weight: 500;">{appointment.branch.name}</td>
        </tr>
        <tr>
            <td style="color: #64748b; padding: 6px 0; font-size: 14px;">Address</td>
            <td style="color: #1e293b; padding: 6px 0; font-size: 14px; text-align: right; font-weight: 500;">{appointment.branch.address}</td>
        </tr>
        '''

    html = f'''
    <div style="font-family: Inter, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
            <img src="cid:logo" alt="CHO Health" style="height: 120px; width: auto; margin-bottom: 8px;" />
        </div>

        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
            <p style="color: #166534; font-size: 14px; font-weight: 600; margin: 0;">
                ✓ Your appointment has been confirmed!
            </p>
        </div>

        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
            Hi <strong>{patient.full_name}</strong>, your appointment has been successfully booked and payment received. Here are your details:
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="color: #64748b; padding: 6px 0; font-size: 14px;">Doctor</td>
                    <td style="color: #1e293b; padding: 6px 0; font-size: 14px; text-align: right; font-weight: 500;">{doctor_name}</td>
                </tr>
                <tr>
                    <td style="color: #64748b; padding: 6px 0; font-size: 14px;">Specialization</td>
                    <td style="color: #1e293b; padding: 6px 0; font-size: 14px; text-align: right; font-weight: 500;">{doctor.specialization if doctor else 'N/A'}</td>
                </tr>
                <tr>
                    <td style="color: #64748b; padding: 6px 0; font-size: 14px;">Service</td>
                    <td style="color: #1e293b; padding: 6px 0; font-size: 14px; text-align: right; font-weight: 500;">{service.name if service else "N/A"}</td>
                </tr>
                <tr>
                    <td style="color: #64748b; padding: 6px 0; font-size: 14px;">Date</td>
                    <td style="color: #1e293b; padding: 6px 0; font-size: 14px; text-align: right; font-weight: 500;">{appt_date}</td>
                </tr>
                <tr>
                    <td style="color: #64748b; padding: 6px 0; font-size: 14px;">Time</td>
                    <td style="color: #1e293b; padding: 6px 0; font-size: 14px; text-align: right; font-weight: 500;">{appt_time}</td>
                </tr>
                <tr>
                    <td style="color: #64748b; padding: 6px 0; font-size: 14px;">Mode</td>
                    <td style="color: #1e293b; padding: 6px 0; font-size: 14px; text-align: right; font-weight: 500;">{mode}</td>
                </tr>
                {branch_info}
            </table>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="color: #64748b; padding: 6px 0; font-size: 14px;">Invoice</td>
                    <td style="color: #1e293b; padding: 6px 0; font-size: 14px; text-align: right; font-weight: 600;">#{invoice.invoice_number}</td>
                </tr>
                <tr>
                    <td style="color: #64748b; padding: 6px 0; font-size: 14px;">Total Paid</td>
                    <td style="color: #166534; padding: 6px 0; font-size: 18px; text-align: right; font-weight: 700;">${invoice.total:.2f}</td>
                </tr>
            </table>
        </div>

        <p style="color: #94a3b8; font-size: 12px; text-align: center; line-height: 1.5;">
            Your invoice is attached to this email as a PDF.<br>
            You can also view your appointment details in your dashboard.
        </p>

        <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin-top: 24px;">
            &copy; {__import__("datetime").datetime.now().year} CHO Health. All rights reserved.
        </p>
    </div>
    '''

    # Generate PDF
    try:
        pdf_bytes = generate_invoice_pdf(invoice)
        encoded_pdf = base64.b64encode(pdf_bytes).decode()
        pdf_attachment = Attachment(
            FileContent(encoded_pdf),
            FileName(f'Invoice-{invoice.invoice_number}.pdf'),
            FileType('application/pdf'),
            Disposition('attachment'),
        )

        attachments = [a for a in [_logo_attachment(), pdf_attachment] if a]

        send_email(
            to_email=patient.user.email,
            subject=f'CHO Health - Appointment Confirmation & Invoice #{invoice.invoice_number}',
            html_content=html,
            attachments=attachments,
        )
    except Exception as e:
        logger.error(f'Failed to send appointment confirmation: {e}')
        # Still try to send without PDF
        send_email(
            to_email=patient.user.email,
            subject=f'CHO Health - Appointment Confirmation & Invoice #{invoice.invoice_number}',
            html_content=html,
            attachments=[a for a in [_logo_attachment()] if a],
        )


def send_appointment_cancellation_email(appointment, cancelled_by: str, refund_amount=None):
    """
    Send cancellation email to the patient.
    `cancelled_by` is one of 'patient' | 'doctor' | 'admin' | 'system'.
    `refund_amount` is a Decimal or None; if None, no refund line is shown.
    """
    patient = appointment.patient
    doctor = appointment.doctor
    service = appointment.service

    appt_date = appointment.date.strftime('%A, %B %d, %Y')
    appt_time = appointment.date.strftime('%I:%M %p')
    doctor_name = f'Dr. {doctor.first_name} {doctor.first_last_name}' if doctor else 'Lab Service'

    if cancelled_by == 'doctor':
        headline = 'Your appointment has been cancelled by the doctor'
        lead = f'Hi <strong>{patient.full_name}</strong>, we\'re sorry to inform you that {doctor_name} had to cancel your upcoming appointment. A full refund has been issued.'
    elif cancelled_by == 'patient':
        headline = 'Your appointment has been cancelled'
        lead = f'Hi <strong>{patient.full_name}</strong>, your appointment has been cancelled as requested.'
    else:
        headline = 'Your appointment has been cancelled'
        lead = f'Hi <strong>{patient.full_name}</strong>, your appointment has been cancelled.'

    refund_block = ''
    if refund_amount is not None:
        refund_amount_str = f'${refund_amount:.2f}'
        refund_note = 'Refunds typically take 5-10 business days to appear on your statement.' if refund_amount > 0 else 'No refund was issued per the cancellation policy (less than 24 hours notice).'
        refund_block = f'''
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="color: #64748b; padding: 6px 0; font-size: 14px;">Refund Amount</td>
                    <td style="color: {'#166534' if refund_amount > 0 else '#991b1b'}; padding: 6px 0; font-size: 18px; text-align: right; font-weight: 700;">{refund_amount_str}</td>
                </tr>
            </table>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 12px; line-height: 1.5;">{refund_note}</p>
        </div>
        '''

    html = f'''
    <div style="font-family: Inter, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
            <img src="cid:logo" alt="CHO Health" style="height: 120px; width: auto; margin-bottom: 8px;" />
        </div>

        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
            <p style="color: #991b1b; font-size: 14px; font-weight: 600; margin: 0;">
                {headline}
            </p>
        </div>

        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
            {lead}
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="color: #64748b; padding: 6px 0; font-size: 14px;">Doctor</td>
                    <td style="color: #1e293b; padding: 6px 0; font-size: 14px; text-align: right; font-weight: 500;">{doctor_name}</td>
                </tr>
                <tr>
                    <td style="color: #64748b; padding: 6px 0; font-size: 14px;">Service</td>
                    <td style="color: #1e293b; padding: 6px 0; font-size: 14px; text-align: right; font-weight: 500;">{service.name if service else "N/A"}</td>
                </tr>
                <tr>
                    <td style="color: #64748b; padding: 6px 0; font-size: 14px;">Date</td>
                    <td style="color: #1e293b; padding: 6px 0; font-size: 14px; text-align: right; font-weight: 500;">{appt_date}</td>
                </tr>
                <tr>
                    <td style="color: #64748b; padding: 6px 0; font-size: 14px;">Time</td>
                    <td style="color: #1e293b; padding: 6px 0; font-size: 14px; text-align: right; font-weight: 500;">{appt_time}</td>
                </tr>
            </table>
        </div>

        {refund_block}

        <p style="color: #94a3b8; font-size: 12px; text-align: center; line-height: 1.5;">
            You can book a new appointment anytime from your dashboard.
        </p>

        <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin-top: 24px;">
            &copy; {__import__("datetime").datetime.now().year} CHO Health. All rights reserved.
        </p>
    </div>
    '''

    send_email(
        to_email=patient.user.email,
        subject='CHO Health - Appointment Cancelled',
        html_content=html,
        attachments=[a for a in [_logo_attachment()] if a],
    )


def send_appointment_rescheduled_email(appointment, old_date, rescheduled_by: str):
    """
    Send rescheduled notification to the patient.
    `old_date` is the previous datetime (already timezone-aware).
    `rescheduled_by` is 'patient' | 'doctor' | 'admin'.
    """
    patient = appointment.patient
    doctor = appointment.doctor
    service = appointment.service

    old_date_str = old_date.strftime('%A, %B %d, %Y at %I:%M %p')
    new_date_str = appointment.date.strftime('%A, %B %d, %Y at %I:%M %p')
    doctor_name = f'Dr. {doctor.first_name} {doctor.first_last_name}' if doctor else 'Lab Service'

    if rescheduled_by == 'doctor':
        headline = 'Your appointment time has been changed by the doctor'
        lead = f'Hi <strong>{patient.full_name}</strong>, {doctor_name} has rescheduled your appointment to a new time. Please review the new details below.'
    else:
        headline = 'Your appointment has been rescheduled'
        lead = f'Hi <strong>{patient.full_name}</strong>, your appointment with {doctor_name} has been successfully rescheduled.'

    html = f'''
    <div style="font-family: Inter, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
            <img src="cid:logo" alt="CHO Health" style="height: 120px; width: auto; margin-bottom: 8px;" />
        </div>

        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
            <p style="color: #1d4ed8; font-size: 14px; font-weight: 600; margin: 0;">
                {headline}
            </p>
        </div>

        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
            {lead}
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
            <p style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">Previous Time</p>
            <p style="color: #94a3b8; font-size: 14px; text-decoration: line-through; margin: 0;">{old_date_str}</p>
        </div>

        <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <p style="color: #0369a1; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px; font-weight: 600;">New Time</p>
            <p style="color: #0c4a6e; font-size: 16px; font-weight: 600; margin: 0;">{new_date_str}</p>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="color: #64748b; padding: 6px 0; font-size: 14px;">Doctor</td>
                    <td style="color: #1e293b; padding: 6px 0; font-size: 14px; text-align: right; font-weight: 500;">{doctor_name}</td>
                </tr>
                <tr>
                    <td style="color: #64748b; padding: 6px 0; font-size: 14px;">Service</td>
                    <td style="color: #1e293b; padding: 6px 0; font-size: 14px; text-align: right; font-weight: 500;">{service.name if service else "N/A"}</td>
                </tr>
                <tr>
                    <td style="color: #64748b; padding: 6px 0; font-size: 14px;">Mode</td>
                    <td style="color: #1e293b; padding: 6px 0; font-size: 14px; text-align: right; font-weight: 500;">{appointment.mode}</td>
                </tr>
            </table>
        </div>

        <p style="color: #94a3b8; font-size: 12px; text-align: center; line-height: 1.5;">
            Your payment and invoice remain attached to this appointment.<br>
            You can view full details anytime in your dashboard.
        </p>

        <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin-top: 24px;">
            &copy; {__import__("datetime").datetime.now().year} CHO Health. All rights reserved.
        </p>
    </div>
    '''

    send_email(
        to_email=patient.user.email,
        subject='CHO Health - Appointment Rescheduled',
        html_content=html,
        attachments=[a for a in [_logo_attachment()] if a],
    )


def _medicine_invoice_pdf_attachment(invoice):
    """Generate the invoice PDF and wrap it as a SendGrid attachment.

    Returns None if generation fails — the caller should still send the email
    without the attachment instead of blocking the whole flow.
    """
    try:
        pdf_bytes = generate_invoice_pdf(invoice)
        att = Attachment()
        att.file_content = FileContent(base64.b64encode(pdf_bytes).decode())
        att.file_name = FileName(f'Invoice-{invoice.invoice_number}.pdf')
        att.file_type = FileType('application/pdf')
        att.disposition = Disposition('attachment')
        return att
    except Exception as e:
        logger.error(f'Failed to build medicine invoice PDF: {e}')
        return None


def send_medicine_order_pickup_email(order, qr_png_bytes: bytes, invoice=None):
    """Send the patient their pickup code and QR for a paid medicine order.

    The QR encodes the same `pickup_code` that the patient also sees in plain
    text — staff can either scan or type it at the branch. Fire-and-forget.
    When an `invoice` is provided, the PDF is attached so the patient also has
    a receipt for the purchase.
    """
    patient = order.patient
    code = order.pickup_code or ''
    branch_name = order.delivery_branch.name if order.delivery_branch else 'the selected branch'

    items_rows = ''
    for item in order.items.select_related('medication').all():
        strength = f' {item.medication.strength}' if item.medication.strength else ''
        line_total = f'${item.total:.2f}' if (item.unit_price or 0) > 0 else 'Free'
        items_rows += f'''
            <tr>
                <td style="color: #1e293b; padding: 6px 0; font-size: 14px;">{item.medication.name}{strength} &times;{item.quantity}</td>
                <td style="color: #64748b; padding: 6px 0; font-size: 14px; text-align: right;">{line_total}</td>
            </tr>
        '''

    html = f'''
    <div style="font-family: Inter, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
            <img src="cid:logo" alt="CHO Health" style="height: 120px; width: auto; margin-bottom: 8px;" />
        </div>

        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
            <p style="color: #166534; font-size: 14px; font-weight: 600; margin: 0;">
                ✓ Your medicine order is ready to pick up
            </p>
        </div>

        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
            Hi <strong>{patient.full_name}</strong>, your order is paid and ready to be picked up at
            <strong>{branch_name}</strong>. Show the QR code below (or type the pickup code) to our staff
            when you arrive and they will hand you your medication.
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <p style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px;">Pickup Code</p>
            <p style="color: #0f172a; font-family: 'Courier New', monospace; font-size: 24px; font-weight: 700; letter-spacing: 2px; margin: 0 0 20px;">{code}</p>
            <img src="cid:pickup_qr" alt="Pickup QR" style="width: 200px; height: 200px;" />
            <p style="color: #94a3b8; font-size: 11px; margin: 12px 0 0;">Scannable QR — same code as above</p>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <p style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">Items</p>
            <table style="width: 100%; border-collapse: collapse;">
                {items_rows}
                <tr>
                    <td style="color: #0f172a; padding: 12px 0 0; font-size: 14px; font-weight: 700; border-top: 1px solid #e2e8f0;">Total paid</td>
                    <td style="color: #166534; padding: 12px 0 0; font-size: 16px; text-align: right; font-weight: 700; border-top: 1px solid #e2e8f0;">${order.total:.2f}</td>
                </tr>
            </table>
        </div>

        <p style="color: #94a3b8; font-size: 12px; text-align: center; line-height: 1.5;">
            This code is unique to you. Keep it safe until you pick up your order.
        </p>

        <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin-top: 24px;">
            &copy; {__import__("datetime").datetime.now().year} CHO Health. All rights reserved.
        </p>
    </div>
    '''

    # Build the inline attachment for the QR (referenced via cid:pickup_qr).
    qr_attachment = Attachment()
    qr_attachment.file_content = FileContent(base64.b64encode(qr_png_bytes).decode())
    qr_attachment.file_name = FileName(f'pickup-{code}.png')
    qr_attachment.file_type = FileType('image/png')
    qr_attachment.disposition = Disposition('inline')
    qr_attachment.content_id = ContentId('pickup_qr')

    invoice_attachment = _medicine_invoice_pdf_attachment(invoice) if invoice else None
    attachments = [a for a in [_logo_attachment(), qr_attachment, invoice_attachment] if a]

    subject = (
        f'CHO Health - Pickup code {code} & Invoice #{invoice.invoice_number}'
        if invoice else
        f'CHO Health - Your pickup code {code}'
    )
    send_email(
        to_email=patient.user.email,
        subject=subject,
        html_content=html,
        attachments=attachments,
    )


def send_medicine_order_shipped_email(order, invoice):
    """Send the patient a shipping confirmation with the invoice PDF attached.

    Fires once a delivery-mode medicine order is paid — the patient gets the
    receipt plus a link back to the live tracking page. A second email is
    sent later (`send_medicine_delivery_completed_email`) when the courier
    actually hands the package over.
    """
    from django.conf import settings

    patient = order.patient
    address = order.delivery_address or ''
    branch_name = order.delivery_branch.name if order.delivery_branch else 'our warehouse'
    tracking_url = f'{settings.FRONTEND_URL}/dashboard/patient/delivery/{order.sid}'

    items_rows = ''
    for item in order.items.select_related('medication').all():
        strength = f' {item.medication.strength}' if item.medication.strength else ''
        line_total = f'${item.total:.2f}' if (item.unit_price or 0) > 0 else 'Covered'
        items_rows += f'''
            <tr>
                <td style="color: #1e293b; padding: 6px 0; font-size: 14px;">
                    {item.medication.name}{strength} &times;{item.quantity}
                </td>
                <td style="color: #64748b; padding: 6px 0; font-size: 14px; text-align: right;">{line_total}</td>
            </tr>
        '''

    shipping_row = ''
    if order.shipping_fee and order.shipping_fee > 0:
        shipping_row = f'''
            <tr>
                <td style="color: #1e293b; padding: 6px 0; font-size: 14px;">Shipping fee</td>
                <td style="color: #64748b; padding: 6px 0; font-size: 14px; text-align: right;">${order.shipping_fee:.2f}</td>
            </tr>
        '''

    html = f'''
    <div style="font-family: Inter, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
            <img src="cid:logo" alt="CHO Health" style="height: 120px; width: auto; margin-bottom: 8px;" />
        </div>

        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
            <p style="color: #1d4ed8; font-size: 14px; font-weight: 600; margin: 0;">
                Your medicine order is on its way
            </p>
        </div>

        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
            Hi <strong>{patient.full_name}</strong>, we received your payment and our courier is
            picking up your order from <strong>{branch_name}</strong>. We'll send another email
            as soon as it reaches your address.
        </p>

        <div style="text-align: center; margin: 28px 0;">
            <a href="{tracking_url}" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; display: inline-block;">
                Track your order
            </a>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <p style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">
                Delivering to
            </p>
            <p style="color: #0f172a; font-size: 14px; margin: 0;">{address}</p>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <p style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">Items</p>
            <table style="width: 100%; border-collapse: collapse;">
                {items_rows}
                {shipping_row}
                <tr>
                    <td style="color: #0f172a; padding: 12px 0 0; font-size: 14px; font-weight: 700; border-top: 1px solid #e2e8f0;">Total paid</td>
                    <td style="color: #166534; padding: 12px 0 0; font-size: 16px; text-align: right; font-weight: 700; border-top: 1px solid #e2e8f0;">${order.total:.2f}</td>
                </tr>
            </table>
        </div>

        <p style="color: #94a3b8; font-size: 12px; text-align: center; line-height: 1.5;">
            Your invoice is attached to this email as a PDF.
        </p>

        <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin-top: 24px;">
            &copy; {__import__("datetime").datetime.now().year} CHO Health. All rights reserved.
        </p>
    </div>
    '''

    invoice_attachment = _medicine_invoice_pdf_attachment(invoice) if invoice else None
    attachments = [a for a in [_logo_attachment(), invoice_attachment] if a]

    subject = (
        f'CHO Health - Your order is on its way - Invoice #{invoice.invoice_number}'
        if invoice else
        'CHO Health - Your order is on its way'
    )
    send_email(
        to_email=patient.user.email,
        subject=subject,
        html_content=html,
        attachments=attachments,
    )


def send_virtual_appointment_started_email(appointment):
    """Send the patient the meeting link for a virtual consultation the moment
    the doctor switches the appointment to 'In Progress'. Fire-and-forget.
    """
    patient = appointment.patient
    doctor = appointment.doctor
    link = appointment.meeting_link
    provider = appointment.meeting_provider or 'video call'

    doctor_name = f'Dr. {doctor.first_name} {doctor.first_last_name}' if doctor else 'Your doctor'
    service_name = appointment.service.name if appointment.service else 'consultation'
    when = appointment.date.strftime('%b %d, %Y at %I:%M %p')

    html = f'''
    <div style="font-family: Inter, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
            <img src="cid:logo" alt="CHO Health" style="height: 120px; width: auto; margin-bottom: 8px;" />
        </div>

        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
            <p style="color: #1d4ed8; font-size: 14px; font-weight: 600; margin: 0;">
                Your virtual consultation is ready
            </p>
        </div>

        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
            Hi <strong>{patient.full_name}</strong>, <strong>{doctor_name}</strong> has just started your
            {service_name} scheduled for {when}. Click the button below to join the meeting.
        </p>

        <div style="text-align: center; margin: 32px 0;">
            <a href="{link}" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; display: inline-block;">
                Join the consultation
            </a>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
            <p style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">
                Meeting link
            </p>
            <p style="color: #0f172a; font-size: 13px; word-break: break-all; margin: 0;">
                <a href="{link}" style="color: #2563eb; text-decoration: none;">{link}</a>
            </p>
            <p style="color: #94a3b8; font-size: 11px; margin: 12px 0 0;">Platform: {provider}</p>
        </div>

        <p style="color: #94a3b8; font-size: 12px; text-align: center; line-height: 1.5;">
            Make sure your microphone and camera are working before joining.
        </p>

        <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin-top: 24px;">
            &copy; {__import__("datetime").datetime.now().year} CHO Health. All rights reserved.
        </p>
    </div>
    '''

    attachments = [a for a in [_logo_attachment()] if a]

    send_email(
        to_email=patient.user.email,
        subject='CHO Health - Your virtual consultation is ready',
        html_content=html,
        attachments=attachments,
    )


def send_medicine_delivery_completed_email(order):
    """Email the patient once the courier marks a delivery order as
    Delivered. Lists the medications delivered and the destination address
    the patient provided at checkout. Fire-and-forget.
    """
    patient = order.patient
    delivery = getattr(order, 'delivery', None)
    address = delivery.address if delivery else order.delivery_address

    items_rows = ''
    for item in order.items.select_related('medication').all():
        strength = f' {item.medication.strength}' if item.medication.strength else ''
        items_rows += f'''
            <tr>
                <td style="color: #1e293b; padding: 6px 0; font-size: 14px;">
                    {item.medication.name}{strength} &times;{item.quantity}
                </td>
            </tr>
        '''

    html = f'''
    <div style="font-family: Inter, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
            <img src="cid:logo" alt="CHO Health" style="height: 120px; width: auto; margin-bottom: 8px;" />
        </div>

        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
            <p style="color: #166534; font-size: 14px; font-weight: 600; margin: 0;">
                ✓ Your medicine order has been delivered
            </p>
        </div>

        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
            Hi <strong>{patient.full_name}</strong>, our courier just dropped off your medicines at
            <strong>{address}</strong>. We hope you feel better soon!
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <p style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">
                Delivered items
            </p>
            <table style="width: 100%; border-collapse: collapse;">
                {items_rows}
            </table>
        </div>

        <p style="color: #94a3b8; font-size: 12px; text-align: center; line-height: 1.5;">
            If you didn't receive this order, reply to this email and we'll look into it right away.
        </p>

        <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin-top: 24px;">
            &copy; {__import__("datetime").datetime.now().year} CHO Health. All rights reserved.
        </p>
    </div>
    '''

    attachments = [a for a in [_logo_attachment()] if a]

    send_email(
        to_email=patient.user.email,
        subject='CHO Health - Your medicines have been delivered',
        html_content=html,
        attachments=attachments,
    )
