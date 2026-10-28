import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertFoodAiPayload} from '../supabase/functions/_shared/strip.ts';
const vectors=JSON.parse(readFileSync(new URL('../native/fixtures/food-ai-guard.json',import.meta.url),'utf8'));
for(const [text,allowed] of vectors)test(`shared food vector: ${text}`,()=>{
 const payload={model:'fixture-model',max_tokens:1500,messages:[{role:'user',content:[{type:'text',text}]}]};
 if(allowed)assert.doesNotThrow(()=>assertFoodAiPayload(payload));else assert.throws(()=>assertFoodAiPayload(payload));
});

// The platform-specific error message is localized on the phone; all guard logic
// and allowlists must otherwise remain byte-identical to the server.
test('native and server food guards remain byte-identical',()=>{
 const native=readFileSync(new URL('../native/src/features/food/ai/guard.ts',import.meta.url),'utf8');
 const server=readFileSync(new URL('../supabase/functions/_shared/strip.ts',import.meta.url),'utf8');
 const marker='// Fail-closed allowlist for food-describe and food-photo.';
 assert.equal(native.slice(native.indexOf(marker)).replace("super(t('foodAiBlocked'));",`super("Couldn't send that meal to the estimate.");`),server.slice(server.indexOf(marker)));
});
