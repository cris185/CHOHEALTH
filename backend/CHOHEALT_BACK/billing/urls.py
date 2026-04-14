from django.urls import path
from .views import (
    DoctorPaymentListView, DoctorPaymentStatsView,
    PatientPaymentListView, PatientPaymentStatsView,
)
from .payment_views import (
    CreateAppointmentWithPaymentView,
    StripeCheckoutView, StripeVerifyPaymentView, StripeWebhookView,
    StripeSavedCardPayView,
    PayPalCreateOrderView, PayPalCaptureOrderView,
    CancelPendingPaymentView,
    MedicineOrderStripeCheckoutView, MedicineOrderStripeVerifyView,
    MedicineOrderStripeSavedCardPayView,
    MedicineOrderPayPalCreateView, MedicineOrderPayPalCaptureView,
)
from .payment_methods_views import (
    SavedCardsListView, SaveCardSetupView,
    DeleteSavedCardView, SetDefaultCardView,
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
    path('payments/stripe/saved-card/', StripeSavedCardPayView.as_view(), name='stripe-saved-card-pay'),
    path('payments/paypal/create-order/', PayPalCreateOrderView.as_view(), name='paypal-create-order'),
    path('payments/paypal/capture-order/', PayPalCaptureOrderView.as_view(), name='paypal-capture-order'),
    path('payments/cancel/', CancelPendingPaymentView.as_view(), name='cancel-pending-payment'),

    # Medicine order payment flow (shares the same Stripe webhook as appointments,
    # which branches on metadata.kind == 'medicine_order')
    path('payments/medicine-order/stripe/checkout/', MedicineOrderStripeCheckoutView.as_view(), name='medicine-order-stripe-checkout'),
    path('payments/medicine-order/stripe/verify/', MedicineOrderStripeVerifyView.as_view(), name='medicine-order-stripe-verify'),
    path('payments/medicine-order/stripe/saved-card/', MedicineOrderStripeSavedCardPayView.as_view(), name='medicine-order-stripe-saved-card-pay'),
    path('payments/medicine-order/paypal/create-order/', MedicineOrderPayPalCreateView.as_view(), name='medicine-order-paypal-create'),
    path('payments/medicine-order/paypal/capture-order/', MedicineOrderPayPalCaptureView.as_view(), name='medicine-order-paypal-capture'),

    # Saved payment methods
    path('payment-methods/cards/', SavedCardsListView.as_view(), name='saved-cards-list'),
    path('payment-methods/setup/', SaveCardSetupView.as_view(), name='save-card-setup'),
    path('payment-methods/cards/<str:payment_method_id>/', DeleteSavedCardView.as_view(), name='delete-saved-card'),
    path('payment-methods/default/', SetDefaultCardView.as_view(), name='set-default-card'),
]