import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { WorkoutStore } from '../src/data/workout/store';
import { memoryRepository } from './workout-repository';
import { FinishSheet } from '../src/features/workout/finish';
import { WorkoutSummary } from '../src/features/workout/summary';
import { ActiveWorkout } from '../src/features/workout/active';
import { DaySummary, WeekStrip } from '../src/features/workout/days';
import { useAuth } from '../src/auth/provider';
import { router, useLocalSearchParams } from 'expo-router';
import { localDay } from '../src/core/workout/rules';
jest.mock('../src/auth/provider', () => ({useAuth:jest.fn()}));
jest.mock('expo-router', () => ({useLocalSearchParams:jest.fn(() => ({})), useIsFocused:()=>true, router:{push:jest.fn(),replace:jest.fn(),canDismiss:()=>false}}));
jest.mock('expo-keep-awake', () => ({useKeepAwake:jest.fn()}));
jest.mock('../src/features/workout/haptics', () => ({tick:jest.fn(),signatureBuzz:jest.fn()}));
const wrapper = ({children}: {children:React.ReactNode}) => <ThemeProvider>{children}</ThemeProvider>;
beforeEach(() => {jest.clearAllMocks(); jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);});
function fixture(duration = 60000) {
 const store = new WorkoutStore(memoryRepository());
 const stamp = Date.now()-86400000;
 const session = store.start(undefined,stamp);
 const entry = store.addExercise(session.id,'Bench Press',1);
 store.editDraft(entry.id,0,{weight:'100',reps:'8'}); store.toggleDone(entry.id,0);
 store.finish(session.id,{startedAt:stamp,finishedAt:stamp+duration,notes:''});
 return {store,session,entry};
}
test('summary edit entry and Edited mark respond only to a real change', async () => {
 const {store,session,entry} = fixture();
 await render(<WorkoutSummary store={store} id={session.id}/>,{wrapper});
 expect(screen.queryByText('Edited')).toBeNull();
 await fireEvent.press(screen.getByRole('button',{name:'Edit workout'}));
 expect(router.push).toHaveBeenCalledWith({pathname:'/workout',params:{id:session.id}});
 await act(() => store.editDraft(entry.id,0,{reps:'8'}));
 expect(screen.queryByText('Edited')).toBeNull();
 await act(() => store.editDraft(entry.id,0,{reps:'9'}));
 expect(screen.getByText('Edited')).toBeTruthy();
});
test('historical logger uses keypad without a clock, timer or interval', async () => {
 const {store,session} = fixture();
 jest.mocked(useAuth).mockReturnValue({repository:store.repo,pending:0,syncStatus:'idle'} as ReturnType<typeof useAuth>);
 jest.mocked(useLocalSearchParams).mockReturnValue({id:session.id});
 const interval = jest.spyOn(global,'setInterval');
 await render(<ActiveWorkout/>,{wrapper});
 expect(screen.getByText(String(session.data.day))).toBeTruthy();
 expect(screen.queryByText('1:00')).toBeNull();
 expect(screen.queryByTestId('rest-sheet-handle')).toBeNull();
 expect(interval).not.toHaveBeenCalled();
 await fireEvent.press(screen.getByRole('button',{name:'Expand exercise'}));
 await fireEvent.press(screen.getByTestId('set-0-0-weight'));
 expect(screen.getByRole('button',{name:'Next: Reps'})).toBeTruthy();
 expect(store.timer()).toBeFalsy();
 interval.mockRestore();
});
test('past week day opens its day summary, including empty day logging', async () => {
 const {store,session} = fixture();
 const yesterday = String(session.data.day);
 const view = await render(<WeekStrip/>,{wrapper});
 await fireEvent.press(screen.getByRole('button',{name:`View workouts for ${yesterday}`}));
 expect(router.push).toHaveBeenCalledWith({pathname:'/workout/day',params:{day:yesterday}});
 await view.rerender(<DaySummary store={store} day={yesterday}/>);
 expect(screen.getByText(/Bench Press/)).toBeTruthy();
 await fireEvent.press(screen.getByRole('button',{name:'Log workout for this day'}));
 expect(router.push).toHaveBeenCalledWith({pathname:'/workout',params:{day:yesterday}});
 await view.rerender(<DaySummary store={store} day={localDay(new Date(Date.now()-3*86400000))}/>);
 expect(screen.getByText('No workouts on this day.')).toBeTruthy();
});

test('opening Finish on history preserves date and exact duration without marking it edited', async () => {
 const {store,session} = fixture(60001);
 await render(<FinishSheet store={store} session={store.repo.get('sessions',session.id)!} onClose={()=>{}}/>,{wrapper});
 expect(screen.getByLabelText('Duration in seconds')).toHaveProp('value','60.001');
 await fireEvent.press(screen.getByTestId('save-workout'));
 expect(store.edited(session.id)).toBe(false);
 expect(store.repo.get('sessions',session.id)?.data.duration_ms).toBe(60001);
});

test('opening a past date creates a preset logger without starting a clock interval', async () => {
 const store = new WorkoutStore(memoryRepository());
 jest.mocked(useAuth).mockReturnValue({repository:store.repo,pending:0,syncStatus:'idle'} as ReturnType<typeof useAuth>);
 jest.mocked(useLocalSearchParams).mockReturnValue({day:'2026-10-01'});
 const interval = jest.spyOn(global,'setInterval');
 await render(<ActiveWorkout/>,{wrapper});
 expect(screen.getByText('2026-10-01')).toBeTruthy();
 expect(store.active()).toBeUndefined();
 expect(store.timer()).toBeFalsy();
 expect(interval).not.toHaveBeenCalled();
 interval.mockRestore();
});
