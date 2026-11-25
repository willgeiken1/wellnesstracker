import { pendingTile } from '../pending';
import type { TilePageConfig } from '../types';

/** The Progress tab's tiles, as the final design lists them: catalogue, tray sections and the starting layout.
 * Every renderer is a pending stub; the Progress packet replaces each `render` (and adds `meta` and `open`) as it builds the tile. */
export const progressTiles: TilePageConfig = {
  id: 'progress', label: 'Progress', color: 'accent',
  groups: [['Today', 'accent'], ['Body', 'recovery'], ['Training', 'training'], ['Trends', 'recovery']],
  intro: 'Tiles for Progress only. Tiles with a range follow Week, Month or Year at the top unless you pick one.',
  defaults: [['score', 'M'], ['history', 'M'], ['recovery', 'L'], ['weight', 'L'], ['goal', 'S'], ['bodyfat', 'S'], ['training', 'M'], ['trend', 'S'], ['records', 'S'], ['weekly', 'M'], ['photos', 'M']],
  tiles: [
    {
      id: 'score', title: 'Day score', sub: "Today's score and the three pillars behind it",
      icon: 'score', color: 'accent', group: 'Today', sizes: ['S', 'M', 'L'], size: 'M',
      label: 'Open the day score',
      options: [
        { id: 'cmp', label: 'Compare with', choices: [['yesterday', 'Yesterday'], ['usual', 'Your usual']] },
      ],
      render: pendingTile('progress', 'score'),
    },
    {
      id: 'history', title: 'Score history', sub: 'Your day score across the week, month or year',
      icon: 'week', color: 'accent', group: 'Today', sizes: ['S', 'M', 'L'], size: 'M',
      label: 'Open the day score',
      options: [
        { id: 'range', label: 'Range', choices: [['page', 'Follow page', 'Page'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']] },
        { id: 'form', label: 'Show as', choices: [['heat', 'Heat strip', 'Heat'], ['cols', 'Columns'], ['pillars', 'Pillars']] },
      ],
      render: pendingTile('progress', 'history'),
    },
    {
      id: 'recovery', title: 'Recovery', sub: 'Sleep, HRV and resting heart rate against your usual',
      icon: 'heart', color: 'recovery', group: 'Today', sizes: ['S', 'M', 'L'], size: 'L',
      label: 'Open sleep and recovery',
      options: [
        { id: 'lead', label: 'Lead with', choices: [['sleep', 'Sleep'], ['hrv', 'HRV'], ['rhr', 'Resting HR']] },
      ],
      render: pendingTile('progress', 'recovery'),
    },
    {
      id: 'weight', title: 'Weight', sub: 'Weigh-ins, the trend and when you reach your goal',
      icon: 'weight', color: 'recovery', group: 'Body', sizes: ['S', 'M', 'L'], size: 'L',
      label: 'Open body',
      options: [
        { id: 'range', label: 'Range', choices: [['page', 'Follow page', 'Page'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']] },
        { id: 'show', label: 'Show', choices: [['goal', 'Goal pace', 'Pace'], ['change', 'Change']] },
      ],
      render: pendingTile('progress', 'weight'),
    },
    {
      id: 'bodyfat', title: 'Body fat', sub: 'Body fat from your smart scale, with fat and lean mass',
      icon: 'scale', color: 'recovery', group: 'Body', sizes: ['S', 'M'], size: 'S',
      label: 'Open body',
      options: [
        { id: 'show', label: 'Lead with', choices: [['pct', 'Body fat'], ['lean', 'Lean mass']] },
      ],
      render: pendingTile('progress', 'bodyfat'),
    },
    {
      id: 'measure', title: 'Measurements', sub: 'Waist, chest, arms and more, with the change since you started',
      icon: 'ruler', color: 'recovery', group: 'Body', sizes: ['S', 'M', 'L'], size: 'M',
      label: 'Edit measurements',
      options: [
        { id: 'cmp', label: 'Change since', choices: [['first', 'First, Sep 20', 'Sep 20'], ['prev', 'Last, Nov 1', 'Nov 1']] },
      ],
      render: pendingTile('progress', 'measure'),
    },
    {
      id: 'goal', title: 'Goal', sub: 'How far along a goal is: weight, your plan or sleep',
      icon: 'rt-target', color: 'recovery', group: 'Body', sizes: ['S', 'M'], size: 'S', head: false,
      label: 'Open the goal',
      options: [
        { id: 'goal', label: 'Goal', choices: [['weight', 'Weight'], ['plan', 'Training plan', 'Plan'], ['sleep', 'Sleep']] },
      ],
      render: pendingTile('progress', 'goal'),
    },
    {
      id: 'training', title: 'Training', sub: 'Sessions, minutes and volume against last week',
      icon: 'workouts', color: 'training', group: 'Training', sizes: ['S', 'M', 'L'], size: 'M',
      label: 'Open the training trend',
      options: [
        { id: 'range', label: 'Range', choices: [['page', 'Follow page', 'Page'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']] },
        { id: 'lead', label: 'Lead with', choices: [['min', 'Minutes'], ['vol', 'Volume']] },
      ],
      render: pendingTile('progress', 'training'),
    },
    {
      id: 'trend', title: 'Metric trend', sub: 'One number over time: steps, sleep, HRV, weight and more',
      icon: 'progress', color: 'recovery', group: 'Trends', sizes: ['S', 'M', 'L'], size: 'S', head: false,
      label: 'Open the trend',
      options: [
        { id: 'metric', label: 'Metric', choices: [['steps', 'Steps'], ['sleep', 'Sleep'], ['hrv', 'HRV'], ['rhr', 'Resting HR'], ['weight', 'Weight'], ['kcal', 'Calories'], ['training', 'Training']] },
        { id: 'range', label: 'Range', choices: [['page', 'Follow page', 'Page'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']] },
      ],
      render: pendingTile('progress', 'trend'),
    },
    {
      id: 'weekly', title: 'Weekly report', sub: 'What changed this week, in a few lines and numbers',
      icon: 'doc', color: 'accent', group: 'Trends', sizes: ['M', 'L'], size: 'M',
      label: 'Read the weekly report',
      options: [
        { id: 'show', label: 'Show', choices: [['lines', 'Highlights'], ['numbers', 'Numbers']] },
      ],
      render: pendingTile('progress', 'weekly'),
    },
    {
      id: 'records', title: 'Records', sub: 'New lifting bests and your best days',
      icon: 'trophy', color: 'warning', group: 'Training', sizes: ['S', 'M', 'L'], size: 'S',
      label: 'Open the newest record',
      options: [
        { id: 'kind', label: 'Show', choices: [['all', 'All records', 'All'], ['lifts', 'Lifts only', 'Lifts']] },
      ],
      render: pendingTile('progress', 'records'),
    },
    {
      id: 'photos', title: 'Photos', sub: 'Your latest progress photos, or the first and latest side by side',
      icon: 'camera', color: 'sleep', group: 'Body', sizes: ['S', 'M', 'L'], size: 'M',
      label: 'Open progress photos',
      options: [
        { id: 'show', label: 'Show', choices: [['recent', 'Latest'], ['compare', 'First and latest', 'Compare']] },
        { id: 'pose', label: 'Pose', choices: [['Front', 'Front'], ['Side', 'Side']] },
      ],
      render: pendingTile('progress', 'photos'),
    },
  ],
};
