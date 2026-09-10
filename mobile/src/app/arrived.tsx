import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/colors';
import { deliveryActions } from '@/api';
import { getCurrentPosition } from '@/location/backgroundTask';

export default function ArrivedScreen() {
  const { deliverySid, address } = useLocalSearchParams<{ deliverySid: string; address: string }>();
  const { token } = useAuth();
  const router = useRouter();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access needed', 'Allow camera access to take the delivery photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleConfirm = async () => {
    if (!token || !deliverySid || !photoUri) return;
    setSubmitting(true);
    try {
      const position = await getCurrentPosition();
      const res = await deliveryActions.arrived(
        deliverySid,
        { latitude: position.latitude, longitude: position.longitude, photoUri },
        token,
      );
      if (res.within_geofence === false) {
        Alert.alert(
          "You're a bit far from the delivery address",
          "We've still marked it delivered, but your position and the address don't quite match. Make sure this is right.",
        );
      }
      router.replace('/home');
    } catch (err: unknown) {
      const e = err as { data?: { detail?: string }; message?: string };
      Alert.alert('Could not confirm delivery', e?.data?.detail ?? e?.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Confirm delivery</Text>
        <Text style={styles.address}>{address}</Text>
        <Text style={styles.hint}>Take a photo of the package at the door as proof of delivery.</Text>

        {photoUri ? (
          <Pressable onPress={takePhoto}>
            <Image source={{ uri: photoUri }} style={styles.preview} />
            <Text style={styles.retake}>Tap to retake</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.photoButton} onPress={takePhoto}>
            <Text style={styles.photoButtonText}>📷 Take Photo</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.confirmButton, (!photoUri || submitting) && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={!photoUri || submitting}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmButtonText}>Confirm Arrival</Text>}
        </Pressable>

        <Pressable onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text },
  address: { fontSize: 15, color: Colors.textMuted, marginTop: 4, marginBottom: 4 },
  hint: { fontSize: 13, color: Colors.textMuted, marginBottom: 20, lineHeight: 19 },
  photoButton: {
    height: 220, borderRadius: 14, borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card,
  },
  photoButtonText: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  preview: { height: 220, borderRadius: 14 },
  retake: { textAlign: 'center', color: Colors.primary, fontWeight: '600', marginTop: 8 },
  confirmButton: {
    marginTop: 28, backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: 16, alignItems: 'center',
  },
  confirmButtonDisabled: { opacity: 0.5 },
  confirmButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancel: { textAlign: 'center', marginTop: 16, color: Colors.textMuted, fontSize: 14 },
});
