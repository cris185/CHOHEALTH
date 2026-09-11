import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/colors';
import { hasLocationPermissions } from '@/location/backgroundTask';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      const granted = await hasLocationPermissions();
      router.replace(granted ? '/home' : '/location-permission');
    } catch (err: unknown) {
      const apiError = err as { data?: { detail?: string } };
      setError(apiError?.data?.detail || 'Could not sign in. Check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.container}>
          <Text style={styles.logo}>CHO Health</Text>
          <Text style={styles.subtitle}>Courier sign in</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholder="••••••••"
            />
            <Pressable style={styles.eyeButton} onPress={() => setShowPassword((v) => !v)} hitSlop={10}>
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
            </Pressable>
          </View>

          <Pressable style={styles.button} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  logo: { fontSize: 28, fontWeight: '800', color: Colors.primary, textAlign: 'center' },
  subtitle: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 4, marginBottom: 32 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, backgroundColor: Colors.card,
  },
  passwordRow: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 44 },
  eyeButton: { position: 'absolute', right: 10, padding: 6 },
  eyeIcon: { fontSize: 18 },
  button: {
    marginTop: 28, backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  error: {
    color: Colors.danger, backgroundColor: '#FEE2E2', borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 13,
  },
});
