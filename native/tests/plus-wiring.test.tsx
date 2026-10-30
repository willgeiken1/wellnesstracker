import { createMockPurchaseProvider } from '../src/features/plus/mock-provider';
import { createRootPurchaseProvider } from '../src/features/plus/root-purchase';
import type { Entitlement } from '../src/features/plus/types';
import { AdvancedTrends } from '../src/features/plus/advanced-trends';
import { PlusSettings } from '../src/features/plus/settings';
import PaywallRoute from '../src/app/paywall';
import { act, fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '../src/design/theme-provider';
import { EntitlementProvider } from '../src/features/plus/use-entitlement';
import { FoodAiEntry } from '../src/features/food/ai/entry';
import { FoodAiClientProvider } from '../src/features/food/ai/runtime';
import { FoodAiService, setConsent } from '../src/features/food/ai/service';
import { memoryRepository } from './workout-repository';
import { pickMealPhoto } from '../src/features/food/ai/photos';
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../src/features/food/ai/photos', () => ({ pickMealPhoto: jest.fn(async () => ({jpeg:'YWJj'})) }));
jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn(async () => ({ isConnected: false })) }));
const item = {name:'Synthetic rice', energy_kj:100, origin:'named', unsure:false};
beforeEach(() => { jest.clearAllMocks(); });
test.each(['snap','describe'] as const)('exhausted free quota opens paywall before %s work; manual logging remains available', async mode => {
 const repo=memoryRepository(); setConsent(repo,true);
 const service=new FoodAiService(repo,async()=>[item]);
 for(let i=0;i<2;i++) await service.describe('Synthetic rice');
 const client=jest.fn(async()=>[item]); const manual=jest.fn();
 const view=await render(<ThemeProvider><EntitlementProvider><FoodAiClientProvider client={client}><FoodAiEntry repo={repo} mode={mode} day="2026-10-30" meal="meal" onClose={jest.fn()} onManual={manual}/></FoodAiClientProvider></EntitlementProvider></ThemeProvider>);
 if(mode==='describe') await fireEvent.changeText(view.getByLabelText('Describe the foods and portions'),'Synthetic rice');
 await fireEvent.press(view.getByRole('button',{name:mode==='snap'?'Choose meal photo':'Estimate meal'}));
 expect(router.push).toHaveBeenCalledWith('/paywall'); expect(client).not.toHaveBeenCalled(); expect(pickMealPhoto).not.toHaveBeenCalled();
 await fireEvent.press(view.getByRole('button',{name:'Manual'})); expect(manual).toHaveBeenCalled();
});
test('shared daily allowance survives service recreation and blocks a third attempt', async()=>{
 const repo=memoryRepository();setConsent(repo,true); const client=jest.fn(async()=>[item]);
 new FoodAiService(repo,client).enqueue({jpeg:'YWJj'},'2026-10-30','meal');
 for(let i=0;i<1;i++) await new FoodAiService(repo,client).describe('Synthetic rice');
 await expect(new FoodAiService(repo,client).describe('Synthetic rice')).rejects.toThrow();
 expect(client).toHaveBeenCalledTimes(1);
});

test('purchase updates settings and advanced trends through the same provider without network', async()=>{
 const provider=createMockPurchaseProvider();
 const http=jest.spyOn(global,'fetch').mockRejectedValue(new Error('Network forbidden'));
 const view=await render(<ThemeProvider><EntitlementProvider provider={provider}><PaywallRoute/><AdvancedTrends sessions={[{at:Date.now(),exercises:[]}]} now={Date.now()}/><PlusSettings/></EntitlementProvider></ThemeProvider>);
 expect(view.getByText('Last 7 days: 1 logged workouts')).toBeTruthy();
 await fireEvent.press(view.getByRole('button',{name:'Subscribe to Insight Plus Monthly'}));
 expect(view.getAllByText('Insight Plus active (simulated)')).toHaveLength(2);
 expect(view.getByText('Last 7 days: 1 logged workouts')).toBeTruthy();
 expect(view.queryByRole('button',{name:'Explore Insight Plus for advanced trends'})).toBeNull();
 expect(http).not.toHaveBeenCalled();http.mockRestore();
});
test('settings restores simulated ownership and explains management placeholder',async()=>{
 const view=await render(<ThemeProvider><EntitlementProvider provider={createMockPurchaseProvider({restoredEntitlement:'plus'})}><PlusSettings/></EntitlementProvider></ThemeProvider>);
 await fireEvent.press(view.getByRole('button',{name:'Restore Purchases'}));
 expect(view.getByText('Insight Plus active (simulated)')).toBeTruthy();
 await fireEvent.press(view.getByRole('button',{name:'Manage subscription'}));
 expect(view.getByText(/Subscription management will be available/)).toBeTruthy();
});
test.each(['cancelled','pending','error'] as const)('failed or incomplete %s purchase keeps advanced trends free',async status=>{
 const provider=createMockPurchaseProvider({purchaseResult:status==='error'?{status,error:{code:'unavailable'}}:{status}});
 const view=await render(<ThemeProvider><EntitlementProvider provider={provider}><PaywallRoute/><AdvancedTrends sessions={[]} now={Date.now()}/></EntitlementProvider></ThemeProvider>);
 await fireEvent.press(view.getByRole('button',{name:'Subscribe to Insight Plus Monthly'}));
 expect(view.getByText('Last 7 days: 0 logged workouts')).toBeTruthy();
 expect(view.queryByRole('button',{name:'Explore Insight Plus for advanced trends'})).toBeNull();
});
test('upgrading an open food entry uses Plus beyond the free allowance',async()=>{
 const repo=memoryRepository();setConsent(repo,true);const client=jest.fn(async()=>[item]);
 const service=new FoodAiService(repo,client);for(let i=0;i<2;i++) await service.describe('Synthetic rice');
 const provider=createMockPurchaseProvider();
 const view=await render(<ThemeProvider><EntitlementProvider provider={provider}><FoodAiClientProvider client={client}><FoodAiEntry repo={repo} mode="describe" day="2026-10-30" meal="meal" onClose={jest.fn()} onManual={jest.fn()}/></FoodAiClientProvider></EntitlementProvider></ThemeProvider>);
 await act(async()=>{await provider.purchase('plus_monthly');});
 await fireEvent.changeText(view.getByLabelText('Describe the foods and portions'),'Synthetic rice');
 await fireEvent.press(view.getByRole('button',{name:'Estimate meal'}));
 expect(client).toHaveBeenCalledTimes(3);expect(router.push).not.toHaveBeenCalled();
});
test('free daily quota resets on the next day within the same week',async()=>{
 const repo=memoryRepository();setConsent(repo,true);let day='2026-10-30';
 const service=new FoodAiService(repo,async()=>[item],()=>day);
 for(let i=0;i<2;i++) await service.describe('Synthetic rice');
 expect(service.quota('photos').allowed).toBe(false);day='2026-10-31';
 expect(service.quota('photos').remaining).toBe(2);
});

test('Plus daily cap shows the limit without opening a paywall',async()=>{
 const repo=memoryRepository();setConsent(repo,true);
 const service=new FoodAiService(repo,async()=>[item],undefined,undefined,()=> 'plus');
 for(let i=0;i<20;i++) await service.describe('Synthetic rice');
 const client=jest.fn(async()=>[item]);
 const view=await render(<ThemeProvider><EntitlementProvider provider={createMockPurchaseProvider({initialEntitlement:'plus'})}><FoodAiClientProvider client={client}><FoodAiEntry repo={repo} mode="describe" day="2026-10-30" meal="meal" onClose={jest.fn()} onManual={jest.fn()}/></FoodAiClientProvider></EntitlementProvider></ThemeProvider>);
 await fireEvent.changeText(view.getByLabelText('Describe the foods and portions'),'Synthetic rice');
 await fireEvent.press(view.getByRole('button',{name:'Estimate meal'}));
 expect(view.getByRole('alert')).toHaveTextContent(/limit/i);
 expect(router.push).not.toHaveBeenCalled();expect(client).not.toHaveBeenCalled();
});
test('cancelled photo selection does not reserve a daily attempt',async()=>{
 const repo=memoryRepository();setConsent(repo,true);jest.mocked(pickMealPhoto).mockResolvedValueOnce(null);
 const view=await render(<ThemeProvider><EntitlementProvider><FoodAiEntry repo={repo} mode="snap" day="2026-10-30" meal="meal" onClose={jest.fn()} onManual={jest.fn()}/></EntitlementProvider></ThemeProvider>);
 await fireEvent.press(view.getByRole('button',{name:'Choose meal photo'}));
 expect(new FoodAiService(repo).quota('photos').remaining).toBe(2);
});

test('queued photos and descriptions share the daily allowance without double charging drain', async () => {
 const repo=memoryRepository(); setConsent(repo,true);
 const client=jest.fn(async()=>[item]);
 const service=new FoodAiService(repo,client,()=> '2026-10-30');
 service.enqueue({jpeg:'YWJj'},'2026-10-30','meal');
 await service.describe('Synthetic rice');
 expect(service.quota('photos').allowed).toBe(false);
 await service.drain();
 expect(client).toHaveBeenCalledTimes(2);
 expect(service.quota('descriptions').remaining).toBe(0);
 await expect(service.describe('Synthetic rice')).rejects.toThrow();
});

test('production Subscribe does not grant free Plus', async () => {
 const provider = await createRootPurchaseProvider(false);
 const view = await render(<ThemeProvider><EntitlementProvider provider={provider}><PaywallRoute/><PlusSettings/></EntitlementProvider></ThemeProvider>);
 expect(view.getAllByText('Free plan').length).toBeGreaterThan(0);
 expect(view.queryByText('Insight Plus active (simulated)')).toBeNull();
 await fireEvent.press(view.getByRole('button', { name: 'Subscribe to Insight Plus Monthly' }));
 expect(await provider.getEntitlement()).toEqual({ status: 'success', value: 'free' });
 expect(view.getByText('Could not load or update simulated purchases. Please try again.')).toBeTruthy();
 expect(view.queryByText('Insight Plus active (simulated)')).toBeNull();
 expect(view.getAllByText('Free plan').length).toBeGreaterThan(0);
});

test('a Plus user is not shown as free while the store is loading', async () => {
 let resolveEntitlement: (result: { status: 'success'; value: 'plus' }) => void = () => {};
 const provider = createMockPurchaseProvider({ initialEntitlement: 'plus' });
 provider.getEntitlement = () => new Promise(resolve => { resolveEntitlement = resolve; });
 const view = await render(<ThemeProvider><EntitlementProvider provider={provider}><PaywallRoute/><PlusSettings/></EntitlementProvider></ThemeProvider>);
 expect(view.queryByText('Free plan')).toBeNull();
 expect(view.queryByText('Insight Plus active (simulated)')).toBeNull();
 expect(view.queryByRole('button', { name: 'Explore Insight Plus' })).toBeNull();
 expect(view.getAllByText('Checking plan…').length).toBeGreaterThan(0);
 await act(async () => { resolveEntitlement({ status: 'success', value: 'plus' }); });
 expect(view.getAllByText('Insight Plus active (simulated)')).toHaveLength(2);
 expect(view.queryByText('Free plan')).toBeNull();
});

test('downgrade returns settings to the free plan', async () => {
 let notify: (entitlement: Entitlement) => void = () => {};
 const provider = createMockPurchaseProvider({ initialEntitlement: 'plus' });
 const subscribe = provider.subscribe.bind(provider);
 provider.subscribe = listener => { notify = listener; return subscribe(listener); };
 const view = await render(<ThemeProvider><EntitlementProvider provider={provider}><PlusSettings/></EntitlementProvider></ThemeProvider>);
 expect(view.getByText('Insight Plus active (simulated)')).toBeTruthy();
 expect(view.queryByRole('button', { name: 'Explore Insight Plus' })).toBeNull();
 await act(async () => { notify('free'); });
 expect(view.getByText('Free plan')).toBeTruthy();
 expect(view.queryByText('Insight Plus active (simulated)')).toBeNull();
 expect(view.getByRole('button', { name: 'Explore Insight Plus' })).toBeTruthy();
});

test('a loading Plus food entry does not spend a free try', async () => {
 let resolveEntitlement: (result: { status: 'success'; value: 'plus' }) => void = () => {};
 const provider = createMockPurchaseProvider({ initialEntitlement: 'plus' });
 provider.getEntitlement = () => new Promise(resolve => { resolveEntitlement = resolve; });
 const repo = memoryRepository(); setConsent(repo, true);
 const client = jest.fn(async () => [item]);
 const view = await render(<ThemeProvider><EntitlementProvider provider={provider}><FoodAiClientProvider client={client}><FoodAiEntry repo={repo} mode="describe" day="2026-10-30" meal="meal" onClose={jest.fn()} onManual={jest.fn()}/></FoodAiClientProvider></EntitlementProvider></ThemeProvider>);
 await fireEvent.changeText(view.getByLabelText('Describe the foods and portions'), 'Synthetic rice');
 await fireEvent.press(view.getByRole('button', { name: 'Estimate meal' }));
 expect(client).not.toHaveBeenCalled();
 expect(new FoodAiService(repo).quota('descriptions').remaining).toBe(2);
 await act(async () => { resolveEntitlement({ status: 'success', value: 'plus' }); });
 await fireEvent.press(view.getByRole('button', { name: 'Estimate meal' }));
 expect(client).toHaveBeenCalledTimes(1);
 expect(router.push).not.toHaveBeenCalled();
});

test('cancelling a Describe does not refund the free try', async () => {
 const repo = memoryRepository(); setConsent(repo, true);
 let started!: () => void;
 const ready = new Promise<void>(resolve => { started = resolve; });
 let release!: (value: unknown) => void;
 const client = jest.fn(() => { started(); return new Promise(resolve => { release = resolve; }); });
 const service = new FoodAiService(repo, client, () => '2026-10-30');
 const pending = service.describe('Synthetic rice');
 await ready;
 expect(service.quota('descriptions').remaining).toBe(1);
 service.cancel();
 release([item]);
 await expect(pending).rejects.toThrow(/stopped/);
 expect(service.quota('descriptions').remaining).toBe(1);
});

test.each(['failed', 'offline'] as const)('%s Describe does not use a free try', async kind => {
 const repo = memoryRepository(); setConsent(repo, true);
 const client = jest.fn(async () => { throw new Error(kind === 'offline' ? 'offline' : 'synthetic failure'); });
 const service = new FoodAiService(repo, client, () => '2026-10-30');
 await expect(service.describe('Synthetic rice')).rejects.toThrow();
 expect(service.quota('descriptions').remaining).toBe(2);
 expect(client).toHaveBeenCalledTimes(1);
 const succeeded = new FoodAiService(repo, async () => [item], () => '2026-10-30');
 await succeeded.describe('Synthetic rice');
 expect(succeeded.quota('descriptions').remaining).toBe(1);
});

test('a full photo queue rolls back the reserved try', () => {
 const repo = memoryRepository(); setConsent(repo, true);
 const service = new FoodAiService(repo, async () => [item], () => '2026-10-30', undefined, () => 'plus');
 for (let i = 0; i < 10; i++) service.enqueue({ jpeg: 'YWJj' }, '2026-10-30', 'meal');
 expect(repo.localGet('foodAiDailyAllowance')).toMatchObject({ day: '2026-10-30', photos: 10, descriptions: 0 });
 expect(() => service.enqueue({ jpeg: 'YWJj' }, '2026-10-30', 'meal')).toThrow(/already waiting/);
 expect(repo.localGet('foodAiDailyAllowance')).toMatchObject({ day: '2026-10-30', photos: 10, descriptions: 0 });
 expect(service.quota('photos').remaining).toBe(10);
});

test('a failed plan load settles to free and can be retried', async () => {
 let calls = 0;
 const provider = createMockPurchaseProvider();
 provider.getEntitlement = async () => {
  calls += 1;
  if (calls < 4) return { status: 'error', error: { code: 'unavailable' } };
  return { status: 'success', value: 'plus' };
 };
 const view = await render(<ThemeProvider><EntitlementProvider provider={provider}><PlusSettings/></EntitlementProvider></ThemeProvider>);
 expect(view.getByText('Checking plan…')).toBeTruthy();
 expect(view.queryByText('Free plan')).toBeNull();
 expect(view.queryByRole('button', { name: 'Try again' })).toBeNull();
 expect(calls).toBe(1);
 await act(async () => { await new Promise(resolve => { setTimeout(resolve, 200); }); });
 expect(calls).toBe(3);
 expect(view.getByText('Free plan')).toBeTruthy();
 expect(view.queryByText('Checking plan…')).toBeNull();
 await fireEvent.press(view.getByRole('button', { name: 'Try again' }));
 expect(view.getByText('Insight Plus active (simulated)')).toBeTruthy();
 expect(view.queryByText('Free plan')).toBeNull();
});
