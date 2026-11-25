import { pendingTile } from '../pending';
import type { TilePageConfig } from '../types';

/** The Routines tab's tiles, as the final design lists them: catalogue, tray sections and the starting layout.
 * Every renderer is a pending stub; the Routines packet replaces each `render` (and adds `meta` and `open`) as it builds the tile. */
export const routinesTiles: TilePageConfig = {
  id: 'routines', label: 'Routines', color: 'sleep',
  groups: [['Today', 'sleep'], ['History', 'sleep'], ['Supplies', 'sleep'], ['Tools', 'sleep']],
  intro: 'Tiles for your routines, supplies and history. Touch and hold any tile to move or resize it.',
  defaults: [['sun', 'L'], ['next', 'S'], ['overview', 'S'], ['routine', 'L'], ['adherence', 'M'], ['streak', 'S'], ['supplies', 'S'], ['peptides', 'M'], ['week', 'M'], ['tools', 'M']],
  tiles: [
    {
      id: 'sun', title: 'Sun path', sub: 'Today on one arc, each item at its time',
      icon: 'sun', color: 'warning', group: 'Today', sizes: ['M', 'L'], size: 'L',
      label: 'Open the next routine',
      options: [
        { id: 'center', label: 'Center', choices: [['time', 'Time now', 'Time'], ['left', 'Items left', 'Left']] },
        { id: 'foot', label: 'Below the arc', choices: [['routines', 'Routines', 'Routines'], ['next', 'Next item', 'Next']] },
      ],
      render: pendingTile('routines', 'sun'),
    },
    {
      id: 'next', title: 'Next up', sub: 'The next item, with log and skip',
      icon: 'up-next', color: 'sleep', group: 'Today', sizes: ['S', 'M'], size: 'M',
      label: 'Open the routine',
      options: [
        { id: 'then', label: 'Also show', choices: [['then', 'What follows', 'Then'], ['window', 'Routine window', 'Window']] },
      ],
      render: pendingTile('routines', 'next'),
    },
    {
      id: 'routine', title: 'Routine', sub: "One routine's items, ticked off right here",
      icon: 'checks', color: 'sleep', group: 'Today', sizes: ['S', 'M', 'L'], size: 'L', head: false,
      label: 'Open the routine',
      options: [
        { id: 'which', label: 'Routine', choices: [['auto', 'Up next', 'Next'], ['morning', 'Morning'], ['midday', 'Midday'], ['night', 'Night']] },
      ],
      render: pendingTile('routines', 'routine'),
    },
    {
      id: 'overview', title: "Today's routines", sub: 'Every routine at a glance, as rings or bars',
      icon: 'routines', color: 'sleep', group: 'Today', sizes: ['S', 'M', 'L'], size: 'S',
      label: 'Edit routines',
      options: [
        { id: 'look', label: 'Show as', choices: [['rings', 'Rings'], ['bars', 'Bars']] },
      ],
      render: pendingTile('routines', 'overview'),
    },
    {
      id: 'adherence', title: 'Last 30 days', sub: 'Items logged on time, day by day',
      icon: 'history', color: 'sleep', group: 'History', sizes: ['S', 'M', 'L'], size: 'M',
      label: 'Open history',
      options: [
        { id: 'which', label: 'Routine', choices: [['all', 'All'], ['morning', 'Morning'], ['midday', 'Midday'], ['night', 'Night']] },
      ],
      render: pendingTile('routines', 'adherence'),
    },
    {
      id: 'streak', title: 'Streak', sub: 'Days in a row with every item done',
      icon: 'flame', color: 'sleep', group: 'History', sizes: ['S', 'M'], size: 'S',
      label: 'Open history',
      options: [
        { id: 'which', label: 'Count', choices: [['all', 'All'], ['morning', 'Morning'], ['midday', 'Midday'], ['night', 'Night']] },
      ],
      render: pendingTile('routines', 'streak'),
    },
    {
      id: 'supplies', title: 'Supplies', sub: 'Days left of each supplement and vial',
      icon: 'capsule', color: 'sleep', group: 'Supplies', sizes: ['S', 'M', 'L'], size: 'S',
      label: 'Open supplements',
      options: [
        { id: 'flag', label: 'Flag under', choices: [['10', '10 days'], ['7', '7 days'], ['14', '14 days']] },
      ],
      render: pendingTile('routines', 'supplies'),
    },
    {
      id: 'peptides', title: 'Peptides', sub: 'Doses left in each vial, schedule and sites',
      icon: 'rt-vial', color: 'sleep', group: 'Supplies', sizes: ['S', 'M', 'L'], size: 'M',
      label: 'Open peptides',
      options: [
        { id: 'show', label: 'Show', choices: [['vials', 'Vials'], ['sites', 'Injection sites', 'Sites']] },
      ],
      render: pendingTile('routines', 'peptides'),
    },
    {
      id: 'meds', title: 'Medications', sub: 'What is due today, with check-off',
      icon: 'rt-med', color: 'sleep', group: 'Supplies', sizes: ['S', 'M'], size: 'M',
      label: 'Open medications',
      render: pendingTile('routines', 'meds'),
    },
    {
      id: 'week', title: 'This week', sub: 'Each routine, day by day',
      icon: 'cal', color: 'sleep', group: 'History', sizes: ['S', 'M', 'L'], size: 'M',
      label: 'Open history',
      options: [
        { id: 'span', label: 'Days', choices: [['past', 'Last 7 days', 'Past'], ['ahead', 'Next 7 days', 'Ahead']] },
      ],
      render: pendingTile('routines', 'week'),
    },
    {
      id: 'tools', title: 'Shortcuts', sub: 'New routine, converter, pause and edit',
      icon: 'sliders2', color: 'sleep', group: 'Tools', sizes: ['S', 'M'], size: 'M',
      label: 'Edit routines',
      render: pendingTile('routines', 'tools'),
    },
  ],
};
