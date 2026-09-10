from django.urls import path

from .views import AdminUserListView, AdminDeliveryListView, AdminUserDeliveryHistoryView, AdminAssignCourierView

urlpatterns = [
    path('admin/users/', AdminUserListView.as_view(), name='admin-users'),
    path('admin/users/<str:sid>/deliveries/', AdminUserDeliveryHistoryView.as_view(), name='admin-user-deliveries'),
    path('admin/deliveries/', AdminDeliveryListView.as_view(), name='admin-deliveries'),
    path('admin/deliveries/<str:sid>/assign/', AdminAssignCourierView.as_view(), name='admin-assign-courier'),
]
