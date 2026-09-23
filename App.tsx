import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';

type GPSState =
  | 'waiting'
  | 'excellent'
  | 'good'
  | 'weak'
  | 'denied';

export default function App() {
  const [speed, setSpeed] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [gpsState, setGpsState] = useState<GPSState>('waiting');
  const [updateRate, setUpdateRate] = useState<number | null>(null);

  const lastTimestamp = useRef<number | null>(null);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let mounted = true;

    async function startLocationTracking() {
      // Check whether location services are enabled.
      const servicesEnabled =
        await Location.hasServicesEnabledAsync();

      if (!servicesEnabled) {
        if (mounted) {
          setGpsState('weak');
        }

        return;
      }

      // Ask Android for foreground location permission.
      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (!mounted) return;

      if (permission.status !== 'granted') {
        setGpsState('denied');
        return;
      }

      subscription = await Location.watchPositionAsync(
        {
          // Highest useful accuracy offered by Expo.
          accuracy: Location.Accuracy.BestForNavigation,

          // Request updates as frequently as possible.
          timeInterval: 100,

          // Receive updates even without a minimum distance.
          distanceInterval: 0,
        },

        (location) => {
          if (!mounted) return;

          const {
            speed: rawSpeed,
            accuracy: rawAccuracy,
          } = location.coords;

          /*
           * Measure the REAL callback interval.
           *
           * timeInterval: 100 is only a request.
           * Android ultimately controls GPS update frequency.
           */
          if (lastTimestamp.current !== null) {
            const difference =
              location.timestamp - lastTimestamp.current;

            setUpdateRate(difference);
          }

          lastTimestamp.current = location.timestamp;

          // -------------------------
          // GPS ACCURACY
          // -------------------------

          setAccuracy(rawAccuracy);

          if (rawAccuracy === null) {
            setGpsState('waiting');
          } else if (rawAccuracy <= 5) {
            setGpsState('excellent');
          } else if (rawAccuracy <= 15) {
            setGpsState('good');
          } else {
            setGpsState('weak');
          }

          // -------------------------
          // SPEED
          // -------------------------

          if (
            rawSpeed === null ||
            !Number.isFinite(rawSpeed) ||
            rawSpeed < 0
          ) {
            setSpeed(null);
            return;
          }

          /*
           * Android reports speed in metres per second.
           *
           * 1 m/s = 3.6 km/h
           */
          const speedKMH = rawSpeed * 3.6;

          /*
           * IMPORTANT:
           *
           * No smoothing.
           * No moving average.
           * No artificial speed threshold.
           *
           * Display exactly what the GPS provider reports.
           */
          setSpeed(speedKMH);

          console.log({
            rawSpeedMS: rawSpeed,
            speedKMH,
            accuracyMeters: rawAccuracy,
            timestamp: location.timestamp,
          });
        }
      );
    }

    startLocationTracking();

    return () => {
      mounted = false;

      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  function getGPSStatus() {
    switch (gpsState) {
      case 'excellent':
        return 'GPS-signaali erinomainen';

      case 'good':
        return 'GPS-signaali hyvä';

      case 'weak':
        return 'GPS-signaali heikko';

      case 'denied':
        return 'Sijaintilupa estetty';

      default:
        return 'Etsitään GPS-signaalia';
    }
  }

  function getStatusColor() {
    switch (gpsState) {
      case 'excellent':
        return '#22c55e';

      case 'good':
        return '#84cc16';

      case 'weak':
        return '#f59e0b';

      case 'denied':
        return '#ef4444';

      default:
        return '#6b7280';
    }
  }

  return (
    <View style={styles.container}>
      {/* GPS STATUS */}

      <View style={styles.status}>
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor: getStatusColor(),
            },
          ]}
        />

        <Text style={styles.statusText}>
          {getGPSStatus()}
        </Text>
      </View>

      {/* SPEED */}

      <View style={styles.speedContainer}>
        <Text
          style={styles.speed}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {speed === null
            ? '--'
            : Math.max(0, Math.round(speed))}
        </Text>

        <Text style={styles.unit}>
          km/h
        </Text>
      </View>

      {/* GPS INFORMATION */}

      <View style={styles.gpsInfo}>
        {accuracy !== null && (
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>
              TARKKUUS
            </Text>

            <Text style={styles.infoValue}>
              ±{Math.round(accuracy)} m
            </Text>
          </View>
        )}

        {updateRate !== null && (
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>
              PÄIVITYS
            </Text>

            <Text style={styles.infoValue}>
              {(updateRate / 1000).toFixed(1)} s
            </Text>
          </View>
        )}
      </View>
    </View>
  );
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

  statusDot: {
    width: 8,
    height: 8,

    borderRadius: 4,
  },

  statusText: {
    color: '#9ca3af',

    fontSize: 14,
    fontWeight: '500',
  },

  speedContainer: {
    width: '100%',

    alignItems: 'center',
    justifyContent: 'center',
  },

  speed: {
    width: '100%',

    color: '#ffffff',

    fontSize: 150,
    fontWeight: '200',

    lineHeight: 165,

    textAlign: 'center',

    fontVariant: ['tabular-nums'],
  },

  unit: {
    color: '#737373',

    fontSize: 21,
    fontWeight: '500',

    marginTop: -8,
  },

  gpsInfo: {
    position: 'absolute',

    bottom: 48,

    flexDirection: 'row',

    gap: 48,
  },

  infoItem: {
    alignItems: 'center',

    minWidth: 80,
  },

  infoLabel: {
    color: '#525252',

    fontSize: 10,
    fontWeight: '600',

    letterSpacing: 1.2,
  },

  infoValue: {
    color: '#8a8a8a',

    fontSize: 14,

    marginTop: 5,
  },
});