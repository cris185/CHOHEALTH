from rest_framework import serializers


class ThreadMessageCreateSerializer(serializers.Serializer):
    content = serializers.CharField(trim_whitespace=True, max_length=5000)

    def validate_content(self, value):
        if not value.strip():
            raise serializers.ValidationError('Message cannot be empty.')
        return value
