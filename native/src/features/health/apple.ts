import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { HealthSource } from './source';

const READ = ['HKQuantityTypeIdentifierBodyMass'] as const;
type Kit = typeof import('@kingstinct/react-native-healthkit');

/** Apple Health, read-only. Null where it cannot work: off iPhone, in the phone-only build (which carries
 * no Health entitlement), or when the native module is missing. Values read here stay on the phone. */
export function appleHealth(): HealthSource | null {
  if (Platform.OS !== 'ios' || Constants.expoConfig?.extra?.phoneOnly === true) return null;
  let kit: Kit;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only where Apple Health can exist
    kit = require('@kingstinct/react-native-healthkit') as Kit;
    if (!kit.isHealthDataAvailable()) return null;
  } catch { return null; }
  return {
    async access() {
      try {
        // 1 = should request, 2 = unnecessary (already asked). Anything else is treated as not asked.
        const status = Number(await kit.getRequestStatusForAuthorization({ toRead: READ }));
        return status === 2 ? 'asked' : 'ask';
      } catch { return 'unavailable'; }
    },
    async request() { await kit.requestAuthorization({ toRead: READ }); },
    async weights(since) {
      const samples = await kit.queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', { unit: 'kg', limit: 0, ascending: true, filter: { date: { startDate: since } } });
      return samples.map(sample => ({ id: sample.uuid, at: new Date(sample.startDate), kg: sample.quantity }));
    },
  };
}
