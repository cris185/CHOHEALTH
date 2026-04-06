from django.db.models import Sum
from django.utils import timezone
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from doctor.permissions import IsDoctor
from patient.permissions import IsPatient
from .models import Payment, Invoice
from .serializers import DoctorPaymentSerializer, PatientPaymentSerializer


class DoctorPaymentListView(generics.ListAPIView):
    serializer_class = DoctorPaymentSerializer
    permission_classes = [IsDoctor]

    def get_queryset(self):
        return Payment.objects.filter(
            invoice__appointment__doctor=self.request.user.doctor
        ).select_related('invoice', 'invoice__patient', 'invoice__appointment', 'invoice__appointment__service').order_by('-created_at')


class DoctorPaymentStatsView(APIView):
    permission_classes = [IsDoctor]

    def get(self, request):
        doctor = request.user.doctor
        now = timezone.now()

        total_revenue = Payment.objects.filter(
            invoice__appointment__doctor=doctor, status='Completed'
        ).aggregate(total=Sum('amount'))['total'] or 0

        this_month_revenue = Payment.objects.filter(
            invoice__appointment__doctor=doctor, status='Completed',
            paid_at__year=now.year, paid_at__month=now.month,
        ).aggregate(total=Sum('amount'))['total'] or 0

        pending_amount = Invoice.objects.filter(
            appointment__doctor=doctor, status__in=['Issued', 'Partially Paid']
        ).aggregate(total=Sum('balance_due'))['total'] or 0

        return Response({
            'total_revenue': total_revenue,
            'this_month_revenue': this_month_revenue,
            'pending_amount': pending_amount,
        })


class PatientPaymentListView(generics.ListAPIView):
    serializer_class = PatientPaymentSerializer
    permission_classes = [IsPatient]

    def get_queryset(self):
        return Payment.objects.filter(
            invoice__patient=self.request.user.patient
        ).select_related('invoice', 'invoice__appointment', 'invoice__appointment__doctor', 'invoice__appointment__service').order_by('-created_at')


class PatientPaymentStatsView(APIView):
    permission_classes = [IsPatient]

    def get(self, request):
        patient = request.user.patient
        now = timezone.now()

        total_paid = Payment.objects.filter(
            invoice__patient=patient, status='Completed'
        ).aggregate(total=Sum('amount'))['total'] or 0

        this_month_paid = Payment.objects.filter(
            invoice__patient=patient, status='Completed',
            paid_at__year=now.year, paid_at__month=now.month,
        ).aggregate(total=Sum('amount'))['total'] or 0

        pending_amount = Invoice.objects.filter(
            patient=patient, status__in=['Issued', 'Partially Paid']
        ).aggregate(total=Sum('balance_due'))['total'] or 0

        return Response({
            'total_paid': total_paid,
            'this_month_paid': this_month_paid,
            'pending_amount': pending_amount,
        })
