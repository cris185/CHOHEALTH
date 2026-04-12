from datetime import datetime
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.views import APIView

from django.conf import settings as django_settings
from django.db.models import Avg, Sum
from django.utils import timezone

from .models import Doctor, DoctorQualification, DoctorSchedule, Notification
from .serializers import DoctorScheduleSerializer, DoctorProfileSerializer, DoctorQualificationSerializer, DoctorQualificationCreateSerializer, NotificationSerializer
from .permissions import IsDoctor
from .utils import get_available_slots, get_available_days
from base.models import Service, Appointment, Review
from billing.models import Invoice


class DoctorScheduleListView(generics.ListAPIView):
    serializer_class = DoctorScheduleSerializer
    permission_classes = [AllowAny]
    pagination_class = None

    def get_queryset(self):
        doctor = Doctor.objects.get(sid=self.kwargs['sid'])
        return DoctorSchedule.objects.filter(doctor=doctor, is_active=True)


class AvailableDaysView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, sid):
        month_str = request.query_params.get('month')
        service_sid = request.query_params.get('service_sid')

        if not month_str or not service_sid:
            return Response({'detail': 'month and service_sid are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            year, month = map(int, month_str.split('-'))
            doctor = Doctor.objects.get(sid=sid)
            service = Service.objects.get(sid=service_sid)
        except (ValueError, Doctor.DoesNotExist, Service.DoesNotExist):
            return Response({'detail': 'Invalid parameters.'}, status=status.HTTP_400_BAD_REQUEST)

        days = get_available_days(doctor, year, month, service)
        return Response(days)


class AvailableSlotsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, sid):
        date_str = request.query_params.get('date')
        service_sid = request.query_params.get('service_sid')

        if not date_str or not service_sid:
            return Response({'detail': 'date and service_sid are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            date = datetime.strptime(date_str, '%Y-%m-%d').date()
            doctor = Doctor.objects.get(sid=sid)
            service = Service.objects.get(sid=service_sid)
        except (ValueError, Doctor.DoesNotExist, Service.DoesNotExist):
            return Response({'detail': 'Invalid parameters.'}, status=status.HTTP_400_BAD_REQUEST)

        result = get_available_slots(doctor, date, service)
        return Response({'date': date_str, **result})


class DoctorProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = DoctorProfileSerializer
    permission_classes = [IsDoctor]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_object(self):
        return self.request.user.doctor


class DoctorQualificationListCreateView(generics.ListCreateAPIView):
    """List and create doctor qualifications."""
    permission_classes = [IsDoctor]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = None

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return DoctorQualificationCreateSerializer
        return DoctorQualificationSerializer

    def get_queryset(self):
        return DoctorQualification.objects.filter(doctor=self.request.user.doctor)

    def perform_create(self, serializer):
        serializer.save(doctor=self.request.user.doctor)


class DoctorQualificationDeleteView(APIView):
    """Delete a doctor qualification."""
    permission_classes = [IsDoctor]

    def delete(self, request, sid):
        try:
            qualification = DoctorQualification.objects.get(sid=sid, doctor=request.user.doctor)
            qualification.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except DoctorQualification.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)


class DoctorStatsView(APIView):
    permission_classes = [IsDoctor]

    def get(self, request):
        doctor = request.user.doctor
        import zoneinfo
        tz = zoneinfo.ZoneInfo(django_settings.TIME_ZONE)
        today = timezone.now().astimezone(tz).date()

        total_appointments = Appointment.objects.filter(doctor=doctor).count()
        today_appointments = Appointment.objects.filter(
            doctor=doctor, date__date=today, status='Confirmed'
        ).count()
        completed_appointments = Appointment.objects.filter(doctor=doctor, status='Completed').count()
        pending_appointments = Appointment.objects.filter(
            doctor=doctor, status='Confirmed'
        ).count()
        total_patients = Appointment.objects.filter(doctor=doctor).values('patient').distinct().count()

        rating_data = Review.objects.filter(doctor=doctor).aggregate(avg=Avg('rating'))
        total_reviews = Review.objects.filter(doctor=doctor).count()

        total_revenue = Invoice.objects.filter(
            appointment__doctor=doctor, status='Paid'
        ).aggregate(total=Sum('total'))['total']

        unread_notifications = Notification.objects.filter(recipient=request.user, is_read=False).count()

        return Response({
            'total_appointments': total_appointments,
            'today_appointments': today_appointments,
            'completed_appointments': completed_appointments,
            'pending_appointments': pending_appointments,
            'total_patients': total_patients,
            'average_rating': rating_data['avg'],
            'total_reviews': total_reviews,
            'total_revenue': total_revenue or 0,
            'unread_notifications': unread_notifications,
        })


# ============================================================================
# Notifications (recipient-based, works for any user type)
# ============================================================================

class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [IsDoctor]

    def get_queryset(self):
        qs = Notification.objects.filter(recipient=self.request.user)
        status_filter = self.request.query_params.get('status')
        if status_filter == 'unread':
            qs = qs.filter(is_read=False)
        elif status_filter == 'read':
            qs = qs.filter(is_read=True)
        return qs


class NotificationMarkReadView(APIView):
    permission_classes = [IsDoctor]

    def patch(self, request, sid):
        try:
            notification = Notification.objects.get(sid=sid, recipient=request.user)
            notification.is_read = True
            notification.save()
            return Response({'detail': 'Marked as read.'})
        except Notification.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)


class NotificationMarkAllReadView(APIView):
    permission_classes = [IsDoctor]

    def post(self, request):
        count = Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({'detail': f'{count} notifications marked as read.'})


class NotificationDeleteView(APIView):
    permission_classes = [IsDoctor]

    def delete(self, request, sid):
        try:
            notification = Notification.objects.get(sid=sid, recipient=request.user)
            notification.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Notification.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)


class NotificationDeleteAllView(APIView):
    permission_classes = [IsDoctor]

    def delete(self, request):
        count = Notification.objects.filter(recipient=request.user).delete()[0]
        return Response({'detail': f'{count} notifications deleted.'})
