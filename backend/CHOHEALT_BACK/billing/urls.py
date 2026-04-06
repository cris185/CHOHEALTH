from django.urls import path
from .views import (
    DoctorPaymentListView, DoctorPaymentStatsView,
    PatientPaymentListView, PatientPaymentStatsView,
)

urlpatterns = [
    path('doctor/payments/', DoctorPaymentListView.as_view(), name='doctor-payment-list'),
    path('doctor/payments/stats/', DoctorPaymentStatsView.as_view(), name='doctor-payment-stats'),
    path('patient/payments/', PatientPaymentListView.as_view(), name='patient-payment-list'),
    path('patient/payments/stats/', PatientPaymentStatsView.as_view(), name='patient-payment-stats'),
]
