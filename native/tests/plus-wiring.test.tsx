import { createMockPurchaseProvider } from '../src/features/plus/mock-provider';
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
 for(let i=0;i<3;i++) await service.describe('Synthetic rice');
 const client=jest.fn(async()=>[item]); const manual=jest.fn();
 const view=await render(<ThemeProvider><EntitlementProvider><FoodAiClientProvider client={client}><FoodAiEntry repo={repo} mode={mode} day="2026-10-30" meal="meal" onClose={jest.fn()} onManual={manual}/></FoodAiClientProvider></EntitlementProvider></ThemeProvider>);
 if(mode==='describe') await fireEvent.changeText(view.getByLabelText('Describe the foods and portions'),'Synthetic rice');
 await fireEvent.press(view.getByRole('button',{name:mode==='snap'?'Choose meal photo':'Estimate meal'}));
 expect(router.push).toHaveBeenCalledWith('/paywall'); expect(client).not.toHaveBeenCalled(); expect(pickMealPhoto).not.toHaveBeenCalled();
 await fireEvent.press(view.getByRole('button',{name:'Manual'})); expect(manual).toHaveBeenCalled();
});
test('shared weekly allowance survives service recreation and blocks a fourth attempt', async()=>{
 const repo=memoryRepository();setConsent(repo,true); const client=jest.fn(async()=>[item]);
 new FoodAiService(repo,client).enqueue({jpeg:'YWJj'},'2026-10-30','meal');
 for(let i=0;i<2;i++) await new FoodAiService(repo,client).describe('Synthetic rice');
 await expect(new FoodAiService(repo,client).describe('Synthetic rice')).rejects.toThrow();
 expect(client).toHaveBeenCalledTimes(2);
});

test('purchase updates settings and advanced trends through the same provider without network', async()=>{
 const provider=createMockPurchaseProvider();
 const http=jest.spyOn(global,'fetch').mockRejectedValue(new Error('Network forbidden'));
 const view=await render(<ThemeProvider><EntitlementProvider provider={provider}><PaywallRoute/><AdvancedTrends sessions={[{at:Date.now(),exercises:[]}]} now={Date.now()}/><PlusSettings/></EntitlementProvider></ThemeProvider>);
 expect(view.getByRole('button',{name:'Explore Insight Plus for advanced trends'})).toBeTruthy();
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
test.each(['cancelled','pending','error'] as const)('failed or incomplete %s purchase leaves advanced trends gated',async status=>{
 const provider=createMockPurchaseProvider({purchaseResult:status==='error'?{status,error:{code:'unavailable'}}:{status}});
 const view=await render(<ThemeProvider><EntitlementProvider provider={provider}><PaywallRoute/><AdvancedTrends sessions={[]} now={Date.now()}/></EntitlementProvider></ThemeProvider>);
 await fireEvent.press(view.getByRole('button',{name:'Subscribe to Insight Plus Monthly'}));
 expect(view.getByRole('button',{name:'Explore Insight Plus for advanced trends'})).toBeTruthy();
});
test('upgrading an open food entry uses Plus beyond the free allowance',async()=>{
 const repo=memoryRepository();setConsent(repo,true);const client=jest.fn(async()=>[item]);
 const service=new FoodAiService(repo,client);for(let i=0;i<3;i++) await service.describe('Synthetic rice');
 const provider=createMockPurchaseProvider();
 const view=await render(<ThemeProvider><EntitlementProvider provider={provider}><FoodAiClientProvider client={client}><FoodAiEntry repo={repo} mode="describe" day="2026-10-30" meal="meal" onClose={jest.fn()} onManual={jest.fn()}/></FoodAiClientProvider></EntitlementProvider></ThemeProvider>);
 await act(async()=>{await provider.purchase('plus_monthly');});
 await fireEvent.changeText(view.getByLabelText('Describe the foods and portions'),'Synthetic rice');
 await fireEvent.press(view.getByRole('button',{name:'Estimate meal'}));
 expect(client).toHaveBeenCalledTimes(4);expect(router.push).not.toHaveBeenCalled();
});
test('free weekly quota resets on Monday',async()=>{
 const repo=memoryRepository();setConsent(repo,true);let day='2026-11-01';
 const service=new FoodAiService(repo,async()=>[item],()=>day);
 for(let i=0;i<3;i++) await service.describe('Synthetic rice');
 expect(service.quota('photos').allowed).toBe(false);day='2026-11-02';
 expect(service.quota('photos').remaining).toBe(3);
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
test('cancelled photo selection does not reserve a weekly attempt',async()=>{
 const repo=memoryRepository();setConsent(repo,true);jest.mocked(pickMealPhoto).mockResolvedValueOnce(null);
 const view=await render(<ThemeProvider><EntitlementProvider><FoodAiEntry repo={repo} mode="snap" day="2026-10-30" meal="meal" onClose={jest.fn()} onManual={jest.fn()}/></EntitlementProvider></ThemeProvider>);
 await fireEvent.press(view.getByRole('button',{name:'Choose meal photo'}));
 expect(new FoodAiService(repo).quota('photos').remaining).toBe(3);
});
