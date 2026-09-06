"""Secure messaging: patient <-> doctor, one thread per Appointment.

Hybrid storage, deliberately: Postgres owns thread/participant/read-state
metadata (none of it PHI); Medplum owns the actual message text and
attachments as FHIR `Communication`/`Binary` resources. `GET /threads/`
never returns message text or attachment info — only
`GET /threads/<sid>/messages/` does, since that's the one view that
actually needs it.
"""
from datetime import timedelta

from django.db import models as db_models
from django.http import HttpResponse
from django.utils import timezone

from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from doctor.models import Notification

from .models import Appointment, MessageThread, ThreadRead, ThreadMessage, open_message_thread_for_appointment
from .messaging_serializers import ThreadMessageCreateSerializer

from medplum.client import MedplumClient
from medplum.exceptions import MedplumError, MedplumUnavailable
from medplum.sync import ensure_patient_resource, ensure_practitioner_resource

MESSAGE_CATEGORY_SYSTEM = 'https://chohealth.co/fhir/message-category'
APPOINTMENT_IDENTIFIER_SYSTEM = 'https://chohealth.co/fhir/appointment-sid'
NOTIFY_DEBOUNCE = timedelta(minutes=15)

ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
ATTACHMENT_ALLOWED_TYPES = {
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
}

MESSAGING_UNAVAILABLE_RESPONSE = {
    'detail': 'Secure messaging is temporarily unavailable. Please try again shortly.',
    'code': 'messaging_unavailable',
}


# ============================================================================
# Helpers
# ============================================================================

def _get_thread_for_user(user, sid):
    """Return (thread, role) if `user` is a participant of thread `sid`,
    otherwise (None, None). Role is 'patient' or 'doctor'.
    """
    try:
        thread = MessageThread.objects.select_related('patient', 'doctor', 'appointment').get(sid=sid)
    except MessageThread.DoesNotExist:
        return None, None
    if hasattr(user, 'patient') and thread.patient_id == user.patient.id:
        return thread, 'patient'
    if hasattr(user, 'doctor') and thread.doctor_id == user.doctor.id:
        return thread, 'doctor'
    return None, None


def _my_threads(user):
    if hasattr(user, 'patient'):
        return MessageThread.objects.filter(patient=user.patient)
    if hasattr(user, 'doctor'):
        return MessageThread.objects.filter(doctor=user.doctor)
    return MessageThread.objects.none()


def _unread_count_for_thread(thread, user):
    read = thread.reads.filter(user=user).first()
    qs = thread.messages.exclude(sender_user=user)
    if read:
        qs = qs.filter(sent_at__gt=read.last_read_at)
    return qs.count()


def _serialize_thread(thread, user, role=None):
    if role is None:
        role = 'patient' if hasattr(user, 'patient') and thread.patient_id == user.patient.id else 'doctor'
    other_party_name = (
        f'Dr. {thread.doctor.first_name} {thread.doctor.first_last_name}' if role == 'patient'
        else thread.patient.full_name
    )
    return {
        'sid': thread.sid,
        'appointment_sid': thread.appointment.sid,
        'status': thread.status,
        'is_writable': thread.is_writable,
        'other_party_name': other_party_name,
        'last_message_at': thread.last_message_at,
        'message_count': thread.message_count,
        'unread_count': _unread_count_for_thread(thread, user),
        'my_role': role,
    }


def _parse_communication_payload(resource):
    """Extract (text, attachment) from a Communication's `payload` array.
    `attachment` is None when the message has no attachment.
    """
    text = ''
    attachment = None
    for item in resource.get('payload') or []:
        if 'contentString' in item:
            text = item['contentString']
        elif 'contentAttachment' in item:
            att = item['contentAttachment']
            attachment = {
                'content_type': att.get('contentType', ''),
                'filename': att.get('title', ''),
                'size': att.get('size'),
            }
    return text, attachment


def _fetch_message_details(messages):
    """Batch-fetch the FHIR Communication resources for `messages` and
    return {medplum_communication_id: {content, attachment}}. Raises
    MedplumUnavailable if Medplum can't be reached — callers must not
    silently show blank content.
    """
    ids = [m.medplum_communication_id for m in messages]
    if not ids:
        return {}
    client = MedplumClient()
    bundle = client.search('Communication', {'_id': ','.join(ids)})
    details = {}
    for entry in bundle.get('entry', []):
        resource = entry['resource']
        text, attachment = _parse_communication_payload(resource)
        details[resource['id']] = {'content': text, 'attachment': attachment}
    return details


def _serialize_message(message, details_for_message):
    attachment = details_for_message.get('attachment')
    return {
        'sid': message.sid,
        'sender_role': message.sender_role,
        'is_mine': message._is_mine,
        'has_attachments': message.has_attachments,
        'sent_at': message.sent_at,
        'content': details_for_message.get('content', ''),
        'attachment': {
            'filename': attachment['filename'],
            'content_type': attachment['content_type'],
            'size': attachment['size'],
            'download_url': f'/threads/{message.thread.sid}/messages/{message.sid}/attachment/',
        } if attachment else None,
    }


def _send_message(thread, role, content):
    patient_fhir_id = ensure_patient_resource(thread.patient)
    practitioner_fhir_id = ensure_practitioner_resource(thread.doctor)

    sender_ref = f'Patient/{patient_fhir_id}' if role == 'patient' else f'Practitioner/{practitioner_fhir_id}'
    recipient_ref = f'Practitioner/{practitioner_fhir_id}' if role == 'patient' else f'Patient/{patient_fhir_id}'

    client = MedplumClient()
    created = client.create('Communication', {
        'resourceType': 'Communication',
        'status': 'completed',
        'subject': {'reference': f'Patient/{patient_fhir_id}'},
        'sender': {'reference': sender_ref},
        'recipient': [{'reference': recipient_ref}],
        'sent': timezone.now().isoformat(),
        'payload': [{'contentString': content}],
        'category': [{'coding': [{'system': MESSAGE_CATEGORY_SYSTEM, 'code': 'secure-message'}]}],
        'identifier': [{'system': APPOINTMENT_IDENTIFIER_SYSTEM, 'value': thread.appointment.sid}],
    })
    return created['id']


def _send_attachment_message(thread, role, file_obj, caption):
    """Upload `file_obj` as a Medplum Binary, then create a Communication
    referencing it (plus an optional text caption). Returns
    (communication_id, binary_id).
    """
    patient_fhir_id = ensure_patient_resource(thread.patient)
    practitioner_fhir_id = ensure_practitioner_resource(thread.doctor)

    sender_ref = f'Patient/{patient_fhir_id}' if role == 'patient' else f'Practitioner/{practitioner_fhir_id}'
    recipient_ref = f'Practitioner/{practitioner_fhir_id}' if role == 'patient' else f'Patient/{patient_fhir_id}'

    client = MedplumClient()
    binary = client.create_binary(file_obj.read(), file_obj.content_type)
    binary_id = binary['id']

    payload = [{'contentAttachment': {
        'contentType': file_obj.content_type,
        'title': file_obj.name,
        'size': file_obj.size,
        'url': f'Binary/{binary_id}',
    }}]
    if caption:
        payload.append({'contentString': caption})

    created = client.create('Communication', {
        'resourceType': 'Communication',
        'status': 'completed',
        'subject': {'reference': f'Patient/{patient_fhir_id}'},
        'sender': {'reference': sender_ref},
        'recipient': [{'reference': recipient_ref}],
        'sent': timezone.now().isoformat(),
        'payload': payload,
        'category': [{'coding': [{'system': MESSAGE_CATEGORY_SYSTEM, 'code': 'secure-message'}]}],
        'identifier': [{'system': APPOINTMENT_IDENTIFIER_SYSTEM, 'value': thread.appointment.sid}],
    })
    return created['id'], binary_id


def _notify_new_message(thread, sender_role):
    recipient_user = thread.doctor.user if sender_role == 'patient' else thread.patient.user
    sender_name = (
        thread.patient.full_name if sender_role == 'patient'
        else f'Dr. {thread.doctor.first_name} {thread.doctor.first_last_name}'
    )

    recently_notified = Notification.objects.filter(
        recipient=recipient_user, type='New Message', appointment=thread.appointment,
        created_at__gte=timezone.now() - NOTIFY_DEBOUNCE,
    ).exists()
    if recently_notified:
        return

    Notification.objects.create(
        recipient=recipient_user,
        type='New Message',
        title='New secure message',
        message=f'{sender_name} sent you a new message.',
        appointment=thread.appointment,
    )


def _record_and_notify(thread, request, role, communication_id, *, has_attachments=False, attachment_binary_id=''):
    message = ThreadMessage.objects.create(
        thread=thread, sender_user=request.user, sender_role=role,
        medplum_communication_id=communication_id,
        has_attachments=has_attachments, attachment_binary_id=attachment_binary_id,
    )
    thread.last_message_at = message.sent_at
    thread.message_count = db_models.F('message_count') + 1
    thread.save(update_fields=['last_message_at', 'message_count'])

    ThreadRead.objects.update_or_create(thread=thread, user=request.user, defaults={})
    _notify_new_message(thread, sender_role=role)
    return message


# ============================================================================
# Views
# ============================================================================

class ThreadOpenView(APIView):
    """Idempotently open (or fetch) the messaging thread for an appointment.

    Threads are normally opened automatically when an appointment is
    confirmed; this endpoint exists as a manual fallback (e.g. appointments
    confirmed before this feature existed) and to let the frontend resolve
    "the thread for this appointment" in one call.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, sid):
        try:
            appointment = Appointment.objects.select_related('patient', 'doctor').get(sid=sid)
        except Appointment.DoesNotExist:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        is_owner = (
            (hasattr(user, 'patient') and appointment.patient_id == user.patient.id)
            or (hasattr(user, 'doctor') and appointment.doctor_id == user.doctor.id)
        )
        if not is_owner:
            return Response({'detail': 'Not your appointment.'}, status=status.HTTP_403_FORBIDDEN)

        if appointment.status not in ('Confirmed', 'In Progress', 'Completed'):
            return Response({'detail': 'This appointment has no messaging thread.'}, status=status.HTTP_400_BAD_REQUEST)

        thread = open_message_thread_for_appointment(appointment)
        if thread is None:
            return Response({'detail': 'This appointment has no doctor to message.'}, status=status.HTTP_400_BAD_REQUEST)

        return Response(_serialize_thread(thread, user))


class ThreadListView(APIView):
    """My inbox. Never returns message text — see module docstring."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        threads = _my_threads(request.user).select_related('patient', 'doctor', 'appointment')
        return Response([_serialize_thread(t, request.user) for t in threads])


class ThreadUnreadCountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        threads = _my_threads(request.user)
        total = sum(_unread_count_for_thread(t, request.user) for t in threads)
        return Response({'unread_count': total})


class ThreadMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, sid):
        thread, role = _get_thread_for_user(request.user, sid)
        if not thread:
            return Response({'detail': 'Thread not found.'}, status=status.HTTP_404_NOT_FOUND)
        ThreadRead.objects.update_or_create(thread=thread, user=request.user, defaults={})
        return Response({'detail': 'Marked as read.'})


class ThreadCloseView(APIView):
    """Doctor-only: end the conversation early, once they're confident all
    of the patient's questions about this visit are resolved. The automatic
    grace-period logic (`close_message_thread_for_appointment`) still runs
    independently when the appointment completes/cancels — this is just a
    manual override for "we're done here" before that window would expire.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, sid):
        thread, role = _get_thread_for_user(request.user, sid)
        if not thread:
            return Response({'detail': 'Thread not found.'}, status=status.HTTP_404_NOT_FOUND)
        if role != 'doctor':
            return Response({'detail': 'Only the doctor can close this conversation.'}, status=status.HTTP_403_FORBIDDEN)

        if thread.status != 'Closed':
            thread.status = 'Closed'
            thread.save(update_fields=['status'])

        return Response(_serialize_thread(thread, request.user, role))


class ThreadMessageListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, sid):
        thread, role = _get_thread_for_user(request.user, sid)
        if not thread:
            return Response({'detail': 'Thread not found.'}, status=status.HTTP_404_NOT_FOUND)

        messages = list(thread.messages.select_related('sender_user').all())

        try:
            details = _fetch_message_details(messages)
        except MedplumUnavailable:
            return Response(MESSAGING_UNAVAILABLE_RESPONSE, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except MedplumError:
            return Response({'detail': 'Could not load messages.'}, status=status.HTTP_502_BAD_GATEWAY)

        data = []
        for m in messages:
            m._is_mine = m.sender_user_id == request.user.id
            data.append(_serialize_message(m, details.get(m.medplum_communication_id, {})))

        ThreadRead.objects.update_or_create(thread=thread, user=request.user, defaults={})

        return Response({
            'thread': _serialize_thread(thread, request.user, role),
            'messages': data,
        })

    def post(self, request, sid):
        thread, role = _get_thread_for_user(request.user, sid)
        if not thread:
            return Response({'detail': 'Thread not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not thread.is_writable:
            return Response({'detail': 'This conversation is closed.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ThreadMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        content = serializer.validated_data['content']

        try:
            communication_id = _send_message(thread, role, content)
        except MedplumUnavailable:
            return Response(MESSAGING_UNAVAILABLE_RESPONSE, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except MedplumError:
            return Response({'detail': 'Could not send the message.'}, status=status.HTTP_502_BAD_GATEWAY)

        message = _record_and_notify(thread, request, role, communication_id)

        return Response({
            'sid': message.sid,
            'sender_role': message.sender_role,
            'is_mine': True,
            'has_attachments': False,
            'sent_at': message.sent_at,
            'content': content,
            'attachment': None,
        }, status=status.HTTP_201_CREATED)


class ThreadAttachmentUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request, sid):
        thread, role = _get_thread_for_user(request.user, sid)
        if not thread:
            return Response({'detail': 'Thread not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not thread.is_writable:
            return Response({'detail': 'This conversation is closed.'}, status=status.HTTP_400_BAD_REQUEST)

        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'detail': 'file is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if file_obj.content_type not in ATTACHMENT_ALLOWED_TYPES:
            return Response({'detail': 'Unsupported file type. Allowed: images and PDF.'}, status=status.HTTP_400_BAD_REQUEST)
        if file_obj.size > ATTACHMENT_MAX_BYTES:
            return Response({'detail': 'File is too large (max 10 MB).'}, status=status.HTTP_400_BAD_REQUEST)

        caption = (request.data.get('caption') or '').strip()

        try:
            communication_id, binary_id = _send_attachment_message(thread, role, file_obj, caption)
        except MedplumUnavailable:
            return Response(MESSAGING_UNAVAILABLE_RESPONSE, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except MedplumError:
            return Response({'detail': 'Could not send the attachment.'}, status=status.HTTP_502_BAD_GATEWAY)

        message = _record_and_notify(
            thread, request, role, communication_id,
            has_attachments=True, attachment_binary_id=binary_id,
        )

        return Response({
            'sid': message.sid,
            'sender_role': message.sender_role,
            'is_mine': True,
            'has_attachments': True,
            'sent_at': message.sent_at,
            'content': caption,
            'attachment': {
                'filename': file_obj.name,
                'content_type': file_obj.content_type,
                'size': file_obj.size,
                'download_url': f'/threads/{thread.sid}/messages/{message.sid}/attachment/',
            },
        }, status=status.HTTP_201_CREATED)


class ThreadAttachmentDownloadView(APIView):
    """Proxies the attachment's bytes from Medplum — never hands out a raw
    Medplum URL, so the same per-thread-participant check that gates the
    rest of the conversation also gates the file.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, sid, message_sid):
        thread, role = _get_thread_for_user(request.user, sid)
        if not thread:
            return Response({'detail': 'Thread not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            message = thread.messages.get(sid=message_sid)
        except ThreadMessage.DoesNotExist:
            return Response({'detail': 'Message not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not message.attachment_binary_id:
            return Response({'detail': 'This message has no attachment.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            content, content_type = MedplumClient().read_binary(message.attachment_binary_id)
        except MedplumUnavailable:
            return Response(MESSAGING_UNAVAILABLE_RESPONSE, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except MedplumError:
            return Response({'detail': 'Could not load the attachment.'}, status=status.HTTP_502_BAD_GATEWAY)

        return HttpResponse(content, content_type=content_type)
