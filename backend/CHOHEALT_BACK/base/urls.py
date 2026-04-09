from django.urls import path
from .views import (
    ServiceListView, ServiceDetailView,
    AppointmentCreateView, AppointmentListView,
    DoctorAppointmentListView, DoctorAppointmentDetailView,
    BranchListView,
)
from .medical_views import (
    DoctorAppointmentStatusUpdateView,
    MedicalRecordCreateView, PrescriptionCreateView, LabOrderCreateView,
    MedicationListView, LabTestListView,
    BookPrescribedLabAppointmentView,
    PrescriptionItemDeliveryStatusUpdateView,
    MedicationCatalogView, MedicineOrderCreateView,
    MedicineOrderListView, MedicineOrderDetailView,
)

urlpatterns = [
    path('services/', ServiceListView.as_view(), name='service-list'),
    path('services/<str:sid>/', ServiceDetailView.as_view(), name='service-detail'),
    path('appointments/', AppointmentCreateView.as_view(), name='appointment-create'),
    path('appointments/my/', AppointmentListView.as_view(), name='appointment-list'),
    path('appointments/doctor/', DoctorAppointmentListView.as_view(), name='doctor-appointment-list'),
    path('appointments/doctor/<str:sid>/status/', DoctorAppointmentStatusUpdateView.as_view(), name='doctor-appointment-status'),
    path('appointments/doctor/<str:sid>/medical-record/', MedicalRecordCreateView.as_view(), name='doctor-medical-record-create'),
    path('appointments/doctor/<str:sid>/', DoctorAppointmentDetailView.as_view(), name='doctor-appointment-detail'),
    path('appointments/book-prescribed-lab/', BookPrescribedLabAppointmentView.as_view(), name='book-prescribed-lab'),
    path('branches/', BranchListView.as_view(), name='branch-list'),

    # Medical workflow
    path('medical-records/<str:sid>/prescription/', PrescriptionCreateView.as_view(), name='prescription-create'),
    path('medical-records/<str:sid>/lab-order/', LabOrderCreateView.as_view(), name='lab-order-create'),
    path('medications/', MedicationListView.as_view(), name='medication-list'),
    path('lab-tests/', LabTestListView.as_view(), name='lab-test-list'),

    # Delivery management
    path('prescription-items/<str:sid>/delivery-status/', PrescriptionItemDeliveryStatusUpdateView.as_view(), name='delivery-status-update'),

    # Medicine shop (patient purchasing)
    path('medicine-catalog/', MedicationCatalogView.as_view(), name='medicine-catalog'),
    path('medicine-orders/', MedicineOrderCreateView.as_view(), name='medicine-order-create'),
    path('medicine-orders/my/', MedicineOrderListView.as_view(), name='medicine-order-list'),
    path('medicine-orders/<str:sid>/', MedicineOrderDetailView.as_view(), name='medicine-order-detail'),
]
