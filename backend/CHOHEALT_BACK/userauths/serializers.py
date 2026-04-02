from rest_framework import serializers
from django.db import transaction
from .models import User
from patient.models import Patient


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'email', 'username', 'user_type')
        read_only_fields = ('id', 'username', 'user_type')


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)
    first_name = serializers.CharField(max_length=100)
    second_name = serializers.CharField(max_length=100, required=False, default='')
    first_last_name = serializers.CharField(max_length=100)
    second_last_name = serializers.CharField(max_length=100, required=False, default='')
    phone = serializers.CharField(max_length=20, required=False, default='')

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Este email ya está registrado.')
        return value

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'Las contraseñas no coinciden.'})
        return data

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
        )
        return user
