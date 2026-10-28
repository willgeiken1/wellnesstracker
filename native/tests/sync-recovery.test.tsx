import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { SyncRecovery } from '../src/auth/sync-recovery';
import { ThemeProvider } from '../src/design/theme-provider';
import type { Repository } from '../src/data/repository';
import { syntheticRow } from '../fixtures/sync';

function fixture() {
 let versions=[{key:'fixture-version',row:syntheticRow(),winningRevision:'200:20000000-0000-4000-8000-000000000002',expiresAt:Date.now()+1000}];
 let notify=()=>{};
 const repo={losingVersions:jest.fn(()=>versions),subscribe:(listener:()=>void)=>{notify=listener;return jest.fn();},restoreLosingVersion:jest.fn(()=>{versions=[];notify();return true;})};
 return {repo,current:()=>versions,replace:(next:typeof versions)=>{versions=next;notify();},expire:()=>{versions=[];}};
}
test('quiet notice offers an accessible restore action and removes the notice after restore',async()=>{
 const {repo}=fixture();await render(<ThemeProvider><SyncRecovery repository={repo as unknown as Repository}/></ThemeProvider>);
 expect(screen.getByText('Changed on your other phone')).toBeTruthy();
 await fireEvent.press(screen.getByRole('button',{name:/Restore previous Workout session item 30000000-0000-4000-8000-000000000001 from Jan 1, 1970/}));
 expect(repo.restoreLosingVersion).toHaveBeenCalledWith('fixture-version');
 expect(screen.queryByText('Changed on your other phone')).toBeNull();
});
test('expiry refresh removes stale restore controls without motion',async()=>{
 jest.useFakeTimers();const {repo,expire}=fixture();
 try {
  const view=await render(<ThemeProvider><SyncRecovery repository={repo as unknown as Repository}/></ThemeProvider>);
  expire();await act(async()=>{jest.advanceTimersByTime(60_000);});
  expect(screen.queryByRole('button',{name:/Restore previous Workout session item 30000000-0000-4000-8000-000000000001 from Jan 1, 1970/})).toBeNull();
  await view.unmount();
 } finally {jest.useRealTimers();}
});
test('failed restore shows safe inline feedback',async()=>{
 const {repo}=fixture();repo.restoreLosingVersion.mockImplementation(()=>{throw new Error('synthetic storage details');});
 await render(<ThemeProvider><SyncRecovery repository={repo as unknown as Repository}/></ThemeProvider>);
 await fireEvent.press(screen.getByRole('button',{name:/Restore previous Workout session item 30000000-0000-4000-8000-000000000001 from Jan 1, 1970/}));
 expect(screen.getByRole('alert')).toHaveTextContent('This version could not be restored. It may have expired, been deleted, or changed again.');
 expect(screen.queryByText('synthetic storage details')).toBeNull();
});

test('sequential sync without recovery copies shows no notice or restore action',async()=>{
 const {repo,expire}=fixture();expire();
 await render(<ThemeProvider><SyncRecovery repository={repo as unknown as Repository}/></ThemeProvider>);
 expect(screen.queryByText('Changed on your other phone')).toBeNull();
 expect(screen.queryByRole('button')).toBeNull();
});

test('item and date labels keep restore targets identifiable after copies reorder',async()=>{
 const {repo,current,replace}=fixture();
 const first=current()[0];
 const second={...first,key:'second-fixture-version',row:{...first.row,id:'30000000-0000-4000-8000-000000000002',updated_at:86400100}};
 replace([first,second]);
 await render(<ThemeProvider><SyncRecovery repository={repo as unknown as Repository}/></ThemeProvider>);
 const secondLabel=/Workout session item 30000000-0000-4000-8000-000000000002 from Jan 2, 1970/;
 expect(screen.getByRole('button',{name:secondLabel})).toBeTruthy();
 await act(async()=>{replace([second,first]);});
 await fireEvent.press(screen.getByRole('button',{name:secondLabel}));
 expect(repo.restoreLosingVersion).toHaveBeenCalledWith('second-fixture-version');
});
