import { lookupBarcode, calorieMismatch, offRequest, scannedPortion } from '../src/features/food/barcode';
import { memoryRepository } from './workout-repository';
const code='0000000000017';
const product={product_name:'Synthetic cereal',serving_quantity:40,serving_quantity_unit:'g',serving_size:'40 g',nutriments:{'energy-kcal_100g':100,proteins_100g:5,carbohydrates_100g:20,fat_100g:1,sodium_100g:0.2}};
test('egress allowlist and payload: only barcode, no user data, query, body or redirects',async()=>{
 const repo=memoryRepository();repo.localSave('profile',{weight:90,name:'Synthetic person'});
 const http=jest.fn().mockResolvedValue({ok:true,status:200,json:async()=>({status:1,product})});
 await lookupBarcode(repo,code,http);
 expect(http).toHaveBeenCalledWith('https://world.openfoodfacts.org/api/v2/product/'+code+'.json',{method:'GET',credentials:'omit',redirect:'error',headers:{'User-Agent':'InsightDaily/1.0 (barcode lookup)'},signal:expect.anything()});
 expect(JSON.stringify(http.mock.calls)).not.toMatch(/Synthetic person|weight/);
});
test.each(['https://evil.test/123','123?weight=90','1234567','123456789012345','１２３４５６７８','12345678/../../'])('rejects invalid barcode %s before network',async value=>{
 const http=jest.fn();await expect(lookupBarcode(memoryRepository(),value,http)).rejects.toThrow();expect(http).not.toHaveBeenCalled();expect(()=>offRequest(value)).toThrow();
});
test('offline cache hit needs no HTTP; portions convert sodium',async()=>{
 const repo=memoryRepository(),http=jest.fn().mockResolvedValue({ok:true,status:200,json:async()=>({status:1,product})});
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
 const http=jest.fn().mockResolvedValue({ok:true,status:200,json:async()=>({status:1,product:{product_name:'Synthetic drink',serving_quantity:250,serving_quantity_unit:'ml',serving_size:'250 ml',nutriments:{proteins_100g:-1}}})});
 const result=await lookupBarcode(memoryRepository(),code,http);
 expect(result!.servingGrams).toBeNull();expect(result!.food.energy_kj).toBeNull();expect(result!.food.protein_g).toBeNull();
 expect(calorieMismatch(result!.food).mismatch).toBe(false);
});
