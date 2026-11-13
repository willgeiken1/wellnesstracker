import { useEffect, useState } from "react";
import { AppState, Pressable, ScrollView, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import type { WorkoutStore } from "@/data/workout/store";
import { remainingSeconds } from "@/core/workout/rules";
import { tokens } from "@/design/tokens";
import { useTheme } from "@/design/theme-provider";
import { touchTarget } from "@/components/button";
import { ThemedText } from "@/components/themed-text";
import { t } from "@/i18n/en";
import { clock, Eyebrow, Pill, layout, Sheet } from "./primitives";
import { restBuzz } from "./haptics";
import { announce } from "@/components/announce";
import { IN_RING_MAX, useOutgrowsRing, useStacked } from "@/components/text-size";
import { useWorkoutStore } from "./use-workout";
// Smooth synthetic geometry starts at twelve o'clock; all rings share it.
const outline = "M150 8C218 6 294 64 294 146C294 197 281 258 238 282C199 306 83 295 48 266C13 238 -8 169 11 125C29 83 105 8 150 8Z";
// Sample cubic lengths once: the active dash represents elapsed perimeter,
// rather than polar angle, on this asymmetric contour.
const curves = [
  [150,8,218,6,294,64,294,146],
  [294,146,294,197,281,258,238,282],
  [238,282,199,306,83,295,48,266],
  [48,266,13,238,-8,169,11,125],
  [11,125,29,83,105,8,150,8],
];
const perimeter = curves.reduce((sum, c) => {
  let x = c[0], y = c[1];
  for (let i = 1; i <= 60; i++) {
    const t = i / 60, u = 1 - t;
    const nextX = u*u*u*c[0] + 3*u*u*t*c[2] + 3*u*t*t*c[4] + t*t*t*c[6];
    const nextY = u*u*u*c[1] + 3*u*u*t*c[3] + 3*u*t*t*c[5] + t*t*t*c[7];
    sum += Math.hypot(nextX-x, nextY-y);
    x = nextX; y = nextY;
  }
  return sum;
}, 0);
export function RestContours({
  seconds,
  duration,
  style,
}: {
  seconds: number;
  duration: number;
  style: "unwind" | "converge";
}) {
  const { colors, mode } = useTheme();
  const remaining = Math.max(0, Math.min(seconds, duration)) / 15;
  const full = Math.floor(remaining), fraction = remaining - full;
  const visible = Math.ceil(remaining);
  const count = Math.min(visible, 40);
  return (
    <Svg testID="rest-contours" accessible={false} width="100%" height="100%" viewBox="0 0 300 300">
      <Path d={outline} fill="none" stroke={colors[mode === "dark" ? "text-muted" : "surface-2"]} opacity={mode === "dark" ? 0.4 : 1} strokeWidth={2} />
      {Array.from({length: count}, (_, i) => {
        const outer = i === visible - 1;
        const partial = outer && fraction > 0 && style === "unwind";
        const scale = style === "converge"
          ? 0.15 + 0.85 * (i + (outer ? fraction || 1 : 1)) / Math.max(1, Math.ceil(duration / 15))
          : count === 1 ? 1 : 0.5 + 0.5 * i / (count - 1);
        return (
          <Path
            key={i}
            d={outline}
            transform={`translate(${150 * (1-scale)} ${150 * (1-scale)}) scale(${scale})`}
            fill="none"
            stroke={colors.accent}
            opacity={0.4 + 0.6 * (i + 1) / Math.max(1, visible)}
            strokeWidth={partial ? 2.6 : 1.6 / scale}
            strokeDasharray={partial ? [perimeter * fraction, perimeter] : undefined}
            strokeLinecap="round"
          />
        );
      })}
      {seconds <= 0 && <Circle cx={150} cy={150} r={5} fill={colors.accent} />}
    </Svg>
  );
}
/** A bar button: a full 44pt target with a compact chip drawn inside it. */
function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={{ minHeight: touchTarget, minWidth: 52, justifyContent: "center" }}>
      <View style={{ minHeight: 36, paddingHorizontal: 10, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors["surface-2"] }}>
        <ThemedText numeric style={{ fontSize: 15, fontWeight: "600" }}>{label}</ThemedText>
      </View>
    </Pressable>
  );
}
export function RestTimer({
  store: source,
  hidden = false,
  presentation = "all",
}: {
  store: WorkoutStore;
  hidden?: boolean;
  presentation?: "all" | "mini" | "sheet";
}) {
  const store = useWorkoutStore(source.repo);
  const outgrown = useOutgrowsRing(), stacked = useStacked();
  const { reduceMotion, colors } = useTheme(),
    [now, setNow] = useState(() => Date.now()),
    timer = store.timer();
  const endAt = timer?.endAt,
    ended = timer?.ended,
    minimized = timer?.minimized;
  useEffect(() => {
    if (
      endAt === undefined ||
      ended ||
      (presentation === "mini" && !minimized) ||
      (presentation === "sheet" && minimized)
    )
      return;
    const update = () => {
      if (AppState.currentState !== "active") return;
      const stamp = Date.now();
      setNow(stamp);
      const latest = store.timer();
      if (latest && !latest.ended && latest.endAt <= stamp) {
        store.updateTimer({
          ended: true,
          minimized: true,
        });
        restBuzz(store.repo);
        // The buzz is off when haptics are off and is never heard; VoiceOver users also hear that rest is over.
        announce(t("restReady"));
      }
    };
    const interval = setInterval(update, reduceMotion ? 1000 : 50),
      subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") update();
      });
    update();
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [store, endAt, ended, reduceMotion, minimized, presentation]);
  if (!timer || hidden) return null;
  const seconds = Math.min(timer.duration, remainingSeconds(timer.endAt, now)),
    style = store.rest(String(store.repo.get("entries", timer.entryId)?.data.exercise)).style;
  const entry = store.repo.get("entries", timer.entryId),
    drafts = store.drafts(timer.entryId),
    next = drafts.findIndex((d) => !d.setId);
  if (
    (presentation === "mini" && !timer.minimized) ||
    (presentation === "sheet" && timer.minimized)
  )
    return null;
  if (timer.minimized) {
    const left = timer.ended ? 0 : Math.max(0, Math.min(1, (timer.endAt - now) / 1000 / Math.max(1, timer.duration)));
    return (
      <View
        testID="rest-mini-bar"
        style={{
          marginHorizontal: tokens.logger.page,
          marginBottom: 8,
          borderRadius: tokens.logger.cardRadius,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors["surface-2"],
          overflow: "hidden",
        }}
      >
        {/* Wraps: at the largest text sizes the chips drop under the clock instead of pushing Skip off the edge. */}
        <View testID="rest-bar-row" style={[layout.row, { paddingLeft: 14, paddingRight: 8, paddingVertical: 8, gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("expandRest")}
            accessibilityValue={{ text: timer.ended ? t("restReady") : clock(seconds) }}
            onPress={() => store.updateTimer({ minimized: false })}
            style={{ flexGrow: 1, flexShrink: 1, flexBasis: 96, minHeight: touchTarget, justifyContent: "center" }}
          >
            {timer.ended ? (
              <ThemedText>{t("restReady")}</ThemedText>
            ) : (
              <ThemedText muted>
                {t("rest")}{"  "}
                <ThemedText testID="rest-bar-clock" numeric style={{ fontSize: 22, fontWeight: "600", color: colors.text }}>
                  {clock(seconds)}
                </ThemedText>
              </ThemedText>
            )}
          </Pressable>
          {!timer.ended && <Chip label={t("minus15")} onPress={() => store.adjustTimer(-15)} />}
          <Chip label={t("plus15")} onPress={() => store.adjustTimer(15)} />
          <Chip label={t(timer.ended ? "done" : "skip")} onPress={() => store.skipTimer()} />
        </View>
        <View accessible={false} style={{ height: 3, backgroundColor: colors["surface-2"] }}>
          <View testID="rest-bar-progress" style={{ height: 3, width: `${Math.round(left * 1000) / 10}%`, backgroundColor: colors.accent }} />
        </View>
      </View>
    );
  }
  const body = (
    <>
      <Eyebrow center>{t("rest")}</Eyebrow>
      <ThemedText
        style={{
          textAlign: "center",
        }}
      >
        {t("next")}: {String(entry?.data.exercise ?? "")} · {t("set")}{" "}
        {next >= 0 ? next + 1 : drafts.length + 1}{" "}
        <ThemedText muted>
          {drafts[next]?.weight || (store.suggestion(entry!).weight ?? "")} ×{" "}
          {drafts[next]?.reps ||
            store.repo.localGet<number>(`target:${entry?.id}`) ||
            ""}
        </ThemedText>
      </ThemedText>
      <View
        style={{
          width: "100%",
          aspectRatio: 1,
          maxWidth: 328,
          flexShrink: 1,
          marginTop: 16,
          alignSelf: "center",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <RestContours
          seconds={
            reduceMotion
              ? seconds
              : Math.min(
                  timer.duration,
                  Math.max(0, (timer.endAt - now) / 1000),
                )
          }
          duration={timer.duration}
          style={style}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            alignItems: "center",
          }}
        >
          {/* The contours are a fixed size, so the clock inside grows only a little with large text; past that the
              same time is written in full under them. */}
          <ThemedText testID="rest-clock" numeric maxFontSizeMultiplier={IN_RING_MAX} style={{ fontSize: tokens.logger.timer, fontWeight: "700" }}>
            {clock(seconds)}
          </ThemedText>
          <ThemedText muted maxFontSizeMultiplier={IN_RING_MAX}>
            {t("of")} {clock(timer.duration)}
          </ThemedText>
        </View>
      </View>
      {outgrown && (
        <ThemedText testID="rest-clock-full" numeric style={{ textAlign: "center", fontWeight: "700" }}>
          {clock(seconds)} <ThemedText muted>{t("of")} {clock(timer.duration)}</ThemedText>
        </ThemedText>
      )}
      <View style={{ flex: 1, minHeight: 12 }} />
      <ThemedText
        muted
        variant="caption"
        style={{
          textAlign: "center",
        }}
      >
        {t("restExplanation")}
      </ThemedText>
      <View style={layout.row}>
        <View style={{ flex: 1 }}>
          <Pill
            secondary
            label={t("plus15")}
            onPress={() => store.adjustTimer(15)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Pill secondary label={t("skip")} onPress={() => store.skipTimer()} />
        </View>
      </View>
      {stacked && <Pill secondary testID="rest-minimize" label={t("minimizeRest")} onPress={() => store.updateTimer({ minimized: true })} />}
    </>
  );
  return (
    <Sheet
      minimal
      tall
      onDecrease={() => store.adjustTimer(-15)}
      onSkip={() => store.skipTimer()}
      testID="rest-sheet"
      label={t("rest")}
      onClose={() =>
        store.updateTimer({
          minimized: true,
        })
      }
    >
      {/* At accessibility sizes the sheet's content is taller than the screen: it scrolls, so the contours keep their
          size instead of being squeezed to nothing, and a visible Minimize joins the drag handle. */}
      {stacked ? <ScrollView testID="rest-sheet-scroll" style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>{body}</ScrollView> : body}
    </Sheet>
  );
}
