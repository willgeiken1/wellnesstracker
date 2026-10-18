import { authConfig } from '../src/auth/config';
import { chunkedStorage } from '../src/auth/storage';

test('production ref is refused before a client can be created, including missing key', () => {
  expect(() => authConfig('https://pvodxxmfgflvgvbdotlv.supabase.co', '')).toThrow('Production');
});
test.each(['https://example.supabase.co', 'https://localhost.evil.com', 'http://127.0.0.1.evil.com'])('hosted/non-loopback URL %s is refused', url => {
  expect(() => authConfig(url, 'sb_publishable_fixture')).toThrow('loopback');
});
test('missing configuration is disabled; local publishable only', () => {
  expect(authConfig('', '')).toBeNull();
  expect(authConfig('http://127.0.0.1:54321', 'sb_publishable_fixture')).toBeTruthy();
  expect(() => authConfig('http://localhost:54321', 'sb_secret_fixture')).toThrow('publishable');
});
test('chunks Unicode below SecureStore byte limit, rejoins, replaces and removes all keys', async () => {
  const values = new Map<string,string>();
  const store = chunkedStorage({
    getItemAsync: async k => values.get(k) ?? null,
    setItemAsync: async (k,v) => { expect(new TextEncoder().encode(v).length).toBeLessThanOrEqual(1800); values.set(k,v); },
    deleteItemAsync: async k => { values.delete(k); },
  });
  const value = '🙂é'.repeat(2400);
  await store.setItem('session', value);
  expect(await store.getItem('session')).toBe(value);
  await store.setItem('session', 'short');
  expect(await store.getItem('session')).toBe('short');
  await store.removeItem('session');
  expect(values.size).toBe(0);
  expect(await store.getItem('session')).toBeNull();
});
test('missing chunk fails closed', async () => {
  const values = new Map<string,string>();
  const store = chunkedStorage({getItemAsync: async k => values.get(k) ?? null, setItemAsync: async (k,v) => { values.set(k,v); }, deleteItemAsync: async k => { values.delete(k); }});
  await store.setItem('session', 'x'.repeat(5000));
  values.delete('session.part.1');
  expect(await store.getItem('session')).toBeNull();
});
test('interruption at every write step restores either a complete value or no session, never mixed chunks', async () => {
  for (let failAt=1; failAt<=12; failAt++) {
    const values=new Map<string,string>();let calls=0,fail=false;
    const touch=()=>{if(fail&&++calls===failAt)throw new Error('fixture private detail');};
    const native={getItemAsync:async(k:string)=>{touch();return values.get(k)??null;},setItemAsync:async(k:string,v:string)=>{touch();values.set(k,v);},deleteItemAsync:async(k:string)=>{touch();values.delete(k);}};
    const storage=chunkedStorage(native),old='a'.repeat(1200),next='b'.repeat(2000);
    await storage.setItem('session',old);fail=true;
    try {await storage.setItem('session',next);}catch(error){expect((error as Error).message).toBe('Session storage unavailable.');}
    fail=false;
    const restarted=chunkedStorage(native),restored=await restarted.getItem('session');
    expect([old,next,null]).toContain(restored);
    await restarted.removeItem('session');expect(values.size).toBe(0);
  }
});
test('concurrent replace/read/delete operations serialize without orphan chunks', async () => {
 const values=new Map<string,string>();const store=chunkedStorage({getItemAsync:async k=>values.get(k)??null,setItemAsync:async(k,v)=>{values.set(k,v);},deleteItemAsync:async k=>{values.delete(k);}});
 const first=store.setItem('session','a'.repeat(5000)),second=store.setItem('session','b'.repeat(1000)),read=store.getItem('session'),remove=store.removeItem('session');
 await Promise.all([first,second,remove]);expect(await read).toBe('b'.repeat(1000));expect(values.size).toBe(0);
});
