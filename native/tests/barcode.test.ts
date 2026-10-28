import { lookupBarcode, calorieMismatch, offRequest, scannedPortion, normalizeBarcode, CACHE_TTL, CACHE_CAP, OFF_FIELDS } from '../src/features/food/barcode';
import { memoryRepository } from './workout-repository';
const code='0000000000017';
const product={product_name:'Synthetic cereal',serving_quantity:40,serving_quantity_unit:'g',serving_size:'40 g',nutriments:{'energy-kcal_100g':100,proteins_100g:5,carbohydrates_100g:20,fat_100g:1,sodium_100g:0.2}};
test('egress allowlist and payload: only barcode and fixed field filter, no user data, body or redirects',async()=>{
 const repo=memoryRepository();repo.localSave('profile',{weight:90,name:'Synthetic person'});
 const http=jest.fn().mockResolvedValue({...reply(product)});
 await lookupBarcode(repo,code,http);
 expect(http).toHaveBeenCalledWith('https://world.openfoodfacts.org/api/v2/product/'+code+'.json?fields='+OFF_FIELDS,{method:'GET',credentials:'omit',redirect:'error',headers:{'User-Agent':'InsightDaily/1.0 (barcode lookup)'},signal:expect.anything()});
 expect(JSON.stringify(http.mock.calls)).not.toMatch(/Synthetic person|weight/);
});
test.each(['https://evil.test/123','123?weight=90','1234567','123456789012345','１２３４５６７８','12345678/../../'])('rejects invalid barcode %s before network',async value=>{
 const http=jest.fn();await expect(lookupBarcode(memoryRepository(),value,http)).rejects.toThrow();expect(http).not.toHaveBeenCalled();expect(()=>offRequest(value)).toThrow();
});
test('offline cache hit needs no HTTP; portions convert sodium',async()=>{
 const repo=memoryRepository(),http=jest.fn().mockResolvedValue({...reply(product)});
 const result=await lookupBarcode(repo,code,http);http.mockRejectedValue(new Error('offline'));
 expect(await lookupBarcode(repo,code,http)).toEqual(result);expect(http).toHaveBeenCalledTimes(1);
 expect(scannedPortion(result!,40,false)).toMatchObject({name:'Synthetic cereal',amount_g:40,energy_kj:167.36,sodium_mg:80});expect(repo.list('food_entries')).toHaveLength(0);
});
test.each([[85,false],[115,false],[84.999,true],[115.001,true],[100,false],[0,true]])('15 percent of label boundary: macro kcal %s', (macro,warn)=>{
 expect(calorieMismatch({energy_kj:418.4,protein_g:macro/4,carbs_g:0,fat_g:0}).mismatch).toBe(warn);
});
test('unknown macros stay unknown; zero label handled',()=>{
 expect(calorieMismatch({energy_kj:418.4,protein_g:null,carbs_g:1,fat_g:1}).mismatch).toBe(false);
 expect(calorieMismatch({energy_kj:0,protein_g:0,carbs_g:0,fat_g:0}).mismatch).toBe(false);
 expect(calorieMismatch({energy_kj:0,protein_g:1,carbs_g:0,fat_g:0}).mismatch).toBe(true);
});
test('not-found and HTTP failures do not cache',async()=>{
 const repo=memoryRepository(),http=jest.fn().mockResolvedValue({status:404,ok:false});
 expect(await lookupBarcode(repo,code,http)).toBeNull();expect(repo.localSnapshot()).toEqual({});
 http.mockResolvedValue({status:503,ok:false});await expect(lookupBarcode(repo,code,http)).rejects.toThrow();
});

test('macro choice is explicit and never changes cached label calories',()=>{
 const result={food:{name:'Synthetic cereal',energy_kj:418.4,protein_g:10,carbs_g:0,fat_g:0,amount_g:100},servingGrams:40};
 expect(scannedPortion(result,100,false).energy_kj).toBe(418.4);
 expect(scannedPortion(result,100,true).energy_kj).toBeCloseTo(167.36);
 expect(result.food.energy_kj).toBe(418.4);
});
test('missing nutrients stay unknown and volume servings are not treated as grams',async()=>{
 const http=jest.fn().mockResolvedValue({...reply({product_name:'Synthetic drink',serving_quantity:250,serving_quantity_unit:'ml',serving_size:'250 ml',nutriments:{proteins_100g:-1}})});
 const result=await lookupBarcode(memoryRepository(),code,http);
 expect(result!.servingGrams).toBeNull();expect(result!.food.energy_kj).toBeNull();expect(result!.food.protein_g).toBeNull();
 expect(calorieMismatch(result!.food).mismatch).toBe(false);
});

test.each(['40', '40.5'])('OFF numeric-string gram serving %s is available in the dropdown',async quantity=>{
 const http=jest.fn().mockResolvedValue({...reply({...product,serving_quantity:quantity})});
 const result=await lookupBarcode(memoryRepository(),code,http);
 expect(result!.servingGrams).toBe(Number(quantity));
 expect(scannedPortion(result!,result!.servingGrams!,false).amount_g).toBe(Number(quantity));
});

test.each(['', ' ', '40 ml', 'Infinity', '-1', '0', '0x28'])('invalid serving quantity %s stays unknown',async quantity=>{
 const http=jest.fn().mockResolvedValue({...reply({...product,serving_quantity:quantity})});
 expect((await lookupBarcode(memoryRepository(),code,http))!.servingGrams).toBeNull();
});

test('explicit volume unit is never overridden by contradictory serving text',async()=>{
 const http=jest.fn().mockResolvedValue({...reply({...product,serving_quantity_unit:'ml'})});
 expect((await lookupBarcode(memoryRepository(),code,http))!.servingGrams).toBeNull();
});

const reply=(product:unknown)=>({ok:true,status:200,body:{getReader:()=>{let done=false;return {read:async()=>done?{done:true}:(done=true,{done:false,value:new TextEncoder().encode(JSON.stringify({status:1,product}))}),cancel:jest.fn(),releaseLock:jest.fn()};}}});
test.each([['01234505','012000003455'],['01234565','012345000065'],['01234535','012300000455'],['01234545','012340000055'],['11234505','112000003455']])('expands UPC-E %s without confusing EAN-8', (input,expected)=>{
 expect(normalizeBarcode(input,'upc_e')).toBe(expected);expect(normalizeBarcode(input,'ean8')).toBe(input);
});
test('cache validates entries, expires after 30 days, and caps stored products',async()=>{
 const repo=memoryRepository(), http=jest.fn().mockResolvedValue(reply(product));
 for(let i=0;i<CACHE_CAP+2;i++)await lookupBarcode(repo,String(i).padStart(13,'0'),http);
 expect(Object.keys(repo.localGet<any>('barcode:v2')!)).toHaveLength(CACHE_CAP);
 repo.localSave('barcode:v2',{[code]:{fetchedAt:Date.now()-CACHE_TTL,product:{food:{name:'stale',amount_g:100},servingGrams:40}}});
 await lookupBarcode(repo,code,http);expect(http).toHaveBeenCalledTimes(CACHE_CAP+3);
 repo.localSave('barcode:v2',{[code]:{fetchedAt:Date.now(),product:{food:{name:'corrupt',protein_g:'bad'},servingGrams:40}}});
 await lookupBarcode(repo,code,http);expect(http).toHaveBeenCalledTimes(CACHE_CAP+4);
});
test('salt becomes sodium; implausible per-100g nutrients and servings stay unknown',async()=>{
 const result=await lookupBarcode(memoryRepository(),code,jest.fn().mockResolvedValue(reply({...product,serving_quantity:10001,nutriments:{salt_100g:2.5,fiber_100g:10,sugars_100g:20,proteins_100g:101,'energy-kcal_100g':10000}})));
 expect(result).toMatchObject({servingGrams:null,food:{sodium_mg:1000,fiber_g:10,sugar_g:20,protein_g:null,energy_kj:null}});
});
test('size cap cancels a response stream; aborted calls never cache',async()=>{
 const cancel=jest.fn(), repo=memoryRepository();
 const http=jest.fn().mockResolvedValue({ok:true,status:200,body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array(65537)}),cancel,releaseLock:jest.fn()})}});
 await expect(lookupBarcode(repo,code,http)).rejects.toThrow();expect(cancel).toHaveBeenCalled();expect(repo.localSnapshot()).toEqual({});
 const controller=new AbortController();const pending=jest.fn().mockImplementation(async()=>{controller.abort();return reply(product);});
 await expect(lookupBarcode(repo,code,pending,controller.signal)).rejects.toThrow();expect(repo.localSnapshot()).toEqual({});
});

test('streamed response exceeding the cap across small chunks is rejected before parsing',async()=>{
 const cancel=jest.fn();let reads=0;
 const http=jest.fn().mockResolvedValue({ok:true,status:200,body:{getReader:()=>({read:async()=>{reads++;return {done:false,value:new Uint8Array(1024)};},cancel,releaseLock:jest.fn()})}});
 await expect(lookupBarcode(memoryRepository(),code,http)).rejects.toThrow();expect(reads).toBe(65);expect(cancel).toHaveBeenCalled();
});
test.each([NaN,Infinity,-1,101])('invalid nutrient %s stays unknown',async value=>{
 const result=await lookupBarcode(memoryRepository(),code,jest.fn().mockResolvedValue(reply({...product,nutriments:{fiber_100g:value,sugars_100g:value,sodium_100g:value}})));
 expect(result!.food).toMatchObject({fiber_g:null,sugar_g:null,sodium_mg:null});
});
test('malformed JSON fails without caching',async()=>{
 const http=jest.fn().mockResolvedValue({ok:true,status:200,body:{getReader:()=>{let done=false;return {read:async()=>done?{done:true}:(done=true,{done:false,value:new TextEncoder().encode('{')}),cancel:jest.fn(),releaseLock:jest.fn()};}}});
 const repo=memoryRepository();await expect(lookupBarcode(repo,code,http)).rejects.toThrow();expect(repo.localSnapshot()).toEqual({});
});
