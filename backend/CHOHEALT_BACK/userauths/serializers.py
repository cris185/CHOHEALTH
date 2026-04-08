from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.db import transaction
from .models import User
from patient.models import Patient
from doctor.models import Doctor


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'sid', 'email', 'username', 'user_type')
        read_only_fields = ('id', 'sid', 'username', 'user_type')


class _BaseRegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)
    first_name = serializers.CharField(max_length=100)
    second_name = serializers.CharField(max_length=100, required=False, default='', allow_blank=True)
    first_last_name = serializers.CharField(max_length=100)
    second_last_name = serializers.CharField(max_length=100, required=False, default='', allow_blank=True)

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Este email ya está registrado.')
        return value

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Las contraseñas no coinciden.'})
        return data


GENDER_CHOICES = [('Male', 'Male'), ('Female', 'Female'), ('Other', 'Other')]
BLOOD_GROUP_CHOICES = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']


class PatientRegisterSerializer(_BaseRegisterSerializer):
    phone = serializers.CharField(max_length=20, required=False, default='', allow_blank=True)
    address = serializers.CharField(max_length=300, required=False, default='', allow_blank=True)
    date_of_birth = serializers.DateField()
    gender = serializers.ChoiceField(choices=GENDER_CHOICES)
    blood_group = serializers.ChoiceField(choices=BLOOD_GROUP_CHOICES, required=False, default='')

    @transaction.atomic
    def create(self, validated_data):
        user = User.objects.create_user(
            email=validated_data['email'],
            password=validated_data['password'],
            user_type='Patient',
        )
        Patient.objects.create(
            user=user,
            first_name=validated_data['first_name'],
            second_name=validated_data.get('second_name', ''),
            first_last_name=validated_data['first_last_name'],
            second_last_name=validated_data.get('second_last_name', ''),
            phone=validated_data.get('phone', ''),
            address=validated_data.get('address', ''),
            date_of_birth=validated_data['date_of_birth'],
            gender=validated_data['gender'],
            blood_group=validated_data.get('blood_group', ''),
        )
        return user


class DoctorRegisterSerializer(_BaseRegisterSerializer):
    mobile = serializers.CharField(max_length=20, required=False, default='', allow_blank=True)
    country = serializers.CharField(max_length=100, required=False, default='', allow_blank=True)
    bio = serializers.CharField(required=False, default='', allow_blank=True)
    specialization = serializers.CharField(max_length=200)
    qualification = serializers.CharField(max_length=300)
    years_of_experience = serializers.IntegerField(min_value=0, default=0)

    @transaction.atomic
    def create(self, validated_data):
        user = User.objects.create_user(
            email=validated_data['email'],
            password=validated_data['password'],
            user_type='Doctor',
        )
        Doctor.objects.create(
            user=user,
            first_name=validated_data['first_name'],
            second_name=validated_data.get('second_name', ''),
            first_last_name=validated_data['first_last_name'],
            second_last_name=validated_data.get('second_last_name', ''),
            mobile=validated_data.get('mobile', ''),
            country=validated_data.get('country', ''),
            bio=validated_data.get('bio', ''),
            specialization=validated_data['specialization'],
            qualification=validated_data['qualification'],
            years_of_experience=validated_data.get('years_of_experience', 0),
        )
        return user


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user).data
        return data


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    email = serializers.EmailField()
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=8)
    new_password_confirm = serializers.CharField()

    def validate(self, data):
        if data['new_password'] != data['new_password_confirm']:
            raise serializers.ValidationError({'new_password_confirm': 'Passwords do not match.'})
        return data