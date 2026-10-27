import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { PlansPanel } from '../src/features/plans/panel';
import { WorkoutStore } from '../src/data/workout/store';
import { PlanStore } from '../src/features/plans/store';
import { memoryRepository } from './workout-repository';
import { Workouts } from '../src/features/workout/templates';
import { useWorkout } from '../src/features/workout/use-workout';
jest.mock('../src/features/workout/use-workout',()=>({useWorkout:jest.fn()}));
import { AccessibilityInfo } from 'react-native';
jest.mock('expo-router',()=>({router:{push:jest.fn()}}));
beforeEach(()=>jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(false));
test('accessible mode, routine and weekday controls save fixed plan and target',async()=>{
 const repo=memoryRepository();Object.defineProperty(repo,'syncFlags',{value:{syncedV1Columns:true}});
 const workout=new WorkoutStore(repo);const a=workout.saveTemplate('Synthetic A',[]);
 await render(<ThemeProvider><PlansPanel store={workout}/></ThemeProvider>);
 await fireEvent.press(screen.getByRole('button',{name:'Edit plan'}));
 expect(screen.getByLabelText('Plan mode')).toBeTruthy();
 await fireEvent.press(screen.getByRole('tab',{name:'Fixed weekdays'}));
 await fireEvent.press(screen.getByRole('checkbox',{name:'Plan day: Synthetic A'}));
 await fireEvent.press(screen.getByRole('checkbox',{name:'Synthetic A: Monday'}));
 await fireEvent.changeText(screen.getByLabelText('Days per week'),'5');
 await fireEvent.press(screen.getByRole('button',{name:'Save plan'}));
 expect(new PlanStore(repo).read()).toEqual({mode:'fixed',daysPerWeek:5,days:[{routineId:a.id,weekdays:[0]}]});
});
test('invalid target stays in editor with catalog validation message',async()=>{
 const repo=memoryRepository();Object.defineProperty(repo,'syncFlags',{value:{syncedV1Columns:true}});
 await render(<ThemeProvider><PlansPanel store={new WorkoutStore(repo)}/></ThemeProvider>);
 await fireEvent.press(screen.getByRole('button',{name:'Edit plan'}));
 await fireEvent.changeText(screen.getByLabelText('Days per week'),'8');
 await fireEvent.press(screen.getByRole('button',{name:'Save plan'}));
 expect(screen.getByRole('alert')).toHaveTextContent(/Choose 1–7 whole days and assign each weekday to at most one plan day\./);
});
test('fixed routine without weekdays stays in the editor with an accessible error',async()=>{
 const repo=memoryRepository();Object.defineProperty(repo,'syncFlags',{value:{syncedV1Columns:true}});
 const workout=new WorkoutStore(repo);workout.saveTemplate('Synthetic A',[]);
 await render(<ThemeProvider><PlansPanel store={workout}/></ThemeProvider>);
 await fireEvent.press(screen.getByRole('button',{name:'Edit plan'}));
 await fireEvent.press(screen.getByRole('tab',{name:'Fixed weekdays'}));
 await fireEvent.press(screen.getByRole('checkbox',{name:'Plan day: Synthetic A'}));
 await fireEvent.press(screen.getByRole('button',{name:'Save plan'}));
 expect(screen.getByRole('alert')).toHaveTextContent(/In Fixed mode, choose at least one weekday for each plan day\./);
 expect(screen.getByRole('button',{name:'Save plan'})).toBeTruthy();
 expect(new PlanStore(repo).read().days).toEqual([]);
});
test('flag off shows defaults and no editable mode or target',async()=>{
 await render(<ThemeProvider><PlansPanel store={new WorkoutStore(memoryRepository())}/></ThemeProvider>);
 await fireEvent.press(screen.getByRole('button',{name:'Edit plan'}));
 expect(screen.queryByLabelText('Plan mode')).toBeNull();
 expect(screen.queryByLabelText('Days per week')).toBeNull();
 expect(screen.getByText('Rotation · 3 days per week')).toBeTruthy();
});

test('starting a member routine from the routine list also advances only after finish',async()=>{
 const repo=memoryRepository();const workout=new WorkoutStore(repo);
 const a=workout.saveTemplate('Synthetic A',[]),b=workout.saveTemplate('Synthetic B',[]);
 const plans=new PlanStore(repo);plans.save({mode:'rotation',daysPerWeek:3,days:[{routineId:a.id,weekdays:[]},{routineId:b.id,weekdays:[]}]});
 jest.mocked(useWorkout).mockReturnValue({store:workout} as ReturnType<typeof useWorkout>);
 await render(<ThemeProvider><Workouts/></ThemeProvider>);
 await fireEvent.press(screen.getByRole('button',{name:'Start Synthetic A'}));
 expect(plans.nextIndex()).toBe(0);
 const session=workout.active()!,now=Number(session.data.started_at);
 workout.finish(session.id,{startedAt:now,finishedAt:now,notes:''});
 expect(plans.nextIndex()).toBe(1);
});
