import zoneinfo
from django.conf import settings as django_settings
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.views import APIView

from .permissions import IsPatient
from .serializers import PatientProfileSerializer, PatientNotificationSerializer
from doctor.models import Notification
from base.models import Appointment, MedicalRecord, LabOrder


class PatientProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = PatientProfileSerializer
    permission_classes = [IsPatient]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_object(self):
        return self.request.user.patient


class PatientStatsView(APIView):
    permission_classes = [IsPatient]

    def get(self, request):
        patient = request.user.patient

        total_appointments = Appointment.objects.filter(patient=patient).count()
        upcoming_appointments = Appointment.objects.filter(
            patient=patient, status__in=['Pending', 'Confirmed']
        ).count()
        completed_appointments = Appointment.objects.filter(patient=patient, status='Completed').count()
        total_medical_records = MedicalRecord.objects.filter(patient=patient).count()
        total_lab_results = LabOrder.objects.filter(
            medical_record__patient=patient, status='Completed'
        ).count()
        unread_notifications = Notification.objects.filter(patient=patient, is_read=False).count()

        return Response({
            'total_appointments': total_appointments,
            'upcoming_appointments': upcoming_appointments,
            'completed_appointments': completed_appointments,
            'total_medical_records': total_medical_records,
            'total_lab_results': total_lab_results,
            'unread_notifications': unread_notifications,
        })


class PatientNotificationListView(generics.ListAPIView):
    serializer_class = PatientNotificationSerializer
    permission_classes = [IsPatient]

    def get_queryset(self):
        qs = Notification.objects.filter(patient=self.request.user.patient)
        status_filter = self.request.query_params.get('status')
        if status_filter == 'unread':
            qs = qs.filter(is_read=False)
        elif status_filter == 'read':
            qs = qs.filter(is_read=True)
        return qs


class PatientNotificationMarkReadView(APIView):
    permission_classes = [IsPatient]

    def patch(self, request, sid):
        try:
            notification = Notification.objects.get(sid=sid, patient=request.user.patient)
            notification.is_read = True
            notification.save()
            return Response({'detail': 'Marked as read.'})
        except Notification.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)


class PatientNotificationMarkAllReadView(APIView):
    permission_classes = [IsPatient]

    def post(self, request):
        count = Notification.objects.filter(
            patient=request.user.patient, is_read=False
        ).update(is_read=True)
        return Response({'detail': f'{count} notifications marked as read.'})


class PatientNotificationDeleteView(APIView):
    permission_classes = [IsPatient]

    def delete(self, request, sid):
        try:
            notification = Notification.objects.get(sid=sid, patient=request.user.patient)
            notification.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Notification.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)


class PatientNotificationDeleteAllView(APIView):
    permission_classes = [IsPatient]

    def delete(self, request):
        count = Notification.objects.filter(patient=request.user.patient).delete()[0]
        return Response({'detail': f'{count} notifications deleted.'})
