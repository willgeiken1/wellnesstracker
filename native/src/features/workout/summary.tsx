import { useEffect } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Svg, {
  Circle,
  Ellipse,
  LinearGradient,
  Defs,
  RadialGradient,
  Stop,
  Path,
} from "react-native-svg";
import { Screen } from "@/components/screen";
import { Button } from "@/components/button";
import { ThemedText } from "@/components/themed-text";
import { tokens } from "@/design/tokens";
import { useTheme } from "@/design/theme-provider";
import { displayWeight, fromKg } from "@/core/workout/rules";
import type { WorkoutStore } from "@/data/workout/store";
import { pluralize, t } from "@/i18n/en";
import { useWorkout, useWorkoutStore } from "./use-workout";
import {
  Eyebrow,
  IconButton,
  Pill,
  Line,
  Panel,
  clock,
  layout,
} from "./primitives";
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
  const { colors, accent } = useTheme();
  const highlight = muted ? colors["token-muted-highlight"] : tokens.accents[accent].dark.accent;
  const face = muted ? colors["token-muted"] : colors.accent;
  const rim = muted ? colors["token-muted"] : tokens.accents[accent].light.accent;
  return (
    <View
      testID={fresh ? "summit-token-new" : muted ? "summit-token-muted" : undefined}
      style={{ width: size, height: size }}
    >
      <Svg accessible={false} width={size} height={size} viewBox="0 0 80 80">
        <Defs>
          <RadialGradient id="token" cx="32%" cy="20%" r="85%">
            <Stop offset="0" stopColor={muted ? highlight : tokens.themes.light.surface} />
            <Stop offset="12%" stopColor={highlight} />
            <Stop offset="45%" stopColor={face} />
            <Stop offset="100%" stopColor={face} stopOpacity={0.75} />
          </RadialGradient>
          <LinearGradient id="rim" x1="0" y1="0" x2="0.7" y2="1">
            <Stop offset="0" stopColor={highlight} />
            <Stop offset="100%" stopColor={rim} />
          </LinearGradient>
          <RadialGradient id="shadow">
            <Stop offset="0" stopColor={tokens.themes.light.text} stopOpacity={0.32} />
            <Stop offset="100%" stopColor={tokens.themes.light.text} stopOpacity={0} />
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
        <Ellipse cx={31} cy={24} rx={10} ry={4} fill={tokens.themes.light.surface} opacity={0.22} transform="rotate(-35 31 24)" />
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
      <Button
        testID="summary-done"
        label={t("done")}
        onPress={() => router.replace("/")}
      />
    </Screen>
  );
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
  return (
    <Screen topInset>
      <View
        style={[
          layout.row,
          { position: "relative", justifyContent: "center", minHeight: 32 },
        ]}
      >
        <View style={{ position: "absolute", left: -8, top: -6 }}>
          <IconButton name="close" label={t("close")} onPress={close} />
        </View>
        <ThemedText muted style={{ fontSize: 15 }}>
          {t("savedHistory")}
        </ThemedText>
      </View>
      <View style={[layout.row, { gap: 14 }]}>
        <ContourThumbnail />
        <View style={{ flex: 1, gap: 5 }}>
          <Eyebrow>{t("workoutComplete")}</Eyebrow>
          <ThemedText variant="title" style={{ fontSize: 26 }}>
            {String(s.data.name ?? t("workoutName"))}
          </ThemedText>
          <ThemedText muted style={{ fontSize: 13 }}>
            {summaryDate(Number(s.data.started_at), Number(s.data.finished_at))}
          </ThemedText>
        </View>
      </View>
      <Panel testID="summary-stats" style={{ paddingVertical: 12 }}>
        <View style={layout.row}>
          {[
            [clock(Number(s.data.duration_ms) / 1000), t("time")],
            [
              Math.round(data.volume).toLocaleString(),
              `${t("volume")}, ${store.unit()}`,
            ],
            [String(data.count), t("setsLabel")],
            [String(data.prs.length), t("prs")],
          ].map(([value, label], i) => (
            <View
              key={label}
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
              <ThemedText muted style={{ fontSize: 12 }}>
                {label}
              </ThemedText>
            </View>
          ))}
        </View>
      </Panel>
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
                {pr.exercise} {displayWeight(pr.displayWeight, store.unit())} ×{" "}
                {pr.bestReps}
              </ThemedText>
              <ThemedText muted style={{ fontSize: 13, lineHeight: 17 }}>
                {t("est1RM")}{" "}
                <ThemedText style={{ fontSize: 13, fontWeight: "600" }}>
                  ≈ {Math.round(fromKg(pr.bestE1rm, store.unit()))}{" "}
                  {store.unit()}
                </ThemedText>
                {pr.previousE1rm > 0
                  ? `, ${t("previousBest")
                      .replace(
                        "{weight}",
                        String(
                          Math.round(
                            fromKg(pr.bestE1rm - pr.previousE1rm, store.unit()),
                          ),
                        ),
                      )
                      .replace("{unit}", store.unit())}`
                  : ""}
              </ThemedText>
            </View>
          </View>
        </Panel>
      ))}
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
                    `${pr.exercise} ${t("summit")}, ${displayWeight(pr.displayWeight, store.unit())} × ${pr.bestReps}`,
                )
                .join(", ")}
            </ThemedText>
          </ThemedText>
        )}
      </Panel>
      {!!s.data.notes && (
        <Panel>
          <ThemedText>{String(s.data.notes)}</ThemedText>
        </Panel>
      )}
      <View style={{ flex: 1 }} />
      <Pill testID="summary-done" label={t("done")} onPress={close} />
    </Screen>
  );
}
