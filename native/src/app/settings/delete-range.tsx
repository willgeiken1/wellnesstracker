import { DeleteRangePage } from '@/features/settings/more-pages';

/** Delete a date range: a large sheet over Data or the Privacy center. Its options are set in the Settings layout, so it opens as a sheet, not a pushed page. */
export default function SettingsDeleteRangeSheet() {
  return <DeleteRangePage />;
}
