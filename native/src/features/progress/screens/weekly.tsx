import type { ReactNode } from 'react';
import { Share, Text, View } from 'react-native';
import { Button, Eyebrow, List, ListRow, NavButton, SectionHeader, font, useKit } from '@/components/kit';
import { t } from '@/i18n/en';
import { addDays, parseDay, weekday } from '../model';
import { fill, fmt, hm, signed, wtS, wtV } from '../format';
import { useProgress } from '../use-progress';
import { Chart } from '../viz';
import { weekLines } from '../tiles/more';
import { Big, Cap, Card, Foot, Page, Split, Txt, hmUnits } from './parts';

/** The weekly report: a few fixed sentences filled with this week's numbers. */
export function WeeklyScreen() {
  const d = useProgress(), k = useKit(), { R } = weekLines(d), T0 = d.training, B = d.baseline.score, u = d.unit;
  const from = parseDay(R.from), to = parseDay(R.to);
  const title = `${weekday(R.from)} ${from.getDate()} ${t('progressTo')} ${weekday(R.to)} ${to.getDate()}`;
  const lead = [
    R.avgScore != null ? (B != null ? fill(t('progressWkLead'), { score: R.avgScore, dir: t(R.avgScore >= B ? 'progressAbove' : 'progressBelow'), base: Math.round(B) }) : fill(t('progressWkLeadNoBase'), { score: R.avgScore })) : '',
    R.sleepAvg != null ? fill(t('progressWkTrainedSlept'), { workouts: R.workouts, sleep: hm(R.sleepAvg) }) : fill(t('progressWkTrained'), { workouts: R.workouts }),
  ].filter(Boolean).join(' ');
  const wins = [
    ...R.prs.map(x => fill(t('progressWinPr'), { lift: `${x.name} ${wtS(x.kg, u, 0)}${x.reps ? ` × ${x.reps}` : ''}`, day: weekday(x.day) })),
    ...(R.volPct != null && R.volPct >= 0 ? [fill(t('progressWinVolUp'), { pct: R.volPct, vol: wtS(T0.weekVolumeKg, u, 0).replace(/\.0 /, ' ') })] : T0.weekVolumeKg > 0 ? [fill(t('progressWinVol'), { vol: wtS(T0.weekVolumeKg, u, 0) })] : []),
    ...(R.logged ? [fill(t('progressWinKcal'), { n: R.onTarget, m: R.logged })] : []),
    ...(T0.streak > 1 ? [fill(t('progressWinStreak'), { n: T0.streak })] : []),
  ];
  const nights = R.shortNights.length === 2 ? `${R.shortNights[0]} ${t('progressAnd')} ${R.shortNights[1]}` : R.shortNights.join(', ');
  const slips = [
    ...(R.shortNights.length ? [fill(t('progressSlipSleep'), { days: nights })] : []),
    ...(R.lowSteps ? [fill(t('progressSlipSteps'), { n: R.lowSteps, goal: fmt(d.stepGoal) })] : []),
    ...(d.food.proteinG != null && d.food.proteinGoal && d.food.proteinG < d.food.proteinGoal ? [fill(t('progressSlipProtein'), { g: Math.round(d.food.proteinG), goal: Math.round(d.food.proteinGoal) })] : []),
  ];
  const plan = [
    ...(T0.next ? [fill(t('progressPlanNext'), { name: T0.next.name, when: T0.next.when.toLowerCase(), n: T0.next.exercises, est: `${T0.next.estMin} min` })] : []),
    ...(T0.plan.perWeek ? [fill(t(T0.plan.name ? 'progressPlanPlan' : 'progressPlanPer'), { per: T0.plan.perWeek, plan: T0.plan.name ?? '' })] : []),
    ...(R.sleepAvg != null && R.sleepAvg < d.sleepGoalMin / 60 ? [t('progressPlanBed')] : []),
    ...(d.food.proteinGoal ? [fill(t('progressPlanProt'), { goal: Math.round(d.food.proteinGoal) })] : []),
  ];
  const share = () => { void Share.share({ message: [title, lead, ...wins, ...slips, ...plan].join('\n') }).catch(() => {}); };
  const rows = (list: string[], icon: 'check' | 'alert' | 'cal', color: string) => list.length
    ? <List>{list.map(x => <ListRow key={x} title={x} icon={icon} color={color} />)}</List>
    : <Card><Cap>{t('progressNothingYet')}</Cap></Card>;
  const stat = (l: string, v: ReactNode, s: string) => <View style={{ flex: 1, minWidth: '45%' }}><Card style={{ padding: 14 }}>
    <Cap>{l}</Cap><View style={{ marginTop: 6 }}>{v}</View><Cap style={[font(500, 12.5, 1.35), { marginTop: 2 }]}>{s}</Cap></Card></View>;
  const nd = <Big size="sm" v={t('progressNoData')} color={k.c['text-muted']} />;
  const wk = d.days.score.slice(-7);
  return <Page back={t('progress')} title={t('progressWeeklyTitle')} right={<NavButton icon="share" label={t('progressShareReport')} onPress={share} />}>
    <View style={{ paddingTop: 6, paddingBottom: 6 }}>
      <Eyebrow style={{ marginBottom: 8 }}>{t('progressWeeklyTitle')}</Eyebrow>
      <Text style={[font(700, 28, 1.1, -0.03), { color: k.c.text }]}>{title}</Text>
      <Txt style={[font(500, 15, 1.45), { marginTop: 10, color: k.c.text }]}>{lead}</Txt>
    </View>
    <Card>
      <Split><Cap>{t('progressScoreByDay')}</Cap>{B != null ? <Cap>{fill(t('progressUsualCap'), { n: Math.round(B) })}</Cap> : null}</Split>
      <Chart values={wk} kind="dots" base={B} color="accent" mini vals H={112} partial={6} ticks={Array.from({ length: 7 }, (_, i) => weekday(addDays(d.today, i - 6)).charAt(0))} />
      <Cap style={{ marginTop: 8 }}>{B != null ? `${fill(t('progressLineUsual'), { n: Math.round(B) })} ${fill(t('progressDayGoing'), { day: weekdayLong(d.today) })}` : t('progressTodayGoing')}</Cap>
    </Card>
    <SectionHeader title={t('progressInNumbers')} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {stat(t('progressWorkouts'), <Big size="sm" v={R.workouts} unit={T0.active ? t('progressPlusGoing') : undefined} color={k.c.training} />, fill(t('progressMinInAll'), { n: fmt(R.minutes) }))}
      {stat(t('progressVolume'), <Big size="sm" v={fmt(wtV(T0.weekVolumeKg, u))} unit={u} color={k.c.training} />, R.volPct != null ? fill(t('progressOnLastWeek'), { pct: signed(R.volPct) }) : t('progressThisWeek'))}
      {stat(t('progressMKcal'), R.kcalAvg != null ? <Big size="sm" v={fmt(R.kcalAvg)} unit="kcal" color={k.c.food} /> : nd, fill(t('progressADayLogged'), { n: R.logged }))}
      {stat(t('progressMSleep'), R.sleepAvg != null ? <Big size="sm" units={hmUnits(R.sleepAvg * 60)} color={k.c.sleep} /> : nd, fill(t('progressANightGoal'), { goal: `${d.sleepGoalMin / 60}h` }))}
      {stat(t('progressMWeight'), R.wDeltaKg != null ? <Big size="sm" v={signed(wtV(R.wDeltaKg, u), 1)} unit={u} color={k.c.recovery} /> : nd, d.weight.kg != null ? `${t('progressNowLower')} ${wtS(d.weight.kg, u)}` : t('progressNoWeighIns'))}
      {stat(t('progressMSteps'), R.stepsAvg != null ? <Big size="sm" v={fmt(Math.round(R.stepsAvg))} unit={t('progressAvgLower')} color={k.c.training} /> : nd, fill(t('progressDaysUnder'), { n: R.lowSteps }))}
    </View>
    <SectionHeader title={t('progressWins')} />{rows(wins, 'check', 'success')}
    <SectionHeader title={t('progressSlipped')} />{rows(slips, 'alert', 'warning')}
    <SectionHeader title={t('progressNextWeek')} />{rows(plan, 'cal', 'accent')}
    <Foot>{t('progressWeeklyFoot')}</Foot>
    <View style={{ marginTop: 8 }}><Button label={t('progressShareReportBtn')} variant="secondary" icon="share" full onPress={share} /></View>
  </Page>;
}
const weekdayLong = (day: string) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][parseDay(day).getDay()];
