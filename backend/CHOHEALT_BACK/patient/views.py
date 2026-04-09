from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.views import APIView

from .permissions import IsPatient
from .serializers import PatientProfileSerializer, PatientNotificationSerializer
from doctor.models import Notification
from base.models import Appointment, MedicalRecord, LabOrder, PrescriptionItem, Branch
from base.medical_serializers import (
    MedicalRecordListSerializer, MedicalRecordDetailSerializer,
    PrescriptionDetailSerializer, LabOrderDetailSerializer,
    LabResultDetailSerializer, DeliveryRequestSerializer,
)


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
            patient=patient, status__in=['Scheduled', 'Confirmed']
        ).count()
        completed_appointments = Appointment.objects.filter(patient=patient, status='Completed').count()
        total_medical_records = MedicalRecord.objects.filter(patient=patient).count()
        total_lab_results = LabOrder.objects.filter(
            medical_record__patient=patient, status='Completed'
        ).count()
        unread_notifications = Notification.objects.filter(recipient=request.user, is_read=False).count()

        return Response({
            'total_appointments': total_appointments,
            'upcoming_appointments': upcoming_appointments,
            'completed_appointments': completed_appointments,
            'total_medical_records': total_medical_records,
            'total_lab_results': total_lab_results,
            'unread_notifications': unread_notifications,
        })


# ============================================================================
# Notifications (recipient-based)
# ============================================================================

class PatientNotificationListView(generics.ListAPIView):
    serializer_class = PatientNotificationSerializer
    permission_classes = [IsPatient]

    def get_queryset(self):
        qs = Notification.objects.filter(recipient=self.request.user)
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
            notification = Notification.objects.get(sid=sid, recipient=request.user)
            notification.is_read = True
            notification.save()
            return Response({'detail': 'Marked as read.'})
        except Notification.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)


class PatientNotificationMarkAllReadView(APIView):
    permission_classes = [IsPatient]

    def post(self, request):
        count = Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({'detail': f'{count} notifications marked as read.'})


class PatientNotificationDeleteView(APIView):
    permission_classes = [IsPatient]

    def delete(self, request, sid):
        try:
            notification = Notification.objects.get(sid=sid, recipient=request.user)
            notification.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Notification.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)


class PatientNotificationDeleteAllView(APIView):
    permission_classes = [IsPatient]

    def delete(self, request):
        count = Notification.objects.filter(recipient=request.user).delete()[0]
        return Response({'detail': f'{count} notifications deleted.'})


# ============================================================================
# Medical Records, Prescriptions, Labs
# ============================================================================

class PatientMedicalRecordListView(generics.ListAPIView):
    serializer_class = MedicalRecordListSerializer
    permission_classes = [IsPatient]

    def get_queryset(self):
        return MedicalRecord.objects.filter(patient=self.request.user.patient).select_related('doctor')


class PatientMedicalRecordDetailView(generics.RetrieveAPIView):
    serializer_class = MedicalRecordDetailSerializer
    permission_classes = [IsPatient]
    lookup_field = 'sid'

    def get_queryset(self):
        return MedicalRecord.objects.filter(
            patient=self.request.user.patient
        ).select_related('doctor').prefetch_related('prescription__items', 'lab_orders__items__test')


class PatientLabOrderListView(generics.ListAPIView):
    serializer_class = LabOrderDetailSerializer
    permission_classes = [IsPatient]

    def get_queryset(self):
        return LabOrder.objects.filter(
            medical_record__patient=self.request.user.patient
        ).prefetch_related('items__test')


class PatientLabResultDetailView(generics.RetrieveAPIView):
    serializer_class = LabResultDetailSerializer
    permission_classes = [IsPatient]
    lookup_field = 'sid'

    def get_queryset(self):
        from base.models import LabResult
        return LabResult.objects.filter(
            lab_order_item__lab_order__medical_record__patient=self.request.user.patient
        )


class PrescriptionItemDeliveryRequestView(APIView):
    """Patient requests pickup or delivery for a system medication."""
    permission_classes = [IsPatient]

    def post(self, request, sid):
        try:
            item = PrescriptionItem.objects.get(
                sid=sid,
                prescription__medical_record__patient=request.user.patient,
            )
        except PrescriptionItem.DoesNotExist:
            return Response({'detail': 'Prescription item not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not item.is_system_medication:
            return Response({'detail': 'Only system medications support delivery.'}, status=status.HTTP_400_BAD_REQUEST)

        if item.delivery_method != 'external':
            return Response({'detail': 'Delivery already requested.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = DeliveryRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        item.delivery_method = serializer.validated_data['delivery_method']

        if item.delivery_method == 'pickup':
            try:
                branch = Branch.objects.get(sid=serializer.validated_data['branch_sid'], is_active=True)
                item.delivery_branch = branch
            except Branch.DoesNotExist:
                return Response({'detail': 'Branch not found.'}, status=status.HTTP_400_BAD_REQUEST)
        elif item.delivery_method == 'delivery':
            item.delivery_address = serializer.validated_data['delivery_address']

        item.delivery_status = 'pending'
        item.save()

        return Response({'detail': f'Delivery requested ({item.delivery_method}).'})
