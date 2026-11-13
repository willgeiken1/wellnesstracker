import { Fragment, useEffect, useRef, useState } from "react";
import { Alert, AppState, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets, initialWindowMetrics } from "react-native-safe-area-context";
import { useKeepAwake } from "expo-keep-awake";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { Button } from "@/components/button";
import { ThemedText } from "@/components/themed-text";
import { tokens } from "@/design/tokens";
import { useTheme } from "@/design/theme-provider";
import { MachineSetup } from "./machine-setup";
import { displayWeight, nextField, validateSet } from "@/core/workout/rules";
import type { Row } from "@/data/rows";
import type { WorkoutStore } from "@/data/workout/store";
import { equipmentLabel, pluralize, workingSetsPhrase, t } from "@/i18n/en";
import { useWorkout } from "./use-workout";
import { SyncBadge } from "./badge";
import {
  clock,
  Chip,
  Eyebrow,
  Pill,
  IconButton,
  layout,
  Line,
  Panel,
  SheetHost,
} from "./primitives";
import { Keypad, type Cursor } from "./keypad";
import { ExercisePicker } from "./picker";
import { SupersetControls } from "./superset-controls";
import { RestOptions } from "./rest-options";
import { SetRow } from "./set-row";
import { UpNext } from "./up-next";
import { RestTimer } from "./timer";
import { restOpens } from "./rest-pref";
import { FinishSheet } from "./finish";
import { tick } from "./haptics";
import { useStacked } from "@/components/text-size";
export function ActiveWorkout({ fixtureState }: { fixtureState?: string } = {}) {
  const { store, auth } = useWorkout(),
    { routine, id, day } = useLocalSearchParams<{
      id?: string;
      day?: string;
      routine?: string;
    }>(),
    [error, setError] = useState(false),
    [pastId, setPastId] = useState<string | null>(null),
    started = useRef(false);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active || !store || started.current) return;
      started.current = true;
      try {
        if (id) store.beginEditing(id);
        else if (day) setPastId(store.startPast(day).id);
        else store.start(routine);
      } catch {
        setError(true);
      }
    });
    return () => {
      active = false;
    };
  }, [store, routine, id, day]);
  const session = id ? store?.repo.get("sessions", id) : day ? (pastId ? store?.repo.get("sessions", pastId) : undefined) : store?.active();
  return store && session ? (
    <Logger
      key={session.id}
      fixtureState={fixtureState}
      store={store}
      session={session}
      pending={auth.pending}
      status={auth.syncStatus}
    />
  ) : (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
      style={{
        flex: 1,
      }}
    >
      <ThemedText>{error ? t("workoutSaveError") : t("workout")}</ThemedText>
      <Button label={t("closeWorkout")} onPress={closeWorkout} />
    </SafeAreaView>
  );
}
function closeWorkout() {
  router.replace("/");
}
function Logger({
  store,
  session,
  pending,
  status,
  fixtureState,
}: {
  store: WorkoutStore;
  fixtureState?: string;
  session: Row;
  pending: number;
  status: "idle" | "syncing" | "offline";
}) {
  const past = store.pastMode(session.id);
  useKeepAwake("workout");
  const insets = useSafeAreaInsets();
  const stacked = useStacked();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ fixtureState?: string }>();
  const selectedFixture = fixtureState ?? params.fixtureState;
  const focused = useIsFocused();
  const [now, setNow] = useState(() => Date.now()),
    [cursor, setCursor] = useState<Cursor | null>(() => {
      const fixture =
        __DEV__ && store.repo.owner === "demo"
          ? store.repo.localGet<{ benchId: string; sessionId: string }>(
              "loggerFixture",
            )
          : null;
      return fixture?.sessionId === session.id &&
        selectedFixture === "keypad"
        ? { entryId: fixture.benchId, index: 2, field: "weight" }
        : null;
    }),
    [value, setValue] = useState(() =>
      __DEV__ && store.repo.owner === "demo" && selectedFixture === "keypad"
        ? "190"
        : "",
    ),
    [picker, setPicker] = useState(false),
    [replacement, setReplacement] = useState<{entryId:string; mode:"swap" | "replace"} | null>(null),
    [options, setOptions] = useState<string | null>(null),
    [finish, setFinish] = useState(false),
    [error, setError] = useState<string | null>(null),
    [open, setOpen] = useState<string[]>([]);
  useEffect(() => {
    if (past) return;
    const timer = setInterval(() => {
      if (AppState.currentState === "active") setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [past]);
  const entries = store.entries(session.id),
    drafts = entries.filter(e => !store.skipped(e.id)).flatMap((e) => store.drafts(e.id)),
    done = drafts.filter((d) => d.setId).length,
    total = drafts.length;
  function run(action: () => void) {
    try {
      action();
      setError(null);
    } catch {
      setError(t("workoutSaveError"));
    }
  }
  function weightHint(entry: Row, index: number) {
    const fixture =
      __DEV__ && store.repo.owner === "demo"
        ? store.repo.localGet<{ entryId: string; weight: number }>(
            "loggerFixtureHint",
          )
        : null;
    if (fixture?.entryId === entry.id) return String(fixture.weight);
    const sg = store.suggestion(entry),
      previous = store
        .previous(entry)
        .find((s) => Number(s.data.position) === index);
    if (sg.jump && sg.weight !== null) return String(sg.weight);
    if (previous)
      return String(
        displayWeight(Number(previous.data.weight_kg), store.unit(entry.id)),
      );
    // A session without a matching history hint carries the preceding set's weight only.
    const preceding = store
      .drafts(entry.id)
      .slice(0, index)
      .reverse()
      .find((d) => d.weight !== "");
    return preceding?.weight ?? (sg.weight === null ? "" : String(sg.weight));
  }
  function edit(entryId: string, index: number, field: "weight" | "reps", side?: "right") {
    const d = store.drafts(entryId)[index];
    setCursor({
      entryId,
      index,
      field,
      side,
    });
    setValue(
      store.repo.localGet<string | null>(
        `input:${entryId}:${index}:${side ? "right:" : ""}${field}`,
      ) ??
        (d[side ? field === "weight" ? "rightWeight" : "rightReps" : field] ||
          (field === "weight"
            ? weightHint(
                entries.find((e) => e.id === entryId)!,
                index,
              )
            : "")),
    );
  }
  function input(text: string) {
    if (!cursor) return;
    setValue(text);
    run(() => {
      store.repo.localSave(
        `input:${cursor.entryId}:${cursor.index}:${cursor.side ? "right:" : ""}${cursor.field}`,
        text,
      );
      const d = store.drafts(cursor.entryId)[cursor.index];
      if (!d.setId)
        store.editDraft(cursor.entryId, cursor.index, {
          [cursor.side ? cursor.field === "weight" ? "rightWeight" : "rightReps" : cursor.field]: text,
        });
    });
  }
  function next() {
    if (!cursor) return;
    const d = store.drafts(cursor.entryId)[cursor.index];
    if (
      d.setId &&
      !validateSet(
        cursor.field === "weight" ? value : cursor.side ? d.rightWeight ?? "" : d.weight,
        cursor.field === "reps" ? value : cursor.side ? d.rightReps ?? "" : d.reps,
        store.unit(cursor.entryId),
      ).valid
    ) {
      setError(t("invalidSet"));
      return;
    }
    const commit = () => {
      try {
        if (
          value !== d[cursor.side ? cursor.field === "weight" ? "rightWeight" : "rightReps" : cursor.field] &&
          !(
            cursor.field === "weight" &&
            !d.weight &&
            value ===
              weightHint(
                entries.find((e) => e.id === cursor.entryId)!,
                cursor.index,
              )
          )
        )
          store.editDraft(cursor.entryId, cursor.index, {
            [cursor.side ? cursor.field === "weight" ? "rightWeight" : "rightReps" : cursor.field]: value,
          });
        store.repo.localSave(
          `input:${cursor.entryId}:${cursor.index}:${cursor.side ? "right:" : ""}${cursor.field}`,
          null,
        );
        const next = nextField(
          cursor.field,
          cursor.index,
          store.drafts(cursor.entryId).length,
        );
        if (store.isUnilateral(cursor.entryId) && cursor.field === 'reps' && !cursor.side) edit(cursor.entryId, cursor.index, 'weight', 'right');
        else if (cursor.side && cursor.field === 'weight') edit(cursor.entryId, cursor.index, 'reps', 'right');
        else if (store.supersetGroup(entries.find(e => e.id === cursor.entryId)! ) && cursor.field === 'reps') {
          const order = store.loggerOrder(session.id), position = order.findIndex(slot => slot.entryId === cursor.entryId && slot.index === cursor.index);
          const slot = order.slice(position+1).find(slot => !store.drafts(slot.entryId)[slot.index].setId);
          if (slot) edit(slot.entryId,slot.index,'weight');
          else setCursor(null);
        }
        else if (next) edit(cursor.entryId, next.index, next.field);
        else {
          const i = entries.findIndex((e) => e.id === cursor.entryId);
          const nextEntry = entries.slice(i + 1).find(e => !store.skipped(e.id));
          if (nextEntry) edit(nextEntry.id, 0, "weight");
          else setCursor(null);
        }
        setError(null);
      } catch {
        setError(t("workoutSaveError"));
      }
    };
    const baseline = store.sets(cursor.entryId).find((s) => s.id === d.setId);
    const check = validateSet(
      cursor.field === "weight" ? value : cursor.side ? d.rightWeight ?? "" : d.weight,
      cursor.field === "reps" ? value : cursor.side ? d.rightReps ?? "" : d.reps,
      store.unit(cursor.entryId),
      baseline ? Number(baseline.data.weight_kg) : undefined,
    );
    if (d.setId && value !== d[cursor.side ? cursor.field === "weight" ? "rightWeight" : "rightReps" : cursor.field] && check.warning)
      Alert.alert(t("checkSet"), t(check.warning), [
        {
          text: t("cancel"),
          style: "cancel",
        },
        {
          text: t("saveSet"),
          onPress: commit,
        },
      ]);
    else commit();
  }
  function mark(entry: Row, index: number) {
    const d = store.drafts(entry.id)[index];
    const effective = {
      ...d,
      weight: d.weight || weightHint(entry, index),
    };
    const check = validateSet(
      effective.weight,
      effective.reps,
      store.unit(entry.id),
      store.previous(entry)[index]
        ? Number(store.previous(entry)[index].data.weight_kg)
        : undefined,
    );
    if (!d.setId && !check.valid) {
      setError(t("invalidSet"));
      return;
    }
    const save = () =>
      run(() => {
        if (!d.setId && !d.weight)
          store.editDraft(entry.id, index, {
            weight: effective.weight,
          });
        if (store.toggleDone(entry.id, index)) {
          tick(store.repo);
          // Rest starts as the bar pinned at the bottom unless the person asked for the full-screen timer.
          if (restOpens(store.repo) === "bar" && store.timer() && !store.timer()!.minimized) store.updateTimer({ minimized: true });
          if (store.supersetGroup(entry)) {
            const next = store.nextSet(session.id);
            if (next) edit(next.entryId,next.index,'weight');
            else setCursor(null);
          }
        }
      });
    if (!d.setId && check.warning)
      Alert.alert(t("checkSet"), t(check.warning), [
        {
          text: t("cancel"),
          style: "cancel",
        },
        {
          text: t("saveSet"),
          onPress: save,
        },
      ]);
    else save();
  }
  const confirmRemoveSet = (entryId: string, index: number) =>
    Alert.alert(t('removeSet'), undefined, [
      {text:t('cancel'), style:'cancel'},
      {text:t('remove'), style:'destructive', onPress:() => run(() => store.removeSet(entryId,index))},
    ]);
  const current = cursor
    ? entries.find((e) => e.id === cursor.entryId)
    : undefined;
  function repsHint(entry: Row, index: number) {
    return String(store.repRange(entry) ? store.suggestion(entry).target ?? "" : store.repo.localGet<number>(`target:${entry.id}`) ?? store.previous(entry).find((s) => Number(s.data.position) === index)?.data.reps ?? "");
  }
  const upcoming = past ? undefined : store.nextSet(session.id),
    upcomingEntry = upcoming ? entries.find((e) => e.id === upcoming.entryId) : undefined;
  function upcomingDetail(entry: Row, index: number) {
    const ds = store.drafts(entry.id), d = ds[index], left = ds.filter((draft) => !draft.setId).length;
    const weight = d.weight || weightHint(entry, index), reps = d.reps || repsHint(entry, index);
    if (weight && reps) return t("upNextDetail").replace("{sets}", String(left)).replace("{reps}", reps).replace("{weight}", weight).replace("{unit}", store.unit(entry.id));
    return reps ? `${left} × ${reps}` : pluralize(left, "set");
  }
  const swap = (entryId: string, mode: "swap" | "replace") => {
    if (!past) store.updateTimer({ minimized: true });
    setReplacement({ entryId, mode });
    setPicker(true);
  };
  // The header stays above the sets at normal sizes. At accessibility sizes it would fill most of the screen, so it
  // scrolls away with the sets instead.
  const finishButton = (
    <Pill
      compact
      testID="finish-button"
      label={t("finish")}
      onPress={() => {
        if (!past) store.updateTimer({
          minimized: true,
        });
        setFinish(true);
      }}
    />
  );
  const header = (
      <View
        testID="logger-header"
        style={[
          layout.content,
          {
            paddingTop: 0,
            paddingBottom: 0,
            flexShrink: 0,
            gap: 8,
          },
        ]}
      >
        <View style={[layout.row, { gap: 4 }, stacked && { flexWrap: "wrap", justifyContent: "space-between" }]}>
          <IconButton
            name="down"
            label={t("closeWorkout")}
            onPress={closeWorkout}
          />
          {stacked && finishButton}
          {/* At accessibility sizes the name gets its own line under the buttons, so it is never squeezed. */}
          <View style={stacked ? { flexBasis: "100%", flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 8 } : { flex: 1, flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <ThemedText variant="title" numberOfLines={stacked ? undefined : 1} style={{ fontWeight: "600", flexShrink: 1 }}>
              {String(session.data.name ?? t("workoutName"))}
            </ThemedText>
            <ThemedText muted numeric style={{ fontSize: 15 }}>
              {past ? String(session.data.day) : clock((now - Number(session.data.started_at)) / 1000)}
            </ThemedText>
          </View>
          {!stacked && finishButton}
        </View>
        <View style={[layout.row, { justifyContent: "space-between", flexWrap: "wrap", gap: 6 }]}>
          <View style={[layout.row, { gap: 6 }]}>
            {session.data.origin === "template" && <Eyebrow>{t("template")}</Eyebrow>}
            {total > 0 && (
              <ThemedText muted variant="caption">
                {session.data.origin === "template" ? "· " : ""}{t("set")} {Math.min(done + 1, total)} {t("of")} {total}
              </ThemedText>
            )}
          </View>
          <SyncBadge
            local={["demo", "guest"].includes(store.repo.owner)}
            pending={pending}
            status={
              __DEV__ &&
              store.repo.owner === "demo" &&
              store.repo.localGet("loggerFixtureOffline")
                ? "offline"
                : status
            }
          />
        </View>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: total > 0 ? (done / total) * 100 : 0,
          }}
          style={{
            height: 4,
            borderRadius: 4,
            backgroundColor: colors["surface-2"],
          }}
        >
          <View
            style={{
              height: 4,
              borderRadius: 4,
              backgroundColor: colors.accent,
              width: `${total ? (done / total) * 100 : 0}%`,
            }}
          />
        </View>
        {error && (
          <ThemedText accessibilityRole="alert" variant="caption">
            {error}
          </ThemedText>
        )}
      </View>
  );
  return (
    <SafeAreaView
      testID="logger-safe-area"
      edges={["left", "right", "bottom"]}
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        // A full-screen presentation can initially report a zero top inset.
        paddingTop: insets.top || initialWindowMetrics?.insets.top || 0,
      }}
    >
      {!stacked && header}
      <ScrollView
        testID="logger-exercises"
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={[layout.content, { paddingTop: 12 }]}
      >
        {stacked && <View style={{ marginHorizontal: -layout.content.padding }}>{header}</View>}
        {upcoming && upcomingEntry && (
          <UpNext
            name={String(upcomingEntry.data.exercise)}
            detail={upcomingDetail(upcomingEntry, upcoming.index)}
            onPress={() => edit(upcomingEntry.id, upcoming.index, "weight")}
            onSkip={store.sets(upcomingEntry.id).length > 0 ? undefined : () => run(() => store.skipExercise(upcomingEntry.id))}
            onSwap={() => swap(upcomingEntry.id, "swap")}
          />
        )}
        {entries.map((e, exerciseIndex) => {
          const ds = store.drafts(e.id),
            complete = ds.length > 0 && ds.every((d) => d.setId),
            completed = ds.filter((d) => d.setId).length,
            firstPending = entries.findIndex((entry) =>
              store.drafts(entry.id).some((d) => !d.setId),
            ),
            compact =
              complete ||
              (completed > 0 &&
                exerciseIndex < firstPending + 1 &&
                entries
                  .slice(exerciseIndex + 1)
                  .some((entry) =>
                    store.drafts(entry.id).some((d) => d.setId),
                  )),
            collapsed = compact && !open.includes(e.id),
            previous = store.previous(e),
            name = String(e.data.exercise),
            equipment = store.preferences().exercise(name).equipment,
            setupNote = store.preferences().machine(name).text,
            pendingIndex = Math.max(0, ds.findIndex((d) => !d.setId));
          return (
            <Panel key={e.id} testID={`logger-card-${exerciseIndex}`} style={{borderRadius: 18, ...(collapsed ? {paddingVertical:8} : {}), ...(store.skipped(e.id) ? {opacity:0.45} : {})}}>
              <View style={layout.row}>
                {compact && (
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 99,
                      backgroundColor: colors.accent,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Line name="check" size={18} color={colors["on-accent"]} />
                  </View>
                )}
                <Pressable
                  disabled={!compact}
                  accessible={false}
                  importantForAccessibility="no"
                  accessibilityLabel={
                    compact
                      ? t(collapsed ? "expandExercise" : "collapseExercise")
                      : undefined
                  }
                  onPress={() =>
                    setOpen((ids) =>
                      ids.includes(e.id)
                        ? ids.filter((id) => id !== e.id)
                        : [...ids, e.id],
                    )
                  }
                  style={{ flex: 1, minHeight: compact ? 44 : undefined, justifyContent: "center" }}
                >
                  <ThemedText
                    variant="headline"
                    style={{
                      fontSize: collapsed ? 17 : tokens.logger.exercise,
                      fontWeight: "600",
                    }}
                  >
                    {String(e.data.exercise)}
                  </ThemedText>
                  <ThemedText muted style={{ fontSize: 13, lineHeight: 16 }}>
                    {collapsed
                      ? `${pluralize(completed, "set")} · ${Math.round(store.sets(e.id).reduce((sum, set) => sum + displayWeight(Number(set.data.weight_kg), store.unit(e.id)) * Number(set.data.reps), 0)).toLocaleString()} ${store.unit(e.id)}${complete ? "" : ` · ${pluralize(ds.length - completed, "left")}`}`
                      : `${exerciseIndex > firstPending && !completed ? t("upNext") : equipmentLabel(store.preferences().exercise(String(e.data.exercise)).equipment)} · ${pluralize(ds.length, "set")}`}
                  </ThemedText>
                </Pressable>
                {!collapsed && !store.skipped(e.id) && equipment === "barbell" && ds.length > 0 && (
                  <Chip
                    label={t("plates")}
                    accessibilityLabel={`${name}, ${t("plates")}`}
                    onPress={() => edit(e.id, pendingIndex, "weight")}
                  />
                )}
                {compact && (
                  <IconButton
                    name="down"
                    label={t(collapsed ? "expandExercise" : "collapseExercise")}
                    expanded={!collapsed}
                    onPress={() =>
                      setOpen((ids) =>
                        ids.includes(e.id)
                          ? ids.filter((id) => id !== e.id)
                          : [...ids, e.id],
                      )
                    }
                  />
                )}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${e.data.exercise}, ${t("exerciseOptions")}`}
                  accessibilityState={{ expanded: options === e.id }}
                  onPress={() => setOptions(options === e.id ? null : e.id)}
                  style={layout.cell}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 99, alignItems: "center", justifyContent: "center", backgroundColor: colors["surface-2"] }}>
                    <Line name="more" size={20} color={colors["text-muted"]} />
                  </View>
                </Pressable>
              </View>
                {store.skipped(e.id) && <ThemedText>{t('skippedExercise')}</ThemedText>}
              {options === e.id && <View style={layout.stack}>
                <Button label={t('cancel')} variant="secondary" onPress={() => setOptions(null)} />
                <Button label={t(store.skipped(e.id) ? 'resumeExercise' : 'skipExercise')} disabled={!store.skipped(e.id) && store.sets(e.id).length > 0} variant="secondary" onPress={() => run(() => store.skipExercise(e.id, !store.skipped(e.id)))} />
                {(['swap','replace'] as const).map(mode => <Button key={mode} label={t(mode === 'swap' ? 'swapExercise' : 'replaceExercise')} variant="secondary" onPress={() => swap(e.id, mode)} />)}
                <Button label={t(store.isUnilateral(e.id) ? 'bilateral' : 'unilateral')} disabled={store.sets(e.id).length > 0} variant="secondary" onPress={() => run(() => store.setUnilateral(e.id, !store.isUnilateral(e.id)))} />
                <SupersetControls currentId={e.id} items={entries.filter(entry => !store.skipped(entry.id)).map(entry => ({id:entry.id,name:String(entry.data.exercise),group:store.supersetGroup(entry)}))} onLink={ids => run(() => store.linkSuperset(ids))} onUnlink={() => run(() => store.unlinkSuperset(e.id))} />
                {!past && <RestOptions value={store.rest(String(e.data.exercise))} onChange={value => run(() => store.setRest(String(e.data.exercise), value))} />}
                <Button label={t('addSet')} variant="secondary" onPress={() => run(() => store.addSet(e.id))} />
                <Button label={t('moveUp')} variant="secondary" onPress={() => run(() => store.moveEntry(e.id, -1))} />
                <Button label={t('moveDown')} variant="secondary" onPress={() => run(() => store.moveEntry(e.id, 1))} />
                <Button label={t('removeExercise')} variant="secondary" onPress={() => Alert.alert(t('removeExercise'), t('removeExerciseBody'), [{text:t('cancel'),style:'cancel'}, {text:t('remove'),style:'destructive',onPress:() => run(() => store.removeExercise(e.id))}])} />
              </View>}
              {store.supersetGroup(e) && <ThemedText>{t('supersetMembers').replace('{names}', entries.filter(entry => !store.skipped(entry.id) && store.supersetGroup(entry) === store.supersetGroup(e)).map(entry => String(entry.data.exercise)).join(', '))}</ThemedText>}
              {!collapsed && !store.skipped(e.id) && (
                <>
                  {!!setupNote && <ThemedText muted variant="caption">{setupNote}</ThemedText>}
                  {/* At the largest text sizes the set rows stack and label their own boxes, so the column heads go. */}
                  {!stacked && <View testID={`logger-columns-${exerciseIndex}`} style={layout.row}>
                    <ThemedText
                      muted
                      variant="caption"
                      style={{ minWidth: 26, textAlign: "center", fontSize: tokens.type.caption, fontWeight: "600" }}
                    >
                      {t("setHeader")}
                    </ThemedText>
                    <ThemedText
                      muted
                      variant="caption"
                      style={{ flex: 1, fontSize: tokens.type.caption, fontWeight: "600" }}
                    >
                      {t("previous")}
                    </ThemedText>
                    <ThemedText
                      muted
                      variant="caption"
                      style={{ flex: 1, fontSize: tokens.type.caption, fontWeight: "600" }}
                    >
                      {store.unit(e.id)}
                    </ThemedText>
                    <ThemedText
                      muted
                      variant="caption"
                      style={{ flex: 1, fontSize: tokens.type.caption, fontWeight: "600" }}
                    >
                      {t("repsHeader")}
                    </ThemedText>
                    <View style={{ width: 40 }} />
                  </View>}
                  <View>
                    {ds.map((d, i) => (
                      <Fragment key={i}>
                        <SetRow
                          key={d.setId ?? i}
                          exerciseIndex={exerciseIndex}
                          exercise={String(e.data.exercise)}
                          index={i}
                          side={store.isUnilateral(e.id) ? 'left' : undefined}
                          unit={store.unit(e.id)}
                          onTag={tag => run(() => store.editDraft(e.id, i, {tag}))}
                          draft={d}
                          previous={
                            previous.find((s) => Number(s.data.position) === i)
                              ? `${displayWeight(Number(previous.find((s) => Number(s.data.position) === i)!.data.weight_kg), store.unit(e.id))} × ${previous.find((s) => Number(s.data.position) === i)!.data.reps}`
                              : ""
                          }
                          hint={weightHint(e, i)}
                          repsHint={repsHint(e, i)}
                          onEdit={(field) => edit(e.id, i, field)}
                          onDone={() => mark(e, i)}
                          onRemove={() => confirmRemoveSet(e.id,i)}
                        />
                        {store.isUnilateral(e.id) && <SetRow exerciseIndex={exerciseIndex} exercise={String(e.data.exercise)} index={i} side="right" unit={store.unit(e.id)} draft={{...d, weight:d.rightWeight ?? '', reps:d.rightReps ?? ''}} previous="" hint="" onEdit={field => edit(e.id, i, field, 'right')} onDone={() => mark(e,i)} onRemove={() => confirmRemoveSet(e.id,i)} />}
                        {i ===
                          Math.max(
                            0,
                            ds.findIndex((draft) => !draft.setId),
                          ) && <JumpCard store={store} entry={e} />}
                      </Fragment>
                    ))}
                  </View>
                  <View style={[layout.row, { flexWrap: "wrap" }]}>
                    <Chip
                      testID={`add-set-${exerciseIndex}`}
                      label={`+ ${t("addSet")}`}
                      accessibilityLabel={`${name}, ${t("addSet")}`}
                      onPress={() => run(() => store.addSet(e.id))}
                    />
                    <MachineSetup compact store={store} name={name} equipment={equipment} />
                  </View>
                </>
              )}
            </Panel>
          );
        })}
        {!entries.length && <ThemedText muted>{t("emptyWorkout")}</ThemedText>}
        <Button
          label={t("addExercise")}
          variant="secondary"
          onPress={() => {
            if (!past) store.updateTimer({
              minimized: true,
            });
            setReplacement(null);
            setPicker(true);
          }}
        />
      </ScrollView>
      {!past && <RestTimer
        store={store}
        presentation="mini"
        hidden={!focused || !!cursor || finish || picker}
      />}
      <SheetHost
        visible={
          focused && (picker ||
          !!cursor ||
          finish ||
          (!past && !!store.timer() && !store.timer()!.minimized))
        }
        onClose={() => {
          if (picker) setPicker(false);
          else if (cursor) setCursor(null);
          else if (finish) setFinish(false);
          else if (!past) store.updateTimer({ minimized: true });
        }}
      >
        {!past && <RestTimer
          store={store}
          presentation="sheet"
          hidden={!focused || !!cursor || finish || picker}
        />}
        {picker && (
          <ExercisePicker
            store={store}
            label={replacement ? t(replacement.mode === 'swap' ? 'swapExercise' : 'replaceExercise') : t('addExercise')}
            onClose={() => setPicker(false)}
            onPick={(name) =>
              run(() => {
                if (replacement) store.replaceExercise(replacement.entryId, name, replacement.mode);
                else store.addExercise(session.id, name);
                setReplacement(null);
                setOptions(null);
                setPicker(false);
              })
            }
          />
        )}
        {cursor && current && (
          <Keypad
            inputId={`${cursor.entryId}:${cursor.index}:${cursor.side ? "right:" : ""}${cursor.field}`}
            label={`${current.data.exercise} · ${t("set")} ${cursor.index + 1} · ${cursor.side ? `${t("rightSide")} · ` : store.isUnilateral(cursor.entryId) ? `${t("leftSide")} · ` : ""}${t(cursor.field)}`}
            field={cursor.field}
            unit={store.unit(current.id)}
            setupStep={store.preferences().increment(String(current.data.exercise), store.unit(current.id))}
            barWeight={store.preferences().machine(String(current.data.exercise)).bar_weight}
            plateSet={store.preferences().plateSet(store.unit(current.id))}
            equipment={store.preferences().exercise(String(current.data.exercise)).equipment}
            value={value}
            previous={
              store.previous(current)[cursor.index]
                ? `${displayWeight(Number(store.previous(current)[cursor.index].data.weight_kg), store.unit(current.id))} × ${store.previous(current)[cursor.index].data.reps}`
                : ""
            }
            onChange={input}
            onNext={next}
            onClose={() => setCursor(null)}
          />
        )}
        {finish && (
          <FinishSheet
            store={store}
            session={session}
            onClose={() => setFinish(false)}
          />
        )}
      </SheetHost>
    </SafeAreaView>
  );
}
function JumpCard({ store, entry }: { store: WorkoutStore; entry: Row }) {
  const fixture =
    __DEV__ && store.repo.owner === "demo"
      ? store.repo.localGet<{
          entryId: string;
          weight: number;
          target: number;
          previous: number;
          count: number;
          jump: boolean;
        }>("loggerFixtureHint")
      : null;
  const fixtureHint = fixture?.entryId === entry.id ? fixture : null;
  const [visible, setVisible] = useState(
    () => !!fixtureHint || store.showCard(entry),
  );
  const { colors } = useTheme();
  const entryId = entry.id;
  useEffect(() => {
    if (visible) {
      const current = store.repo.get("entries", entryId);
      if (current && store.showCard(current)) store.markCard(current);
    }
  }, [store, entryId, visible]);
  const sg = fixtureHint ?? store.suggestion(entry);
  if (!visible || !sg.jump) return null;
  const lead = t("jumpLead")
    .replace("{weight}", String(sg.weight))
    .replace("{unit}", store.unit(entry.id));
  const explanation = t("jumpExplanation")
    .replace("Try {weight} {unit}. ", "")
    .replace("{reps}", pluralize(sg.target ?? 0, "rep"))
    .replace("{previous}", String(sg.previous))
    .replace("{workingSets}", workingSetsPhrase(sg.count));
  return (
    <Pressable
      testID="suggestion-card"
      accessibilityLabel={`${lead} ${explanation}`}
      accessibilityRole="button"
      accessibilityHint={t("dismissSuggestion")}
      onLongPress={() => setVisible(false)}
      accessibilityActions={[
        { name: "dismiss", label: t("dismissSuggestion") },
      ]}
      onAccessibilityAction={() => setVisible(false)}
      style={{
        backgroundColor: colors["accent-tint"],
        padding: 12,
        borderRadius: 9,
        minHeight: 44,
        marginVertical: 2,
      }}
    >
      <View style={[layout.row, { alignItems: "flex-start" }]}>
        <Line name="trend" size={16} color={colors.accent} />
        <ThemedText style={{ flex: 1, fontSize: 14, lineHeight: 18 }}>
          <ThemedText style={{ fontWeight: "700", fontSize: 14 }}>
            {lead}
          </ThemedText>{" "}
          {explanation}
        </ThemedText>
      </View>
    </Pressable>
  );
}
