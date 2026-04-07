from django.urls import path
from .views import (
    DoctorPaymentListView, DoctorPaymentStatsView,
    PatientPaymentListView, PatientPaymentStatsView,
)
from .payment_views import (
    CreateAppointmentWithPaymentView,
    StripeCheckoutView, StripeVerifyPaymentView, StripeWebhookView,
    PayPalCreateOrderView, PayPalCaptureOrderView,
    CancelPendingPaymentView,
)

urlpatterns = [
    path('doctor/payments/', DoctorPaymentListView.as_view(), name='doctor-payment-list'),
    path('doctor/payments/stats/', DoctorPaymentStatsView.as_view(), name='doctor-payment-stats'),
    path('patient/payments/', PatientPaymentListView.as_view(), name='patient-payment-list'),
    path('patient/payments/stats/', PatientPaymentStatsView.as_view(), name='patient-payment-stats'),

    # Payment flow
    path('payments/create-appointment/', CreateAppointmentWithPaymentView.as_view(), name='create-appointment-payment'),
    path('payments/stripe/checkout/', StripeCheckoutView.as_view(), name='stripe-checkout'),
    path('payments/stripe/verify/', StripeVerifyPaymentView.as_view(), name='stripe-verify'),
    path('payments/stripe/webhook/', StripeWebhookView.as_view(), name='stripe-webhook'),
    path('payments/paypal/create-order/', PayPalCreateOrderView.as_view(), name='paypal-create-order'),
    path('payments/paypal/capture-order/', PayPalCaptureOrderView.as_view(), name='paypal-capture-order'),
    path('payments/cancel/', CancelPendingPaymentView.as_view(), name='cancel-pending-payment'),
]