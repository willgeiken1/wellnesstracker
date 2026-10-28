import { fetch as expoFetch } from 'expo/fetch';
import type { Repository } from '../../data/repository';
import { nutrients, portion, type Food } from './model';
export interface ScannedFood { food: Food; servingGrams: number | null }
export const CACHE_TTL=30*86400000, CACHE_CAP=100;
export const OFF_FIELDS='product_name,nutriments,serving_quantity,serving_quantity_unit,serving_size';
const MAX_BYTES=65536;
export function normalizeBarcode(code:string,type?:string) {
  if(type!=='upc_e')return code;
  if(!/^[01]\d{7}$/.test(code))throw new Error('Invalid UPC-E.');
  const [system,a,b,c,d,e,last,check]=code;
  const middle=Number(last)<=2?`${a}${b}${last}0000${c}${d}${e}`:last==='3'?`${a}${b}${c}00000${d}${e}`:last==='4'?`${a}${b}${c}${d}00000${e}`:`${a}${b}${c}${d}${e}0000${last}`;
  return system+middle+check;
}
const host='https://world.openfoodfacts.org';
/** Closed egress boundary: no caller URL, headers, query, body, identity or health values. */
export function offRequest(code:string) {
  if(!/^(?:\d{8}|\d{12,14})$/.test(code))throw new Error('Invalid barcode.');
  return `${host}/api/v2/product/${code}.json?fields=${OFF_FIELDS}`;
}
export function calorieMismatch(food:Food) {
  const valid=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const values=[food.protein_g,food.carbs_g,food.fat_g];
  const macro=values.every(valid)?Number(food.protein_g)*4+Number(food.carbs_g)*4+Number(food.fat_g)*9:null;
  const label=valid(food.energy_kj)?food.energy_kj/4.184:null;
  return {macro,mismatch:macro!==null&&label!==null&&Math.abs(macro-label)>label*0.15+Number.EPSILON*Math.max(label,macro)*4};
}
function parseProduct(value:unknown):ScannedFood|null {
  if(!value||typeof value!=='object')return null;
  const p=value as Record<string,unknown>;
  if(typeof p.product_name!=='string'||!p.product_name.trim())return null;
  const n=(p.nutriments&&typeof p.nutriments==='object'?p.nutriments:{}) as Record<string,unknown>;
  const number=(key:string,max=100)=>typeof n[key]==='number'&&Number.isFinite(n[key])&&n[key]>=0&&n[key]<=max?n[key] as number:null;
  const kcal=number('energy-kcal_100g',1000),sodium=number('sodium_100g'),salt=number('salt_100g');
  const food:Food={name:p.product_name.slice(0,200),amount_g:100,energy_kj:kcal===null?number('energy_100g',4184):kcal*4.184,
    protein_g:number('proteins_100g'),carbs_g:number('carbohydrates_100g'),fat_g:number('fat_100g'),fiber_g:number('fiber_100g'),sugar_g:number('sugars_100g'),sodium_mg:sodium!==null?sodium*1000:salt!==null?salt*400:null};
  // Never interpret a volume serving as grams. Only explicit gram quantities are supported.
  // OFF's schema permits a numeric string for the normalized quantity.
  const quantity=typeof p.serving_quantity==='string'&&/^\d+(?:\.\d+)?$/.test(p.serving_quantity.trim())
    ?Number(p.serving_quantity):p.serving_quantity;
  const grams=typeof quantity==='number'&&quantity>0&&quantity<=10000&&Number.isFinite(quantity)&&
    (p.serving_quantity_unit==='g'||(p.serving_quantity_unit==null&&typeof p.serving_size==='string'&&/^\s*\d+(?:\.\d+)?\s*g\s*$/i.test(p.serving_size)))?quantity:null;
  return {food,servingGrams:grams};
}
interface CacheEntry { fetchedAt:number; product:ScannedFood }
function validEntry(value:unknown,now:number):value is CacheEntry {
  if(!value||typeof value!=='object')return false;
  const entry=value as CacheEntry, p=entry.product;
  if(!Number.isFinite(entry.fetchedAt)||entry.fetchedAt>now||now-entry.fetchedAt>=CACHE_TTL||!p?.food)return false;
  const f=p.food;
  return typeof f.name==='string'&&!!f.name.trim()&&f.name.length<=200&&f.amount_g===100&&
    (p.servingGrams===null||(typeof p.servingGrams==='number'&&Number.isFinite(p.servingGrams)&&p.servingGrams>0&&p.servingGrams<=10000))&&
    nutrients.every(k=>f[k]==null||(typeof f[k]==='number'&&Number.isFinite(f[k])&&Number(f[k])>=0&&Number(f[k])<=(k==='energy_kj'?4184:k==='sodium_mg'?100000:100)));
}
/** Stream before parsing so oversized or unbounded product documents cannot accumulate. */
async function boundedJson(response:Response,signal:AbortSignal):Promise<unknown> {
  const reader=response.body?.getReader();if(!reader)throw new Error('Response unavailable.');
  const decoder=new TextDecoder();let size=0,text='';
  try {
    if(Number(response.headers?.get('content-length'))>MAX_BYTES)throw new Error('Response too large.');
    while(true) {
      const chunk=await reader.read();if(signal.aborted)throw new Error('Lookup cancelled.');
      if(chunk.done)break;
      size+=chunk.value.byteLength;if(size>MAX_BYTES)throw new Error('Response too large.');
      text+=decoder.decode(chunk.value,{stream:true});
    }
    return JSON.parse(text+decoder.decode());
  } finally {await reader.cancel();reader.releaseLock();}
}
export async function lookupBarcode(repo:Repository,code:string,http:typeof expoFetch=expoFetch,signal?:AbortSignal):Promise<ScannedFood|null> {
  const url=offRequest(code),now=Date.now();
  if(signal?.aborted)throw new Error('Lookup cancelled.');
  const raw=repo.localGet<unknown>('barcode:v2');
  const cache=Object.fromEntries(Object.entries(raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{}).filter(([key,value])=>/^(?:\d{8}|\d{12,14})$/.test(key)&&validEntry(value,now)).sort((a,b)=>(b[1] as CacheEntry).fetchedAt-(a[1] as CacheEntry).fetchedAt).slice(0,CACHE_CAP)) as Record<string,CacheEntry>;
  if(cache[code])return cache[code].product;
  const controller=new AbortController(),abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,12000);
  try {
    const response=await http(url,{method:'GET',credentials:'omit',redirect:'error',headers:{'User-Agent':'InsightDaily/1.0 (barcode lookup)'},signal:controller.signal});
    if(controller.signal.aborted)throw new Error('Lookup cancelled.');
    if(response.status===404)return null;
    if(!response.ok)throw new Error('Barcode lookup unavailable.');
    const body=await boundedJson(response,controller.signal) as {status?:number;product?:unknown};
    const result=body?.status===1?parseProduct(body.product):null;
    if(controller.signal.aborted)throw new Error('Lookup cancelled.');
    if(result) {
      // Re-read after HTTP so concurrent lookups cannot overwrite each other's products.
      const latest=repo.localGet<Record<string,unknown>>('barcode:v2');
      const entries=Object.entries(latest&&typeof latest==='object'?latest:{}).filter(([key,value])=>key!==code&&/^(?:\d{8}|\d{12,14})$/.test(key)&&validEntry(value,Date.now())).sort((a,b)=>(b[1] as CacheEntry).fetchedAt-(a[1] as CacheEntry).fetchedAt).slice(0,CACHE_CAP-1);
      repo.localSave('barcode:v2',Object.fromEntries([[code,{fetchedAt:Date.now(),product:result}],...entries]));
    }
    return result;
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function scannedPortion(product:ScannedFood,grams:number,useMacros:boolean):Food {
  const macro=calorieMismatch(product.food).macro;
  return portion({...product.food,energy_kj:useMacros&&macro!==null?macro*4.184:product.food.energy_kj},grams/100);
}
