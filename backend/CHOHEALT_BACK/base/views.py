from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from .models import Service, Appointment, Branch
from .serializers import (
    ServiceListSerializer, ServiceDetailSerializer,
    AppointmentCreateSerializer, AppointmentListSerializer,
    DoctorAppointmentListSerializer, DoctorAppointmentDetailSerializer,
    BranchSerializer,
)


class ServiceListView(generics.ListAPIView):
    serializer_class = ServiceListSerializer
    permission_classes = [AllowAny]
    pagination_class = None
    queryset = Service.objects.filter(is_active=True).prefetch_related('doctors')


class ServiceDetailView(generics.RetrieveAPIView):
    serializer_class = ServiceDetailSerializer
    permission_classes = [AllowAny]
    queryset = Service.objects.filter(is_active=True).prefetch_related('doctors')
    lookup_field = 'sid'


class AppointmentCreateView(generics.CreateAPIView):
    serializer_class = AppointmentCreateSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        appointment = serializer.save()
        return Response(
            AppointmentListSerializer(appointment).data,
            status=status.HTTP_201_CREATED,
        )


class AppointmentListView(generics.ListAPIView):
    serializer_class = AppointmentListSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return Appointment.objects.filter(
            patient=self.request.user.patient
        ).select_related('doctor', 'service', 'branch')


class DoctorAppointmentListView(generics.ListAPIView):
    serializer_class = DoctorAppointmentListSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        date_param = self.request.query_params.get('date')
        month_param = self.request.query_params.get('month')
        qs = Appointment.objects.filter(
            doctor=self.request.user.doctor
        ).select_related('patient', 'patient__user', 'service', 'branch')

        if date_param:
            qs = qs.filter(date__date=date_param)
        elif month_param:
            try:
                year, month = map(int, month_param.split('-'))
                qs = qs.filter(date__year=year, date__month=month)
            except (ValueError, AttributeError):
                pass

        return qs


class DoctorAppointmentDetailView(generics.RetrieveAPIView):
    serializer_class = DoctorAppointmentDetailSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'sid'

    def get_queryset(self):
        return Appointment.objects.filter(
            doctor=self.request.user.doctor
        ).select_related('patient', 'patient__user', 'service', 'branch')


class BranchListView(generics.ListAPIView):
    serializer_class = BranchSerializer
    permission_classes = [AllowAny]
    pagination_class = None
    queryset = Branch.objects.filter(is_active=True)