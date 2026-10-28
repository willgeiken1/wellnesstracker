import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertFoodAiPayload} from '../supabase/functions/_shared/strip.ts';
const vectors=JSON.parse(readFileSync(new URL('../native/fixtures/food-ai-guard.json',import.meta.url),'utf8'));
for(const [text,allowed] of vectors)test(`shared food vector: ${text}`,()=>{
 const payload={model:'fixture-model',max_tokens:1500,messages:[{role:'user',content:[{type:'text',text}]}]};
 if(allowed)assert.doesNotThrow(()=>assertFoodAiPayload(payload));else assert.throws(()=>assertFoodAiPayload(payload));
});
