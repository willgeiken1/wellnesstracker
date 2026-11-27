import { pendingTile } from '../pending';
import type { TilePageConfig } from '../types';

/** The Training tab's tiles, as the final design lists them: catalogue, tray sections and the starting layout.
 * Every renderer is a pending stub; the Training packet replaces each `render` (and adds `meta` and `open`) as it builds the tile. */
export const trainingTiles: TilePageConfig = {
  id: 'training', label: 'Training', color: 'training',
  groups: [['Today', 'training'], ['This week', 'training'], ['Progress', 'training'], ['History', 'training']],
  defaults: [['split', 'L'], ['session', 'L'], ['goal', 'S'], ['streak', 'S'], ['week', 'L'], ['next', 'M'], ['e1rm', 'S'], ['records', 'S'], ['muscles', 'L'], ['recent', 'M']],
  // The Split tile joined the top of Training after layouts were saved (Insight Mockup v21).
  arrivals: [{ id: 'split', rev: 1, size: 'L' }],
  tiles: [
    {
      id: 'split', title: 'Split', sub: "Today's split day and this week, with a Change button. Picks your first split.",
      icon: 'sp-split', color: 'training', group: 'Today', sizes: ['S', 'M', 'L'], size: 'L', head: false,
      label: 'Open your split',
      render: pendingTile('training', 'split'),
    },
    {
      id: 'session', title: 'Workout in progress', sub: 'Live timer, sets done and the next set',
      icon: 'timer', color: 'training', group: 'Today', sizes: ['S', 'M', 'L'], size: 'L', head: false,
      label: 'Resume workout',
      options: [
        { id: 'show', label: 'Under the timer', choices: [['next', 'Next set'], ['exs', 'Exercises']] },
      ],
      render: pendingTile('training', 'session'),
    },
    {
      id: 'goal', title: "Today's goal", sub: "Minutes or sets toward today's target",
      icon: 'flame', color: 'training', group: 'Today', sizes: ['S', 'M'], size: 'S',
      label: 'Open training trend',
      options: [
        { id: 'track', label: 'Track', choices: [['min', 'Minutes'], ['sets', 'Sets']] },
      ],
      render: pendingTile('training', 'goal'),
    },
    {
      id: 'week', title: 'This week', sub: 'Plan days, time or volume by day, and last week',
      icon: 'week', color: 'training', group: 'This week', sizes: ['S', 'M', 'L'], size: 'L',
      label: 'Open the plan',
      options: [
        { id: 'by', label: 'Columns', choices: [['min', 'Minutes'], ['lb', 'Volume']] },
      ],
      render: pendingTile('training', 'week'),
    },
    {
      id: 'next', title: 'Up next', sub: 'Your next plan day, its exercises and targets',
      icon: 'up-next', color: 'training', group: 'This week', sizes: ['S', 'M', 'L'], size: 'M',
      label: 'Open the plan',
      options: [
        { id: 'show', label: 'Show', choices: [['target', 'Targets'], ['sets', 'Sets and reps']] },
      ],
      render: pendingTile('training', 'next'),
    },
    {
      id: 'plan', title: 'Plan days', sub: 'Every day of your plan, live and next marked',
      icon: 'workouts', color: 'training', group: 'This week', sizes: ['S', 'M', 'L'], size: 'M',
      label: 'Edit plan',
      options: [
        { id: 'order', label: 'Order', choices: [['rot', 'Rotation'], ['last', 'Last done']] },
      ],
      render: pendingTile('training', 'plan'),
    },
    {
      id: 'muscles', title: 'Muscle groups', sub: 'Sets or volume per muscle against a weekly range',
      icon: 'layers', color: 'training', group: 'Progress', sizes: ['S', 'M', 'L'], size: 'L',
      label: 'Open training trend',
      options: [
        { id: 'measure', label: 'Measure', choices: [['sets', 'Sets'], ['lb', 'Volume']] },
        { id: 'count', label: 'Count', choices: [['primary', 'Main muscle', 'Main'], ['both', 'Plus helpers at half', 'Plus helpers']] },
      ],
      render: pendingTile('training', 'muscles'),
    },
    {
      id: 'e1rm', title: 'Estimated 1RM', sub: "One lift's best, trended from your top sets",
      icon: 'trophy', color: 'training', group: 'Progress', sizes: ['S', 'M', 'L'], size: 'S',
      label: 'Open the lift',
      options: [
        { id: 'lift', label: 'Lift', choices: [['Back squat', 'Back squat', 'Squat'], ['Bench press', 'Bench press', 'Bench'], ['Deadlift', 'Deadlift', 'Deadlift'], ['Barbell row', 'Barbell row', 'Row'], ['Overhead press', 'Overhead press', 'Press']] },
        { id: 'range', label: 'Range', choices: [['8', '8 weeks', '8 wk'], ['4', '4 weeks', '4 wk']] },
      ],
      render: pendingTile('training', 'e1rm'),
    },
    {
      id: 'recent', title: 'Recent workouts', sub: 'Your last sessions with records marked',
      icon: 'history', color: 'training', group: 'History', sizes: ['S', 'M', 'L'], size: 'M',
      label: 'Open the last workout',
      options: [
        { id: 'value', label: 'Value', choices: [['lb', 'Volume'], ['min', 'Time'], ['sets', 'Sets']] },
      ],
      render: pendingTile('training', 'recent'),
    },
    {
      id: 'records', title: 'Records', sub: 'Your best lifts, newest first',
      icon: 'trophy', color: 'warning', group: 'Progress', sizes: ['S', 'M', 'L'], size: 'S',
      label: 'Open the newest record',
      options: [
        { id: 'show', label: 'Show', choices: [['est', 'Estimated 1RM', 'Est. 1RM'], ['top', 'Top set']] },
      ],
      render: pendingTile('training', 'records'),
    },
    {
      id: 'streak', title: 'Consistency', sub: 'Weeks on plan in a row, or every day for a month',
      icon: 'cal', color: 'training', group: 'History', sizes: ['S', 'M', 'L'], size: 'S',
      label: 'Open training trend',
      options: [
        { id: 'by', label: 'Show', choices: [['weeks', 'Weeks'], ['days', 'Days']] },
      ],
      render: pendingTile('training', 'streak'),
    },
    {
      id: 'cardio', title: 'Cardio', sub: "This week's runs, rides and walks, Apple Health included",
      icon: 'run', color: 'training', group: 'History', sizes: ['S', 'M'], size: 'M',
      label: 'Log cardio',
      options: [
        { id: 'lead', label: 'Lead with', choices: [['min', 'Time'], ['mi', 'Distance']] },
      ],
      render: pendingTile('training', 'cardio'),
    },
  ],
};
