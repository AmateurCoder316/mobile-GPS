import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';

type GPSState = 'waiting' | 'excellent' | 'good' | 'weak' | 'disabled' | 'denied' | 'error';
type TripPoint = { latitude: number; longitude: number; timestamp: number };

const CALIBRATION_SECONDS = 10;
const MAX_ACCURACY_METERS = 30;
const MIN_DISTANCE_STEP_METERS = 1.5;

export default function App() {
  const [speed, setSpeed] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [updateRate, setUpdateRate] = useState<number | null>(null);
  const [gpsState, setGpsState] = useState<GPSState>('waiting');
  const [calibrationRemaining, setCalibrationRemaining] = useState(CALIBRATION_SECONDS);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [tripSeconds, setTripSeconds] = useState(0);

  const lastTimestamp = useRef<number | null>(null);
  const lastTripPoint = useRef<TripPoint | null>(null);
  const calibrated = useRef(false);
  const tripStartedAt = useRef<number | null>(null);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let calibrationTimer: ReturnType<typeof setInterval> | null = null;
    let tripTimer: ReturnType<typeof setInterval> | null = null;
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

            const {
              speed: speedMS,
              accuracy: accuracyMeters,
              latitude,
              longitude,
            } = location.coords;

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
            } else {
              setSpeed(speedMS * 3.6);
            }

            if (!calibrated.current || accuracyMeters === null || accuracyMeters > MAX_ACCURACY_METERS) {
              return;
            }

            const point: TripPoint = { latitude, longitude, timestamp: location.timestamp };
            const previous = lastTripPoint.current;
            lastTripPoint.current = point;

            if (!previous) return;

            const elapsedSeconds = (point.timestamp - previous.timestamp) / 1000;
            if (elapsedSeconds <= 0 || elapsedSeconds > 10) return;

            const segmentMeters = getDistanceMeters(previous, point);
            const impliedSpeedKmh = (segmentMeters / elapsedSeconds) * 3.6;

            if (
              segmentMeters >= MIN_DISTANCE_STEP_METERS &&
              segmentMeters < 200 &&
              impliedSpeedKmh < 250
            ) {
              setDistanceMeters((current) => current + segmentMeters);
            }
          }
        );

        calibrationTimer = setInterval(() => {
          setCalibrationRemaining((remaining) => {
            if (remaining <= 1) {
              if (calibrationTimer) clearInterval(calibrationTimer);
              calibrated.current = true;
              lastTripPoint.current = null;
              tripStartedAt.current = Date.now();
              setTripSeconds(0);

              tripTimer = setInterval(() => {
                if (tripStartedAt.current !== null) {
                  setTripSeconds((Date.now() - tripStartedAt.current) / 1000);
                }
              }, 1000);

              return 0;
            }

            return remaining - 1;
          });
        }, 1000);
      } catch {
        if (active) setGpsState('error');
      }
    }

    startTracking();

    return () => {
      active = false;
      subscription?.remove();
      if (calibrationTimer) clearInterval(calibrationTimer);
      if (tripTimer) clearInterval(tripTimer);
    };
  }, []);

  const status = getStatus(gpsState);

  if (calibrationRemaining > 0 && gpsState !== 'denied' && gpsState !== 'disabled' && gpsState !== 'error') {
    const progress = ((CALIBRATION_SECONDS - calibrationRemaining) / CALIBRATION_SECONDS) * 100;

    return (
      <View style={styles.calibrationScreen}>
        <StatusBar style="light" />
        <Image source={require('./assets/skick.png')} style={styles.calibrationLogo} resizeMode="contain" />

        <View style={styles.calibrationContent}>
          <Text style={styles.calibrationTitle}>Kalibroidaan GPS</Text>
          <Text style={styles.calibrationText}>
            Pidä laite paikallaan ja odota, kun GPS tarkentaa sijaintisi.
          </Text>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>

          <Text style={styles.calibrationTime}>{calibrationRemaining} s</Text>
        </View>

        <Branding />
      </View>
    );
  }

  const averageSpeed = tripSeconds > 0 ? (distanceMeters / tripSeconds) * 3.6 : 0;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.status}>
        <View style={[styles.statusDot, { backgroundColor: status.color }]} />
        <Text style={styles.statusText}>{status.label}</Text>
      </View>

      <View style={styles.speedContainer}>
        <Text style={styles.speed} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>
          {speed === null ? '--' : Math.max(0, Math.round(speed))}
        </Text>
        <Text style={styles.unit}>km/h</Text>
      </View>

      <View style={styles.statsCard}>
        <Stat label="MATKA" value={formatDistance(distanceMeters)} />
        <View style={styles.statDivider} />
        <Stat label="KESKINOPEUS" value={`${averageSpeed.toFixed(1)} km/h`} />
      </View>

      <View style={styles.gpsInfo}>
        {accuracy !== null && <Info label="TARKKUUS" value={`±${Math.round(accuracy)} m`} />}
        {updateRate !== null && <Info label="PÄIVITYS" value={`${(updateRate / 1000).toFixed(1)} s`} />}
      </View>

      <Branding />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
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

function Branding() {
  return (
    <View style={styles.branding}>
      <Image source={require('./assets/skick.png')} style={styles.brandLogo} resizeMode="contain" />
      <Text style={styles.brandX}>×</Text>
      <Image source={require('./assets/hl-logo.png')} style={styles.harbourLogo} resizeMode="contain" />
    </View>
  );
}

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function getDistanceMeters(a: TripPoint, b: TripPoint) {
  const earthRadius = 6371000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
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
    paddingHorizontal: 22,
  },
  calibrationScreen: {
    flex: 1,
    backgroundColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  calibrationLogo: {
    position: 'absolute',
    top: 72,
    width: 116,
    height: 72,
  },
  calibrationContent: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },
  calibrationTitle: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  calibrationText: {
    color: '#8f8f8f',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 320,
  },
  progressTrack: {
    width: '100%',
    height: 5,
    borderRadius: 999,
    backgroundColor: '#1d1d1d',
    overflow: 'hidden',
    marginTop: 32,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#ffffff',
  },
  calibrationTime: {
    color: '#686868',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    marginTop: 12,
  },
  status: {
    position: 'absolute',
    top: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    color: '#929292',
    fontSize: 13,
    fontWeight: '500',
  },
  speedContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: '27%',
  },
  speed: {
    width: '100%',
    color: '#ffffff',
    fontSize: 190,
    fontWeight: '200',
    lineHeight: 200,
    textAlign: 'center',
    letterSpacing: -8,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    color: '#686868',
    fontSize: 22,
    fontWeight: '600',
    marginTop: -10,
    letterSpacing: 0.3,
  },
  statsCard: {
    width: '100%',
    maxWidth: 420,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#1d1d1d',
    borderRadius: 18,
    paddingVertical: 18,
    marginTop: 34,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 34,
    backgroundColor: '#242424',
  },
  statLabel: {
    color: '#5f5f5f',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.3,
  },
  statValue: {
    color: '#d7d7d7',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 7,
    fontVariant: ['tabular-nums'],
  },
  gpsInfo: {
    flexDirection: 'row',
    gap: 42,
    marginTop: 24,
  },
  infoItem: {
    alignItems: 'center',
    minWidth: 82,
  },
  infoLabel: {
    color: '#484848',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  infoValue: {
    color: '#777777',
    fontSize: 13,
    marginTop: 5,
    fontVariant: ['tabular-nums'],
  },
  branding: {
    position: 'absolute',
    bottom: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.72,
  },
  brandLogo: {
    width: 54,
    height: 32,
  },
  brandX: {
    color: '#505050',
    fontSize: 16,
    fontWeight: '400',
    marginHorizontal: 10,
  },
  harbourLogo: {
    width: 68,
    height: 32,
  },
});
