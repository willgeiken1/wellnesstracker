import { View, Pressable, ScrollView, StyleSheet } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useRef, useState } from "react";
import { equipmentLabel, pluralize, t } from "@/i18n/en";
import {
  keypad,
  plates,
  rounded,
  step,
  toKg,
  validKeypadValue,
  type Equipment,
  type Unit,
} from "@/core/workout/rules";
import { ThemedText } from "@/components/themed-text";
import { tokens } from "@/design/tokens";
import { useTheme } from "@/design/theme-provider";
import { Eyebrow, Line, Sheet, layout } from "./primitives";
export interface Cursor {
  side?: "right";
  entryId: string;
  index: number;
  field: "weight" | "reps";
}
/** How long a tap waits for the store to show it before the keypad trusts the store again. */
const SETTLE_MS = 800;
export function Keypad({
  label,
  inputId = label,
  field,
  unit,
  equipment,
  setupStep,
  barWeight,
  plateSet,
  value,
  previous,
  onChange,
  onNext,
  onClose,
}: {
  label: string;
  inputId?: string;
  field: "weight" | "reps";
  unit: Unit;
  equipment: Equipment;
  setupStep?: number;
  barWeight?: number;
  plateSet?: number[];
  value: string;
  previous: string;
  onChange: (value: string) => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const { colors, keypadLook } = useTheme();
  // Glass keys: real liquid glass where iOS has it, and everywhere else a see-through key with a light rim.
  const glassKeys = keypadLook === "glass", liquid = glassKeys && isLiquidGlassAvailable();
  const focus = `${inputId}:${field}:${unit}`;
  const [selectedInput, setSelectedInput] = useState(focus),
    [wheel, setWheel] = useState(false),
    [wheelBase, setWheelBase] = useState(0),
    [fresh, setFresh] = useState(true),
    [limitHint, setLimitHint] = useState(false),
    // Counts arrivals at a field, so coming back to the same field starts fresh again.
    [visit, setVisit] = useState(0);
  // Reset selection when moving fields without remounting the numeric keys.
  if (selectedInput !== focus) {
    setSelectedInput(focus);
    setVisit(visit + 1);
    setFresh(true);
    setLimitHint(false);
    setWheel(false);
  }
  // Taps can land faster than the store redraws this keypad, so `value` and `fresh` may still be from before
  // the last tap. The last value sent is kept here and used until the store shows it (or shows something else,
  // which then wins), and only for a moment, so a value the store refused never lingers unseen.
  // Without this, a quick second digit replaced the first instead of joining it.
  const sent = useRef<{ visit: number; before: string; typed: string; at: number } | null>(null);
  const live = () => {
    const last = sent.current;
    return last && last.visit === visit && Date.now() - last.at < SETTLE_MS && (value === last.before || value === last.typed) ? { value: last.typed, fresh: false } : { value, fresh };
  };
  const send = (next: string) => {
    sent.current = { visit, before: value, typed: next, at: Date.now() };
    onChange(next);
  };
  const increment = field === "reps" ? 1 : step(equipment, unit, setupStep),
    p = plates(Number(value), unit, barWeight, plateSet);
  const change = (next: string) => {
    if (!validKeypadValue(next, field === "weight", unit)) {
      setLimitHint(true);
      return;
    }
    setFresh(false);
    setLimitHint(false);
    send(next);
  };
  const adjust = (n: number) =>
    change(String(rounded(Math.max(0, Number(live().value || 0) + n))));
  const grouped = new Map<number, number>();
  for (const plate of p.plates)
    grouped.set(plate, (grouped.get(plate) ?? 0) + 1);
  const plateLine = [...grouped]
    .map(([plate, count]) =>
      count > 1 ? `${plate} × ${count}` : String(plate),
    )
    .join(" + ");
  const openWheel = () => {
    setWheelBase(Number(value || 0));
    setWheel((w) => !w);
  };
  const repUnit = pluralize(Number(value) || 0, "rep").split(" ")[1];
  const repLabel = repUnit ? repUnit[0].toUpperCase() + repUnit.slice(1) : "";
  const nextLabel = field === "weight" ? t("nextReps") : t("nextSet");
  const keys = [
    "1",
    "2",
    "3",
    "minus",
    "4",
    "5",
    "6",
    "plus",
    "7",
    "8",
    "9",
    "wheel",
    field === "weight" ? "." : "",
    "0",
    "backspace",
    "next",
  ];
  return (
    <Sheet
      minimal
      testID="keypad-sheet"
      closeTestID="keypad-close"
      label={label}
      onClose={onClose}
    >
      <Eyebrow>{label}</Eyebrow>
      <ScrollView
        contentContainerStyle={[layout.stack, { gap: 12 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            layout.row,
            {
              justifyContent: "space-between",
            },
          ]}
        >
          <ThemedText
            numeric
            style={{ fontSize: tokens.logger.value, lineHeight: 52 }}
          >
            {value || "—"}{" "}
            <ThemedText muted>
              {field === "weight" ? unit : repLabel}
            </ThemedText>
          </ThemedText>
          <View
            accessible={false}
            style={{
              height: 34,
              width: 2,
              backgroundColor: colors.accent,
              marginLeft: 4,
              marginRight: "auto",
            }}
          />
          <View style={{ alignItems: "flex-end" }}>
            <Eyebrow>{t("lastTime")}</Eyebrow>
            <ThemedText numeric muted style={{ fontSize: 16 }}>
              {previous || "—"}
            </ThemedText>
          </View>
        </View>
        {equipment === "barbell" &&
          field === "weight" &&
          value !== "" &&
          Number.isFinite(Number(value)) &&
          Number(value) >= 0 &&
          toKg(Number(value), unit) <= 1000 && (
            <View
              style={[
                layout.input,
                {
                  backgroundColor: colors["surface-2"],
                  paddingVertical: 8,
                  minHeight: 32,
                },
              ]}
            >
              <View style={layout.row}>
                <Line name="barbell" size={16} color={colors["text-muted"]} />
                <ThemedText
                  testID="plate-line"
                  muted
                  variant="caption"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ flex: 1 }}
                >
                  <ThemedText style={{ fontSize: 13, fontWeight: "600" }}>
                    {t("platesPerSide")}:
                  </ThemedText>{" "}
                  {plateLine || "—"}{" "}
                  {t("onBar")
                    .replace("{weight}", String(p.bar))
                    .replace("{unit}", unit)}
                </ThemedText>
              </View>
              {p.remainder !== 0 && (
                <ThemedText muted variant="caption">
                  {t("plateRemainder")}
                </ThemedText>
              )}
            </View>
          )}
        {limitHint && (
          <ThemedText
            testID="keypad-limit-hint"
            muted
            variant="caption"
            accessibilityLiveRegion="polite"
          >
            {t(
              field === "reps"
                ? "keypadRepsLimit"
                : unit === "lb"
                  ? "keypadLbLimit"
                  : "keypadKgLimit",
            )}
          </ThemedText>
        )}
        {wheel && (
          <ScrollView
            horizontal
            snapToInterval={64}
            decelerationRate="fast"
            accessibilityLabel={`${equipmentLabel(equipment)}, ${t("weightWheel")}`}
            contentOffset={{
              x: 640,
              y: 0,
            }}
            onMomentumScrollEnd={(event) => {
              const index = Math.round(event.nativeEvent.contentOffset.x / 64);
              change(
                String(
                  rounded(
                    Math.max(0, wheelBase + (index - 10) * (increment || 1)),
                  ),
                ),
              );
            }}
          >
            {Array.from(
              {
                length: 21,
              },
              (_, i) => {
                const n = rounded(
                  Math.max(0, wheelBase + (i - 10) * (increment || 1)),
                );
                return (
                  <Pressable
                    key={i}
                    accessibilityRole="button"
                    accessibilityLabel={String(n)}
                    onPress={() => change(String(n))}
                    style={[
                      layout.cell,
                      {
                        width: 64,
                      },
                    ]}
                  >
                    <ThemedText numeric>{n}</ThemedText>
                  </Pressable>
                );
              },
            )}
          </ScrollView>
        )}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {keys.map((key, i) => {
            const unavailable =
              !key || ((key === "minus" || key === "plus") && increment === 0);
            const text =
              key === "minus"
                ? `−${increment}`
                : key === "plus"
                  ? `+${increment}`
                  : key === "wheel"
                    ? t("holdWheel")
                    : key === "next"
                      ? nextLabel
                      : key;
            const label =
              key === "backspace"
                ? t("backspace")
                : unavailable
                  ? t("blankKey")
                  : text;
            const action = () => {
              if (key === "minus") adjust(-increment);
              else if (key === "plus") adjust(increment);
              else if (key === "wheel") openWheel();
              else if (key === "next") onNext();
              else {
                const now = live(), base = now.fresh && key !== "backspace" ? "" : now.value;
                const next = keypad(base, key, field === "weight", unit);
                if (
                  key !== "backspace" &&
                  next === base &&
                  !(key === "0" && base === "0")
                )
                  setLimitHint(true);
                else {
                  setFresh(false);
                  setLimitHint(false);
                  send(next);
                }
              }
            };
            return (
              <Pressable
                testID={key === "next" ? "keypad-next" : `keypad-key-${key}`}
                key={`${key}${i}`}
                accessibilityRole="button"
                accessibilityLabel={label}
                disabled={unavailable}
                onLongPress={key === "wheel" ? openWheel : undefined}
                onPress={action}
                style={[
                  layout.cell,
                  {
                    width: "22%",
                    flexGrow: 1,
                    minHeight: tokens.logger.keyHeight,
                    borderRadius: tokens.logger.keyRadius,
                    backgroundColor:
                      key === "next" ? colors.accent : glassKeys ? `${colors.text}14` : colors["surface-2"],
                    borderWidth: glassKeys ? StyleSheet.hairlineWidth * 2 : 0,
                    borderColor: `${colors.text}3D`,
                    overflow: "hidden",
                  },
                ]}
              >
                {liquid && key !== "next" && !unavailable && (
                  <GlassView
                    testID="keypad-glass"
                    pointerEvents="none"
                    glassEffectStyle="regular"
                    style={StyleSheet.absoluteFill}
                  />
                )}
                {key === "backspace" ? (
                  <Line name="backspace" />
                ) : (
                  <ThemedText
                    numeric={key !== "wheel" && key !== "next"}
                    variant={
                      key === "wheel" || key === "next" ? "body" : "title"
                    }
                    // The two word keys shrink to fit and may take two lines, so a label is never cut off by the key.
                    numberOfLines={key === "wheel" || key === "next" ? 2 : 1}
                    adjustsFontSizeToFit={key === "wheel" || key === "next"}
                    minimumFontScale={0.75}
                    style={{
                      textAlign: "center",
                      paddingHorizontal: key === "wheel" || key === "next" ? 4 : 0,
                      lineHeight: key === "wheel" ? 17 : key === "next" ? 19 : undefined,
                      fontSize: key === "wheel" ? 14 : key === "next" ? 16 : 24,
                      fontWeight: key === "next" ? "600" : undefined,
                      color: key === "next" ? colors["on-accent"] : colors.text,
                    }}
                  >
                    {unavailable ? "" : text}
                  </ThemedText>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </Sheet>
  );
}
