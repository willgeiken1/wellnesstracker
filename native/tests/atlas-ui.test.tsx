import { render, screen, fireEvent } from '@testing-library/react-native';
import * as RN from 'react-native';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import { router } from 'expo-router';
import { BodyAtlas, atlasLabel } from '../src/features/atlas/body-atlas';
import { heatmap, heatFill } from '../src/features/atlas/volume';
import { ThemeProvider } from '../src/design/theme-provider';
import { t } from '../src/i18n/en';
jest.mock('expo-router',()=>({router:{push:jest.fn()}}));
jest.mock('expo-haptics',()=>({impactAsync:jest.fn().mockResolvedValue(undefined),ImpactFeedbackStyle:{Light:'light'}}));
const now=Date.UTC(2026,9,28,12);
const sessions=[{at:now-86400000,exercises:[{main:'chest',helpers:['triceps'],sets:12}]}];
const wrapper=({children}:{children:React.ReactNode})=><ThemeProvider>{children}</ThemeProvider>;
beforeEach(()=>{
 jest.clearAllMocks();
 jest.spyOn(RN.AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(false);
 jest.spyOn(RN.AccessibilityInfo,'isScreenReaderEnabled').mockResolvedValue(false);
});
test('paths select exact key, outline, card and stub route; light haptic with no muscle payload',async()=>{
 await render(<BodyAtlas sessions={sessions} now={now}/>,{wrapper});
 await fireEvent.press(screen.getByTestId('atlas-path-pecUpper'));
 expect(screen.getByText('Pectoralis major, clavicular head')).toBeTruthy();
 expect(impactAsync).toHaveBeenCalledWith(ImpactFeedbackStyle.Light);
 expect(screen.getByTestId('atlas-path-pecUpper').props.strokeWidth).toBe(2.5);
 await fireEvent.press(screen.getByRole('button',{name:t('atlasOpen')}));
 expect(router.push).toHaveBeenCalledWith({pathname:'/muscle/[key]',params:{key:'pecUpper'}});
});
test('accessible list covers all 44 heatmap entries with identical labels and values',async()=>{
 await render(<BodyAtlas sessions={sessions} now={now}/>,{wrapper});
 const values=heatmap(sessions,now);
 for(const side of ['atlasFront','atlasBack'] as const){
  await fireEvent.press(screen.getByRole('button',{name:t(side)}));
  for(const path of screen.queryAllByTestId(/^atlas-path-/)){
   const key=path.props.testID.replace('atlas-path-','');
   expect(path.props.accessibilityLabel).toBe(atlasLabel(values.find(v=>v.key===key)!,now));
  }
 }
 await fireEvent.press(screen.getByRole('button',{name:t('atlasList')}));
 expect(screen.getAllByTestId(/^atlas-row-/)).toHaveLength(44);
 for(const value of values) expect(screen.getByRole('button',{name:atlasLabel(value,now)})).toBeTruthy();
 await fireEvent.press(screen.getByTestId('atlas-row-gastroc'));
 expect(screen.getByTestId('atlas-row-gastroc').props.accessibilityState).toEqual({selected:true});
});
test.each(['light','dark'] as const)('%s rendered heatmap snapshot, body controls and list colors',async mode=>{
 const scheme=jest.spyOn(RN,'useColorScheme').mockReturnValue(mode);
 try{
  await render(<BodyAtlas sessions={sessions} now={now} compact/>,{wrapper});
  const snapshot:unknown[]=[];
  for(const side of ['atlasFront','atlasBack'] as const){
   await fireEvent.press(screen.getByRole('button',{name:t(side)}));
   snapshot.push(screen.getAllByTestId(/^atlas-path-/).map(path=>({
    id:path.props.testID,fill:path.props.fill,opacity:path.props.fillOpacity,stroke:path.props.stroke,strokeWidth:path.props.strokeWidth,
   })));
  }
  expect(snapshot).toMatchSnapshot();
  await fireEvent.press(screen.getByRole('button',{name:t('atlasFemale')}));
  expect(screen.getByRole('button',{name:t('atlasFemale')}).props.accessibilityState).toMatchObject({selected:true});
  await fireEvent.press(screen.getByRole('button',{name:t('atlasList')}));
  const value=heatmap(sessions,now)[0];
  expect(screen.getByTestId(`atlas-row-${value.key}`).queryAll(n=>n.props.style?.backgroundColor===heatFill(value,mode==='dark')).length).toBeGreaterThan(0);
 }finally{scheme.mockRestore();}
});
test('Reduce Motion renders static paths and disabled haptics sends nothing',async()=>{
 const reduce=jest.spyOn(RN.AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(true);
 try{
  await render(<BodyAtlas sessions={sessions} now={now} haptics={false}/>,{wrapper});
  await fireEvent.press(screen.getByTestId('atlas-path-pecUpper'));
  expect(impactAsync).not.toHaveBeenCalled();
  expect(screen.getAllByTestId(/^atlas-path-/)).toHaveLength(25);
 }finally{reduce.mockRestore();}
});
test('screen readers start in the complete list without needing to navigate SVG',async()=>{
 const enabled=jest.spyOn(RN.AccessibilityInfo,'isScreenReaderEnabled').mockResolvedValue(true);
 try{
  await render(<BodyAtlas sessions={sessions} now={now}/>,{wrapper});
  expect(await screen.findAllByTestId(/^atlas-row-/)).toHaveLength(44);
  expect(screen.queryAllByTestId(/^atlas-path-/)).toHaveLength(0);
 }finally{enabled.mockRestore();}
});

test('map hit layer expands touch areas without obscuring precise paths and exposes selection',async()=>{
 await render(<BodyAtlas sessions={sessions} now={now} compact/>,{wrapper});
 const hits=screen.getAllByTestId(/^atlas-hit-/);
 expect(hits).toHaveLength(25);
 for(const hit of hits){
  expect(hit.props.strokeWidth).toBeGreaterThanOrEqual(44);
  // Assert the native SVG props after react-native-svg extraction.
  expect(hit.props.vectorEffect).toBe(1); // non-scaling-stroke enum
  expect(hit.props.stroke).toEqual({type:0,payload:RN.processColor('transparent')});
 }
 await fireEvent.press(screen.getByTestId('atlas-hit-deltAnt'));
 expect(screen.getByTestId('atlas-path-deltAnt').props.accessibilityState).toEqual({selected:true});
 expect(screen.getByTestId('atlas-path-pecUpper').props.accessibilityState).toEqual({selected:false});
 expect(screen.getByText(/muscle list to pick one by name/)).toBeTruthy();
});
test.each([[24,'1 day ago'],[48,'2 days ago'],[200,'not in the last 7 days']] as const)('last trained %s hours uses a sensible label',async(hours,label)=>{
 await render(<BodyAtlas sessions={[{at:now-hours*3600000,exercises:[{main:'chest',helpers:[],sets:1}]}]} now={now}/>,{wrapper});
 await fireEvent.press(screen.getByTestId('atlas-path-pecUpper'));
 expect(screen.getByText(new RegExp(label))).toBeTruthy();
 expect(screen.queryByText(/200 hours ago/)).toBeNull();
});

describe('line contrast', () => {
  const { ATLAS_LINE_OPACITY } = require('../src/features/atlas/body-atlas') as typeof import('../src/features/atlas/body-atlas');
  const design = require('../src/design/tokens');
  // Works before and after the move from four accents to themes: only the default colours are needed here.
  const createTheme = (mode: 'dark' | 'light'): Record<string, string> => design.createTheme(mode, 'accents' in design.tokens ? 'sea' : undefined);
  const { contrast } = require('../src/core/contrast') as typeof import('../src/core/contrast');
  const blend = (under: string, over: string, alpha: number) => '#' + [1, 3, 5].map(i => {
    const a = parseInt(under.slice(i, i + 2), 16), b = parseInt(over.slice(i, i + 2), 16);
    return Math.round(a + (b - a) * alpha).toString(16).padStart(2, '0');
  }).join('');
  test.each(['dark', 'light'] as const)('in %s mode muscle lines keep 3:1 on an untrained muscle and the body outline keeps 4.5:1', mode => {
    const c = createTheme(mode);
    expect(contrast(blend(c['surface-2'], c['text-muted'], ATLAS_LINE_OPACITY), c['surface-2'])).toBeGreaterThanOrEqual(3);
    expect(contrast(c['text-muted'], c['surface-2'])).toBeGreaterThanOrEqual(4.5);
  });
  test.each(['dark', 'light'] as const)('in %s mode the boundary of a trained muscle keeps 3:1 against its heat colour, fresh or faded', mode => {
    const { trainedStroke } = require('../src/features/atlas/body-atlas') as typeof import('../src/features/atlas/body-atlas');
    const { heatFill } = require('../src/features/atlas/volume') as typeof import('../src/features/atlas/volume');
    const c = createTheme(mode) as Record<'text' | 'bg' | 'surface-2', string>;
    for (const sets of [1, 12, 40]) for (const freshness of [0, 0.5, 1]) {
      const fill = heatFill({ sets, target: [10, 20] } as unknown as Parameters<typeof heatFill>[0], mode === 'dark');
      // .6 is how a trained muscle under the surface is drawn; the rest is the surface range, fresh to faded.
      for (const opacity of [.6, .65 + .35 * freshness]) expect(contrast(trainedStroke(fill, opacity, c), blend(c['surface-2'], fill, opacity))).toBeGreaterThanOrEqual(3);
    }
  });
  test('a trained muscle is outlined at full strength in a colour that stands out, an untrained one keeps soft ink', async () => {
    await render(<BodyAtlas sessions={[{ at: now - 3600000, exercises: [{ main: 'chest', helpers: [], sets: 12 }] }]} now={now}/>, { wrapper });
    const trained = screen.getByTestId('atlas-path-pecUpper').props;
    expect(trained.strokeOpacity).toBe(1);
    const untrained = screen.getAllByTestId(/^atlas-path-/).map(n => n.props).find(p => p.strokeOpacity === ATLAS_LINE_OPACITY);
    expect(untrained).toBeTruthy();
    expect(JSON.stringify(trained.stroke)).not.toBe(JSON.stringify(untrained!.stroke));
  });
  test('a selected trained muscle keeps the contrasting outline, only thicker', async () => {
    await render(<BodyAtlas sessions={[{ at: now - 3600000, exercises: [{ main: 'chest', helpers: [], sets: 12 }] }]} now={now}/>, { wrapper });
    const before = screen.getByTestId('atlas-path-pecUpper').props;
    await fireEvent.press(screen.getByTestId('atlas-path-pecUpper'));
    const after = screen.getByTestId('atlas-path-pecUpper').props;
    expect(after.accessibilityState).toMatchObject({ selected: true });
    expect(JSON.stringify(after.stroke)).toBe(JSON.stringify(before.stroke));
    expect(after.strokeWidth).toBeGreaterThan(before.strokeWidth);
  });
  test('the body outline is drawn at full strength', async () => {
    await render(<BodyAtlas sessions={sessions} now={now}/>, { wrapper });
    const outline = screen.getByTestId('atlas-outline').props;
    expect(outline.strokeOpacity ?? 1).toBe(1);
    expect(outline.stroke).toBeTruthy();
  });
});
