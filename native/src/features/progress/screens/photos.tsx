import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Icon, List, ListRow, NavButton, SectionHeader, font, useKit } from '@/components/kit';
import { useAuth } from '@/auth/provider';
import { t } from '@/i18n/en';
import { showToast } from '@/features/shell/toast';
import { daysBetween, dShort, type ProgressPhoto } from '../model';
import { clock, fill, wD, wtS } from '../format';
import { readReminder, saveReminder } from '../local';
import { useProgress } from '../use-progress';
import { PhotoBox } from '../tiles/more';
import { Card, Cap, Ic, Page } from './parts';

/** "Front photo, Nov 8, 182.9 lb" */
const photoName = (p: ProgressPhoto, unit: 'kg' | 'lb') => fill(t('progressPhotoAria'), { pose: t(p.pose === 'Side' ? 'progressPoseSide' : p.pose === 'Back' ? 'progressPoseBack' : 'progressPoseFront'), day: dShort(p.day) })
  + (p.kg != null ? `, ${wtS(p.kg, unit)}` : '');

/** One photo in the grid: tap to put it in the comparison; the number says which side it is on. */
function Pick({ p, n, unit, onPress }: { p: ProgressPhoto; n: number; unit: 'kg' | 'lb'; onPress: () => void }) {
  const k = useKit();
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: n > 0 }}
    accessibilityLabel={photoName(p, unit) + (n ? `, ${fill(t('progressSelectedN'), { n })}` : '')}
    style={({ pressed }) => ({ flex: 1, borderRadius: 14, transform: [{ scale: pressed ? 0.97 : 1 }], boxShadow: n ? `0px 0px 0px 3px ${k.c.accent}` : undefined })}>
    <PhotoBox p={p} w="100%" radius={14} />
    {n ? <View style={{ position: 'absolute', right: 6, top: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: k.c.accent }}>
      <Text style={[font(700, 12), { color: k.tok('on-accent') }]}>{n}</Text></View> : null}
  </Pressable>;
}

export function PhotosScreen() {
  const d = useProgress(), k = useKit(), auth = useAuth(), u = d.unit, ph = d.photos;
  // The two photos in the comparison (oldest and newest to start); the next tap replaces `next`.
  const [cmp, setCmp] = useState<[number, number]>([0, Math.max(0, ph.length - 1)]), [next, setNext] = useState(0);
  const [remind, setRemind] = useState(() => auth.repository ? readReminder(auth.repository) : true);
  const pair = [...cmp].sort((a, b) => a - b).map(i => ph[Math.min(i, ph.length - 1)]).filter(Boolean);
  const pick = (i: number) => {
    const at = cmp.indexOf(i);
    if (at >= 0) { setNext(1 - at); showToast(fill(t('progressStaysInCompare'), { day: dShort(ph[i].day) }), { color: 'sleep' }); return; }
    const c: [number, number] = [...cmp]; c[next] = i; setCmp(c); setNext(1 - next);
  };
  const toggle = (on: boolean) => {
    setRemind(on); if (auth.repository) saveReminder(auth.repository, on);
    showToast(on ? fill(t('progressReminderOn'), { time: clock(480) }) : t('progressReminderOff'), { color: 'sleep' });
  };
  const A = pair[0], B = pair[1];
  const days = A && B ? daysBetween(A.day, B.day) : 0, wk = Math.round(days / 7);
  const delta = A && B && A !== B && A.kg != null && B.kg != null
    ? fill(t('progressPhotoDelta'), { v: `${wD(B.kg - A.kg, u)} ${u}`, span: wk >= 1 ? fill(t(wk === 1 ? 'progressOneWeek' : 'progressNWeeks'), { n: wk }) : fill(t('progressNDays'), { n: days }) }) : null;
  const rows: (ProgressPhoto | 'add')[] = [...ph, 'add'];
  return <Page back={t('progressBody')} title={t('progressPhotos')} right={<NavButton icon="camera" label={t('progressTakePhoto')} onPress={() => router.push('/progress/photo-capture')} />}>
    <Text accessibilityRole="header" style={[font(700, 30, 1.1, -0.03), { color: k.c.text, marginTop: 4, marginBottom: 4 }]}>{t('progressPhotos')}</Text>
    {A && B && A !== B ? <Card>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={[font(700, 16, undefined, -0.015), { color: k.c.text }]}>{t('progressCompare')}</Text><Cap>{t('progressTapTwo')}</Cap></View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[A, B].map(p => <View key={p.id} style={{ flex: 1 }} accessible accessibilityLabel={photoName(p, u)}>
          <PhotoBox p={p} w="100%" date={false} radius={16} />
          <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[font(600, 13), { color: k.c.text }]}>{dShort(p.day)}</Text>
            {p.kg != null ? <Text style={[font(600, 13), { color: k.c['text-muted'], fontVariant: ['tabular-nums'] }]}>{wtS(p.kg, u)}</Text> : null}</View>
        </View>)}
      </View>
      {delta ? <View style={{ alignItems: 'center', marginTop: 14 }}><Badge label={delta} color="recovery" /></View> : null}
    </Card> : null}
    <SectionHeader title={t('progressAllPhotos')} aside={fill(t('progressNPhotos'), { n: ph.length })} />
    <View accessibilityRole="none" accessibilityLabel={t('progressTapTwoAria')} style={{ gap: 8 }}>
      {Array.from({ length: Math.ceil(rows.length / 3) }, (_, r) => <View key={r} style={{ flexDirection: 'row', gap: 8 }}>
        {[0, 1, 2].map(c => { const i = r * 3 + c, x = rows[i];
          if (x == null) return <View key={c} style={{ flex: 1 }} />;
          if (x === 'add') return <Pressable key="add" onPress={() => router.push('/progress/photo-capture')} accessibilityRole="button" accessibilityLabel={t('progressTakePhoto')}
            style={({ pressed }) => ({ flex: 1, aspectRatio: 3 / 4, borderRadius: 14, gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: k.c.surface, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
            <Icon name="camera" size={24} color={k.c.sleep} /><Text style={[font(600, 12.5), { color: k.c.sleep }]}>{t('progressAddPhoto')}</Text></Pressable>;
          const n = cmp.indexOf(i) >= 0 ? [...cmp].sort((a, b) => a - b).indexOf(i) + 1 : 0;
          return <Pick key={x.id} p={x} n={n} unit={u} onPress={() => pick(i)} />; })}
      </View>)}
    </View>
    <View style={{ height: 4 }} />
    <Card><View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}><Ic icon="lock2" color="success" />
      <Text style={[font(500, 14, 1.45), { flex: 1, color: k.c['text-muted'] }]}><Text style={[font(700, 14), { color: k.c.text }]}>{t('progressPhotosStay')}</Text> {t('progressPhotosStayMore')}</Text></View></Card>
    <List>
      <ListRow icon="bell" color="sleep" title={t('progressPhotoReminder')} sub={fill(t('progressSundaysAt'), { time: clock(480) })} toggle={remind} onToggle={toggle} />
    </List>
  </Page>;
}
