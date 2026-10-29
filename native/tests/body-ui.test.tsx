import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Alert } from 'react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { Body } from '../src/features/body/screen';
import { memoryRepository } from './workout-repository';
import { saveWeighIn } from '../src/features/body/model';
const wrapper=({children}:{children:React.ReactNode})=><ThemeProvider>{children}</ThemeProvider>;
afterEach(()=>jest.useRealTimers());
test('empty state opens decimal keypad, rejects invalid weight, saves and averages repeated readings',async()=>{
 const repo=memoryRepository();repo.save('profile',{weight_unit:'kg'});
 await render(<Body repository={repo}/>,{wrapper});
 expect(screen.getByText('Log a weigh-in to start your trend.')).toBeTruthy();
 await fireEvent.press(screen.getByRole('button',{name:'Add your first weigh-in'}));
 await fireEvent.changeText(screen.getByLabelText('Weight (kg)'),'0');
 await fireEvent.press(screen.getByRole('button',{name:'Save weigh-in'}));expect(screen.getByRole('alert')).toBeTruthy();
 await fireEvent.changeText(screen.getByLabelText('Weight (kg)'),'80');
 await fireEvent.press(screen.getByRole('button',{name:'Save weigh-in'}));expect(repo.list('weigh_ins')).toHaveLength(1);
 await fireEvent.press(screen.getByRole('button',{name:'Log weigh-in'}));
 expect(screen.getByRole('adjustable',{name:'Weight wheel (kg)'})).toHaveAccessibilityValue({text:'80.0 kg'});
 await fireEvent.press(screen.getByRole('button',{name:'Enter weight with keypad'}));
 await fireEvent.changeText(screen.getByLabelText('Weight (kg)'),'82');await fireEvent.press(screen.getByRole('button',{name:'Save weigh-in'}));
 expect(repo.list('weigh_ins')).toHaveLength(2);expect(screen.getByText('Trend: 81.0 kg')).toBeTruthy();
});
test('wheel starts at last reading, adjusts by tenths, cancels and preserves input on failure',async()=>{
 jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 const repo=memoryRepository();repo.save('profile',{weight_unit:'kg'});saveWeighIn(repo,80,'kg');
 await render(<Body repository={repo}/>,{wrapper});await fireEvent.press(screen.getByRole('button',{name:'Log weigh-in'}));
 await fireEvent(screen.getByRole('adjustable',{name:'Weight wheel (kg)'}),'accessibilityAction',{nativeEvent:{actionName:'increment'}});
 expect(screen.getByRole('adjustable',{name:'Weight wheel (kg)'})).toHaveAccessibilityValue({text:'80.1 kg'});
 const save=jest.spyOn(repo,'save').mockImplementation(()=>{throw new Error('Synthetic failure');});
 await fireEvent.press(screen.getByRole('button',{name:'Save weigh-in'}));expect(screen.getByRole('alert')).toBeTruthy();
 save.mockRestore();await fireEvent.press(screen.getByRole('button',{name:'Save weigh-in'}));expect(repo.list('weigh_ins')[1].data.weight_kg).toBeCloseTo(80.1);
 await fireEvent.press(screen.getByRole('button',{name:'Log weigh-in'}));await fireEvent.press(screen.getByRole('button',{name:'Cancel'}));expect(repo.list('weigh_ins')).toHaveLength(2);
});
test('ranges, tap and accessible chart navigation expose points; live profile units change display only',async()=>{
 jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-27T12:00:00Z'));
 const repo=memoryRepository();repo.save('profile',{weight_unit:'kg'},'profile');saveWeighIn(repo,80,'kg','2026-09-01');saveWeighIn(repo,79,'kg','2026-10-27');
 await render(<Body repository={repo}/>,{wrapper});
 for(const name of ['1M','3M','1Y','All'])expect(screen.getByRole('tab',{name})).toBeTruthy();
 await fireEvent.press(screen.getByRole('tab',{name:'All'}));
 await fireEvent.press(screen.getByRole('button',{name:'Previous trend point'}));expect(screen.getByText(/2026-09-01 · Trend/)).toBeTruthy();
 await fireEvent.press(screen.getByRole('button',{name:'Next trend point'}));expect(screen.getByText(/2026-10-27 · Trend/)).toBeTruthy();
 await fireEvent.press(screen.getByTestId('body-chart'),{nativeEvent:{locationX:0}});expect(screen.getByText(/2026-09-01 · Trend/)).toBeTruthy();
 await fireEvent.press(screen.getByRole('tab',{name:'1M'}));expect(screen.queryByText(/2026-09-01 · Trend/)).toBeNull();
 const before=JSON.stringify(repo.list('weigh_ins'));await act(()=>{repo.save('profile',{weight_unit:'lb'},'profile');});
 expect(screen.getByText(/Trend: .* lb/)).toBeTruthy();expect(JSON.stringify(repo.list('weigh_ins'))).toBe(before);
});
test('lb entry stores canonical kg and wheel Reduce Motion disables momentum',async()=>{
 jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 const repo=memoryRepository();repo.save('profile',{weight_unit:'lb'});saveWeighIn(repo,80,'kg');
 await render(<Body repository={repo}/>,{wrapper});
 await fireEvent.press(screen.getByRole('button',{name:'Log weigh-in'}));
 expect(screen.getByRole('adjustable',{name:'Weight wheel (lb)'})).toHaveAccessibilityValue({text:'176.4 lb'});
 expect(screen.getByTestId('body-wheel-scroll',{includeHiddenElements:true}).props.decelerationRate).toBe(0);
 expect(screen.getByTestId('body-wheel-scroll',{includeHiddenElements:true}).props.disableIntervalMomentum).toBe(true);
 await fireEvent.press(screen.getByRole('button',{name:'Enter weight with keypad'}));
 await fireEvent.changeText(screen.getByLabelText('Weight (lb)'),'180');await fireEvent.press(screen.getByRole('button',{name:'Save weigh-in'}));
 expect(repo.list('weigh_ins')[1].data).toMatchObject({weight_kg:expect.closeTo(81.6466266,10),entered_value:180,entered_unit:'lb'});
});
test('wheel scroll selects the centered tenth without rewriting earlier measurements',async()=>{
 const repo=memoryRepository();repo.save('profile',{weight_unit:'kg'});saveWeighIn(repo,80,'kg');
 const original=JSON.stringify(repo.list('weigh_ins')[0]);
 await render(<Body repository={repo}/>,{wrapper});await fireEvent.press(screen.getByRole('button',{name:'Log weigh-in'}));
 expect(screen.getByTestId('body-wheel-scroll',{includeHiddenElements:true}).props.contentOffset.y).toBe(2400);
 await fireEvent(screen.getByTestId('body-wheel-scroll',{includeHiddenElements:true}),'momentumScrollEnd',{nativeEvent:{contentOffset:{x:0,y:2448}}});
 expect(screen.getByRole('adjustable',{name:'Weight wheel (kg)'})).toHaveAccessibilityValue({text:'80.1 kg'});
 await fireEvent.press(screen.getByRole('button',{name:'Save weigh-in'}));expect(JSON.stringify(repo.list('weigh_ins')[0])).toBe(original);
});
test('nonfinite keypad values cannot open a broken wheel or save',async()=>{
 const repo=memoryRepository();repo.save('profile',{weight_unit:'kg'});
 await render(<Body repository={repo}/>,{wrapper});await fireEvent.press(screen.getByRole('button',{name:'Add your first weigh-in'}));
 await fireEvent.changeText(screen.getByLabelText('Weight (kg)'),'9'.repeat(400));
 await fireEvent.press(screen.getByRole('button',{name:'Use weight wheel'}));
 expect(screen.getByRole('alert')).toBeTruthy();expect(screen.getByLabelText('Weight (kg)')).toBeTruthy();expect(repo.list('weigh_ins')).toHaveLength(0);
});

test('unusual save waits for confirmation, cancel keeps input, confirm saves',async()=>{
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const repo=memoryRepository();repo.save('profile',{weight_unit:'kg'});saveWeighIn(repo,80,'kg');
 await render(<Body repository={repo}/>,{wrapper});
 await fireEvent.press(screen.getByRole('button',{name:'Log weigh-in'}));
 await fireEvent.press(screen.getByRole('button',{name:'Enter weight with keypad'}));
 await fireEvent.changeText(screen.getByLabelText('Weight (kg)'),'100');
 await fireEvent.press(screen.getByRole('button',{name:'Save weigh-in'}));
 expect(repo.list('weigh_ins')).toHaveLength(1);
 const buttons=alert.mock.calls.at(-1)![2]!;
 await act(()=>{buttons.find(b=>b.style==='cancel')?.onPress?.();});
 expect(screen.getByLabelText('Weight (kg)').props.value).toBe('100');
 await fireEvent.press(screen.getByRole('button',{name:'Save weigh-in'}));
 await act(()=>{alert.mock.calls.at(-1)![2]!.find(b=>b.text==='Save anyway')!.onPress!();});
 expect(repo.list('weigh_ins')).toHaveLength(2);
 expect(repo.list('weigh_ins')[1].data.weight_kg).toBe(100);
 alert.mockRestore();
});
test('delete confirmation cancels safely and removes only the selected entry',async()=>{
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const repo=memoryRepository();repo.save('profile',{weight_unit:'kg'});
 const first=saveWeighIn(repo,80,'kg'),keep=saveWeighIn(repo,82,'kg');
 await render(<Body repository={repo}/>,{wrapper});
 await fireEvent.press(screen.getByTestId(`body-delete-${first.id}`));
 expect(repo.list('weigh_ins')).toHaveLength(2);
 await act(()=>{alert.mock.calls.at(-1)![2]!.find(b=>b.style==='cancel')?.onPress?.();});
 expect(repo.list('weigh_ins')).toHaveLength(2);
 await fireEvent.press(screen.getByTestId(`body-delete-${first.id}`));
 await act(()=>{alert.mock.calls.at(-1)![2]!.find(b=>b.style==='destructive')!.onPress!();});
 expect(repo.list('weigh_ins')).toEqual([keep]);
 expect(screen.getByText('Trend: 82.0 kg')).toBeTruthy();
 alert.mockRestore();
});

test('delete buttons identify the date and lb value and confirmation includes the date',async()=>{
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const repo=memoryRepository();repo.save('profile',{weight_unit:'lb'});
 saveWeighIn(repo,180,'lb','2026-10-01');
 await render(<Body repository={repo}/>,{wrapper});
 await fireEvent.press(screen.getByRole('button',{name:'Delete weigh-in for 2026-10-01, 180.0 lb'}));
 expect(alert.mock.calls.at(-1)![0]).toBe('Delete weigh-in for 2026-10-01?');
 await act(()=>{alert.mock.calls.at(-1)![2]!.find(b=>b.style==='destructive')!.onPress!();});
 expect(repo.list('weigh_ins')).toEqual([]);alert.mockRestore();
});

test('delete list initially shows the 30 most recent readings and Show all expands it',async()=>{
 const repo=memoryRepository();repo.save('profile',{weight_unit:'kg'});
 // Reverse insertion makes chronology, rather than repository order, observable.
 for(let day=31;day>=1;day--)saveWeighIn(repo,80,'kg',`2026-08-${String(day).padStart(2,'0')}`);
 await render(<Body repository={repo}/>,{wrapper});
 expect(screen.getAllByRole('button',{name:/Delete weigh-in for/})).toHaveLength(30);
 expect(screen.queryByRole('button',{name:'Delete weigh-in for 2026-08-01, 80.0 kg'})).toBeNull();
 expect(screen.getAllByRole('button',{name:/Delete weigh-in for/})[0].props.accessibilityLabel).toContain('2026-08-31');
 await fireEvent.press(screen.getByRole('button',{name:'Show all'}));
 expect(screen.getAllByRole('button',{name:/Delete weigh-in for/})).toHaveLength(31);
});

test('a stale delete confirmation shows failure when its row is already deleted',async()=>{
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const repo=memoryRepository();repo.save('profile',{weight_unit:'kg'});
 const row=saveWeighIn(repo,80,'kg');
 await render(<Body repository={repo}/>,{wrapper});
 await fireEvent.press(screen.getByTestId(`body-delete-${row.id}`));
 const confirm=alert.mock.calls.at(-1)![2]!.find(b=>b.style==='destructive')!.onPress!;
 await act(()=>{repo.remove('weigh_ins',row.id);});
 await act(()=>{confirm();});
 expect(screen.getByRole('alert')).toHaveTextContent('Could not delete this weigh-in. Try again.');alert.mockRestore();
});

test('All selects the full synthetic history, including points older than one year', async () => {
 jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-29T12:00:00Z'));
 const repo = memoryRepository(); repo.save('profile', { weight_unit: 'kg' });
 for (const day of ['2024-01-01', '2025-05-01', '2026-10-29']) saveWeighIn(repo, 80, 'kg', day);
 await render(<Body repository={repo} />, { wrapper });
 expect(screen.getByRole('tab', { name: '1M' })).toBeSelected();
 expect(screen.getByRole('button', { name: 'Previous trend point' })).toBeDisabled();
 await fireEvent.press(screen.getByRole('tab', { name: 'All' }));
 expect(screen.getByRole('tab', { name: 'All' })).toBeSelected();
 expect(screen.getByRole('tab', { name: '1M' })).not.toBeSelected();
 await fireEvent.press(screen.getByRole('button', { name: 'Previous trend point' }));
 expect(screen.getByText(/2025-05-01 · Trend/)).toBeTruthy();
 await fireEvent.press(screen.getByRole('button', { name: 'Previous trend point' }));
 expect(screen.getByText(/2024-01-01 · Trend/)).toBeTruthy();
 expect(screen.getByRole('button', { name: 'Previous trend point' })).toBeDisabled();
});
