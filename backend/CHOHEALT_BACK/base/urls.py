from django.urls import path
from .views import (
    ServiceListView, ServiceDetailView,
    AppointmentCreateView, AppointmentListView,
    DoctorAppointmentListView, DoctorAppointmentDetailView,
    BranchListView,
)
from .medical_views import (
    DoctorAppointmentStatusUpdateView, DoctorAppointmentCompleteView,
    MedicalRecordCreateView, PrescriptionCreateView, LabOrderCreateView,
    MedicationListView, LabTestListView, LabTestCatalogView,
    LabTestDetailView, BookDirectLabAppointmentView,
    BookPrescribedLabAppointmentView,
    PrescriptionItemDeliveryStatusUpdateView,
    MedicationCatalogView, MedicineOrderCreateView,
    MedicineOrderListView, MedicineOrderDetailView,
)
from .appointment_actions import (
    PatientAppointmentCancelView, PatientAppointmentRescheduleView,
    PatientAppointmentDeleteView,
    DoctorAppointmentCancelView, DoctorAppointmentRescheduleView,
)
from .delivery_views import (
    PrescriptionDeliveryCreateView, MedicineDeliveryTrackingView,
    PatientDeliveryListView,
)

urlpatterns = [
    path('services/', ServiceListView.as_view(), name='service-list'),
    path('services/<str:sid>/', ServiceDetailView.as_view(), name='service-detail'),
    path('appointments/', AppointmentCreateView.as_view(), name='appointment-create'),
    path('appointments/my/', AppointmentListView.as_view(), name='appointment-list'),
    path('appointments/doctor/', DoctorAppointmentListView.as_view(), name='doctor-appointment-list'),
    path('appointments/doctor/<str:sid>/status/', DoctorAppointmentStatusUpdateView.as_view(), name='doctor-appointment-status'),
    path('appointments/doctor/<str:sid>/complete/', DoctorAppointmentCompleteView.as_view(), name='doctor-appointment-complete'),
    path('appointments/doctor/<str:sid>/cancel/', DoctorAppointmentCancelView.as_view(), name='doctor-appointment-cancel'),
    path('appointments/doctor/<str:sid>/reschedule/', DoctorAppointmentRescheduleView.as_view(), name='doctor-appointment-reschedule'),
    path('appointments/doctor/<str:sid>/medical-record/', MedicalRecordCreateView.as_view(), name='doctor-medical-record-create'),
    path('appointments/doctor/<str:sid>/', DoctorAppointmentDetailView.as_view(), name='doctor-appointment-detail'),
    path('appointments/<str:sid>/cancel/', PatientAppointmentCancelView.as_view(), name='patient-appointment-cancel'),
    path('appointments/<str:sid>/reschedule/', PatientAppointmentRescheduleView.as_view(), name='patient-appointment-reschedule'),
    path('appointments/<str:sid>/delete/', PatientAppointmentDeleteView.as_view(), name='patient-appointment-delete'),
    path('appointments/book-prescribed-lab/', BookPrescribedLabAppointmentView.as_view(), name='book-prescribed-lab'),
    path('branches/', BranchListView.as_view(), name='branch-list'),

    # Medical workflow
    path('medical-records/<str:sid>/prescription/', PrescriptionCreateView.as_view(), name='prescription-create'),
    path('medical-records/<str:sid>/lab-order/', LabOrderCreateView.as_view(), name='lab-order-create'),
    path('medications/', MedicationListView.as_view(), name='medication-list'),
    path('lab-tests/', LabTestListView.as_view(), name='lab-test-list'),
    path('lab-tests-catalog/', LabTestCatalogView.as_view(), name='lab-test-catalog'),
    path('lab-tests-catalog/<str:sid>/', LabTestDetailView.as_view(), name='lab-test-detail'),
    path('lab-tests/book/', BookDirectLabAppointmentView.as_view(), name='lab-test-book-direct'),

    # Delivery management
    path('prescription-items/<str:sid>/delivery-status/', PrescriptionItemDeliveryStatusUpdateView.as_view(), name='delivery-status-update'),

    # Medicine shop (patient purchasing)
    path('medicine-catalog/', MedicationCatalogView.as_view(), name='medicine-catalog'),
    path('medicine-orders/', MedicineOrderCreateView.as_view(), name='medicine-order-create'),
    path('medicine-orders/my/', MedicineOrderListView.as_view(), name='medicine-order-list'),
    path('medicine-orders/<str:sid>/', MedicineOrderDetailView.as_view(), name='medicine-order-detail'),

    # Delivery (bundled shipping)
    path('prescriptions/<str:sid>/delivery/', PrescriptionDeliveryCreateView.as_view(), name='prescription-delivery-create'),
    path('medicine-orders/<str:sid>/tracking/', MedicineDeliveryTrackingView.as_view(), name='medicine-order-tracking'),
    path('deliveries/', PatientDeliveryListView.as_view(), name='patient-delivery-list'),
]
