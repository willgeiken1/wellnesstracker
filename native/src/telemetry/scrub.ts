/* What crash reports and usage events may carry. Both are rebuilt from allowlists:
   nothing here may carry a health value, food text, a note, a photo, an email or a token.
   Numbers are dropped from free text, because a measurement is a number. */

const USER_ID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function telemetryUserId(id:unknown):string|undefined{return typeof id==='string'&&USER_ID_RE.test(id)?id:undefined;}

/** Short, numberless, secret-free text for an error message, with quoted text and web address paths taken out. */
export function scrubText(value:unknown):string|undefined{
  if(typeof value!=='string'||!value)return undefined;
  return value
    // A web address keeps only its host: a path or query can name a food, a day or an account.
    .replace(/(https?:\/\/[^\s/?#'"]+)[^\s'"]*/gi,'$1')
    .replace(/\bBearer\s+[\w.~+/-]+=*/gi,'Bearer [token]')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g,'[token]')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,'[email]')
    .replace(/\b(access_token|refresh_token|token|code|apikey|key|password)=[^\s&]+/gi,'$1=[redacted]')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,'[id]')
    // Quoted text is usually something a person typed (a food, a note, a search), so it goes whole.
    .replace(/(^|[^\w])(["'`\u2018\u201c])(?:(?!\2|[\u2019\u201d]).){1,200}(?:\2|[\u2019\u201d])/g,'$1[text]')
    .replace(/\d+(?:[.,]\d+)*/g,'#')
    // Words: only error vocabulary and code names stay. Anything else could be a reading, a mood or a note.
    // (A web address is already cut to its host above and stays as it is.)
    .replace(/https?:\/\/\S+|[A-Za-z][A-Za-z'\u2019_]*/g,word=>/^https?:/i.test(word)||SAFE_WORDS.has(word.toLowerCase().replace('\u2019',"'"))||CODE_NAME.test(word)?word:'~')
    .replace(/~(?:[\s,;:-]*~)+/g,'~')
    .slice(0,200);
}
/* A name written in code (camelCase, PascalCase with an inner capital, or snake_case) comes from the program,
   not from a person. */
const CODE_NAME=/^(?:[a-z]+[A-Z]|[A-Z][a-z]+[A-Z]|[A-Za-z]+_[A-Za-z])/;
/* Words error messages are made of. A health or check-in word (a stage, a mood, high or low) is never added. */
const SAFE_WORDS=new Set(('a an the and or of to in on at for from with by as is are was were be been not no nor cannot ' +
  "can't couldn't could can didn't did does doesn't don't isn't wasn't won't will would should must has have had " +
  'this that it its there here than then into out over after before while when where which what who because ' +
  'error errors failed fail failure fatal exception exceptions invalid unexpected unknown unable undefined null nan ' +
  'true false type types value values property properties object objects function functions method methods ' +
  'argument arguments parameter parameters read write reading writing save saving saved load loading loaded ' +
  'open opening close closed find found missing required expected got received returned return call called ' +
  'network request response requests fetch timeout timed abort aborted aborted connection connect refused offline ' +
  'server client status code json parse syntax token unexpectedly end input string number array length index ' +
  'key keys row rows column columns table tables database query sql sqlite constraint unique foreign transaction ' +
  'locked busy disk full permission permissions denied access authorized unauthorized forbidden auth session ' +
  'sign signed signing user account module modules native component components render rendering hook hooks ' +
  'evaluating instance constructor maximum minimum stack size exceeded memory range bound bounds out-of-range ' +
  'file files directory path url uri http https api id ok os io ui sdk app view screen navigation route ' +
  'promise rejection unhandled async await event events listener state update updated invariant violation ' +
  'support supported unsupported available unavailable empty already does exist exists ' +
  // The scrubber's own placeholders.
  'text email redacted bearer').split(' ').filter(Boolean));

type Frame={filename?:string;function?:string;lineno?:number;colno?:number;in_app?:boolean};
type ExceptionValue={type?:string;value?:string;mechanism?:{type?:string;handled?:boolean};stacktrace?:{frames?:Frame[]}};
export type CrashEvent={event_id?:string;timestamp?:number;platform?:string;level?:string;release?:string;dist?:string;environment?:string;
  message?:string;exception?:{values?:ExceptionValue[]};user?:{id?:string};
  contexts?:{os?:{name?:string;version?:string};device?:{family?:string;model?:string;simulator?:boolean};app?:{app_version?:string;app_build?:string}};
  [key:string]:unknown};

const str=(v:unknown)=>typeof v==='string'?v.slice(0,100):undefined;
const pick=<T extends object>(o:T)=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined)) as Partial<T>;
function frame(f:Frame):Frame{return pick({filename:str(f.filename)?.replace(/[?#].*$/,''),function:str(f.function),
  lineno:typeof f.lineno==='number'?f.lineno:undefined,colno:typeof f.colno==='number'?f.colno:undefined,in_app:typeof f.in_app==='boolean'?f.in_app:undefined});}

/** Sentry beforeSend: a new event holding only the error, where it happened, and app/device basics. */
export function crashEvent(event:CrashEvent):CrashEvent{
  const c=event.contexts??{};
  const id=telemetryUserId(event.user?.id);
  return pick({
    event_id:str(event.event_id),timestamp:typeof event.timestamp==='number'?event.timestamp:undefined,
    platform:str(event.platform),level:str(event.level),release:str(event.release),dist:str(event.dist),environment:str(event.environment),
    message:scrubText(event.message),
    exception:event.exception?.values?{values:event.exception.values.slice(0,5).map(v=>pick({
      type:str(v.type),value:scrubText(v.value),
      mechanism:v.mechanism?pick({type:str(v.mechanism.type),handled:typeof v.mechanism.handled==='boolean'?v.mechanism.handled:undefined}):undefined,
      stacktrace:v.stacktrace?.frames?{frames:v.stacktrace.frames.slice(-50).map(frame)}:undefined,
    }))}:undefined,
    contexts:{os:pick({name:str(c.os?.name),version:str(c.os?.version)}),
      device:pick({family:str(c.device?.family),model:str(c.device?.model),simulator:typeof c.device?.simulator==='boolean'?c.device.simulator:undefined}),
      app:pick({app_version:str(c.app?.app_version),app_build:str(c.app?.app_build)})},
    user:id?{id}:undefined,
  }) as CrashEvent;
}

/* Product events. Names and properties are an allowlist, matching the web app's.
   tab_viewed { tab }  home, workouts, food, progress, insights, settings */
export const USAGE_TABS=['home','workouts','food','progress','insights','settings'] as const;
const FEATURE:Record<string,(props:Record<string,unknown>)=>Record<string,string>|null>={
  tab_viewed:p=>typeof p.tab==='string'&&(USAGE_TABS as readonly string[]).includes(p.tab)?{tab:p.tab}:null,
  workout_logged:()=>({}),
  food_logged:p=>p.method==='manual'?{method:'manual'}:null,
  privacy_export:()=>({}),
  insights_opened:()=>({}),
};
const IDENTITY_EVENTS=new Set(['$identify','$create_alias','$opt_in','$opt_out']);
/* SDK string fields that are fine to keep. Numeric SDK fields (screen size, timings) are dropped. */
const AUTO_KEYS=new Set(['$lib','$lib_version','$os','$os_name','$os_version','$device_type','$device_manufacturer','$device_model',
  '$app_name','$app_version','$app_build','$app_namespace','$locale','$timezone','$session_id','$insert_id','$anon_distinct_id',
  '$device_id','$user_id','$process_person_profile','$geoip_disable','token','distinct_id']);

export function sanitizeCapture(name:string,props?:Record<string,unknown>){
  const build=FEATURE[name];if(!build)return null;
  const properties=build(props&&typeof props==='object'?props:{});
  return properties?{event:name,properties}:null;
}

type Props=Record<string,unknown>;
function autoProps(p:Props|undefined):Props{
  const out:Props={};
  for(const [k,v] of Object.entries(p??{}))if(AUTO_KEYS.has(k)&&(typeof v==='string'||typeof v==='boolean'))out[k]=typeof v==='string'?v.slice(0,200):v;
  return out;
}
export type UsageEvent={uuid?:string;event:string;properties?:Props;$set?:Props;$set_once?:Props;timestamp?:Date};
/** PostHog before_send: drops any event not on the list and rebuilds the rest. */
export function usageEvent(event:UsageEvent):UsageEvent|null{
  if(!event||typeof event.event!=='string')return null;
  const base=autoProps(event.properties);
  let own:Props={};
  if(!IDENTITY_EVENTS.has(event.event)){
    const clean=sanitizeCapture(event.event,event.properties);if(!clean)return null;own=clean.properties;
  }
  return pick({uuid:event.uuid,event:event.event,timestamp:event.timestamp,
    properties:{...base,...own,$geoip_disable:true},$set:event.$set?autoProps(event.$set):undefined,$set_once:event.$set_once?autoProps(event.$set_once):undefined}) as UsageEvent;
}
