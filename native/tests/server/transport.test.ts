import { SupabaseTransport } from '../../src/data/sync/supabase';
import { OWNER_A, OWNER_B, syntheticRow } from '../../fixtures/sync';
import type { SupabaseClient } from '@supabase/supabase-js';
function clientFixture(owner=OWNER_A) {
 const query={eq:jest.fn().mockReturnThis(),gt:jest.fn().mockReturnThis(),order:jest.fn().mockReturnThis(),limit:jest.fn(async()=>({data:[],error:null}))};
 const select=jest.fn((_fields:string)=>query),rpc=jest.fn(async()=>({error:null})),from=jest.fn(()=>({select}));
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
