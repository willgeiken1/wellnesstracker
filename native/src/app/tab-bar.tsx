import { router, Stack, useGlobalSearchParams } from 'expo-router';
import { TabBarSheet } from '@/features/shell/tab-bar-sheet';
import { PAGES, type PageKey } from '@/features/shell/pages';

/** The Tab bar sheet: touch and hold the bar, or Settings. `from` names the page open behind it, if any. */
export default function TabBar() {
  const { from } = useGlobalSearchParams<{ from?: string }>();
  const current = PAGES.some(p => p.key === from) ? from as PageKey : null;
  return <>
    <Stack.Screen options={{ headerShown: false, presentation: 'formSheet', sheetAllowedDetents: 'fitToContents', sheetGrabberVisible: true, sheetCornerRadius: 24 }} />
    <TabBarSheet current={current} onDone={() => router.back()}
      onOpen={page => { router.back(); setTimeout(() => router.navigate(PAGES.find(p => p.key === page)!.href as never), 200); }} />
  </>;
}
