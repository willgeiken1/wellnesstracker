import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { BodyAtlas } from '../src/features/atlas/body-atlas';
import { ThemeProvider } from '../src/design/theme-provider';
import { atlasSessions } from '../src/features/atlas/read-logs';
import { WorkoutStore } from '../src/data/workout/store';
import { memoryRepository } from './workout-repository';
import { t } from '../src/i18n/en';
jest.mock('expo-router',()=>({router:{push:jest.fn()}}));
jest.mock('expo-haptics',()=>({impactAsync:jest.fn().mockResolvedValue(undefined),ImpactFeedbackStyle:{Light:'light'}}));
/** Check actual imported modules rather than a telemetry mock the feature never uses.
 * These external UI modules are the complete reviewed runtime capability boundary. */
test('atlas runtime import closure has no network, telemetry, logging or AI capability',()=>{
 const start=path.resolve(__dirname,'../src/features/atlas');
 const approved=new Set(['react','react-native','react-native-svg','expo-haptics','expo-router','react-native-safe-area-context']);
 const seen=new Set<string>();
 function visit(file:string){
  if(seen.has(file))return;seen.add(file);
  const text=fs.readFileSync(file,'utf8');
  expect(text).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(|\bconsole\s*\.|\b(?:Sentry|PostHog|posthog)\s*\.|\b(?:captureException|captureMessage|captureEvent|track|capture|sendBeacon)\s*\(/);
  for(const match of text.matchAll(/import\s+(?!type\b)[\s\S]*?from\s*['"]([^'"]+)['"]/g)){
   const spec=match[1];
   if(!spec.startsWith('.')&&!spec.startsWith('@/')){expect(approved.has(spec)).toBe(true);continue;}
   const base=spec.startsWith('@/')?path.resolve(__dirname,'../src',spec.slice(2)):path.resolve(path.dirname(file),spec);
   const next=['.ts','.tsx','.json'].map(ext=>base+ext).find(f=>fs.existsSync(f))??base;
   expect(next).not.toMatch(/\/auth\/|\/sync\/|\/server\/|\/ai\/|telemetry|analytics|sentry|posthog/i);
   if(!next.endsWith('.json'))visit(next);
  }
 }
 for(const f of fs.readdirSync(start).filter(f=>/\.tsx?$/.test(f)))visit(path.join(start,f));
 expect(seen.size).toBeGreaterThan(5);
});
test('synthetic local log read and every atlas interaction make zero requests or log calls',async()=>{
 const store=new WorkoutStore(memoryRepository());
 const at=Date.now()-86400000;
 const session=store.start(undefined,at);const entry=store.addExercise(session.id,'Bench Press',1);
 store.editDraft(entry.id,0,{weight:'100',reps:'8'});store.toggleDone(entry.id,0);
 store.finish(session.id,{startedAt:at,finishedAt:at+60000,notes:''});
 const fetchSpy=jest.spyOn(global,'fetch').mockRejectedValue(new Error('Network forbidden'));
 const xhr=jest.fn(()=>{throw new Error('Network forbidden');});
 const priorXHR=Object.getOwnPropertyDescriptor(globalThis,'XMLHttpRequest');
 Object.defineProperty(globalThis,'XMLHttpRequest',{configurable:true,value:xhr});
 const logs=[jest.spyOn(console,'log').mockImplementation(()=>{}),jest.spyOn(console,'info').mockImplementation(()=>{}),jest.spyOn(console,'warn').mockImplementation(()=>{}),jest.spyOn(console,'error').mockImplementation(()=>{})];
 try{
  await render(<ThemeProvider><BodyAtlas sessions={atlasSessions(store)} now={at+120000}/></ThemeProvider>);
  for(const id of ['atlas-path-pecUpper','atlas-path-deltAnt'])await fireEvent.press(screen.getByTestId(id));
  await fireEvent.press(screen.getByRole('button',{name:t('atlasBack')}));
  await fireEvent.press(screen.getByTestId('atlas-path-lats'));
  await fireEvent.press(screen.getByRole('button',{name:t('atlasFemale')}));
  await fireEvent.press(screen.getByRole('button',{name:t('atlasList')}));
  for(const row of screen.getAllByTestId(/^atlas-row-/))await fireEvent.press(row);
  await fireEvent.press(screen.getByRole('button',{name:t('atlasOpen')}));
  expect(fetchSpy).not.toHaveBeenCalled();expect(xhr).not.toHaveBeenCalled();
  for(const log of logs)expect(log).not.toHaveBeenCalled();
 }finally{fetchSpy.mockRestore();if(priorXHR) Object.defineProperty(globalThis,'XMLHttpRequest',priorXHR);else Reflect.deleteProperty(globalThis,'XMLHttpRequest');logs.forEach(log=>log.mockRestore());}
});
