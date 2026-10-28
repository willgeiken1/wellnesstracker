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
  expect(screen.getAllByTestId(/^atlas-path-/)).toHaveLength(20);
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
