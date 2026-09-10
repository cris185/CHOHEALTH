from django.urls import path
from .views import (
    DeliveryPersonProfileView,
    ClockInView, ClockOutView, BreakStartView, BreakEndView,
    LocationPingView,
    MyPendingOfferView, DeliveryOfferAcceptView, DeliveryOfferDeclineView,
    MyDeliveriesView,
)

urlpatterns = [
    path('delivery/profile/', DeliveryPersonProfileView.as_view(), name='delivery-profile'),
    path('delivery/clock-in/', ClockInView.as_view(), name='delivery-clock-in'),
    path('delivery/clock-out/', ClockOutView.as_view(), name='delivery-clock-out'),
    path('delivery/break/start/', BreakStartView.as_view(), name='delivery-break-start'),
    path('delivery/break/end/', BreakEndView.as_view(), name='delivery-break-end'),
    path('delivery/location/', LocationPingView.as_view(), name='delivery-location-ping'),
    path('delivery/offers/mine/', MyPendingOfferView.as_view(), name='delivery-offer-mine'),
    path('delivery/offers/<str:sid>/accept/', DeliveryOfferAcceptView.as_view(), name='delivery-offer-accept'),
    path('delivery/offers/<str:sid>/decline/', DeliveryOfferDeclineView.as_view(), name='delivery-offer-decline'),
    path('delivery/deliveries/', MyDeliveriesView.as_view(), name='delivery-my-deliveries'),
]
