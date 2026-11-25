import { pendingTile } from '../pending';
import type { TilePageConfig } from '../types';

/** The Food tab's tiles, as the final design lists them: catalogue, tray sections and the starting layout.
 * Every renderer is a pending stub; the Food packet replaces each `render` (and adds `meta` and `open`) as it builds the tile. */
export const foodTiles: TilePageConfig = {
  id: 'food', label: 'Food', color: 'food',
  groups: [['Today', 'food'], ['Nutrition', 'food'], ['Log faster', 'food'], ['Patterns', 'food']],
  intro: 'Food tiles follow the day you pick above them.',
  defaults: [['cal', 'M'], ['macros', 'M'], ['meals', 'L'], ['water', 'S'], ['protein', 'S'], ['fits', 'M'], ['week', 'M'], ['window', 'S'], ['streak', 'S'], ['quick', 'M']],
  tiles: [
    {
      id: 'cal', title: 'Calories', sub: 'Left or eaten, burned and calories by meal',
      icon: 'flame', color: 'food', group: 'Today', sizes: ['S', 'M', 'L'], size: 'M',
      label: 'Open nutrition',
      options: [
        { id: 'lead', label: 'Big number', choices: [['left', 'Calories left', 'Left'], ['eaten', 'Calories eaten', 'Eaten']] },
      ],
      render: pendingTile('food', 'cal'),
    },
    {
      id: 'macros', title: 'Macros', sub: 'Protein, carbs, fat and fiber against your targets',
      icon: 'layers', color: 'food', group: 'Today', sizes: ['S', 'M', 'L'], size: 'M',
      label: 'Open nutrition',
      options: [
        { id: 'show', label: 'Show', choices: [['eaten', 'Grams eaten', 'Eaten'], ['left', 'Grams left', 'Left']] },
      ],
      render: pendingTile('food', 'macros'),
    },
    {
      id: 'protein', title: 'Protein', sub: 'Your daily target or 40 g a meal, and foods that close the gap',
      icon: 'bolt', color: 'food', group: 'Nutrition', sizes: ['S', 'M', 'L'], size: 'S',
      label: 'Open nutrition',
      options: [
        { id: 'view', label: 'Track', choices: [['day', 'Daily target', 'Daily'], ['meal', 'Per meal, 40 g each', 'Per meal']] },
      ],
      render: pendingTile('food', 'protein'),
    },
    {
      id: 'meals', title: 'Meals', sub: 'Breakfast to dinner with calories or protein, and quick adds',
      icon: 'meal', color: 'food', group: 'Today', sizes: ['S', 'M', 'L'], size: 'L',
      label: 'Log food',
      options: [
        { id: 'value', label: 'Value', choices: [['kcal', 'Calories'], ['p', 'Protein']] },
      ],
      render: pendingTile('food', 'meals'),
    },
    {
      id: 'water', title: 'Water', sub: 'Today toward your goal, the week, and your containers one tap each',
      icon: 'drop', color: 'water', group: 'Today', sizes: ['S', 'M', 'L'], size: 'S',
      label: 'Open water',
      options: [
        { id: 'show', label: 'Big number', choices: [['drunk', 'Drunk so far', 'Drunk'], ['left', 'Left to drink', 'Left']] },
      ],
      render: pendingTile('food', 'water'),
    },
    {
      id: 'week', title: 'This week', sub: 'Calories or protein by day, against your goal or last week',
      icon: 'cal', color: 'food', group: 'Patterns', sizes: ['S', 'M', 'L'], size: 'M',
      label: 'Open nutrition',
      options: [
        { id: 'measure', label: 'Measure', choices: [['kcal', 'Calories'], ['p', 'Protein']] },
        { id: 'compare', label: 'Compare with', choices: [['goal', 'Your goal', 'Goal'], ['last', 'The week before', 'Last week']] },
      ],
      render: pendingTile('food', 'week'),
    },
    {
      id: 'micros', title: 'Nutrients', sub: 'Fiber and key nutrients to reach, or limits like sodium and sugar',
      icon: 'sliders', color: 'food', group: 'Nutrition', sizes: ['S', 'M', 'L'], size: 'M',
      label: 'Open nutrition',
      options: [
        { id: 'show', label: 'Show', choices: [['reach', 'Goals to reach', 'To reach'], ['limit', 'Limits to stay under', 'Limits']] },
      ],
      render: pendingTile('food', 'micros'),
    },
    {
      id: 'window', title: 'Meal timing', sub: 'Your eating window, first and last meal, with an optional target',
      icon: 'clock', color: 'food', group: 'Patterns', sizes: ['S', 'M', 'L'], size: 'S',
      label: 'Open meals',
      options: [
        { id: 'target', label: 'Target window', choices: [['0', 'No target', 'None'], ['12', '12 hours', '12 h'], ['10', '10 hours', '10 h']] },
      ],
      render: pendingTile('food', 'window'),
    },
    {
      id: 'streak', title: 'Logging streak', sub: 'Days in a row with food or every meal logged',
      icon: 'checks', color: 'food', group: 'Patterns', sizes: ['S', 'M', 'L'], size: 'S',
      label: 'Log food',
      options: [
        { id: 'count', label: 'Count a day when', choices: [['any', 'Any food is logged', 'Any food'], ['full', 'Every meal is logged', 'Every meal']] },
      ],
      render: pendingTile('food', 'streak'),
    },
    {
      id: 'quick', title: 'Quick add', sub: 'Recent foods, your most logged or saved meals, one tap each',
      icon: 'history', color: 'food', group: 'Log faster', sizes: ['S', 'M', 'L'], size: 'M',
      label: 'Log food',
      options: [
        { id: 'list', label: 'List', choices: [['recent', 'Recent'], ['often', 'Most logged', 'Most'], ['saved', 'Saved meals', 'Saved']] },
      ],
      render: pendingTile('food', 'quick'),
    },
    {
      id: 'net', title: 'Net calories', sub: 'Eaten minus burned from Apple Health, today or by day',
      icon: 'swap', color: 'food', group: 'Today', sizes: ['S', 'M', 'L'], size: 'M',
      label: 'Open nutrition',
      options: [
        { id: 'range', label: 'Range', choices: [['day', 'One day', 'Day'], ['week', 'The week', 'Week']] },
      ],
      render: pendingTile('food', 'net'),
    },
    {
      id: 'fits', title: 'What fits today', sub: 'Saved meals that fit the calories you have left',
      icon: 'bookmark', color: 'food', group: 'Log faster', sizes: ['S', 'M', 'L'], size: 'M',
      label: 'Open saved meals',
      options: [
        { id: 'by', label: 'Best for', choices: [['kcal', 'Using calories left', 'Calories'], ['p', 'Most protein', 'Protein']] },
      ],
      render: pendingTile('food', 'fits'),
    },
  ],
};
