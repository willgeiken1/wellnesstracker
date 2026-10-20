import * as SecureStore from 'expo-secure-store';
import { lastOwnerStorage } from '../src/auth/last-owner-storage';
import { openLocalDatabase } from '../src/data/database';
import { OWNER_A } from '../fixtures/sync';

jest.mock('expo-secure-store',()=>({getItemAsync:jest.fn(),setItemAsync:jest.fn(),deleteItemAsync:jest.fn(),WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
jest.mock('../src/data/database',()=>({openLocalDatabase:jest.fn(()=>{throw new Error('SQLite must not be used for the owner hint.');})}));
const key='insight.last-signed-in-owner.v1';
beforeEach(()=>jest.clearAllMocks());

test('persists only the owner id in SecureStore without opening or writing SQLite',async()=>{
 await lastOwnerStorage.write(OWNER_A);
 expect(SecureStore.setItemAsync).toHaveBeenCalledWith(key,OWNER_A,{keychainAccessible:6});
 jest.mocked(SecureStore.getItemAsync).mockResolvedValue(OWNER_A);
 expect(await lastOwnerStorage.read()).toBe(OWNER_A);
 await lastOwnerStorage.clear();expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(key);
 expect(openLocalDatabase).not.toHaveBeenCalled();
});
test.each(['demo','guest','invalid',null])('does not persist a non-account owner: %s',async owner=>{
 await lastOwnerStorage.write(owner);
 expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
 expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(key);
});
test('a departure clear waits for an earlier auth write so it cannot resurrect the owner',async()=>{
 let finish!:()=>void;let stored:string|null=null;
 jest.mocked(SecureStore.setItemAsync).mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=()=>{stored=OWNER_A;resolve();};}));
 jest.mocked(SecureStore.deleteItemAsync).mockImplementationOnce(async()=>{stored=null;});
 const writing=lastOwnerStorage.write(OWNER_A);
 const clearing=lastOwnerStorage.clear();
 await Promise.resolve();expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
 finish();await writing;await clearing;expect(stored).toBeNull();
});
