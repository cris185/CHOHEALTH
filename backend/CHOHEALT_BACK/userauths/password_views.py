import uuid
import hashlib
import time

from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError

from .models import User
from .serializers import PasswordResetRequestSerializer, PasswordResetConfirmSerializer
from .services.email_service import send_password_reset_email


class PasswordResetRequestView(APIView):
    """Request a password reset email."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']

        try:
            user = User.objects.get(email=email)
            # Generate token
            token = str(uuid.uuid4())
            hashed = hashlib.sha256(token.encode()).hexdigest()
            timestamp = str(int(time.time()))
            user.otp = f'{hashed}|{timestamp}'
            user.save(update_fields=['otp'])

            # Send email
            send_password_reset_email(user, token)
        except User.DoesNotExist:
            pass  # Don't reveal if email exists

        return Response({
            'detail': 'If an account with that email exists, a reset link has been sent.',
        })


class PasswordResetConfirmView(APIView):
    """Confirm password reset with token."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        token = serializer.validated_data['token']
        new_password = serializer.validated_data['new_password']

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({'detail': 'Invalid reset link.'}, status=status.HTTP_400_BAD_REQUEST)

        if not user.otp:
            return Response({'detail': 'Invalid or expired reset link.'}, status=status.HTTP_400_BAD_REQUEST)

        # Parse stored OTP
        try:
            stored_hash, timestamp_str = user.otp.split('|')
        except ValueError:
            return Response({'detail': 'Invalid reset link.'}, status=status.HTTP_400_BAD_REQUEST)

        # Verify token
        incoming_hash = hashlib.sha256(token.encode()).hexdigest()
        if incoming_hash != stored_hash:
            return Response({'detail': 'Invalid reset link.'}, status=status.HTTP_400_BAD_REQUEST)

        # Check expiry
        expiry_seconds = settings.PASSWORD_RESET_TOKEN_EXPIRY_HOURS * 3600
        if time.time() - float(timestamp_str) > expiry_seconds:
            user.otp = None
            user.save(update_fields=['otp'])
            return Response({'detail': 'Reset link has expired. Please request a new one.'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate password
        try:
            validate_password(new_password, user)
        except ValidationError as e:
            return Response({'detail': e.messages}, status=status.HTTP_400_BAD_REQUEST)

        # Set new password
        user.set_password(new_password)
        user.otp = None
        user.save()

        return Response({'detail': 'Password has been reset successfully.'})
