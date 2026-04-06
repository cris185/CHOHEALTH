from django.urls import path
from .views import (
    PatientProfileView, PatientStatsView,
    PatientNotificationListView, PatientNotificationMarkReadView,
    PatientNotificationMarkAllReadView, PatientNotificationDeleteView,
    PatientNotificationDeleteAllView,
)

urlpatterns = [
    path('patient/profile/', PatientProfileView.as_view(), name='patient-profile'),
    path('patient/stats/', PatientStatsView.as_view(), name='patient-stats'),

    # Notifications — fixed paths BEFORE <sid>
    path('patient/notifications/', PatientNotificationListView.as_view(), name='patient-notification-list'),
    path('patient/notifications/mark-all-read/', PatientNotificationMarkAllReadView.as_view(), name='patient-notification-mark-all-read'),
    path('patient/notifications/delete-all/', PatientNotificationDeleteAllView.as_view(), name='patient-notification-delete-all'),
    path('patient/notifications/<str:sid>/read/', PatientNotificationMarkReadView.as_view(), name='patient-notification-mark-read'),
    path('patient/notifications/<str:sid>/', PatientNotificationDeleteView.as_view(), name='patient-notification-delete'),
]
