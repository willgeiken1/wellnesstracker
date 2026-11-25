import { Platform } from 'react-native';
import { pendingTile } from '../pending';
import type { TilePageConfig } from '../types';

/** Home's tiles: every tile in its styles, the tray sections and Home's starting layout.
 * Each tile draws its own header and frame depth in the final design (head: false). Every renderer is a pending stub;
 * the Home packet replaces each style's `render` and adds `open`. Only options the tray offers are listed. */
const allHomeTiles: TilePageConfig = {
  id: 'home', label: 'Home', color: 'accent', variant: 'home',
  groups: [['Today', 'accent'], ['Training', 'training'], ['Food', 'food'], ['Body', 'accent-2'], ['Recovery & Sleep', 'sleep'], ['Routines', 'sleep']],
  defaults: [['next', 'M', 'B'], ['protein', 'S', 'A'], ['water', 'S', 'E'], ['steps', 'S', 'A'], ['weight', 'S', 'A']],
  tiles: [
    {
      id: 'score', title: 'Insight Score', sub: 'Your day score and its three pillars',
      icon: 'score', color: 'accent', group: 'Today', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'A',
      label: 'Open Insight Score',
      render: pendingTile('home', 'score'),
      versions: [
        { key: 'A', name: 'Dial', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'score', 'A') },
        { key: 'B', name: 'Rings', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'score', 'B') },
        { key: 'C', name: 'Trend', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'score', 'C') },
        { key: 'D', name: 'Balance', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'score', 'D') },
      ],
    },
    {
      id: 'week', title: 'This week', sub: 'Seven days at a glance',
      icon: 'week', color: 'accent', group: 'Today', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'C',
      label: 'Open weekly report',
      render: pendingTile('home', 'week'),
      versions: [
        { key: 'A', name: 'Rings', sizes: ['M', 'L'], render: pendingTile('home', 'week', 'A') },
        { key: 'B', name: 'Lanes', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'week', 'B') },
        { key: 'C', name: 'Columns', sizes: ['M', 'L'], render: pendingTile('home', 'week', 'C') },
        { key: 'D', name: 'Rose', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'week', 'D') },
      ],
    },
    {
      id: 'next', title: 'Next', sub: 'What to do now',
      icon: 'up-next', color: 'accent', group: 'Today', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'B',
      label: 'Open what is next',
      render: pendingTile('home', 'next'),
      versions: [
        { key: 'A', name: 'Gauge', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'next', 'A') },
        { key: 'B', name: 'Slots', sizes: ['M', 'L'], render: pendingTile('home', 'next', 'B') },
        { key: 'C', name: 'Timeline', sizes: ['M', 'L'], render: pendingTile('home', 'next', 'C') },
        { key: 'D', name: 'Focus', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'next', 'D') },
      ],
    },
    {
      id: 'nextup', title: 'Next up', sub: 'Your next routine item',
      icon: 'routine', color: 'sleep', group: 'Routines', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'B',
      label: 'Open Routines',
      render: pendingTile('home', 'nextup'),
      versions: [
        { key: 'A', name: 'Sun path', sizes: ['S', 'M'], render: pendingTile('home', 'nextup', 'A') },
        { key: 'B', name: 'Checklist', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'nextup', 'B') },
        { key: 'C', name: 'Clock', sizes: ['S', 'M'], render: pendingTile('home', 'nextup', 'C') },
        { key: 'D', name: 'Ruler', sizes: ['S', 'M'], render: pendingTile('home', 'nextup', 'D') },
      ],
    },
    {
      id: 'volume', title: 'Volume', sub: 'Weight lifted over 7, 14 or 30 days',
      icon: 'volume', color: 'training', group: 'Training', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'C',
      label: 'Open Training',
      render: pendingTile('home', 'volume'),
      versions: [
        { key: 'A', name: 'Plate bars', sizes: ['S', 'M', 'L'],
          options: [
            { id: 'range', label: 'Range', choices: [['7', '7 days'], ['14', '14 days'], ['30', '30 days']] },
          ],
          render: pendingTile('home', 'volume', 'A') },
        { key: 'B', name: 'Loaded bar', sizes: ['S', 'M', 'L'],
          options: [
            { id: 'range', label: 'Range', choices: [['7', '7 days'], ['14', '14 days'], ['30', '30 days']] },
          ],
          render: pendingTile('home', 'volume', 'B') },
        { key: 'C', name: 'Versus', sizes: ['S', 'M', 'L'],
          options: [
            { id: 'range', label: 'Range', choices: [['7', '7 days'], ['14', '14 days'], ['30', '30 days']] },
          ],
          render: pendingTile('home', 'volume', 'C') },
        { key: 'D', name: 'Dot calendar', sizes: ['S', 'M', 'L'],
          options: [
            { id: 'range', label: 'Range', choices: [['7', '7 days'], ['14', '14 days'], ['30', '30 days']] },
          ],
          render: pendingTile('home', 'volume', 'D') },
      ],
    },
    {
      id: 'exercise', title: 'Exercise', sub: 'Exercise minutes today',
      icon: 'timer', color: 'training', group: 'Training', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'A',
      label: 'Open training trend',
      render: pendingTile('home', 'exercise'),
      versions: [
        { key: 'A', name: 'Minute dial', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'exercise', 'A') },
        { key: 'B', name: 'Hour grid', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'exercise', 'B') },
        { key: 'C', name: 'Goal streak', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'exercise', 'C') },
        { key: 'D', name: 'Segments', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'exercise', 'D') },
      ],
    },
    {
      id: 'active', title: 'Active energy', sub: 'Active energy burned',
      icon: 'calories', color: 'training', group: 'Training', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'A',
      label: 'Open active energy trend',
      render: pendingTile('home', 'active'),
      versions: [
        { key: 'A', name: 'Burn curve', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'active', 'A') },
        { key: 'B', name: 'Day gauge', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'active', 'B') },
        { key: 'C', name: 'Usual range', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'active', 'C') },
        { key: 'D', name: 'Day clock', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'active', 'D') },
      ],
    },
    {
      id: 'steps', title: 'Steps', sub: 'Steps so far today',
      icon: 'steps', color: 'accent-2', group: 'Body', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'A',
      label: 'Open steps trend',
      render: pendingTile('home', 'steps'),
      versions: [
        { key: 'A', name: 'Day rhythm', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'steps', 'A') },
        { key: 'B', name: 'Step calendar', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'steps', 'B') },
        { key: 'C', name: 'Trail', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'steps', 'C') },
        { key: 'D', name: 'Milestones', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'steps', 'D') },
      ],
    },
    {
      id: 'calories', title: 'Calories', sub: 'Eaten and left today',
      icon: 'calories', color: 'food', group: 'Food', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'B',
      label: 'Open Food',
      render: pendingTile('home', 'calories'),
      versions: [
        { key: 'A', name: 'Ring', sizes: ['S', 'M'], render: pendingTile('home', 'calories', 'A') },
        { key: 'B', name: 'Meals', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'calories', 'B') },
        { key: 'C', name: 'Macros', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'calories', 'C') },
        { key: 'D', name: 'Week', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'calories', 'D') },
      ],
    },
    {
      id: 'protein', title: 'Protein', sub: 'Grams toward your goal',
      icon: 'protein', color: 'food', group: 'Food', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'A',
      label: 'Open nutrition',
      render: pendingTile('home', 'protein'),
      versions: [
        { key: 'A', name: 'Dial', sizes: ['S', 'M'], render: pendingTile('home', 'protein', 'A') },
        { key: 'B', name: 'Goal days', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'protein', 'B') },
        { key: 'C', name: 'Goal line', sizes: ['S', 'M'], render: pendingTile('home', 'protein', 'C') },
        { key: 'D', name: 'Timeline', sizes: ['S', 'M'], render: pendingTile('home', 'protein', 'D') },
      ],
    },
    {
      id: 'water', title: 'Water', sub: 'Water toward your goal, or one tap to add',
      icon: 'water', color: 'food', group: 'Food', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'E',
      label: 'Log water',
      render: pendingTile('home', 'water'),
      versions: [
        { key: 'A', name: 'Level', sizes: ['S', 'M'], render: pendingTile('home', 'water', 'A') },
        { key: 'B', name: 'Clock', sizes: ['S', 'M'], render: pendingTile('home', 'water', 'B') },
        { key: 'C', name: 'Week levels', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'water', 'C') },
        { key: 'D', name: 'On pace', sizes: ['S', 'M'], render: pendingTile('home', 'water', 'D') },
        { key: 'E', name: 'Quick add', sizes: ['S', 'M'], render: pendingTile('home', 'water', 'E') },
      ],
    },
    {
      id: 'logMeal', title: 'Log a meal', sub: 'The next meal, or recent foods in one tap',
      icon: 'meal', color: 'food', group: 'Food', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'A',
      label: 'Log a meal',
      render: pendingTile('home', 'logMeal'),
      versions: [
        { key: 'A', name: 'Next meal', sizes: ['S', 'M'],
          options: [
            { id: 'value', label: 'Shows', choices: [['kcal', 'Calories'], ['p', 'Protein']] },
          ],
          render: pendingTile('home', 'logMeal', 'A') },
        { key: 'B', name: 'Quick add', sizes: ['M', 'L'],
          options: [
            { id: 'list', label: 'List', choices: [['recent', 'Recent'], ['saved', 'Saved meals', 'Saved']] },
            { id: 'value', label: 'Shows', choices: [['kcal', 'Calories'], ['p', 'Protein']] },
          ],
          render: pendingTile('home', 'logMeal', 'B') },
      ],
    },
    {
      id: 'weight', title: 'Weight', sub: 'Trend toward your goal',
      icon: 'weight', color: 'accent-2', group: 'Body', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'A',
      label: 'Open body',
      render: pendingTile('home', 'weight'),
      versions: [
        { key: 'A', name: 'Trend', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'weight', 'A') },
        { key: 'B', name: 'Weeks', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'weight', 'B') },
        { key: 'C', name: 'Weigh-ins', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'weight', 'C') },
        { key: 'D', name: 'Progress', sizes: ['S', 'M'], render: pendingTile('home', 'weight', 'D') },
      ],
    },
    {
      id: 'bodyFat', title: 'Body fat', sub: 'Body fat over 30 days',
      icon: 'pillar-recovery', color: 'accent-2', group: 'Body', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'A',
      label: 'Open body',
      render: pendingTile('home', 'bodyFat'),
      versions: [
        { key: 'A', name: 'Readings', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'bodyFat', 'A') },
        { key: 'B', name: 'Dot grid', sizes: ['S', 'M'], render: pendingTile('home', 'bodyFat', 'B') },
        { key: 'C', name: 'Log', sizes: ['S', 'M'], render: pendingTile('home', 'bodyFat', 'C') },
        { key: 'D', name: 'Composition', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'bodyFat', 'D') },
      ],
    },
    {
      id: 'sleep', title: 'Sleep', sub: 'Last night, by stage',
      icon: 'sleep', color: 'sleep', group: 'Recovery & Sleep', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'D',
      label: 'Open sleep',
      render: pendingTile('home', 'sleep'),
      versions: [
        { key: 'A', name: 'Hypnogram', sizes: ['S', 'M', 'L'],
          options: [
            { id: 'show', label: 'Shows', choices: [['hours', 'Hours'], ['score', 'Sleep score']] },
          ],
          render: pendingTile('home', 'sleep', 'A') },
        { key: 'B', name: 'Nights', sizes: ['S', 'M', 'L'],
          options: [
            { id: 'show', label: 'Shows', choices: [['hours', 'Hours'], ['score', 'Sleep score']] },
          ],
          render: pendingTile('home', 'sleep', 'B') },
        { key: 'C', name: 'Night arc', sizes: ['S', 'M', 'L'],
          options: [
            { id: 'show', label: 'Shows', choices: [['hours', 'Hours'], ['score', 'Sleep score']] },
          ],
          render: pendingTile('home', 'sleep', 'C') },
        { key: 'D', name: 'Stages', sizes: ['S', 'M', 'L'],
          options: [
            { id: 'show', label: 'Shows', choices: [['hours', 'Hours'], ['score', 'Sleep score']] },
          ],
          render: pendingTile('home', 'sleep', 'D') },
      ],
    },
    {
      id: 'sleepScore', title: 'Sleep score', sub: 'Last night as one score',
      icon: 'sleep', color: 'sleep', group: 'Recovery & Sleep', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'C',
      render: pendingTile('home', 'sleepScore'),
      versions: [
        { key: 'A', name: 'Ring', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'sleepScore', 'A') },
        { key: 'B', name: 'Parts', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'sleepScore', 'B') },
        { key: 'C', name: 'Horizon', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'sleepScore', 'C') },
        { key: 'D', name: 'Week', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'sleepScore', 'D') },
      ],
    },
    {
      id: 'mindful', title: 'Mindful minutes', sub: 'Minutes from Apple Health',
      icon: 'mindful', color: 'sleep', group: 'Recovery & Sleep', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'D',
      label: 'Mindful minutes',
      render: pendingTile('home', 'mindful'),
      versions: [
        { key: 'A', name: 'Ripples', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'mindful', 'A') },
        { key: 'B', name: 'Day line', sizes: ['S', 'M'], render: pendingTile('home', 'mindful', 'B') },
        { key: 'C', name: 'Calm days', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'mindful', 'C') },
        { key: 'D', name: 'Meter', sizes: ['S', 'M'], render: pendingTile('home', 'mindful', 'D') },
      ],
    },
    {
      id: 'hrv', title: 'HRV', sub: 'Heart rate variability from Oura',
      icon: 'heart', color: 'sleep', group: 'Recovery & Sleep', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'A',
      label: 'Open HRV trend',
      render: pendingTile('home', 'hrv'),
      versions: [
        { key: 'A', name: 'Band line', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'hrv', 'A') },
        { key: 'B', name: 'Range bar', sizes: ['S', 'M'], render: pendingTile('home', 'hrv', 'B') },
        { key: 'C', name: 'Your nights', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'hrv', 'C') },
        { key: 'D', name: 'Columns', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'hrv', 'D') },
      ],
    },
    {
      id: 'rhr', title: 'Resting heart rate', sub: 'Resting heart rate from Oura',
      icon: 'heart', color: 'sleep', group: 'Recovery & Sleep', sizes: ['S', 'M', 'L'], size: 'S', head: false, style: 'C',
      label: 'Open resting heart rate trend',
      render: pendingTile('home', 'rhr'),
      versions: [
        { key: 'A', name: 'Baseline', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'rhr', 'A') },
        { key: 'B', name: 'Dial', sizes: ['S', 'M'], render: pendingTile('home', 'rhr', 'B') },
        { key: 'C', name: 'Week row', sizes: ['S', 'M', 'L'], render: pendingTile('home', 'rhr', 'C') },
        { key: 'D', name: 'Orbit', sizes: ['S', 'M'], render: pendingTile('home', 'rhr', 'D') },
      ],
    },
  ],
};

/** Tiles only Apple Health fills. Android has no Apple Health in v1, so there Home neither offers nor starts with them. */
export const APPLE_ONLY_TILES: readonly string[] = ['active', 'exercise', 'bodyFat', 'water', 'mindful'];
const withoutAppleOnly = (cfg: TilePageConfig): TilePageConfig => ({
  ...cfg,
  defaults: cfg.defaults.filter(([id]) => !APPLE_ONLY_TILES.includes(id)),
  tiles: cfg.tiles.filter(d => !APPLE_ONLY_TILES.includes(d.id)),
});
export const homeTiles: TilePageConfig = Platform.OS === 'android' ? withoutAppleOnly(allHomeTiles) : allHomeTiles;
