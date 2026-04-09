from django.urls import path
from .views import (
    PatientProfileView, PatientStatsView,
    PatientNotificationListView, PatientNotificationMarkReadView,
    PatientNotificationMarkAllReadView, PatientNotificationDeleteView,
    PatientNotificationDeleteAllView,
    PatientMedicalRecordListView, PatientMedicalRecordDetailView,
    PatientLabOrderListView, PatientLabResultDetailView,
    PrescriptionItemDeliveryRequestView,
)

urlpatterns = [
    path('patient/profile/', PatientProfileView.as_view(), name='patient-profile'),
    path('patient/stats/', PatientStatsView.as_view(), name='patient-stats'),

    # Notifications
    path('patient/notifications/', PatientNotificationListView.as_view(), name='patient-notification-list'),
    path('patient/notifications/mark-all-read/', PatientNotificationMarkAllReadView.as_view(), name='patient-notification-mark-all-read'),
    path('patient/notifications/delete-all/', PatientNotificationDeleteAllView.as_view(), name='patient-notification-delete-all'),
    path('patient/notifications/<str:sid>/read/', PatientNotificationMarkReadView.as_view(), name='patient-notification-mark-read'),
    path('patient/notifications/<str:sid>/', PatientNotificationDeleteView.as_view(), name='patient-notification-delete'),

    # Medical records, prescriptions, labs
    path('patient/medical-records/', PatientMedicalRecordListView.as_view(), name='patient-medical-records'),
    path('patient/medical-records/<str:sid>/', PatientMedicalRecordDetailView.as_view(), name='patient-medical-record-detail'),
    path('patient/lab-orders/', PatientLabOrderListView.as_view(), name='patient-lab-orders'),
    path('patient/lab-results/<str:sid>/', PatientLabResultDetailView.as_view(), name='patient-lab-result-detail'),
    path('patient/prescription-items/<str:sid>/request-delivery/', PrescriptionItemDeliveryRequestView.as_view(), name='delivery-request'),
]
