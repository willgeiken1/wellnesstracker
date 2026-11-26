import { render, screen, fireEvent } from '@testing-library/react-native';
import { DEFAULT_PALETTE, paletteName, palettes } from '../src/design/tokens';
import { ThemeProvider } from '../src/design/theme-provider';
import Appearance from '../src/features/settings/appearance';
import type { Repository } from '../src/data/repository';
import type { Row } from '../src/data/rows';
import { syntheticRow } from '../fixtures/sync';
/* Appearance follows the final design: Theme and Palette are radio groups, one radio per mode and per palette. */
const pal=(id:Parameters<typeof paletteName>[0])=>screen.getByRole('radio',{name:new RegExp('^'+paletteName(id)+'(, default)?$')});
const checkedPalettes=()=>screen.getAllByTestId(/^appearance-palette-/).filter(el=>el.props.accessibilityState?.checked);
function settingsRepository() {
 let saved:Row[]=[];const listeners=new Set<()=>void>();
 return { list:()=>saved, subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},save:(_table:unknown,data:Row['data'])=>{saved=[{...syntheticRow('settings'),data}];listeners.forEach(l=>l());return saved[0];} } as unknown as Repository;
}
test('theme and accent persist through provider restart and reset across owner repositories',async()=>{
 const a=settingsRepository(),b=settingsRepository();
 let view=await render(<ThemeProvider repository={a}><Appearance/></ThemeProvider>);
 await fireEvent.press(screen.getByRole('radio',{name:'Light'}));await fireEvent.press(pal('moonlightDusk'));
 await view.unmount();view=await render(<ThemeProvider repository={a}><Appearance/></ThemeProvider>);
 expect(screen.getByRole('radio',{name:'Light'})).toBeChecked();expect(pal('moonlightDusk')).toBeChecked();
 await view.rerender(<ThemeProvider repository={b}><Appearance/></ThemeProvider>);
 // A fresh install starts on Dark, as in the final mockup.
 expect(screen.getByRole('radio',{name:'Dark'})).toBeChecked();expect(pal(DEFAULT_PALETTE)).toBeChecked();
});
test('an accent saved before themes opens as its closest theme, and a pick is saved in the same setting',async()=>{
 const repo=settingsRepository();repo.save('settings',{theme_override:'dark',accent:'sand',rest_seconds:90});
 await render(<ThemeProvider repository={repo}><Appearance/></ThemeProvider>);
 expect(pal('desertMirage')).toBeChecked();
 await fireEvent.press(pal('goldenHour'));
 expect(repo.list('settings')[0].data).toMatchObject({theme_override:'dark',accent:'goldenHour',rest_seconds:90});
 expect(pal('goldenHour')).toBeChecked();
 expect(checkedPalettes()).toHaveLength(1);
});
test('all themes are offered and none is locked',async()=>{
 await render(<ThemeProvider repository={settingsRepository()}><Appearance/></ThemeProvider>);
 expect(screen.getAllByTestId(/^appearance-palette-/)).toHaveLength(palettes.length);
 for(const id of palettes)expect(pal(id)).toBeEnabled();
 expect(screen.queryByText('Midnight Neon')).toBeNull();expect(screen.queryByText('Holographic Chrome')).toBeNull();
});
