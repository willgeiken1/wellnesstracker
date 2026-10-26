import { rangeSuggestion } from '../src/core/workout/supersets';
import type { Equipment, Unit } from '../src/core/workout/rules';
test.each([
  ['barbell','lb',5],['barbell','kg',2.5],['dumbbell','lb',5],['dumbbell','kg',2.5],
  ['machine','lb',10],['machine','kg',5],['cable','lb',10],['cable','kg',5],
  ['bodyweight','lb',0],['other','kg',0]
] as [Equipment,Unit,number][])('%s in %s uses its equipment step %s', (equipment,unit,increment) => {
  const result = rangeSuggestion([{weight:100,reps:10,done:true},{weight:100,reps:11,done:true},{weight:1,reps:1,done:true,warmup:true}],equipment,unit,{min:8,max:10});
  expect(result).toMatchObject({weight:100+increment,jump:increment>0,target:increment>0 ? 8 : 10,count:2});
});
