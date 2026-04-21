from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny

from patient.permissions import IsPatient
from doctor.models import Doctor
from .models import Appointment, Review
from .serializers import (
    ReviewSerializer, ReviewCreateSerializer, PendingReviewAppointmentSerializer,
)


class DoctorReviewsListView(generics.ListAPIView):
    """Public list of reviews for a doctor. Shown on the booking page so
    prospective patients can read what others say."""
    serializer_class = ReviewSerializer
    permission_classes = [AllowAny]
    pagination_class = None

    def get_queryset(self):
        doctor_sid = self.kwargs['sid']
        return (
            Review.objects
            .filter(doctor__sid=doctor_sid)
            .select_related('patient', 'doctor', 'appointment')
        )


class MyReviewsListView(generics.ListAPIView):
    """Reviews the authenticated patient has written."""
    serializer_class = ReviewSerializer
    permission_classes = [IsPatient]
    pagination_class = None

    def get_queryset(self):
        return (
            Review.objects
            .filter(patient=self.request.user.patient)
            .select_related('patient', 'doctor', 'appointment')
        )


class AllReviewsListView(generics.ListAPIView):
    """Full feed of reviews across every doctor — the 'community' tab on the
    patient reviews page. Useful to explore what other patients have said."""
    serializer_class = ReviewSerializer
    permission_classes = [IsPatient]
    pagination_class = None

    def get_queryset(self):
        return (
            Review.objects
            .select_related('patient', 'doctor', 'appointment')
            .all()
        )


class PendingReviewsListView(generics.ListAPIView):
    """Completed consultation appointments the patient has NOT rated yet —
    surfaced as the 'pending' tab so the patient can quickly find what still
    needs rating."""
    serializer_class = PendingReviewAppointmentSerializer
    permission_classes = [IsPatient]
    pagination_class = None

    def get_queryset(self):
        return (
            Appointment.objects
            .filter(
                patient=self.request.user.patient,
                status='Completed',
                service__isnull=False,
                lab_test__isnull=True,
                review__isnull=True,
            )
            .select_related('doctor', 'service')
            .order_by('-date')
        )


class ReviewCreateOrUpdateView(APIView):
    """Create OR update the patient's review for a specific appointment.

    A patient can only review an appointment they own that is `Completed`.
    One review per appointment — the Review.appointment FK is OneToOne, so
    this endpoint upserts: if the review exists it is updated, otherwise a
    new one is created.
    """
    permission_classes = [IsPatient]

    def post(self, request):
        serializer = ReviewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        patient = request.user.patient
        try:
            appointment = Appointment.objects.select_related('doctor').get(
                sid=serializer.validated_data['appointment_sid'],
                patient=patient,
            )
        except Appointment.DoesNotExist:
            return Response({'detail': 'Appointment not found.'}, status=status.HTTP_404_NOT_FOUND)

        if appointment.status != 'Completed':
            return Response(
                {'detail': 'Only completed appointments can be reviewed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not appointment.doctor_id:
            return Response(
                {'detail': 'This appointment has no doctor to review.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        review, _created = Review.objects.update_or_create(
            appointment=appointment,
            defaults={
                'patient': patient,
                'doctor': appointment.doctor,
                'rating': serializer.validated_data['rating'],
                'comment': serializer.validated_data.get('comment', ''),
            },
        )
        return Response(ReviewSerializer(review).data, status=status.HTTP_201_CREATED)


class ReviewDeleteView(APIView):
    """Let the patient delete their own review."""
    permission_classes = [IsPatient]

    def delete(self, request, sid):
        try:
            review = Review.objects.get(sid=sid, patient=request.user.patient)
        except Review.DoesNotExist:
            return Response({'detail': 'Review not found.'}, status=status.HTTP_404_NOT_FOUND)
        review.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
