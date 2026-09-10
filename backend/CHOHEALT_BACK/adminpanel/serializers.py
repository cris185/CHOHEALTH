from rest_framework import serializers


class AdminUserSerializer(serializers.Serializer):
    """Flattens a User plus whichever role profile it has (Patient/Doctor/
    DeliveryPerson, or none for a superuser) into one row for the admin
    users list — the frontend doesn't need to know which profile model
    backs a given row.
    """
    sid = serializers.CharField()
    email = serializers.EmailField()
    user_type = serializers.CharField()
    full_name = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    date_joined = serializers.DateTimeField()
    is_active = serializers.BooleanField()
    on_duty_status = serializers.SerializerMethodField()

    def _profile(self, user):
        return getattr(user, 'patient', None) or getattr(user, 'doctor', None) or getattr(user, 'delivery_person', None)

    def get_full_name(self, user):
        profile = self._profile(user)
        return profile.full_name if profile else (user.username or user.email)

    def get_phone(self, user):
        profile = self._profile(user)
        return getattr(profile, 'phone', '') if profile else ''

    def get_on_duty_status(self, user):
        delivery_person = getattr(user, 'delivery_person', None)
        return delivery_person.on_duty_status if delivery_person else None


class AdminDeliverySerializer(serializers.Serializer):
    sid = serializers.CharField()
    order_sid = serializers.CharField(source='order.sid')
    patient_name = serializers.SerializerMethodField()
    patient_sid = serializers.SerializerMethodField()
    courier_name = serializers.SerializerMethodField()
    courier_sid = serializers.SerializerMethodField()
    origin_branch = serializers.SerializerMethodField()
    stage = serializers.CharField()
    address = serializers.CharField()
    created_at = serializers.DateTimeField()
    delivered_at = serializers.DateTimeField()

    def get_patient_name(self, obj):
        return obj.order.patient.full_name

    def get_patient_sid(self, obj):
        return obj.order.patient.user.sid

    def get_courier_name(self, obj):
        return obj.courier.full_name if obj.courier else None

    def get_courier_sid(self, obj):
        return obj.courier.user.sid if obj.courier else None

    def get_origin_branch(self, obj):
        return obj.origin_branch.name if obj.origin_branch else None
