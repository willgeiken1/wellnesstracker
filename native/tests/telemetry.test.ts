import path from 'node:path';
import { crashEvent, scrubText, usageEvent, sanitizeCapture, type CrashEvent } from '../src/telemetry/scrub';

const mockSentry={init:jest.fn(),close:jest.fn(()=>Promise.resolve()),setUser:jest.fn()};
const mockPh={identify:jest.fn(),reset:jest.fn(),capture:jest.fn(),optIn:jest.fn(()=>Promise.resolve()),optOut:jest.fn(()=>Promise.resolve())};
const mockPostHogCtor=jest.fn(()=>mockPh);
jest.mock('@sentry/react-native',()=>mockSentry);
jest.mock('posthog-react-native',()=>({__esModule:true,default:function(...a:unknown[]){return mockPostHogCtor(...(a as []));}}));
jest.mock('expo-router',()=>({usePathname:()=>'/'}));
jest.mock('../src/features/onboarding/device-preferences',()=>({onDevicePreferencesSaved:()=>()=>{},readDevicePreferences:()=>Promise.resolve({crashReports:false,analytics:false})}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sdk=require('../src/telemetry/sdk') as typeof import('../src/telemetry/sdk');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { tabForPath }=require('../src/telemetry/runtime') as typeof import('../src/telemetry/runtime');
const ID='3f1c2a9e-1b2c-4d5e-8f90-123456789abc';
const keys={sentryDsn:'https://public@o0.ingest.us.mockSentry.io/1',posthogKey:'phc_test'};
beforeEach(()=>{jest.clearAllMocks();sdk.resetTelemetryForTests();});

describe('scrubbing',()=>{
  test('error text loses emails, tokens, ids, URL queries and every number',()=>{
    const out=scrubText(`Weight 82.5 kg for will@example.com at https://x.supabase.co/rest/v1/rows?id=eq.5 Bearer abc.def eyJa.eyJb.sig ${ID} token=zzz`)!;
    expect(out).not.toMatch(/\d|example\.com|eq\.|abc\.def|eyJ|zzz/);
    expect(out).toContain('[email]');
  });
  test('a crash event keeps only the error, frames and app basics',()=>{
    const event={event_id:'e1',level:'error',release:'insight@1',message:'HRV 55 too low',
      exception:{values:[{type:'TypeError',value:'Cannot read 82.5',stacktrace:{frames:[{filename:'app:///index.bundle?x=1',function:'save',lineno:3,colno:4,in_app:true,vars:{weight:82.5}}]}}]},
      breadcrumbs:[{message:'food: oatmeal 350 kcal'}],extra:{weight:82.5},tags:{meal:'oatmeal'},request:{url:'https://x?y=1',data:{kcal:350}},
      user:{id:ID,email:'will@example.com',ip_address:'1.2.3.4'},
      contexts:{os:{name:'iOS',version:'26.1'},device:{family:'iPhone',model:'iPhone17,1',memory_size:1},app:{app_version:'1.0.0',app_build:'5'},health:{hrv:55}}} as unknown as CrashEvent;
    const out=crashEvent(event);
    const json=JSON.stringify(out);
    expect(json).not.toMatch(/oatmeal|kcal|82|55|hrv|weight|example\.com|1\.2\.3\.4|vars|breadcrumbs|"extra"|"tags"|request/);
    expect(out.user).toEqual({id:ID});
    expect(out.exception?.values?.[0]).toMatchObject({type:'TypeError',stacktrace:{frames:[{filename:'app:///index.bundle',function:'save',lineno:3}]}});
    expect(out.contexts?.os).toEqual({name:'iOS',version:'26.1'});
  });
  test('a user id that is not an account id is dropped',()=>{
    expect(crashEvent({user:{id:'will@example.com'}}).user).toBeUndefined();
  });
  test('usage events are an allowlist of names and properties',()=>{
    expect(usageEvent({event:'$screen',properties:{$screen_name:'food'}})).toBeNull();
    expect(usageEvent({event:'weight_logged',properties:{kg:82}})).toBeNull();
    expect(usageEvent({event:'tab_viewed',properties:{tab:'diary'}})).toBeNull();
    const out=usageEvent({event:'tab_viewed',properties:{tab:'food',$os:'iOS',$hrv:55,$screen_width:390,calories:350,token:'phc_test'},$set:{$os:'iOS',weight:82}})!;
    expect(out.properties).toEqual({tab:'food',$os:'iOS',token:'phc_test',$geoip_disable:true});
    expect(out.$set).toEqual({$os:'iOS'});
    expect(usageEvent({event:'$identify',properties:{$anon_distinct_id:'a',email:'x@y.z'}})!.properties).toEqual({$anon_distinct_id:'a',$geoip_disable:true});
    expect(sanitizeCapture('food_logged',{method:'describe'})).toBeNull();
  });
  test('routes map to tabs and nothing else',()=>{
    expect(['/','/workouts','/food/log','/settings/privacy','/workout','/score'].map(tabForPath)).toEqual(['home','workouts','food','settings',undefined,undefined]);
  });
});

describe('switches',()=>{
  test('nothing starts without keys or with both switches off',()=>{
    sdk.applyTelemetry({crashReports:true,analytics:true},{});
    sdk.applyTelemetry({crashReports:false,analytics:false},keys);
    expect(mockSentry.init).not.toHaveBeenCalled();expect(mockPostHogCtor).not.toHaveBeenCalled();
  });
  test('crash reports start private and stop when switched off',()=>{
    sdk.setTelemetryUser(ID);
    sdk.applyTelemetry({crashReports:true,analytics:false},keys);
    const options=mockSentry.init.mock.calls[0][0];
    expect(options).toMatchObject({dsn:keys.sentryDsn,sendDefaultPii:false,maxBreadcrumbs:0,attachScreenshot:false,attachViewHierarchy:false,enableAutoPerformanceTracing:false});
    expect(options.tracesSampleRate).toBeUndefined();
    expect(options.beforeBreadcrumb({message:'x'})).toBeNull();
    expect(options.beforeSend({extra:{weight:82},user:{id:ID,email:'a@b.c'}})).toEqual({contexts:{os:{},device:{},app:{}},user:{id:ID}});
    expect(mockSentry.setUser).toHaveBeenCalledWith({id:ID});
    sdk.applyTelemetry({crashReports:false,analytics:false},keys);
    expect(mockSentry.close).toHaveBeenCalled();
    expect(options.beforeSend({message:'late'})).toBeNull();
    expect(mockPostHogCtor).not.toHaveBeenCalled();
  });
  test('analytics start only on opt-in, on the US host, and pause when switched off',()=>{
    sdk.applyTelemetry({crashReports:false,analytics:true},keys);
    expect(mockPostHogCtor).toHaveBeenCalledWith('phc_test',expect.objectContaining({host:'https://us.i.posthog.com',disableGeoip:true,captureAppLifecycleEvents:false,enableSessionReplay:false}));
    sdk.track('tab_viewed',{tab:'food',kcal:350});
    sdk.track('weight_logged',{kg:82});
    expect(mockPh.capture).toHaveBeenCalledTimes(1);
    expect(mockPh.capture).toHaveBeenCalledWith('tab_viewed',{tab:'food'});
    sdk.setTelemetryUser(ID);expect(mockPh.identify).toHaveBeenCalledWith(ID);
    sdk.setTelemetryUser(undefined);expect(mockPh.reset).toHaveBeenCalled();
    sdk.applyTelemetry({crashReports:false,analytics:false},keys);
    expect(mockPh.optOut).toHaveBeenCalled();
    sdk.track('tab_viewed',{tab:'home'});
    expect(mockPh.capture).toHaveBeenCalledTimes(1);
    const before=(mockPostHogCtor.mock.calls[0] as unknown as [string,{before_send:(e:unknown)=>unknown}])[1].before_send;
    expect(before({event:'tab_viewed',properties:{tab:'home'}})).toBeNull();
    sdk.applyTelemetry({crashReports:false,analytics:true},keys);
    expect(mockPh.optIn).toHaveBeenCalled();expect(mockPostHogCtor).toHaveBeenCalledTimes(1);
  });
});

test('the phone-only build swaps the SDK file for a no-op',()=>{
  jest.doMock('expo/metro-config',()=>({getDefaultConfig:()=>({resolver:{}})}));
  const before=process.env.APP_VARIANT;process.env.APP_VARIANT='freeiphone';
  let config:{resolver:{resolveRequest:(c:unknown,n:string,p:string)=>{filePath:string}}}|undefined;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try{jest.isolateModules(()=>{config=require('../metro.config.js');});}finally{if(before===undefined)delete process.env.APP_VARIANT;else process.env.APP_VARIANT=before;}
  const root=path.resolve(__dirname,'..');
  const context={resolveRequest:()=>({type:'sourceFile',filePath:path.join(root,'src/telemetry/sdk.ts')})};
  expect(config!.resolver.resolveRequest(context,'./sdk','ios').filePath).toBe(path.join(root,'src/phone-only/telemetry-sdk.ts'));
  expect(()=>config!.resolver.resolveRequest(context,'@sentry/react-native','ios')).toThrow();
  expect(()=>config!.resolver.resolveRequest(context,'posthog-react-native','ios')).toThrow();
});
