import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import Appearance from '../src/features/settings/appearance';
import type { Repository } from '../src/data/repository';
import type { Row } from '../src/data/rows';
import { syntheticRow } from '../fixtures/sync';
function settingsRepository() {
 let saved:Row[]=[];const listeners=new Set<()=>void>();
 return { list:()=>saved, subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},save:(_table:unknown,data:Row['data'])=>{saved=[{...syntheticRow('settings'),data}];listeners.forEach(l=>l());return saved[0];} } as unknown as Repository;
}
test('theme and accent persist through provider restart and reset across owner repositories',async()=>{
 const a=settingsRepository(),b=settingsRepository();
 let view=await render(<ThemeProvider repository={a}><Appearance/></ThemeProvider>);
 await fireEvent.press(screen.getByRole('tab',{name:'Light'}));await fireEvent.press(screen.getByRole('button',{name:'Dusk'}));
 await view.unmount();view=await render(<ThemeProvider repository={a}><Appearance/></ThemeProvider>);
 expect(screen.getByRole('tab',{name:'Light'})).toBeSelected();expect(screen.getByRole('button',{name:'Dusk'})).toBeSelected();
 await view.rerender(<ThemeProvider repository={b}><Appearance/></ThemeProvider>);
 expect(screen.getByRole('tab',{name:'System'})).toBeSelected();expect(screen.getByRole('button',{name:'Citrus'})).toBeSelected();
});
