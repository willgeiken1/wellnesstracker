import * as SecureStore from 'expo-secure-store';
import { signOutStorage } from '../src/auth/sign-out-storage';
jest.mock('expo-secure-store',()=>({getItemAsync:jest.fn(),setItemAsync:jest.fn(),deleteItemAsync:jest.fn(),WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
beforeEach(()=>jest.clearAllMocks());
test('pending owner and timestamp occupy one durable SecureStore item outside session chunks',async()=>{
 const marker={owner:'demo',startedAt:1234,phase:'pending' as const};
 await signOutStorage.write(marker);
 expect(SecureStore.setItemAsync).toHaveBeenCalledWith('insight.sign-out-pending.v1',JSON.stringify(marker),{keychainAccessible:6});
 jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify(marker));expect(await signOutStorage.read()).toEqual(marker);
 await signOutStorage.remove();expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('insight.sign-out-pending.v1');
});
test.each(['not-json','{}','{"owner":"demo","startedAt":-1,"phase":"pending"}','{"owner":"demo","startedAt":1,"phase":"unknown"}'])('corrupt marker fails closed: %s',async raw=>{
 jest.mocked(SecureStore.getItemAsync).mockResolvedValue(raw);await expect(signOutStorage.read()).rejects.toThrow('Sign-out recovery unavailable.');
});
