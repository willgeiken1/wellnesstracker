import { canonicalRow, type Row } from '../../src/data/rows';
import { SupabaseTransport } from '../../src/data/sync/supabase';
import { OWNER_A, OWNER_B, syntheticRow } from '../../fixtures/sync';
import type { SupabaseClient } from '@supabase/supabase-js';
function clientFixture(owner=OWNER_A) {
 const query={eq:jest.fn().mockReturnThis(),gt:jest.fn().mockReturnThis(),order:jest.fn().mockReturnThis(),limit:jest.fn(async()=>({data:[],error:null}))};
 const select=jest.fn((_fields:string)=>query),rpc=jest.fn(async(_name:string,{rows}:{rows:Row[]})=>({data:rows.map(canonicalRow),error:null})),from=jest.fn(()=>({select}));
 const auth={getSession:jest.fn(async()=>({data:{session:{user:{id:owner}}},error:null}))};
 return {client:{auth,rpc,from} as unknown as SupabaseClient,rpc,from,select,query};
}
test('app-owned rows only: health-source, unknown columns and owner mismatches never reach RPC',async()=>{
 const fixture=clientFixture(),transport=new SupabaseTransport(fixture.client,OWNER_A);
 const health={...syntheticRow('weigh_ins'),data:{source:'healthkit',weight_kg:80}};
 await expect(transport.push([health])).rejects.toThrow();
 await expect(transport.push([{...syntheticRow(),owner_id:OWNER_B}])).rejects.toThrow();
 await expect(transport.push([{...syntheticRow(),data:{access_token:'synthetic'}}])).rejects.toThrow();
 await expect(transport.push([{...syntheticRow(),unexpected:'synthetic'} as never])).rejects.toThrow();
 expect(fixture.rpc).not.toHaveBeenCalled();
});
test('transport checks current account, uses text bigint cursor, and sanitizes backend errors',async()=>{
 const changed=clientFixture(OWNER_B),transport=new SupabaseTransport(changed.client,OWNER_A);
 await expect(transport.push([syntheticRow()])).rejects.toThrow('Sync account changed.');expect(changed.rpc).not.toHaveBeenCalled();
 const fixture=clientFixture(),current=new SupabaseTransport(fixture.client,OWNER_A);
 await current.pull('sets','90071992547409930',100);
 expect(fixture.select.mock.calls[0][0]).toContain('server_seq::text');
 expect(fixture.query.eq).toHaveBeenCalledWith('owner_id',OWNER_A);
 expect(fixture.query.gt).toHaveBeenCalledWith('server_seq','90071992547409930');
 fixture.rpc.mockResolvedValueOnce({error:{message:'fixture sensitive detail'}} as never);
 await expect(current.push([syntheticRow()])).rejects.toThrow('Sync unavailable.');
});
test('rejected network promises cannot expose backend payload details in transport errors',async()=>{
 const fixture=clientFixture(),transport=new SupabaseTransport(fixture.client,OWNER_A);
 fixture.rpc.mockRejectedValueOnce(new Error('fixture private payload detail'));
 await expect(transport.push([syntheticRow()])).rejects.toThrow('Sync unavailable.');
 fixture.query.limit.mockRejectedValueOnce(new Error('fixture private payload detail'));
 await expect(transport.pull('sets','0',100)).rejects.toThrow('Sync unavailable.');
});

test('only the dedicated provenance SQLSTATE becomes a typed conflict, without backend details',async()=>{
 const {ProvenanceConflict}=require('../../src/data/sync/conflict') as typeof import('../../src/data/sync/conflict');
 const fixture=clientFixture(),transport=new SupabaseTransport(fixture.client,OWNER_A);
 fixture.rpc.mockResolvedValueOnce({error:{code:'P2001',message:'fixture private detail'}} as never);
 await expect(transport.push([syntheticRow('weigh_ins')])).rejects.toBeInstanceOf(ProvenanceConflict);
 fixture.rpc.mockResolvedValueOnce({error:{code:'23514',message:'fixture private detail'}} as never);
 await expect(transport.push([syntheticRow()])).rejects.toThrow('Sync unavailable.');
});

test('push sends only tombstone identity and provenance, even if caller supplies values',async()=>{
 const fixture=clientFixture(),transport=new SupabaseTransport(fixture.client,OWNER_A);
 const row={...syntheticRow('weigh_ins'),deleted_at:100};
 await transport.push([row]);
 expect(fixture.rpc).toHaveBeenCalledWith('sync_push',{rows:[{...row,data:{source:'app'}}]});
 expect(row.data.weight_kg).toBe(80);
});

test('push fails closed on missing, mismatched or invalid authoritative acknowledgments',async()=>{
 const fixture=clientFixture(),transport=new SupabaseTransport(fixture.client,OWNER_A),row=syntheticRow();
 for(const data of [null,[],[{...row,owner_id:OWNER_B}],[{...row,table:'meals'}],[{...row,id:OWNER_B}],[{...row,data:null}]]) {
  fixture.rpc.mockResolvedValueOnce({data,error:null} as never);
  await expect(transport.push([row])).rejects.toThrow();
 }
});

test('authoritative acknowledgments ignore future data columns while validating known values and identity',async()=>{
 const fixture=clientFixture(),transport=new SupabaseTransport(fixture.client,OWNER_A),row=syntheticRow('sets');
 fixture.rpc.mockResolvedValueOnce({data:[{...row,data:{reps:8,future_set_column:'fixture'}}],error:null});
 expect((await transport.push([row]))[0].data.reps).toBe(8);
 fixture.rpc.mockResolvedValueOnce({data:[{...row,data:{reps:'invalid',future_set_column:'fixture'}}],error:null} as never);
 await expect(transport.push([row])).rejects.toThrow();
});
