import { WorkoutAiCard } from "./ai/card";
import { useEffect, useMemo } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Svg, {
  Circle,
  Ellipse,
  G,
  LinearGradient,
  Defs,
  RadialGradient,
  Stop,
  Path,
} from "react-native-svg";
import { Screen } from "@/components/screen";
import { Card } from "@/components/card";
import { ThemedText } from "@/components/themed-text";
import { tokens } from "@/design/tokens";
import { useTheme } from "@/design/theme-provider";
import { displayWeight, fromKg } from "@/core/workout/rules";
import type { WorkoutStore } from "@/data/workout/store";
import { atlasGeometry, type Side } from "@/features/atlas/geometry";
import { muscleByKey } from "@/features/atlas/muscles";
import { atlasSessions } from "@/features/atlas/read-logs";
import { muscleLabel, pluralize, t } from "@/i18n/en";
import { useWorkout, useWorkoutStore } from "./use-workout";
import { Eyebrow, Pill, Line, Panel, clock, layout } from "./primitives";
import {
  PageBar,
  Primary,
  Print,
  Round,
  Secondary,
  SectionTitle,
  card,
  leave,
  semibold,
  sessionPrint,
} from "./parts";
import { signatureBuzz } from "./haptics";
/** Static synthetic artwork; no workout values enter the contour thumbnail. */
export function ContourThumbnail() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 112,
        height: 84,
        borderRadius: 14,
        backgroundColor: colors.surface,
        padding: 10,
      }}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 70">
        {[1, 0.86, 0.71, 0.56, 0.39].map((scale, i) => (
          <Path
            key={scale}
            d="M5 31C5 9 27 7 42 7S62 0 75 16S99 30 96 46S77 60 65 58S54 76 39 66S4 56 5 31Z"
            transform={`translate(${50 * (1 - scale)} ${35 * (1 - scale)}) scale(${scale})`}
            fill="none"
            stroke={colors.accent}
            opacity={0.35 + i * 0.13}
            strokeWidth={1.4}
          />
        ))}
      </Svg>
    </View>
  );
}
export function SummitToken({
  fresh = false,
  size = 48,
  muted = false,
}: {
  fresh?: boolean;
  size?: number;
  muted?: boolean;
}) {
  const { colors, palette } = useTheme();
  const light = tokens.palettes[palette].light;
  const highlight = muted ? colors["token-muted-highlight"] : tokens.palettes[palette].dark.accent;
  const face = muted ? colors["token-muted"] : colors.accent;
  const rim = muted ? colors["token-muted"] : light.accent;
  return (
    <View
      testID={fresh ? "summit-token-new" : muted ? "summit-token-muted" : undefined}
      style={{ width: size, height: size }}
    >
      <Svg accessible={false} width={size} height={size} viewBox="0 0 80 80">
        <Defs>
          <RadialGradient id="token" cx="32%" cy="20%" r="85%">
            <Stop offset="0" stopColor={muted ? highlight : light.surface} />
            <Stop offset="12%" stopColor={highlight} />
            <Stop offset="45%" stopColor={face} />
            <Stop offset="100%" stopColor={face} stopOpacity={0.75} />
          </RadialGradient>
          <LinearGradient id="rim" x1="0" y1="0" x2="0.7" y2="1">
            <Stop offset="0" stopColor={highlight} />
            <Stop offset="100%" stopColor={rim} />
          </LinearGradient>
          <RadialGradient id="shadow">
            <Stop offset="0" stopColor={light.text} stopOpacity={0.32} />
            <Stop offset="100%" stopColor={light.text} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={40} cy={71} rx={25} ry={5} fill="url(#shadow)" />
        <Circle
          cx={40}
          cy={40}
          r={39}
          fill={face}
          opacity={fresh || size >= 80 ? 0.2 : 0.08}
        />
        <Circle cx={40} cy={41.5} r={30} fill="url(#rim)" />
        <Circle
          cx={40}
          cy={40}
          r={30}
          fill="url(#token)"
          opacity={fresh || size >= 80 ? 1 : 0.45}
        />
        <Circle
          cx={40}
          cy={40}
          r={25}
          fill="none"
          stroke={highlight}
          strokeWidth={0.8}
        />
        <Circle
          cx={40}
          cy={40}
          r={18}
          fill="none"
          stroke={colors["on-accent"]}
          opacity={0.25}
        />
        <Ellipse cx={31} cy={24} rx={10} ry={4} fill={light.surface} opacity={0.22} transform="rotate(-35 31 24)" />
        <Path
          d="M25 47L40 24L55 47ZM40 24C15 38 28 69 48 54S51 27 40 24Z"
          fill="none"
          stroke={colors["on-accent"]}
          opacity={0.45}
          strokeWidth={1}
        />
      </Svg>
      {fresh && (
        <View
          style={{
            position: "absolute",
            right: -2,
            top: -2,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Svg width={12} height={12} viewBox="0 0 12 12">
            <Path
              d="M6 1V11M1 6H11"
              stroke={colors["on-accent"]}
              strokeWidth={1.4}
            />
          </Svg>
        </View>
      )}
    </View>
  );
}
export function summaryDate(start: number, end: number) {
  const first = new Date(start),
    last = new Date(end);
  const date = first.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const samePeriod = first.getHours() < 12 === last.getHours() < 12;
  return `${date} · ${samePeriod ? time(first).replace(/ [AP]M$/, "") : time(first)} ${t("to")} ${time(last)}`;
}
export function Summary() {
  const { store } = useWorkout(),
    { id } = useLocalSearchParams<{
      id: string;
    }>();
  return store && id && store.repo.get("sessions", id) ? (
    <WorkoutSummary store={store} id={id} />
  ) : (
    <Screen topInset>
      <PageBar
        title={t("summaryTitle")}
        left={<Round glyph="back" label={t("flowBack")} onPress={leave} />}
      />
      <Card testID="summary-missing" style={card}>
        <ThemedText style={semibold}>
          {t(store ? "summaryMissing" : "localError")}
        </ThemedText>
        {store && <ThemedText muted>{t("summaryMissingBody")}</ThemedText>}
      </Card>
      <View style={{ flex: 1 }} />
      <Primary
        testID="summary-done"
        label={t("flowWorkouts")}
        onPress={() => router.replace("/workouts")}
      />
    </Screen>
  );
}
/** What one finished workout trained, read from the same logs the body atlas uses. Full sets go to an
 * exercise's main muscle; helper muscles are named but not counted. */
export function sessionMuscles(store: WorkoutStore, id: string) {
  const finished = store
    .history()
    .filter(
      (s) =>
        typeof s.data.finished_at === "number" &&
        Number.isFinite(s.data.finished_at),
    );
  const index = finished.findIndex((s) => s.id === id);
  const exercises = index < 0 ? [] : (atlasSessions(store)[index]?.exercises ?? []);
  const main = new Map<string, number>(),
    helpers = new Set<string>();
  for (const exercise of exercises) {
    if (!(exercise.sets > 0)) continue;
    if (exercise.main)
      main.set(exercise.main, (main.get(exercise.main) ?? 0) + exercise.sets);
    for (const helper of exercise.helpers) helpers.add(helper);
  }
  for (const group of main.keys()) helpers.delete(group);
  return {
    main: [...main].map(([group, sets]) => ({ group, sets })).sort((a, b) => b.sets - a.sets),
    helpers: [...helpers],
  };
}
export function WorkoutSummary({
  store: source,
  id,
}: {
  store: WorkoutStore;
  id: string;
}) {
  const store = useWorkoutStore(source.repo);
  const { colors } = useTheme();
  const repo = store.repo;
  const data = store.summary(id),
    s = data.session;
  useEffect(() => {
    if (!data.prs.length || repo.localGet(`buzz:${id}`))
      return;
    repo.localSave(`buzz:${id}`, true);
    if (repo.localGet<boolean>("haptics") !== false) return signatureBuzz(repo);
  }, [repo, id, data.prs.length]);
  const close = () =>
    router.canDismiss() ? router.dismissAll() : router.replace("/");
  const milestones = store.milestones(),
    shown = [
      ...milestones
        .filter((token) => token.sessionId !== id)
        .slice(0, 4)
        .reverse(),
      ...milestones.filter((token) => token.sessionId === id),
    ];
  const print = useMemo(() => sessionPrint(store, id), [store, id]);
  const muscles = useMemo(() => sessionMuscles(store, id), [store, id]);
  const entries = store.entries(id).filter((e) => !store.skipped(e.id));
  const stats = [
    [clock(Number(s.data.duration_ms) / 1000), t("time")],
    [
      Math.round(data.volume).toLocaleString(),
      `${t("volume")}, ${store.unit()}`,
    ],
    [String(data.count), t("setsLabel")],
    // A count of records only when there is one: a zero here would read as a result.
    ...(data.prs.length ? [[String(data.prs.length), t("prs")]] : []),
  ];
  return (
    <Screen topInset>
      <View style={[layout.row, { minHeight: 44 }]}>
        <Round glyph="close" label={t("close")} onPress={close} />
        <ThemedText muted style={{ flex: 1, textAlign: "center", fontSize: 15 }}>
          {t("savedHistory")}
        </ThemedText>
        <View style={{ width: 44 }} />
      </View>
      <View style={{ alignItems: "center", gap: 4 }}>
        <Eyebrow center>{t("workoutComplete")}</Eyebrow>
        <ThemedText
          variant="title"
          accessibilityRole="header"
          style={{ fontSize: 28, lineHeight: 34, fontWeight: "600", textAlign: "center" }}
        >
          {String(s.data.name ?? t("workoutName"))}
        </ThemedText>
        <ThemedText muted style={{ fontSize: 15, textAlign: "center" }}>
          {summaryDate(Number(s.data.started_at), Number(s.data.finished_at))}
        </ThemedText>
        {store.edited(id) && (
          <View
            style={{
              borderRadius: 99,
              paddingHorizontal: 10,
              paddingVertical: 3,
              backgroundColor: colors["surface-2"],
            }}
          >
            <ThemedText muted variant="caption" accessibilityLabel={t("editedWorkout")}>
              {t("edited")}
            </ThemedText>
          </View>
        )}
      </View>
      <Panel testID="summary-stats" style={{ paddingVertical: 14 }}>
        <View style={[layout.row, { alignItems: "flex-start" }]}>
          {stats.map(([value, label], i) => (
            <View
              key={label}
              accessible
              accessibilityLabel={`${label}: ${value}`}
              style={{
                flex: 1,
                alignItems: "center",
                gap: 3,
                borderLeftWidth: i ? 1 : 0,
                borderColor: colors["surface-2"],
              }}
            >
              <ThemedText numeric style={{ fontSize: 21 }}>
                {value}
              </ThemedText>
              <ThemedText
                muted
                style={{
                  fontSize: tokens.type.caption,
                  fontWeight: "600",
                  textAlign: "center",
                }}
              >
                {label}
              </ThemedText>
            </View>
          ))}
        </View>
      </Panel>
      {print.data.names.length > 0 && (
        <>
          <SectionTitle>{t("summaryPrint")}</SectionTitle>
          <Card testID="summary-print" style={[card, { gap: tokens.spacing[1] }]}>
            <View style={{ width: "100%", aspectRatio: 2 }}>
              <Print data={print.data} width={300} height={150} />
            </View>
            <ThemedText muted variant="caption">
              {t("printCaption")}
            </ThemedText>
          </Card>
        </>
      )}
      {muscles.main.length + muscles.helpers.length > 0 && (
        <>
          <SectionTitle>{t("summaryMuscles")}</SectionTitle>
          <MusclesCard main={muscles.main} helpers={muscles.helpers} />
        </>
      )}
      {data.prs.length > 0 && <SectionTitle>{t("summaryRecords")}</SectionTitle>}
      {data.prs.map((pr) => (
        <Panel testID="summary-pr" key={pr.exercise}>
          <View style={[layout.row, { gap: 10 }]}>
            <SummitToken size={88} />
            <View style={{ flex: 1, gap: 8 }}>
              <View
                style={[
                  layout.row,
                  {
                    alignSelf: "flex-start",
                    backgroundColor: colors.accent,
                    borderRadius: 99,
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                  },
                ]}
              >
                <Line name="summit" size={14} color={colors["on-accent"]} />
                <ThemedText
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: colors["on-accent"],
                  }}
                >
                  {t("newPR")}
                </ThemedText>
              </View>
              <ThemedText style={{ fontSize: 19, fontWeight: "600" }}>
                {pr.exercise} {displayWeight(pr.displayWeight, pr.unit)} ×{" "}
                {pr.bestReps}
              </ThemedText>
              <ThemedText muted style={{ fontSize: 13, lineHeight: 17 }}>
                {t("est1RM")}{" "}
                <ThemedText style={{ fontSize: 13, fontWeight: "600" }}>
                  ≈ {Math.round(fromKg(pr.bestE1rm, pr.unit))}{" "}
                  {pr.unit}
                </ThemedText>
                {pr.previousE1rm > 0
                  ? `, ${t("previousBest")
                      .replace(
                        "{weight}",
                        String(
                          Math.round(
                            fromKg(pr.bestE1rm - pr.previousE1rm, pr.unit),
                          ),
                        ),
                      )
                      .replace("{unit}", pr.unit)}`
                  : ""}
              </ThemedText>
            </View>
          </View>
        </Panel>
      ))}
      <WorkoutAiCard store={store} id={id} />
      {milestones.length > 0 && (
      <Panel testID="summary-shelf">
        <View style={[layout.row, { justifyContent: "space-between" }]}>
          <ThemedText style={{ fontSize: 16, fontWeight: "600" }}>
            {t("milestonesShelf")}
          </ThemedText>
          <ThemedText muted style={{ fontSize: 13 }}>
            {pluralize(milestones.length, "token")} ›
          </ThemedText>
        </View>
        <View
          style={[
            layout.row,
            { justifyContent: "space-between", paddingVertical: 4 },
          ]}
        >
          {shown.map((token) => (
            <View
              key={`${token.sessionId}:${token.exercise}`}
              accessible
              accessibilityLabel={`${token.exercise}, ${t("summitToken")}`}
            >
              <SummitToken
                size={token.sessionId === id ? 62 : 46}
                fresh={token.sessionId === id}
                muted={token.sessionId !== id}
              />
            </View>
          ))}
          <View
            style={{
              width: 40,
              height: 52,
              borderRadius: 28,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: colors["text-muted"],
              opacity: 0.25,
            }}
          />
        </View>
        <View
          style={{
            height: 6,
            borderRadius: 99,
            backgroundColor: colors["surface-2"],
          }}
        />
        {data.prs.length > 0 && (
          <ThemedText muted style={{ fontSize: 13 }}>
            {t("added")}:{" "}
            <ThemedText style={{ fontSize: 13 }}>
              {data.prs
                .map(
                  (pr) =>
                    `${pr.exercise} ${t("summit")}, ${displayWeight(pr.displayWeight, pr.unit)} × ${pr.bestReps}`,
                )
                .join(", ")}
            </ThemedText>
          </ThemedText>
        )}
      </Panel>
      )}
      <SectionTitle>{t("summaryExercises")}</SectionTitle>
      {entries.length === 0 ? (
        <Card testID="summary-no-exercises" style={card}>
          <ThemedText muted>{t("summaryNoExercises")}</ThemedText>
        </Card>
      ) : (
        <Card testID="summary-exercises" style={[card, { gap: 0, paddingVertical: tokens.spacing[0] }]}>
          {entries.map((e, index) => {
            const sets = store.sets(e.id), unit = store.unit(e.id);
            return (
              <View
                key={e.id}
                style={{
                  paddingVertical: tokens.spacing[2],
                  gap: 2,
                  borderTopWidth: index ? 1 : 0,
                  borderTopColor: colors["surface-2"],
                }}
              >
                <View style={[layout.row, { alignItems: "baseline" }]}>
                  <ThemedText style={{ flex: 1, fontWeight: "600" }}>
                    {String(e.data.exercise)}
                  </ThemedText>
                  <ThemedText muted numeric variant="caption">
                    {sets.length ? `${pluralize(sets.length, "set")} · ${unit}` : t("summaryNoSets")}
                  </ThemedText>
                </View>
                {sets.length > 0 && (
                  <ThemedText muted numeric style={{ fontSize: 15, lineHeight: 21 }}>
                    {sets
                      .map((set) => {
                        const weight = displayWeight(Number(set.data.weight_kg), unit);
                        // A set with no load is its reps alone, not "0 ×".
                        return weight > 0
                          ? `${weight} × ${String(set.data.reps)}`
                          : t("summaryReps").replace("{reps}", String(set.data.reps));
                      })
                      .join("   ")}
                  </ThemedText>
                )}
              </View>
            );
          })}
        </Card>
      )}
      {!!s.data.notes && (
        <>
          <SectionTitle>{t("notes")}</SectionTitle>
          <Card style={card}>
            <ThemedText>{String(s.data.notes)}</ThemedText>
          </Card>
        </>
      )}
      <View style={{ flex: 1 }} />
      <View style={[layout.row, { gap: tokens.spacing[1], marginTop: tokens.spacing[1] }]}>
        <View style={{ flex: 1 }}>
          <Secondary
            label={t("editWorkout")}
            onPress={() => {
              store.beginEditing(id);
              router.push({ pathname: "/workout", params: { id } });
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Secondary
            testID="summary-view-day"
            label={t("summaryViewDay")}
            onPress={() =>
              router.push({
                pathname: "/workout/day",
                params: { day: String(s.data.day) },
              })
            }
          />
        </View>
      </View>
      <Pill testID="summary-done" label={t("done")} onPress={close} />
    </Screen>
  );
}
const SIDES: readonly Side[] = ["front", "back"];
/** The muscles one workout trained: a small front and back figure, then each main muscle with its sets.
 * The figure is a picture of the list beside it, so screen readers get the list only. */
function MusclesCard({
  main,
  helpers,
}: {
  main: { group: string; sets: number }[];
  helpers: string[];
}) {
  const { colors } = useTheme();
  const worked = new Set(main.map((m) => m.group)),
    helped = new Set(helpers),
    most = Math.max(1, ...main.map((m) => m.sets));
  return (
    <Card testID="summary-muscles" style={[card, { gap: tokens.spacing[2] }]}>
      <View
        style={{ flexDirection: "row", justifyContent: "center", gap: tokens.spacing[4] }}
      >
        {SIDES.map((side) => {
          const geometry = atlasGeometry.male[side];
          return (
            <View key={side} style={{ width: 92, aspectRatio: 200 / 440 }}>
              <Svg width="100%" height="100%" viewBox="0 0 200 440" accessible={false}>
                <Path
                  d={geometry.skin}
                  fill={colors["surface-2"]}
                  stroke={colors["text-muted"]}
                  strokeWidth={1.2}
                  strokeLinejoin="round"
                />
                <G>
                  {geometry.muscles.map((path) => {
                    const group = muscleByKey.get(path.id)?.group ?? "";
                    const on = worked.has(group), half = helped.has(group);
                    if (!on && !half) return null;
                    return (
                      <Path
                        key={path.id}
                        testID={`summary-muscle-${path.id}`}
                        d={path.d}
                        fill={colors.training}
                        fillOpacity={on ? (path.deep ? 0.6 : 0.95) : 0.35}
                      />
                    );
                  })}
                </G>
                <Path
                  d={geometry.lines}
                  fill="none"
                  stroke={colors["text-muted"]}
                  strokeOpacity={0.7}
                  strokeWidth={0.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
          );
        })}
      </View>
      <View>
        {main.map((muscle, index) => (
          <View
            key={muscle.group}
            accessible
            accessibilityLabel={`${muscleLabel(muscle.group)}: ${pluralize(muscle.sets, "set")}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: tokens.spacing[2],
              minHeight: 40,
              borderTopWidth: index ? 1 : 0,
              borderTopColor: colors["surface-2"],
            }}
          >
            <ThemedText style={{ flex: 1 }}>{muscleLabel(muscle.group)}</ThemedText>
            <View
              style={{
                width: 60,
                height: 6,
                borderRadius: 3,
                overflow: "hidden",
                backgroundColor: colors["surface-2"],
              }}
            >
              <View
                style={{
                  width: `${Math.round((muscle.sets / most) * 100)}%`,
                  height: "100%",
                  backgroundColor: colors.training,
                }}
              />
            </View>
            <ThemedText muted numeric variant="caption" style={{ minWidth: 48, textAlign: "right" }}>
              {pluralize(muscle.sets, "set")}
            </ThemedText>
          </View>
        ))}
      </View>
      {helpers.length > 0 && (
        <ThemedText muted variant="caption">
          {t("summaryHelpers").replace("{muscles}", helpers.map(muscleLabel).join(", "))}
        </ThemedText>
      )}
    </Card>
  );
}
