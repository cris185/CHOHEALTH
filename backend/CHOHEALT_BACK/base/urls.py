from django.urls import path
from .views import (
    ServiceListView, ServiceDetailView,
    AppointmentCreateView, AppointmentListView,
    DoctorAppointmentListView, DoctorAppointmentDetailView,
    BranchListView,
)

urlpatterns = [
    path('services/', ServiceListView.as_view(), name='service-list'),
    path('services/<str:sid>/', ServiceDetailView.as_view(), name='service-detail'),
    path('appointments/', AppointmentCreateView.as_view(), name='appointment-create'),
    path('appointments/my/', AppointmentListView.as_view(), name='appointment-list'),
    path('appointments/doctor/', DoctorAppointmentListView.as_view(), name='doctor-appointment-list'),
    path('appointments/doctor/<str:sid>/', DoctorAppointmentDetailView.as_view(), name='doctor-appointment-detail'),
    path('branches/', BranchListView.as_view(), name='branch-list'),
]