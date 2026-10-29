import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { CalorieRing } from '../src/features/food/ring';
const wrapper=({children}:{children:React.ReactNode})=><ThemeProvider>{children}</ThemeProvider>;
const total={energy_kj:418.4,protein_g:5,carbs_g:20,fat_g:2,fiber_g:null,sugar_g:null,sodium_mg:null,amount_g:null};
test('ring exposes calories and macro values accessibly and marks estimates',async()=>{
 await render(<CalorieRing total={total} target={{energy_kj:836.8,protein_g:10,carbs_g:40,fat_g:4}} estimated/>,{wrapper});
 expect(screen.getByRole('image',{name:'100 kcal of 200; protein 5 g, carbs 20 g, fat 2 g'})).toBeTruthy();
 for(const label of ['100 of 200 kcal','Protein · 5 of 10 g','Carbs · 20 of 40 g','Fat · 2 of 4 g'])expect(screen.getByText(label,{includeHiddenElements:true})).toBeTruthy();
 expect(screen.getByText('Dashed arcs indicate AI estimates.',{includeHiddenElements:true})).toBeTruthy();
});
test('unknown targets and values remain unknown',async()=>{
 await render(<CalorieRing total={{...total,energy_kj:null,protein_g:null}} target={null}/>,{wrapper});
 expect(screen.getByRole('image',{name:'— kcal of —; protein — g, carbs 20 g, fat 2 g'})).toBeTruthy();
});
