import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { WorkoutStore } from '../src/data/workout/store';
import { memoryRepository } from './workout-repository';
import { TemplateEditor, Workouts } from '../src/features/workout/templates';
import { useWorkout } from '../src/features/workout/use-workout';
import { Summary } from '../src/features/workout/summary';
import { WorkoutDay } from '../src/features/workout/days';
import { ActiveWorkout } from '../src/features/workout/active';
import { FinishSheet } from '../src/features/workout/finish';
import { SetRow } from '../src/features/workout/set-row';
import { Alert } from 'react-native';
import { router } from 'expo-router';
jest.mock('../src/features/workout/use-workout', () => ({...jest.requireActual('../src/features/workout/use-workout'), useWorkout: jest.fn()}));
jest.mock('expo-router', () => ({useLocalSearchParams: () => ({}), router: {push: jest.fn(), navigate: jest.fn(), back:jest.fn(), replace:jest.fn(), canDismiss:()=>false}}));
const wrapper = ({children}: {children: React.ReactNode}) => <ThemeProvider>{children}</ThemeProvider>;
function fixture() {
 const store = new WorkoutStore(memoryRepository());
 jest.mocked(useWorkout).mockReturnValue({store, auth: {ready:true, demo:false, syncStatus:'idle'}} as ReturnType<typeof useWorkout>);
 return store;
}
beforeEach(() => jest.clearAllMocks());
test('empty routines and history give their specific next step', async () => {
 fixture(); await render(<Workouts/>, {wrapper});
 expect(screen.getByText('No routines yet')).toBeTruthy();
 expect(screen.getByRole('button', {name:'Start empty workout'})).toBeTruthy();
 await fireEvent.press(screen.getByRole('tab', {name:'History'}));
 expect(screen.getByText('Your finished workouts show here')).toBeTruthy();
});
test('initial load delays skeletons and never flashes empty', async () => {
 jest.useFakeTimers();
 fixture(); jest.mocked(useWorkout).mockReturnValue({store:null, auth:{ready:false}} as ReturnType<typeof useWorkout>);
 try {
  await render(<Workouts/>, {wrapper});
  expect(screen.queryByText('No routines yet')).toBeNull();
  expect(screen.queryByTestId('workout-loading')).toBeNull();
  await act(() => jest.advanceTimersByTime(301));
  expect(screen.getByTestId('workout-loading')).toBeTruthy();
 } finally {jest.useRealTimers();}
});
test('data shows up next and grouped routines', async () => {
 const store=fixture(); store.saveTemplate('Synthetic push', [{exercise:'Bench Press',target_sets:2,target_reps:8}]);
 await render(<Workouts/>, {wrapper});
 expect(screen.getByText('Up next')).toBeTruthy();
 expect(screen.getByText('1 exercise')).toBeTruthy();
 expect(screen.getByTestId('routine-list')).toBeTruthy();
 await fireEvent.press(screen.getAllByRole('button', {name:'Start Synthetic push'})[0]);
 expect(store.active()).toBeTruthy(); expect(router.push).toHaveBeenCalledWith('/workout');
});
test('failed start retries the action without losing the routine', async () => {
 const store=fixture(); store.saveTemplate('Synthetic push', []);
 const start=jest.spyOn(store,'start').mockImplementationOnce(() => {throw Error('Synthetic failure');});
 await render(<Workouts/>, {wrapper});
 await fireEvent.press(screen.getAllByRole('button', {name:'Start Synthetic push'})[0]);
 expect(screen.getByRole('alert')).toHaveTextContent('Could not save this change.');
 await fireEvent.press(screen.getByRole('button', {name:'Try again'}));
 expect(start).toHaveBeenCalledTimes(2); expect(store.templates()).toHaveLength(1);
});


test.each([['editor',TemplateEditor],['summary',Summary],['day',WorkoutDay],['logger',ActiveWorkout]])('%s delays initial loading and exposes repository recovery', async (_,Component) => {
 jest.useFakeTimers();
 const retryBoot=jest.fn();
 fixture(); jest.mocked(useWorkout).mockReturnValue({store:null,auth:{ready:false,retryBoot}} as unknown as ReturnType<typeof useWorkout>);
 try {
  const view=await render(<Component/>,{wrapper});
  expect(screen.queryByTestId('workout-loading')).toBeNull();
  await act(() => jest.advanceTimersByTime(301));
  expect(screen.getByTestId('workout-loading')).toBeTruthy();
  jest.mocked(useWorkout).mockReturnValue({store:null,auth:{ready:false,recovery:'boot-error',retryBoot}} as unknown as ReturnType<typeof useWorkout>);
  await view.rerender(<Component/>);
  expect(screen.getByRole('alert')).toHaveTextContent('Workouts are unavailable.');
  await fireEvent.press(screen.getByRole('button',{name:'Try again'}));
  expect(retryBoot).toHaveBeenCalled();
 } finally {jest.useRealTimers();}
});
test('routine duplication keeps exercise options; deletion requires a second confirmation',async () => {
 const store=fixture(); store.saveTemplate('Synthetic push',[{exercise:'Bench Press',target_sets:2,target_reps:8,rep_min:6,rep_max:10}]);
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 try {
  await render(<Workouts/>,{wrapper});
  await fireEvent.press(screen.getByRole('button',{name:'Duplicate'}));
  expect(store.templates()).toHaveLength(2);
  const copy=store.templates().find(r=>r.data.name==='Synthetic push copy')!;
  expect(store.templateExercises(copy.id)[0].data).toMatchObject({exercise:'Bench Press',target_sets:2,rep_min:6,rep_max:10});
  await fireEvent.press(screen.getByRole('button',{name:'Delete'}));
  expect(store.templates()).toHaveLength(2);
  const confirmation=alert.mock.calls.at(-1)![2]!;
  expect(confirmation.find(b=>b.style==='cancel')).toBeTruthy();
  await act(() => confirmation.find(b=>b.style==='destructive')!.onPress!());
  expect(store.templates()).toHaveLength(1);
 } finally {alert.mockRestore();}
});
test('editor empty, data and failed save keep the draft for retry',async () => {
 const store=fixture(); const save=jest.spyOn(store,'saveTemplate').mockImplementationOnce(()=>{throw Error('Synthetic failure');});
 await render(<TemplateEditor/>,{wrapper});
 expect(screen.getByLabelText('Template name')).toHaveProp('value','');
 await fireEvent.changeText(screen.getByLabelText('Template name'),'Synthetic draft');
 await fireEvent.press(screen.getByRole('button',{name:'Save template'}));
 expect(screen.getByRole('alert')).toHaveTextContent('Could not save this routine.');
 expect(screen.getByLabelText('Template name')).toHaveProp('value','Synthetic draft');
 await fireEvent.press(screen.getByRole('button',{name:'Try again'}));
 expect(save).toHaveBeenCalledTimes(2); expect(store.templates()[0].data.name).toBe('Synthetic draft');
});
test('finish save failure keeps notes and retries with the same session',async () => {
 const store=fixture(),session=store.start();
 const finish=jest.spyOn(store,'finish').mockImplementationOnce(()=>{throw Error('Synthetic failure');});
 await render(<FinishSheet store={store} session={session} onClose={()=>{}}/>,{wrapper});
 await fireEvent.changeText(screen.getByLabelText('Notes'),'Synthetic note');
 await fireEvent.press(screen.getByTestId('save-workout'));
 expect(screen.getByRole('alert')).toHaveTextContent('Could not save this workout.');
 expect(screen.getByLabelText('Notes')).toHaveProp('value','Synthetic note');
 expect(store.active()?.id).toBe(session.id);
 await fireEvent.press(screen.getByRole('button',{name:'Try again'}));
 expect(finish).toHaveBeenCalledTimes(2); expect(store.history()[0].data.notes).toBe('Synthetic note');
});
test('dense set inputs and completion retain 44 point targets',async () => {
 await render(<SetRow exercise="Synthetic press" index={0} draft={{weight:'',reps:''}} previous="" hint="" onEdit={()=>{}} onDone={()=>{}} onRemove={()=>{}}/>,{wrapper});
 for (const id of ['set-row-0-0','set-0-0-weight','set-0-0-reps','set-0-0-done']) expect(screen.getByTestId(id)).toHaveStyle({minHeight:44});
});

test('summary with no selected workout has an empty state and exit',async () => {
 fixture(); await render(<Summary/>,{wrapper});
 expect(screen.getByText('Your finished workouts show here')).toBeTruthy();
 expect(screen.getByTestId('summary-done')).toBeTruthy();
});
test('history data groups by week and shows volume, print and PR count',async () => {
 const store=fixture(); const session=store.start(undefined,Date.now()-60000);
 const entry=store.addExercise(session.id,'Bench Press',1);
 store.editDraft(entry.id,0,{weight:'50',reps:'8'}); store.toggleDone(entry.id,0);
 store.finish(session.id,{startedAt:Number(session.data.started_at),finishedAt:Date.now()-1000,notes:'',name:'Synthetic history'});
 await render(<Workouts/>,{wrapper});
 await fireEvent.press(screen.getByRole('tab',{name:'History'}));
 expect(screen.getByText(/Week of /)).toBeTruthy();
 expect(screen.getByText('Synthetic history')).toBeTruthy();
 expect(screen.getByText(/PRs/)).toBeTruthy();
});

test('fallback menu receives the row long press and exposes all actions',async () => {
 const {RoutineMenu:Fallback}=require('../src/features/workout/routine-menu.tsx');
 const {Pressable,Text}=require('react-native');
 const edit=jest.fn(),duplicate=jest.fn(),remove=jest.fn();
 const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 try {
  await render(<Fallback edit={edit} duplicate={duplicate} remove={remove}>{(onLongPress?:()=>void) => <Pressable accessibilityRole="button" accessibilityLabel="Synthetic routine" onLongPress={onLongPress}><Text>Synthetic routine</Text></Pressable>}</Fallback>);
  await fireEvent(screen.getByRole('button',{name:'Synthetic routine'}),'longPress');
  const actions=alert.mock.calls.at(-1)![2]!;
  expect(actions.map(a=>a.text)).toEqual(['Edit','Duplicate','Delete','Cancel']);
  await act(() => actions[1].onPress!()); expect(duplicate).toHaveBeenCalledTimes(1);
 } finally {alert.mockRestore();}
});
