/* The only file that loads the Sentry and PostHog SDKs. The phone-only build swaps it for a no-op.
   Crash reports start only while the crash-report switch is on and a DSN is set; usage analytics
   start only while the analytics switch is on (off by default) and a project key is set.
   Will sets EXPO_PUBLIC_SENTRY_DSN and EXPO_PUBLIC_POSTHOG_KEY on the Mac; neither is a secret. */
import * as Sentry from '@sentry/react-native';
import PostHog from 'posthog-react-native';
import type { DevicePreferences } from '../features/onboarding/model';
import { crashEvent, sanitizeCapture, telemetryUserId, usageEvent, type CrashEvent, type UsageEvent } from './scrub';

export const POSTHOG_HOST='https://us.i.posthog.com';
export type TelemetryKeys={sentryDsn?:string;posthogKey?:string};
export function telemetryKeys():TelemetryKeys{
  const clean=(v:string|undefined)=>v&&v.trim()?v.trim():undefined;
  return {sentryDsn:clean(process.env.EXPO_PUBLIC_SENTRY_DSN),posthogKey:clean(process.env.EXPO_PUBLIC_POSTHOG_KEY)};
}

let crashOn=false;let sentryStarted=false;let posthog:PostHog|null=null;let analyticsOn=false;let user:string|undefined;
// The account PostHog is tied to on this phone right now (undefined: none). Kept apart from `user` so an account
// change while analytics is off still clears the old account's id.
let posthogUser:string|undefined;
// PostHog's reset clears everything it stores, its opt-out too. Keep the opt-out, or a reset would switch analytics back on.
const KEEP_OPT_OUT=['opted_out'] as unknown as Parameters<PostHog['reset']>[0];

/** Point PostHog at the current account. A different account first clears the old id (keeping any opt-out),
 * and nothing is linked while analytics is off. */
function followUser(){
  if(!posthog)return;
  if(posthogUser&&posthogUser!==user){posthog.reset(KEEP_OPT_OUT);posthogUser=undefined;}
  if(analyticsOn&&user&&posthogUser!==user){posthog.identify(user);posthogUser=user;}
}

/** Start, pause or resume each service to match the switches. Safe to call repeatedly. */
export function applyTelemetry(prefs:DevicePreferences,keys:TelemetryKeys=telemetryKeys()){
  crashOn=prefs.crashReports===true&&!!keys.sentryDsn;
  if(crashOn&&!sentryStarted){
    Sentry.init({
      dsn:keys.sentryDsn,
      sendDefaultPii:false,
      maxBreadcrumbs:0,
      beforeBreadcrumb:()=>null,
      attachScreenshot:false,
      attachViewHierarchy:false,
      enableAutoPerformanceTracing:false,
      // Read at send time, so switching crash reports off stops anything still queued in this session.
      beforeSend:event=>crashOn?(crashEvent(event as unknown as CrashEvent) as unknown as typeof event):null,
    });
    sentryStarted=true;
    if(user)Sentry.setUser({id:user});
  }else if(!crashOn&&sentryStarted){
    void Sentry.close();sentryStarted=false;
  }
  analyticsOn=prefs.analytics===true&&!!keys.posthogKey;
  if(analyticsOn&&!posthog){
    posthog=new PostHog(keys.posthogKey!,{
      host:POSTHOG_HOST,
      disableGeoip:true,
      captureAppLifecycleEvents:false,
      enableSessionReplay:false,
      personProfiles:'identified_only',
      preloadFeatureFlags:false,
      disableSurveys:true,
      before_send:event=>analyticsOn?(usageEvent(event as UsageEvent) as typeof event|null):null,
    });
    // PostHog keeps an earlier opt-out across restarts, so a client made with the switch on is opted in here.
    void posthog.optIn();posthogUser=undefined;followUser();
  }else if(analyticsOn&&posthog){
    void posthog.optIn();followUser();
  }else if(!analyticsOn&&posthog){
    void posthog.optOut();
  }
}

/** Link reports to the signed-in account id (a random id, never the email), or clear it on sign-out. */
export function setTelemetryUser(id:string|undefined){
  const next=telemetryUserId(id);
  if(next===user)return;
  user=next;
  if(sentryStarted)Sentry.setUser(next?{id:next}:null);
  followUser();
}

/** Send one allowlisted product event. Anything off the list is dropped here and again in before_send. */
export function track(name:string,props?:Record<string,unknown>){
  if(!analyticsOn||!posthog)return;
  const clean=sanitizeCapture(name,props);
  if(clean)posthog.capture(clean.event,clean.properties);
}

export function resetTelemetryForTests(){crashOn=false;sentryStarted=false;posthog=null;analyticsOn=false;user=undefined;posthogUser=undefined;}
