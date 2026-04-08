import base64
import logging
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import (
    Mail, Attachment, FileContent, FileName, FileType, Disposition,
)
from django.conf import settings

from .pdf_invoice import generate_invoice_pdf

logger = logging.getLogger(__name__)


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
            <div style="display: inline-block; background: #2563EB; border-radius: 12px; padding: 10px; margin-bottom: 12px;">
                <span style="color: white; font-size: 20px;">❤</span>
            </div>
            <h1 style="color: #1e293b; font-size: 22px; margin: 0;">CHO Health</h1>
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
    )


def send_appointment_confirmation_email(appointment, invoice):
    """Send appointment confirmation with PDF invoice attached."""
    patient = appointment.patient
    doctor = appointment.doctor
    service = appointment.service

    # Format appointment details
    appt_date = appointment.date.strftime('%A, %B %d, %Y')
    appt_time = appointment.date.strftime('%I:%M %p')
    doctor_name = f'Dr. {doctor.first_name} {doctor.first_last_name}'
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
            <div style="display: inline-block; background: #2563EB; border-radius: 12px; padding: 10px; margin-bottom: 12px;">
                <span style="color: white; font-size: 20px;">❤</span>
            </div>
            <h1 style="color: #1e293b; font-size: 22px; margin: 0;">CHO Health</h1>
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
                    <td style="color: #1e293b; padding: 6px 0; font-size: 14px; text-align: right; font-weight: 500;">{doctor.specialization}</td>
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
        attachment = Attachment(
            FileContent(encoded_pdf),
            FileName(f'Invoice-{invoice.invoice_number}.pdf'),
            FileType('application/pdf'),
            Disposition('attachment'),
        )

        send_email(
            to_email=patient.user.email,
            subject=f'CHO Health - Appointment Confirmation & Invoice #{invoice.invoice_number}',
            html_content=html,
            attachments=[attachment],
        )
    except Exception as e:
        logger.error(f'Failed to send appointment confirmation: {e}')
        # Still try to send without PDF
        send_email(
            to_email=patient.user.email,
            subject=f'CHO Health - Appointment Confirmation & Invoice #{invoice.invoice_number}',
            html_content=html,
        )
