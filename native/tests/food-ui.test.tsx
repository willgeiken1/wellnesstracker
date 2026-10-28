import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { foodTargets } from '../src/features/food/model';
import { FoodScreen } from '../src/features/food/screen';
import { memoryRepository } from './workout-repository';
const wrapper=({children}:{children:React.ReactNode})=><ThemeProvider>{children}</ThemeProvider>;
beforeEach(()=>{jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-27T17:00:00Z'));});
afterEach(()=>jest.useRealTimers());
test('four meals, manual entry names day, blank nutrients, edit portions, delete and Undo',async()=>{
 const repo=memoryRepository();await render(<FoodScreen repository={repo}/>,{wrapper});
 for(const meal of ['Breakfast','Lunch','Dinner','Snacks'])expect(screen.getByRole('button',{name:meal})).toBeTruthy();
 await fireEvent.press(screen.getByRole('button',{name:'Manual'}));
 await fireEvent.changeText(screen.getByLabelText('Food name'),'Synthetic oats');
 await fireEvent.changeText(screen.getByLabelText('Calories (kcal)'),'100');
 await fireEvent.press(screen.getByRole('button',{name:'Save to 2026-10-27'}));
 expect(repo.list('food_entries')).toHaveLength(1);expect(screen.getByText('Synthetic oats')).toBeTruthy();
 await fireEvent.press(screen.getByRole('button',{name:'Edit Synthetic oats'}));
 await fireEvent.changeText(screen.getByLabelText('Portion multiplier'),'2');await fireEvent.press(screen.getByRole('button',{name:'Save to 2026-10-27'}));
 expect(repo.list('food_entries')[0].data.energy_kj).toBeCloseTo(836.8);
 await fireEvent.press(screen.getByRole('button',{name:'Delete Synthetic oats'}));expect(repo.list('food_entries')).toHaveLength(0);
 await fireEvent.press(screen.getByRole('button',{name:'Undo delete'}));expect(repo.list('food_entries')).toHaveLength(1);
});
test('past day selected explicitly, future blocked, missing stats inline target entry',async()=>{
 const repo=memoryRepository();await render(<FoodScreen repository={repo}/>,{wrapper});
 expect(screen.getByRole('button',{name:'Next food day'})).toBeDisabled();
 await fireEvent.press(screen.getByRole('button',{name:'Previous food day'}));await fireEvent.press(screen.getByRole('button',{name:'Manual'}));
 expect(screen.getByRole('button',{name:'Save to 2026-10-26'})).toBeTruthy();await fireEvent.press(screen.getByRole('button',{name:'Cancel'}));
 await fireEvent.press(screen.getByRole('button',{name:'Set food targets'}));
 for(const [label,value] of [['Target calories (kcal)','2000'],['Target protein (g)','100'],['Target carbs (g)','250'],['Target fat (g)','67']])await fireEvent.changeText(screen.getByLabelText(label),value);
 await fireEvent.press(screen.getByRole('button',{name:'Save targets'}));expect(repo.list('food_targets')).toHaveLength(1);
});
test('Snap asks consent before camera or services, calendar excludes future',async()=>{
 await render(<FoodScreen repository={memoryRepository()}/>,{wrapper});
 await fireEvent.press(screen.getByRole('button',{name:'Snap'}));expect(screen.getByText('Use AI for this meal?')).toBeTruthy();await fireEvent.press(screen.getByRole('button',{name:'Cancel'}));
 await fireEvent.press(screen.getByRole('button',{name:'Open food calendar'}));expect(screen.getByRole('button',{name:'2026-10-28'})).toBeDisabled();
});
test('saved foods, favorites, combos, copy yesterday, rename/add meals persist through UI',async()=>{
 const repo=memoryRepository();await render(<FoodScreen repository={repo}/>,{wrapper});
 await fireEvent.press(screen.getByRole('button',{name:'Previous food day'}));await fireEvent.press(screen.getByRole('button',{name:'Manual'}));
 await fireEvent.changeText(screen.getByLabelText('Food name'),'Synthetic toast');await fireEvent.changeText(screen.getByLabelText('Calories (kcal)'),'120');
 await fireEvent.press(screen.getByRole('button',{name:'Save to 2026-10-26'}));
 await fireEvent.press(screen.getByRole('button',{name:'Favorite Synthetic toast'}));await fireEvent.press(screen.getByRole('button',{name:'Save Synthetic toast for later'}));
 expect(repo.list('saved_foods')).toHaveLength(1);
 await fireEvent.press(screen.getByRole('button',{name:'Save Breakfast as combo'}));await fireEvent.press(screen.getByRole('button',{name:'Save combo'}));
 await fireEvent.press(screen.getByRole('button',{name:'Next food day'}));await fireEvent.press(screen.getByRole('button',{name:'Copy yesterday to Breakfast'}));
 expect(repo.list('food_entries').filter(r=>r.data.day==='2026-10-27')).toHaveLength(1);
 await fireEvent.press(screen.getByRole('button',{name:'Saved'}));await fireEvent.press(screen.getByRole('button',{name:'Log Breakfast'}));
 expect(repo.list('food_entries').filter(r=>r.data.day==='2026-10-27')).toHaveLength(2);
 await fireEvent.press(screen.getByRole('button',{name:'Rename Breakfast'}));await fireEvent.changeText(screen.getByLabelText('Meal name'),'Morning');await fireEvent.press(screen.getByRole('button',{name:'Save meal name'}));
 expect(screen.getByRole('button',{name:'Morning'})).toBeTruthy();
 await fireEvent.press(screen.getByRole('button',{name:'Add meal'}));await fireEvent.changeText(screen.getByLabelText('Meal name'),'After work');await fireEvent.press(screen.getByRole('button',{name:'Save meal name'}));
 expect(screen.getByRole('button',{name:'After work'})).toBeTruthy();
});
test('before 4 AM starts previous day and one tap switches today without changing explicit past selection',async()=>{
 jest.setSystemTime(new Date(2026,9,27,1,30));
 await render(<FoodScreen repository={memoryRepository()}/>,{wrapper});
 expect(screen.getByText('Before 4 AM: logging to 2026-10-26.')).toBeTruthy();
 await fireEvent.press(screen.getByRole('button',{name:'Use today instead'}));await fireEvent.press(screen.getByRole('button',{name:'Manual'}));
 expect(screen.getByRole('button',{name:'Save to 2026-10-27'})).toBeTruthy();
 await fireEvent.press(screen.getByRole('button',{name:'Cancel'}));await fireEvent.press(screen.getByRole('button',{name:'Previous food day'}));await fireEvent.press(screen.getByRole('button',{name:'Previous food day'}));
 expect(screen.queryByRole('button',{name:'Use today instead'})).toBeNull();
});
test('failed save retains form, and failed Undo keeps Undo action available',async()=>{
 const repo=memoryRepository();await render(<FoodScreen repository={repo} initialManual/>,{wrapper});
 await fireEvent.changeText(screen.getByLabelText('Food name'),'Synthetic rice');
 const save=jest.spyOn(repo,'save').mockImplementation(()=>{throw new Error('Synthetic failure');});
 await fireEvent.press(screen.getByRole('button',{name:'Save to 2026-10-27'}));expect(screen.getByRole('alert')).toBeTruthy();expect(screen.getByLabelText('Food name')).toHaveDisplayValue('Synthetic rice');
 save.mockRestore();await fireEvent.press(screen.getByRole('button',{name:'Save to 2026-10-27'}));await fireEvent.press(screen.getByRole('button',{name:'Delete Synthetic rice'}));
 const restore=jest.spyOn(repo,'save').mockImplementation(()=>{throw new Error('Synthetic failure');});await fireEvent.press(screen.getByRole('button',{name:'Undo delete'}));expect(screen.getByRole('button',{name:'Undo delete'})).toBeTruthy();
 restore.mockRestore();await fireEvent.press(screen.getByRole('button',{name:'Undo delete'}));expect(repo.list('food_entries')).toHaveLength(1);
});

test('repository revisions refresh totals and targets without reopening the screen',async()=>{
 const repo=memoryRepository();await render(<FoodScreen repository={repo}/>,{wrapper});
 await act(()=>{repo.save('food_entries',{day:'2026-10-27',meal_id:'fd000000-0000-4000-8000-000000000000',name:'Synthetic fruit',energy_kj:418.4});repo.save('food_targets',{day:'2026-10-27',energy_kj:836.8,protein_g:10,carbs_g:40,fat_g:4});repo.localSave('targetBasis','manual');});
 expect(foodTargets(repo,'2026-10-27').targets!.energy_kj).toBe(836.8);
 expect(screen.getByRole('image',{name:'100 kcal of 200; protein — g, carbs — g, fat — g'})).toBeTruthy();
 expect(screen.getByText('Daily targets (manual)')).toBeTruthy();
});
