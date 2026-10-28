import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { SyncRecovery } from '../src/auth/sync-recovery';
import { ThemeProvider } from '../src/design/theme-provider';
import type { Repository } from '../src/data/repository';
import { syntheticRow } from '../fixtures/sync';

function fixture() {
 let versions=[{key:'fixture-version',row:syntheticRow(),expiresAt:Date.now()+1000}];
 let notify=()=>{};
 const repo={losingVersions:jest.fn(()=>versions),subscribe:(listener:()=>void)=>{notify=listener;return jest.fn();},restoreLosingVersion:jest.fn(()=>{versions=[];notify();return true;})};
 return {repo,expire:()=>{versions=[];}};
}
test('quiet notice offers an accessible restore action and removes the notice after restore',async()=>{
 const {repo}=fixture();await render(<ThemeProvider><SyncRecovery repository={repo as unknown as Repository}/></ThemeProvider>);
 expect(screen.getByText('Changed on your other phone')).toBeTruthy();
 await fireEvent.press(screen.getByRole('button',{name:'Restore previous version 1'}));
 expect(repo.restoreLosingVersion).toHaveBeenCalledWith('fixture-version');
 expect(screen.queryByText('Changed on your other phone')).toBeNull();
});
test('expiry refresh removes stale restore controls without motion',async()=>{
 jest.useFakeTimers();const {repo,expire}=fixture();
 try {
  const view=await render(<ThemeProvider><SyncRecovery repository={repo as unknown as Repository}/></ThemeProvider>);
  expire();await act(async()=>{jest.advanceTimersByTime(60_000);});
  expect(screen.queryByRole('button',{name:'Restore previous version 1'})).toBeNull();
  await view.unmount();
 } finally {jest.useRealTimers();}
});
test('failed restore shows safe inline feedback',async()=>{
 const {repo}=fixture();repo.restoreLosingVersion.mockImplementation(()=>{throw new Error('synthetic storage details');});
 await render(<ThemeProvider><SyncRecovery repository={repo as unknown as Repository}/></ThemeProvider>);
 await fireEvent.press(screen.getByRole('button',{name:'Restore previous version 1'}));
 expect(screen.getByRole('alert')).toHaveTextContent('This version could not be restored. It may have expired or been deleted.');
 expect(screen.queryByText('synthetic storage details')).toBeNull();
});
