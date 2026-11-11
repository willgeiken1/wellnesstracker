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
 await fireEvent.press(screen.getByRole('tab',{name:'Light'}));await fireEvent.press(screen.getByRole('button',{name:'Moonlight Dusk'}));
 await view.unmount();view=await render(<ThemeProvider repository={a}><Appearance/></ThemeProvider>);
 expect(screen.getByRole('tab',{name:'Light'})).toBeSelected();expect(screen.getByRole('button',{name:'Moonlight Dusk'})).toBeSelected();
 await view.rerender(<ThemeProvider repository={b}><Appearance/></ThemeProvider>);
 expect(screen.getByRole('tab',{name:'System'})).toBeSelected();expect(screen.getByRole('button',{name:'Sea Glass Tide'})).toBeSelected();
});
test('an accent saved before themes opens as its closest theme, and a pick is saved in the same setting',async()=>{
 const repo=settingsRepository();repo.save('settings',{theme_override:'dark',accent:'sand',rest_seconds:90});
 await render(<ThemeProvider repository={repo}><Appearance/></ThemeProvider>);
 expect(screen.getByRole('button',{name:'Desert Mirage'})).toBeSelected();
 await fireEvent.press(screen.getByRole('button',{name:'Golden Hour'}));
 expect(repo.list('settings')[0].data).toMatchObject({theme_override:'dark',accent:'goldenHour',rest_seconds:90});
 expect(screen.getByRole('button',{name:'Golden Hour'})).toBeSelected();
 expect(screen.getAllByTestId('theme-selected-mark')).toHaveLength(1);
});
test('all 11 themes are offered and none is locked',async()=>{
 await render(<ThemeProvider repository={settingsRepository()}><Appearance/></ThemeProvider>);
 expect(screen.getAllByTestId(/^theme-(?!grid|selected)/)).toHaveLength(11);
 for(const name of ['Sea Glass Tide','Mountain Mist','Moonlight Dusk','Desert Mirage','Spring Citrus','Lotus Garden','Aurora Fjord','Berry Meadow','Golden Hour','Glacier Bloom','Forest Ember'])expect(screen.getByRole('button',{name})).toBeEnabled();
 expect(screen.queryByText('Midnight Neon')).toBeNull();expect(screen.queryByText('Holographic Chrome')).toBeNull();
});
