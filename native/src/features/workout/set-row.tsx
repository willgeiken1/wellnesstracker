import { useState } from "react";
import { Button } from "@/components/button";
import { PanResponder, Pressable, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/design/theme-provider";
import type { Draft } from "@/data/workout/store";
import { t } from "@/i18n/en";
import { tokens } from "@/design/tokens";
import { Line, layout } from "./primitives";
/** A faded hint is a suggestion, so screen readers say so instead of "blank". */
function spoken(hint: string) {
  return hint && hint !== "—" ? `${t("suggested")} ${hint}` : t("blank");
}
export function SetRow({
  exerciseIndex = 0,
  exercise,
  index,
  draft,
  previous,
  hint,
  repsHint = "",
  onEdit,
  onDone,
  onRemove,
  onTag,
  side,
}: {
  exerciseIndex?: number;
  side?: "left" | "right";
  onTag?: (tag: Draft["tag"]) => void;
  exercise: string;
  index: number;
  draft: Draft;
  previous: string;
  hint: string;
  repsHint?: string;
  onEdit: (field: "weight" | "reps") => void;
  onDone: () => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  const [tagsOpen, setTagsOpen] = useState(false);
  const label = `${exercise}, ${t("set")} ${index + 1}${side ? `, ${t(side === "left" ? "leftSide" : "rightSide")}` : ""}`;
  const pan = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      g.dx > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderRelease: (_, g) => {
      if (g.dx > 65 && !draft.setId) onDone();
    },
  });
  const suffix = side === "right" ? "-right" : "";
  const done = !!draft.setId;
  const tagLetter = draft.tag && onTag ? { warmup: "W", failure: "F", drop: "D" }[draft.tag] : "";
  const prev = (
    <>
      <ThemedText muted variant="caption" style={{ fontSize: 14 }}>
        {previous || "—"}
      </ThemedText>
      {!!draft.tag && onTag && (
        <ThemedText variant="caption" style={{ color: colors.accent, fontWeight: "600" }}>
          {t(draft.tag)}
        </ThemedText>
      )}
    </>
  );
  return (
    <>
    {side && <ThemedText muted variant="caption">{t(side === 'left' ? 'leftSide' : 'rightSide')}</ThemedText>}
    <View
      testID={`set-row-${exerciseIndex}-${index}${suffix}`}
      {...pan.panHandlers}
      style={[
        layout.row,
        {
          minHeight: tokens.logger.rowHeight,
          paddingVertical: 4,
          // A done row tints the full card width.
          paddingHorizontal: 14,
          marginHorizontal: -14,
          borderRadius: 0,
          backgroundColor: done ? colors["accent-tint"] : undefined,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${t("removeSet")}`}
        hitSlop={{ left: 9, right: 9, top: 4, bottom: 4 }}
        onLongPress={onRemove}
        onPress={() => { if (onTag) setTagsOpen(!tagsOpen); }}
        accessibilityActions={[
          {
            name: "delete",
            label: t("removeSet"),
          },
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "delete") onRemove();
        }}
        style={[
          layout.cell,
          {
            width: 26,
            minWidth: 26,
          },
        ]}
      >
        <ThemedText numeric muted={!tagLetter} style={tagLetter ? { color: colors.accent, fontWeight: "700" } : undefined}>
          {tagLetter || index + 1}
        </ThemedText>
      </Pressable>
      {onTag ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${t('setTag')}${draft.tag ? `, ${t(draft.tag)}` : ''}`}
          // The label names the button, so the previous weight and reps it shows are read as its value.
          accessibilityValue={previous ? { text: `${t('lastTime')}: ${previous}` } : undefined}
          accessibilityState={{ expanded: tagsOpen }}
          onPress={() => setTagsOpen(!tagsOpen)}
          style={{ flex: 1, minHeight: 44, justifyContent: "center" }}
        >
          {prev}
        </Pressable>
      ) : (
        <View style={{ flex: 1, justifyContent: "center" }}>{prev}</View>
      )}
      {(["weight", "reps"] as const).map((field) => (
        <Pressable
          testID={`set-${exerciseIndex}-${index}${suffix}-${field}`}
          key={field}
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${t(field)}, ${draft[field] || spoken(field === "weight" ? hint : repsHint)}`}
          hitSlop={{ top: 4, bottom: 4 }}
          onPress={() => onEdit(field)}
          style={[
            layout.cell,
            {
              flex: 1,
              minWidth: 0,
              minHeight: 40,
              borderRadius: 12,
              borderWidth: 0,
              backgroundColor: done ? undefined : colors["surface-2"],
            },
          ]}
        >
          <ThemedText numeric muted={!draft[field]} style={{ fontSize: 17 }}>
            {draft[field] || (field === "weight" ? hint : repsHint) || "–"}
          </ThemedText>
        </Pressable>
      ))}
      <Pressable
        testID={`set-${exerciseIndex}-${index}${suffix}-done`}
        accessibilityRole="checkbox"
        accessibilityLabel={`${label}, ${t("done")}`}
        accessibilityState={{
          checked: done,
        }}
        hitSlop={{ top: 4, bottom: 4, right: 6 }}
        onPress={onDone}
        style={[
          layout.cell,
          {
            width: 40,
            minWidth: 40,
            minHeight: 40,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: done ? colors.accent : `${colors["text-muted"]}55`,
            backgroundColor: done ? colors.accent : colors.surface,
          },
        ]}
      >
        <Line
          name="check"
          size={18}
          color={done ? colors["on-accent"] : colors.text}
        />
      </Pressable>
    </View>
    {tagsOpen && onTag && <View style={[layout.row, {flexWrap:'wrap', paddingBottom: 6}]}>
      {(['warmup','failure','drop'] as const).map(tag => <Button key={tag} label={t(tag)} selected={draft.tag === tag} variant="secondary" onPress={() => {onTag(draft.tag === tag ? null : tag); setTagsOpen(false);}} />)}
      <Button label={t('clearTag')} variant="secondary" onPress={() => {onTag(null); setTagsOpen(false);}} />
      <Button label={t('removeSet')} variant="secondary" onPress={() => {setTagsOpen(false); onRemove();}} />
    </View>}</>
  );
}
