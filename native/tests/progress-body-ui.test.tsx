import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import Progress from '../src/app/(tabs)/progress';
import { memoryRepository } from './workout-repository';
const mockRepository=memoryRepository();
jest.mock('../src/auth/provider',()=>({useAuth:()=>({repository:mockRepository})}));
test('Progress opens Body and keeps Photos and Goals in their own segments',async()=>{
 await render(<ThemeProvider><Progress/></ThemeProvider>);
 expect(screen.getByRole('button',{name:'Add your first weigh-in'})).toBeTruthy();
 for(const name of ['Photos','Goals & PRs']){
  await fireEvent.press(screen.getByRole('tab',{name}));expect(screen.getByRole('tab',{name})).toBeSelected();
  expect(screen.queryByRole('button',{name:'Add your first weigh-in'})).toBeNull();
 }
 await fireEvent.press(screen.getByRole('tab',{name:'Body'}));expect(screen.getByRole('button',{name:'Add your first weigh-in'})).toBeTruthy();
});
