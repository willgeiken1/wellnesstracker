import { render } from '@testing-library/react-native';
import RootLayout from '../src/app/_layout';
import { AuthContext, type AuthState } from '../src/auth/provider';
jest.mock('expo-font',()=>({useFonts:()=>[true,null]}));
jest.mock('../src/auth/provider',()=>{
 const actual=jest.requireActual('../src/auth/provider');
 return {...actual,AuthProvider:({children}:{children:React.ReactNode})=>children};
});
jest.mock('../src/auth/client',()=>({getAuthClient:()=>null}));
jest.mock('../src/data/database',()=>({openLocalDatabase:jest.fn()}));

test('production root layout mounts LocalDataRecovery while private navigation is locked',async()=>{
 const auth:AuthState={session:null,demo:false,ready:false,configured:false,configError:null,repository:null,pending:0,conflicts:0,syncStatus:'idle',recovery:'corrupt-marker',lookAround:jest.fn(),signIn:jest.fn(),createAccount:jest.fn(),signOut:jest.fn(),syncNow:jest.fn()};
 const view=await render(<AuthContext.Provider value={auth}><RootLayout/></AuthContext.Provider>);
 expect(view.getByRole('button',{name:'Erase all local data and sign out'})).toBeTruthy();
 expect(view.queryByRole('button',{name:'Start freestyle'})).toBeNull();
});
