import { weightGoalStatus } from '../src/features/settings/pages';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock('../src/features/shell/toast', () => ({ showToast: jest.fn(), ShellToast: () => null }));

// Made-up weights, in pounds.
describe('the weight goal works in its own direction', () => {
  test('a goal over where you are counts the gain still to go, not "at your goal"', () => {
    expect(weightGoalStatus(170, 165, 180)).toEqual({ left: 10, done: 5, total: 15 });
    expect(weightGoalStatus(170, null, 180)).toEqual({ left: 10, done: null, total: null });
  });
  test('a goal under where you are still counts the loss to go', () => {
    expect(weightGoalStatus(190, 200, 180)).toEqual({ left: 10, done: 10, total: 20 });
  });
  test('reaching or passing the goal leaves nothing to go', () => {
    expect(weightGoalStatus(182, 165, 180).left).toBe(0);
    expect(weightGoalStatus(178, 200, 180).left).toBe(0);
  });
  test('with no current weight there is nothing to count', () => {
    expect(weightGoalStatus(null, 200, 180)).toEqual({ left: null, done: null, total: 20 });
  });
});
