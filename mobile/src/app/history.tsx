import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/colors';
import { deliveryPerson, DeliveryHistoryItem } from '@/api';

const STAGE_LABEL: Record<string, string> = {
  picked_up: 'Picked up',
  on_the_way: 'On the way',
  delivered: 'Delivered',
};

export default function HistoryScreen() {
  const { token } = useAuth();
  const [items, setItems] = useState<DeliveryHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    deliveryPerson.deliveries(token).then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.sid}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No deliveries yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.address} numberOfLines={1}>{item.address}</Text>
              <View style={[styles.badge, item.stage === 'delivered' && styles.badgeDone]}>
                <Text style={[styles.badgeText, item.stage === 'delivered' && styles.badgeTextDone]}>
                  {STAGE_LABEL[item.stage]}
                </Text>
              </View>
            </View>
            <Text style={styles.date}>
              {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16 },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: 40, fontSize: 14 },
  card: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 10,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  address: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
  date: { fontSize: 12, color: Colors.textMuted, marginTop: 6 },
  badge: { backgroundColor: Colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeDone: { backgroundColor: Colors.successBg },
  badgeText: { fontSize: 11, fontWeight: '700', color: Colors.text },
  badgeTextDone: { color: Colors.successText },
});
