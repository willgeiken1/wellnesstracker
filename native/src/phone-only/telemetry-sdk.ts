/* The phone-only build sends no crash reports or analytics. Same surface as src/telemetry/sdk.ts. */
import type { DevicePreferences } from '../features/onboarding/model';
export type TelemetryKeys={sentryDsn?:string;posthogKey?:string};
export function telemetryKeys():TelemetryKeys{return {};}
export function applyTelemetry(_prefs:DevicePreferences,_keys?:TelemetryKeys){}
export function setTelemetryUser(_id:string|undefined){}
export function track(_name:string,_props?:Record<string,unknown>){}
export function resetTelemetryForTests(){}
