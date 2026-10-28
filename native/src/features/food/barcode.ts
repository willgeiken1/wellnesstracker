import { fetch as expoFetch } from 'expo/fetch';
import type { Repository } from '../../data/repository';
import { portion, type Food } from './model';
export interface ScannedFood { food: Food; servingGrams: number | null }
const host='https://world.openfoodfacts.org';
/** Closed egress boundary: no caller URL, headers, query, body, identity or health values. */
export function offRequest(code:string) {
  if(!/^(?:\d{8}|\d{12,14})$/.test(code))throw new Error('Invalid barcode.');
  return `${host}/api/v2/product/${code}.json`;
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
  const number=(key:string)=>typeof n[key]==='number'&&Number.isFinite(n[key])&&n[key]>=0?n[key] as number:null;
  const kcal=number('energy-kcal_100g'),sodium=number('sodium_100g');
  const food:Food={name:p.product_name.slice(0,200),amount_g:100,energy_kj:kcal===null?number('energy_100g'):kcal*4.184,
    protein_g:number('proteins_100g'),carbs_g:number('carbohydrates_100g'),fat_g:number('fat_100g'),fiber_g:number('fiber_100g'),sugar_g:number('sugars_100g'),sodium_mg:sodium===null?null:sodium*1000};
  // Never interpret a volume serving as grams. Only explicit gram quantities are supported.
  // OFF's schema permits a numeric string for the normalized quantity.
  const quantity=typeof p.serving_quantity==='string'&&/^\d+(?:\.\d+)?$/.test(p.serving_quantity.trim())
    ?Number(p.serving_quantity):p.serving_quantity;
  const grams=typeof quantity==='number'&&quantity>0&&Number.isFinite(quantity)&&
    (p.serving_quantity_unit==='g'||(p.serving_quantity_unit==null&&typeof p.serving_size==='string'&&/^\s*\d+(?:\.\d+)?\s*g\s*$/i.test(p.serving_size)))?quantity:null;
  return {food,servingGrams:grams};
}
export async function lookupBarcode(repo:Repository,code:string,http:typeof expoFetch=expoFetch):Promise<ScannedFood|null> {
  const url=offRequest(code),key=`barcode:v1:${code}`;
  const cached=repo.localGet<ScannedFood>(key);if(cached)return cached;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try {
    const response=await http(url,{method:'GET',credentials:'omit',redirect:'error',headers:{'User-Agent':'InsightDaily/1.0 (barcode lookup)'},signal:controller.signal});
    if(response.status===404)return null;
    if(!response.ok)throw new Error('Barcode lookup unavailable.');
    const body=await response.json();
    const result=body?.status===1?parseProduct(body.product):null;
    if(result)repo.localSave(key,result);
    return result;
  } finally {clearTimeout(timer);}
}
export function scannedPortion(product:ScannedFood,grams:number,useMacros:boolean):Food {
  const macro=calorieMismatch(product.food).macro;
  return portion({...product.food,energy_kj:useMacros&&macro!==null?macro*4.184:product.food.energy_kj},grams/100);
}
