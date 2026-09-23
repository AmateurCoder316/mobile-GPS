import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';

type GPSState = 'waiting' | 'excellent' | 'good' | 'weak' | 'disabled' | 'denied' | 'error';

export default function App() {
  const [speed, setSpeed] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [updateRate, setUpdateRate] = useState<number | null>(null);
  const [gpsState, setGpsState] = useState<GPSState>('waiting');
  const lastTimestamp = useRef<number | null>(null);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let active = true;

    async function startTracking() {
      try {
        if (!(await Location.hasServicesEnabledAsync())) {
          if (active) setGpsState('disabled');
          return;
        }

        const permission = await Location.requestForegroundPermissionsAsync();
        if (!active) return;

        if (permission.status !== 'granted') {
          setGpsState('denied');
          return;
        }

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 100,
            distanceInterval: 0,
          },
          (location) => {
            if (!active) return;

            const { speed: speedMS, accuracy: accuracyMeters } = location.coords;

            if (lastTimestamp.current !== null) {
              setUpdateRate(location.timestamp - lastTimestamp.current);
            }
            lastTimestamp.current = location.timestamp;

            setAccuracy(accuracyMeters);

            if (accuracyMeters === null) setGpsState('waiting');
            else if (accuracyMeters <= 5) setGpsState('excellent');
            else if (accuracyMeters <= 15) setGpsState('good');
            else setGpsState('weak');

            if (speedMS === null || !Number.isFinite(speedMS) || speedMS < 0) {
              setSpeed(null);
              return;
            }

            // The native provider reports speed in m/s. Keep this value unsmoothed
            // while diagnosing real-device GPS behaviour.
            setSpeed(speedMS * 3.6);
          }
        );
      } catch {
        if (active) setGpsState('error');
      }
    }

    startTracking();

    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  const status = getStatus(gpsState);

  return (
    <View style={styles.container}>
      <View style={styles.status}>
        <View style={[styles.statusDot, { backgroundColor: status.color }]} />
        <Text style={styles.statusText}>{status.label}</Text>
      </View>

      <View style={styles.speedContainer}>
        <Text style={styles.speed} numberOfLines={1} adjustsFontSizeToFit>
          {speed === null ? '--' : Math.max(0, Math.round(speed))}
        </Text>
        <Text style={styles.unit}>km/h</Text>
      </View>

      <View style={styles.gpsInfo}>
        {accuracy !== null && <Info label="TARKKUUS" value={`±${Math.round(accuracy)} m`} />}
        {updateRate !== null && <Info label="PÄIVITYS" value={`${(updateRate / 1000).toFixed(1)} s`} />}
      </View>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function getStatus(state: GPSState) {
  switch (state) {
    case 'excellent':
      return { label: 'GPS-signaali erinomainen', color: '#22c55e' };
    case 'good':
      return { label: 'GPS-signaali hyvä', color: '#84cc16' };
    case 'weak':
      return { label: 'GPS-signaali heikko', color: '#f59e0b' };
    case 'disabled':
      return { label: 'Sijaintipalvelut pois käytöstä', color: '#ef4444' };
    case 'denied':
      return { label: 'Sijaintilupa estetty', color: '#ef4444' };
    case 'error':
      return { label: 'GPS-virhe', color: '#ef4444' };
    default:
      return { label: 'Etsitään GPS-signaalia', color: '#6b7280' };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  status: {
    position: 'absolute',
    top: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: '#9ca3af', fontSize: 14, fontWeight: '500' },
  speedContainer: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  speed: {
    width: '100%',
    color: '#ffffff',
    fontSize: 150,
    fontWeight: '200',
    lineHeight: 165,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  unit: { color: '#737373', fontSize: 21, fontWeight: '500', marginTop: -8 },
  gpsInfo: { position: 'absolute', bottom: 48, flexDirection: 'row', gap: 48 },
  infoItem: { alignItems: 'center', minWidth: 80 },
  infoLabel: { color: '#525252', fontSize: 10, fontWeight: '600', letterSpacing: 1.2 },
  infoValue: { color: '#8a8a8a', fontSize: 14, marginTop: 5 },
});
