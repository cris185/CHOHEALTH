import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { requestLocationPermissions } from '@/location/backgroundTask';

// Shown once, before the OS permission dialogs — app stores require this
// kind of "pre-permission" explanation screen ahead of requesting
// background/"Always" location, and it also just makes for less startling UX.
export default function LocationPermissionScreen() {
  const router = useRouter();
  const [requesting, setRequesting] = useState(false);
  const [deniedReason, setDeniedReason] = useState<string | null>(null);

  const handleContinue = async () => {
    setRequesting(true);
    setDeniedReason(null);
    try {
      const result = await requestLocationPermissions();
      if (result.granted) {
        router.replace('/home');
      } else if (result.reason === 'background') {
        setDeniedReason(
          "You granted location \"while using the app\", but deliveries need \"Always\" so your position keeps updating in the background. Open Settings and change it to \"Always allow\".",
        );
      } else {
        setDeniedReason('Location access is required to deliver orders. Please allow it to continue.');
      }
    } finally {
      setRequesting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.icon}>📍</Text>
        <Text style={styles.title}>Location access</Text>
        <Text style={styles.body}>
          CHOHEALTH Courier uses your location for two things:
        </Text>
        <View style={styles.bullet}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            Letting the patient see you moving toward them on a live map, once you mark a delivery &ldquo;on the way&rdquo;.
          </Text>
        </View>
        <View style={styles.bullet}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            Offering you nearby deliveries first — this only works if we can see how close you are, even while
            you&apos;re on duty with the app in the background.
          </Text>
        </View>
        <Text style={styles.body}>
          Your location is only tracked while you&apos;re clocked in, and stops the moment you clock out.
        </Text>

        {deniedReason && (
          <View style={styles.deniedBox}>
            <Text style={styles.deniedText}>{deniedReason}</Text>
            <Pressable onPress={() => Linking.openSettings()}>
              <Text style={styles.settingsLink}>Open Settings</Text>
            </Pressable>
          </View>
        )}

        <Pressable style={styles.button} onPress={handleContinue} disabled={requesting}>
          {requesting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Allow Location Access</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  icon: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 14 },
  body: { fontSize: 14, color: Colors.textMuted, lineHeight: 21, marginBottom: 12 },
  bullet: { flexDirection: 'row', marginBottom: 12, paddingRight: 4 },
  bulletDot: { fontSize: 14, color: Colors.primary, marginRight: 8, fontWeight: '800' },
  bulletText: { flex: 1, fontSize: 14, color: Colors.text, lineHeight: 21 },
  deniedBox: { backgroundColor: '#FEE2E2', borderRadius: 10, padding: 14, marginTop: 8, marginBottom: 8 },
  deniedText: { color: Colors.danger, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  settingsLink: { color: Colors.danger, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  button: {
    marginTop: 20, backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
