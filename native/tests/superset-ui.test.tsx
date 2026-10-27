import { AccessibilityInfo } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../src/design/theme-provider';
import { SupersetControls } from '../src/features/workout/superset-controls';
import { RepRangeInput } from '../src/features/workout/rep-range-input';
beforeEach(() => jest.spyOn(AccessibilityInfo,'isReduceMotionEnabled').mockResolvedValue(false));
const items = [{id:'a',name:'Bench Press',group:'pair'},{id:'b',name:'Dumbbell Row',group:'pair'},{id:'c',name:'Squat',group:null},{id:'d',name:'Plank',group:null}];
test('accessible partner selection caps at three, preserves exercise order and unlinks',async () => {
  const link = jest.fn(), unlink = jest.fn();
  await render(<ThemeProvider><SupersetControls items={items} currentId="a" onLink={link} onUnlink={unlink} /></ThemeProvider>);
  expect(screen.getByText('Superset: Bench Press, Dumbbell Row')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button',{name:'Unlink superset for Bench Press'})); expect(unlink).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button',{name:'Link superset for Bench Press'}));
  expect(screen.getByRole('button',{name:'Save superset'})).toBeDisabled();
  await fireEvent.press(screen.getByRole('button',{name:'Include Squat in superset'}));
  await fireEvent.press(screen.getByRole('button',{name:'Include Dumbbell Row in superset'}));
  expect(screen.getByRole('button',{name:'Include Squat in superset'}).props.accessibilityState.selected).toBe(true);
  expect(screen.getByRole('button',{name:'Include Plank in superset'})).toBeDisabled();
  await fireEvent.press(screen.getByRole('button',{name:'Save superset'})); expect(link).toHaveBeenCalledWith(['a','b','c']);
});
test('range fields are labelled with exercise and clear together',async () => {
  const change = jest.fn();
  await render(<ThemeProvider><RepRangeInput exercise="Bench Press" value={{rep_min:8,rep_max:10}} onChange={change} /></ThemeProvider>);
  await fireEvent.changeText(screen.getByLabelText('Bench Press, Minimum reps'),'9');
  expect(change).toHaveBeenLastCalledWith({rep_min:9,rep_max:10});
  await fireEvent.press(screen.getByRole('button',{name:'Clear rep range for Bench Press'}));
  expect(change).toHaveBeenLastCalledWith({rep_min:null,rep_max:null});
});
