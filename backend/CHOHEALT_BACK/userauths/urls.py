from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import PatientRegisterView, DoctorRegisterView, LoginView, LogoutView, MeView

urlpatterns = [
    path('register/patient/', PatientRegisterView.as_view(), name='auth-register-patient'),
    path('register/doctor/', DoctorRegisterView.as_view(), name='auth-register-doctor'),
    path('login/', LoginView.as_view(), name='auth-login'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
    path('token/refresh/', TokenRefreshView.as_view(), name='auth-token-refresh'),
    path('me/', MeView.as_view(), name='auth-me'),
]