import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/colors';
import {
  deliveryPerson, deliveryActions, DeliveryPersonProfile, DeliveryHistoryItem, PendingOffer,
} from '@/api';
import { startLocationTracking, stopLocationTracking } from '@/location/backgroundTask';
import { registerForPushNotifications } from '@/notifications';

const OFFER_POLL_MS = 5000;

const STATUS_LABEL: Record<string, string> = {
  off_duty: 'Off duty',
  on_duty: 'On duty',
  on_break: 'On break',
};

function secondsLeft(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

export default function HomeScreen() {
  const { user, token, logout } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<DeliveryPersonProfile | null>(null);
  const [activeDelivery, setActiveDelivery] = useState<DeliveryHistoryItem | null>(null);
  const [offer, setOffer] = useState<PendingOffer | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const offerRef = useRef<PendingOffer | null>(null);
  useEffect(() => { offerRef.current = offer; }, [offer]);

  const loadAll = useCallback(async () => {
    if (!token) return;
    try {
      const [p, deliveries] = await Promise.all([
        deliveryPerson.profile(token),
        deliveryPerson.deliveries(token),
      ]);
      setProfile(p);
      const active = deliveries.find((d) => d.stage !== 'delivered') ?? null;
      setActiveDelivery(active);
    } catch {
      // transient — next poll/refresh retries
    }
  }, [token]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (token) registerForPushNotifications(token).catch(() => {});
  }, [token]);

  // Poll for a new offer — the fallback path for when push isn't configured
  // (no EAS project yet) or was missed while backgrounded.
  useEffect(() => {
    if (!token || !profile) return;
    if (profile.on_duty_status !== 'on_duty' || activeDelivery || offerRef.current) return;

    const poll = async () => {
      try {
        const found = await deliveryPerson.myOffer(token);
        if (found) setOffer(found);
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, OFFER_POLL_MS);
    return () => clearInterval(id);
  }, [token, profile, activeDelivery]);

  // Local countdown + auto-decline at zero.
  useEffect(() => {
    if (!offer) return;
    setCountdown(secondsLeft(offer.expires_at));
    const id = setInterval(async () => {
      const left = secondsLeft(offer.expires_at);
      setCountdown(left);
      if (left <= 0) {
        clearInterval(id);
        if (token) await deliveryPerson.declineOffer(offer.sid, token).catch(() => {});
        setOffer(null);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [offer, token]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const handleClockIn = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await startLocationTracking();
      await deliveryPerson.clockIn(token);
      await loadAll();
    } catch (err: unknown) {
      const e = err as { data?: { detail?: string } };
      Alert.alert('Could not clock in', e?.data?.detail ?? 'Please try again.');
      await stopLocationTracking().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const handleClockOut = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await deliveryPerson.clockOut(token);
      await stopLocationTracking();
      await loadAll();
    } catch (err: unknown) {
      const e = err as { data?: { detail?: string } };
      Alert.alert('Could not clock out', e?.data?.detail ?? 'You may have an active delivery.');
    } finally {
      setBusy(false);
    }
  };

  const handleBreak = async (starting: boolean) => {
    if (!token) return;
    setBusy(true);
    try {
      await (starting ? deliveryPerson.breakStart(token) : deliveryPerson.breakEnd(token));
      await loadAll();
    } catch (err: unknown) {
      const e = err as { data?: { detail?: string } };
      Alert.alert(starting ? 'Could not start break' : 'Could not end break', e?.data?.detail ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async () => {
    if (!token || !offer) return;
    setBusy(true);
    try {
      await deliveryPerson.acceptOffer(offer.sid, token);
      setOffer(null);
      await loadAll();
    } catch {
      Alert.alert('This offer is no longer available', 'It may have gone to someone else.');
      setOffer(null);
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = async () => {
    if (!token || !offer) return;
    setBusy(true);
    try {
      await deliveryPerson.declineOffer(offer.sid, token);
    } finally {
      setOffer(null);
      setBusy(false);
    }
  };

  const handleNavigate = (delivery: DeliveryHistoryItem) => {
    // A destination confirmed on the patient's map picker gives exact
    // coordinates; falling back to the address text still lets Maps geocode
    // it itself on the rare delivery that somehow skipped the picker.
    const destination = delivery.dest_lat != null && delivery.dest_lng != null
      ? `${delivery.dest_lat},${delivery.dest_lng}`
      : encodeURIComponent(delivery.address);
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`).catch(() => {
      Alert.alert('Could not open Maps', 'No maps app was found to handle navigation.');
    });
  };

  const handleStartTransit = async () => {
    if (!token || !activeDelivery) return;
    setBusy(true);
    try {
      await deliveryActions.startTransit(activeDelivery.sid, token);
      await loadAll();
    } catch (err: unknown) {
      const e = err as { data?: { detail?: string } };
      Alert.alert('Could not start transit', e?.data?.detail ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!user || !profile) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const status = profile.on_duty_status;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{profile.full_name}</Text>
            <Text style={styles.email}>{profile.email}</Text>
          </View>
          <Pressable onPress={logout}><Text style={styles.logout}>Log out</Text></Pressable>
        </View>

        <View style={[styles.statusPill, status === 'on_duty' && styles.statusOnDuty, status === 'on_break' && styles.statusOnBreak]}>
          <Text style={styles.statusText}>{STATUS_LABEL[status]}</Text>
        </View>

        {/* Incoming offer — takes over the screen while pending */}
        {offer && (
          <View style={styles.offerCard}>
            <Text style={styles.offerTitle}>New delivery offer</Text>
            <Text style={styles.offerAddress}>{offer.address}</Text>
            <Text style={styles.offerCountdown}>{countdown}s to respond</Text>
            <View style={styles.offerButtons}>
              <Pressable style={[styles.button, styles.buttonDanger, styles.flex1]} onPress={handleDecline} disabled={busy}>
                <Text style={styles.buttonText}>Decline</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.buttonPrimary, styles.flex1]} onPress={handleAccept} disabled={busy}>
                <Text style={styles.buttonText}>Accept</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Active delivery */}
        {!offer && activeDelivery && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Current delivery</Text>
            <Text style={styles.cardAddress}>{activeDelivery.address}</Text>
            <Text style={styles.cardStage}>{activeDelivery.stage === 'picked_up' ? 'Picked up — ready to go' : 'On the way'}</Text>
            <Pressable style={[styles.button, styles.buttonSecondary, styles.navigateButton]} onPress={() => handleNavigate(activeDelivery)}>
              <Text style={styles.buttonTextSecondary}>🧭 Navigate</Text>
            </Pressable>
            {activeDelivery.stage === 'picked_up' && (
              <Pressable style={[styles.button, styles.buttonPrimary]} onPress={handleStartTransit} disabled={busy}>
                <Text style={styles.buttonText}>Start Transit</Text>
              </Pressable>
            )}
            {activeDelivery.stage === 'on_the_way' && (
              <Pressable
                style={[styles.button, styles.buttonAccent]}
                onPress={() => router.push({ pathname: '/arrived', params: { deliverySid: activeDelivery.sid, address: activeDelivery.address } })}
                disabled={busy}
              >
                <Text style={styles.buttonText}>Mark Arrived</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Duty controls — hidden while there's an offer or active delivery */}
        {!offer && !activeDelivery && (
          <View style={styles.card}>
            {status === 'off_duty' && (
              <Pressable style={[styles.button, styles.buttonPrimary]} onPress={handleClockIn} disabled={busy}>
                <Text style={styles.buttonText}>Clock In</Text>
              </Pressable>
            )}
            {status === 'on_duty' && (
              <View style={styles.rowGap}>
                <Pressable style={[styles.button, styles.buttonSecondary, styles.flex1]} onPress={() => handleBreak(true)} disabled={busy}>
                  <Text style={styles.buttonTextSecondary}>Start Break</Text>
                </Pressable>
                <Pressable style={[styles.button, styles.buttonDanger, styles.flex1]} onPress={handleClockOut} disabled={busy}>
                  <Text style={styles.buttonText}>Clock Out</Text>
                </Pressable>
              </View>
            )}
            {status === 'on_break' && (
              <Pressable style={[styles.button, styles.buttonPrimary]} onPress={() => handleBreak(false)} disabled={busy}>
                <Text style={styles.buttonText}>End Break</Text>
              </Pressable>
            )}
            {status === 'on_duty' && (
              <Text style={styles.waitingHint}>Waiting for a nearby delivery…</Text>
            )}
          </View>
        )}

        <View style={styles.footerLinks}>
          <Pressable onPress={() => router.push('/history')}><Text style={styles.footerLink}>History</Text></Pressable>
          <Pressable onPress={() => router.push('/profile')}><Text style={styles.footerLink}>Profile</Text></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  greeting: { fontSize: 20, fontWeight: '800', color: Colors.text },
  email: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  logout: { fontSize: 13, color: Colors.danger, fontWeight: '600' },
  statusPill: {
    alignSelf: 'flex-start', backgroundColor: Colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 20,
  },
  statusOnDuty: { backgroundColor: Colors.successBg },
  statusOnBreak: { backgroundColor: Colors.warningBg },
  statusText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  card: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: Colors.border, marginBottom: 16,
  },
  cardLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardAddress: { fontSize: 17, fontWeight: '700', color: Colors.text, marginTop: 6 },
  cardStage: { fontSize: 14, color: Colors.textMuted, marginTop: 4, marginBottom: 16 },
  offerCard: {
    backgroundColor: '#EFF6FF', borderRadius: 16, padding: 20, borderWidth: 2, borderColor: Colors.primary, marginBottom: 16,
  },
  offerTitle: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  offerAddress: { fontSize: 17, fontWeight: '700', color: Colors.text, marginTop: 8 },
  offerCountdown: { fontSize: 14, color: Colors.danger, fontWeight: '700', marginTop: 8, marginBottom: 16 },
  offerButtons: { flexDirection: 'row', gap: 10 },
  rowGap: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  button: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  buttonPrimary: { backgroundColor: Colors.primary },
  buttonAccent: { backgroundColor: Colors.accent },
  buttonSecondary: { backgroundColor: Colors.border },
  navigateButton: { marginBottom: 10 },
  buttonDanger: { backgroundColor: Colors.danger },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  buttonTextSecondary: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  waitingHint: { textAlign: 'center', fontSize: 13, color: Colors.textMuted, marginTop: 14 },
  footerLinks: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 8 },
  footerLink: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
});
