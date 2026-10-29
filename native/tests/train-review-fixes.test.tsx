import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Pressable, Text } from 'react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { WorkoutStore } from '../src/data/workout/store';
import { memoryRepository } from './workout-repository';
import { Workouts } from '../src/features/workout/templates';
import { FinishSheet } from '../src/features/workout/finish';
import { useAuth } from '../src/auth/provider';
import { t } from '../src/i18n/en';

jest.mock('../src/auth/provider', () => ({useAuth: jest.fn()}));
jest.mock('expo-router', () => ({useLocalSearchParams: () => ({}), router: {replace: jest.fn()}}));
const wrapper = ({children}: {children: React.ReactNode}) => <ThemeProvider>{children}</ThemeProvider>;
beforeEach(() => jest.clearAllMocks());
function fixture() {
 const store = new WorkoutStore(memoryRepository());
 jest.mocked(useAuth).mockReturnValue({repository:store.repo,ready:true,demo:true,syncStatus:'offline'} as ReturnType<typeof useAuth>);
 return store;
}
function routineOrder() {
 return screen.getAllByRole('button', {name:/^Start Synthetic .* · Not done yet$/}).map(row => row.props.accessibilityLabel);
}
test('routine menu moves routines both ways and updates list order and edge actions', async () => {
 const store=fixture();
 const routines=['A','B','C'].map(name => store.saveTemplate(`Synthetic ${name}`,[]));
 const move=jest.spyOn(WorkoutStore.prototype,'moveTemplate');
 try {
  await render(<Workouts/>,{wrapper});
  expect(screen.getByText('Example data')).toBeTruthy();
  expect(screen.getByText('Offline · logs save here and sync when you reconnect.')).toBeTruthy();
  expect(screen.getAllByRole('button',{name:'Move up'})).toHaveLength(2);
  expect(screen.getAllByRole('button',{name:'Move down'})).toHaveLength(2);
  await fireEvent.press(screen.getAllByRole('button',{name:'Move up'})[0]);
  expect(move).toHaveBeenLastCalledWith(routines[1].id,-1);
  expect(routineOrder()).toEqual(['B','A','C'].map(name => `Start Synthetic ${name} · Not done yet`));
  await fireEvent.press(screen.getAllByRole('button',{name:'Move down'})[0]);
  expect(move).toHaveBeenLastCalledWith(routines[1].id,1);
  expect(routineOrder()).toEqual(['A','B','C'].map(name => `Start Synthetic ${name} · Not done yet`));
 } finally {move.mockRestore();}
});
test('a single routine has no move actions', async () => {
 const store=fixture(); store.saveTemplate('Synthetic only',[]);
 await render(<Workouts/>,{wrapper});
 expect(screen.queryByRole('button',{name:'Move up'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Move down'})).toBeNull();
});
test.each([
 ['first',false,true],['middle',true,true],['last',true,false],['only',false,false],
])('fallback %s routine exposes only valid move actions', async (_,up,down) => {
 const {RoutineMenu:Fallback}=require('../src/features/workout/routine-menu.tsx');
 const moveUp=jest.fn(),moveDown=jest.fn();
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 try {
  await render(<Fallback edit={()=>{}} duplicate={()=>{}} remove={()=>{}} moveUp={up ? moveUp : undefined} moveDown={down ? moveDown : undefined}>
   {(onLongPress:()=>void) => <Pressable accessibilityRole="button" accessibilityLabel="Synthetic routine" onLongPress={onLongPress}><Text>Synthetic routine</Text></Pressable>}
  </Fallback>);
  await fireEvent(screen.getByRole('button',{name:'Synthetic routine'}),'longPress');
  const actions=alert.mock.calls.at(-1)![2]!;
  expect(actions.some(action => action.text==='Move up')).toBe(up);
  expect(actions.some(action => action.text==='Move down')).toBe(down);
  if (up) {await act(()=>actions.find(action=>action.text==='Move up')!.onPress!()); expect(moveUp).toHaveBeenCalledTimes(1);}
  if (down) {await act(()=>actions.find(action=>action.text==='Move down')!.onPress!()); expect(moveDown).toHaveBeenCalledTimes(1);}
 } finally {alert.mockRestore();}
});
test.each(['', '-1', 'NaN', 'Infinity'])('finish rejects invalid duration %j before saving', async duration => {
 const store=fixture(),session=store.start(undefined,Date.now()-60000);
 const finish=jest.spyOn(store,'finish');
 await render(<FinishSheet store={store} session={session} onClose={()=>{}}/>,{wrapper});
 await fireEvent.changeText(screen.getByLabelText('Duration in seconds'),duration);
 await fireEvent.press(screen.getByTestId('save-workout'));
 expect(screen.getByRole('alert')).toHaveTextContent(t('invalidFinish'));
 expect(finish).not.toHaveBeenCalled();
});
test.each(['2026-02-30 12:00','invalid','1960-01-01 12:00','2999-01-01 12:00'])('finish rejects invalid date %j before saving', async start => {
 const store=fixture(),session=store.start(undefined,Date.now()-60000);
 const finish=jest.spyOn(store,'finish');
 await render(<FinishSheet store={store} session={session} onClose={()=>{}}/>,{wrapper});
 await fireEvent.changeText(screen.getByLabelText(t('startDateTime')),start);
 await fireEvent.press(screen.getByTestId('save-workout'));
 expect(screen.getByRole('alert')).toHaveTextContent(t('invalidFinish'));
 expect(finish).not.toHaveBeenCalled();
});
test('finish rejects an end date after now before saving',async () => {
 const store=fixture(),session=store.start(undefined,Date.now()-60000);
 const finish=jest.spyOn(store,'finish');
 await render(<FinishSheet store={store} session={session} onClose={()=>{}}/>,{wrapper});
 await fireEvent.changeText(screen.getByLabelText('Duration in seconds'),'1e20');
 await fireEvent.press(screen.getByTestId('save-workout'));
 expect(screen.getByRole('alert')).toHaveTextContent(t('invalidFinish'));
 expect(finish).not.toHaveBeenCalled();
});
test.each(['Synthetic failure','Invalid date.','Invalid duration.'])('store error %j uses the generic save error',async message => {
 const store=fixture(),session=store.start(undefined,Date.now()-60000);
 jest.spyOn(store,'finish').mockImplementation(()=>{throw Error(message);});
 await render(<FinishSheet store={store} session={session} onClose={()=>{}}/>,{wrapper});
 await fireEvent.press(screen.getByTestId('save-workout'));
 expect(screen.getByRole('alert')).toHaveTextContent('Could not save this workout.');
 expect(screen.getByRole('button',{name:'Try again'})).toBeTruthy();
});
