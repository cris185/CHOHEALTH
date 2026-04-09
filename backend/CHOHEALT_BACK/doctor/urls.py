from django.urls import path
from .views import (
    DoctorScheduleListView, AvailableDaysView, AvailableSlotsView,
    DoctorProfileView, DoctorStatsView,
    DoctorQualificationListCreateView, DoctorQualificationDeleteView,
    NotificationListView, NotificationMarkReadView,
    NotificationMarkAllReadView, NotificationDeleteView, NotificationDeleteAllView,
)

urlpatterns = [
    path('doctor/profile/', DoctorProfileView.as_view(), name='doctor-profile'),
    path('doctor/stats/', DoctorStatsView.as_view(), name='doctor-stats'),
    path('doctor/qualifications/', DoctorQualificationListCreateView.as_view(), name='doctor-qualifications'),
    path('doctor/qualifications/<str:sid>/', DoctorQualificationDeleteView.as_view(), name='doctor-qualification-delete'),

    # Notifications
    path('notifications/', NotificationListView.as_view(), name='notification-list'),
    path('notifications/mark-all-read/', NotificationMarkAllReadView.as_view(), name='notification-mark-all-read'),
    path('notifications/delete-all/', NotificationDeleteAllView.as_view(), name='notification-delete-all'),
    path('notifications/<str:sid>/read/', NotificationMarkReadView.as_view(), name='notification-mark-read'),
    path('notifications/<str:sid>/', NotificationDeleteView.as_view(), name='notification-delete'),

    path('doctors/<str:sid>/schedule/', DoctorScheduleListView.as_view(), name='doctor-schedule'),
    path('doctors/<str:sid>/available-days/', AvailableDaysView.as_view(), name='doctor-available-days'),
    path('doctors/<str:sid>/available-slots/', AvailableSlotsView.as_view(), name='doctor-available-slots'),
]
