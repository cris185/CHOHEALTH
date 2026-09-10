import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/colors';
import { deliveryPerson, DeliveryPersonProfile } from '@/api';

const STATUS_LABEL: Record<string, string> = {
  off_duty: 'Off duty',
  on_duty: 'On duty',
  on_break: 'On break',
};

export default function ProfileScreen() {
  const { token } = useAuth();
  const [profile, setProfile] = useState<DeliveryPersonProfile | null>(null);

  useEffect(() => {
    if (!token) return;
    deliveryPerson.profile(token).then(setProfile).catch(() => {});
  }, [token]);

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.container}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{profile.first_name?.[0]}{profile.first_last_name?.[0]}</Text>
        </View>
        <Text style={styles.name}>{profile.full_name}</Text>
        <Text style={styles.email}>{profile.email}</Text>
        <View style={styles.badge}><Text style={styles.badgeText}>{STATUS_LABEL[profile.on_duty_status]}</Text></View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Phone</Text>
          <Text style={styles.rowValue}>{profile.phone || '—'}</Text>
        </View>

        <Text style={styles.note}>
          To edit your name, phone, or photo, use the CHOHEALTH website — this app is focused on deliveries.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 24, alignItems: 'center' },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', marginTop: 12,
  },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '800' },
  name: { fontSize: 19, fontWeight: '800', color: Colors.text, marginTop: 14 },
  email: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  badge: { backgroundColor: Colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginTop: 10 },
  badgeText: { fontSize: 12, fontWeight: '700', color: Colors.text },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 24,
  },
  rowLabel: { fontSize: 14, color: Colors.textMuted },
  rowValue: { fontSize: 14, fontWeight: '600', color: Colors.text },
  note: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: 24, lineHeight: 18 },
});
