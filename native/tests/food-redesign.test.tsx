import { act, fireEvent, render, screen } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import { ThemeProvider } from '../src/design/theme-provider';
import { FoodScreen } from '../src/features/food/screen';
import Food from '../src/app/(tabs)/food';
import FoodLog from '../src/app/food/log';
import { memoryRepository } from './workout-repository';
import { WATER_ROW_ENABLED } from '../src/features/food/water-slot';

jest.mock('expo-router',()=>({router:{navigate:jest.fn()}}));
let mockRepository: ReturnType<typeof memoryRepository> | null;
jest.mock('../src/auth/provider',()=>({useAuth:()=>({repository:mockRepository})}));
jest.mock('@expo/ui',()=>{
 const React=require('react'),{View}=require('react-native');
 return {Host:View,RNHostView:View,BottomSheet:({isPresented,children}:any)=>isPresented?React.createElement(View,{testID:'targets-sheet'},children):null};
});
const wrapper=({children}:{children:React.ReactNode})=><ThemeProvider>{children}</ThemeProvider>;
beforeEach(()=>{jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-27T17:00:00Z'));mockRepository=memoryRepository();});
afterEach(()=>jest.useRealTimers());
for(const [name,Route] of [['Food',Food],['Food log',FoodLog]] as const){
 test(`${name}: loading waits 300 ms and never flashes empty`,async()=>{
  mockRepository=null;await render(<Route/>,{wrapper});
  expect(screen.queryByText('Nothing logged today')).toBeNull();
  expect(screen.queryByTestId('food-skeleton')).toBeNull();
  await act(()=>jest.advanceTimersByTime(299));expect(screen.queryByTestId('food-skeleton')).toBeNull();
  await act(()=>jest.advanceTimersByTime(1));expect(screen.getByTestId('food-skeleton')).toBeTruthy();
 });
 test(`${name}: empty offers breakfast logging`,async()=>{
  await render(<Route/>,{wrapper});expect(screen.getByText('Nothing logged today')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button',{name:'Log breakfast'}));expect(screen.getByLabelText('Food name')).toBeTruthy();
 });
 test(`${name}: read failure offers a working retry`,async()=>{
  const spy=jest.spyOn(mockRepository!,'list').mockImplementation(()=>{throw new Error('Synthetic failure');});
  await render(<Route/>,{wrapper});expect(screen.getByText('Food log could not be loaded.')).toBeTruthy();
  spy.mockRestore();await fireEvent.press(screen.getByRole('button',{name:'Try again'}));expect(screen.getByText('Nothing logged today')).toBeTruthy();
 });
 test(`${name}: data uses grouped meals`,async()=>{
  mockRepository!.save('food_entries',{day:'2026-10-27',meal_id:'fd000000-0000-4000-8000-000000000000',name:'Synthetic oats',energy_kj:418.4});
  await render(<Route/>,{wrapper});expect(screen.getByText('Synthetic oats')).toBeTruthy();
  expect(screen.getByTestId('food-meals')).toBeTruthy();expect(screen.queryByText('Nothing logged today')).toBeNull();
 });
}
test('targets live in a native sheet, split actions and reserved water slot precede meals',async()=>{
 await render(<FoodScreen repository={mockRepository!}/>,{wrapper});
 expect(screen.queryByText('Targets not set')).toBeNull();
 await fireEvent.press(screen.getByRole('button',{name:'Food targets info'}));expect(screen.getByTestId('targets-sheet')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Set food targets'})).toBeTruthy();
 expect(screen.getByTestId('food-log-actions')).toBeTruthy();
 expect(screen.getByLabelText('Example data')).toBeTruthy();expect(WATER_ROW_ENABLED).toBe(false);
 expect(screen.getByTestId('food-water-slot')).toHaveStyle({minHeight:88});
 expect(screen.queryByText('750 of 2,500 ml')).toBeNull();
 const spec=fs.readFileSync(path.join(__dirname,'../design/REDESIGN.md'),'utf8');
 expect(spec).toContain('row between the log row and Meals');expect(spec).toContain('no reflow');
 const source=fs.readFileSync(path.join(__dirname,'../src/features/food/screen.tsx'),'utf8');
 const waterSource=fs.readFileSync(path.join(__dirname,'../src/features/food/water-slot.tsx'),'utf8');
 expect(waterSource).toContain('M3, I10');expect(waterSource).toContain('token pending, Q-C');
 expect(source.indexOf('<WaterSlot')).toBeLessThan(source.indexOf('testID="food-meals"'));
});
test('presentation has no literal colours, pastel slabs, cards or workout panels',()=>{
 const files=['app/(tabs)/food/index.tsx','app/food/log.tsx',...fs.readdirSync(path.join(__dirname,'../src/features/food')).filter(f=>f.endsWith('.tsx')).map(f=>'features/food/'+f)];
 for(const file of files){
  const source=fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
  expect(source).not.toMatch(/#[\da-f]{3,8}\b|rgba?\s*\(/i);
  expect(source).not.toMatch(/backgroundColor\s*:\s*[^,}\n]*(?:accent-tint|accent-2|ring-oura|pink|pastel)/i);
  expect(source).not.toMatch(/components\/card|workout\/primitives|<Card\b/);
 }
});
