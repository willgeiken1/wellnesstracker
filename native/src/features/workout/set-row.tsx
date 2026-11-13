import { useState } from "react";
import { Button } from "@/components/button";
import { Pressable, View } from "react-native";
import { SwipeStops } from "./swipe-stops";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/design/theme-provider";
import type { Draft } from "@/data/workout/store";
import { t } from "@/i18n/en";
import { tokens } from "@/design/tokens";
import { Line, layout } from "./primitives";
import { useStacked } from "@/components/text-size";
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
  unit,
}: {
  /** Shown over the weight box when the row stacks at large text (the column heads are hidden then). */
  unit?: string;
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
  // At the largest text sizes the row stacks: the set number, last time and the check on one line, then a line
  // naming the two boxes, then the boxes. Wrapping keeps one row of controls, so swipe and focus order stay the same.
  const stacked = useStacked();
  const removeAction = [{ name: "delete", label: t("removeSet") }];
  const onRemoveAction = (e: { nativeEvent: { actionName: string } }) => { if (e.nativeEvent.actionName === "delete") onRemove(); };
  const label = `${exercise}, ${t("set")} ${index + 1}${side ? `, ${t(side === "left" ? "leftSide" : "rightSide")}` : ""}`;
  const suffix = side === "right" ? "-right" : "";
  const done = !!draft.setId;
  const tagLetter = draft.tag && onTag ? { warmup: "W", failure: "F", drop: "D" }[draft.tag] : "";
  const prev = (
    <>
      <ThemedText muted variant="caption" style={{ fontSize: 14 }}>
        {previous || "—"}
      </ThemedText>
      {!!draft.tag && onTag && (
        <ThemedText variant="caption" style={{ color: done ? colors["accent-2"] : colors.accent, fontWeight: "600" }}>
          {t(draft.tag)}
        </ThemedText>
      )}
    </>
  );
  const checkCell = (
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
  );
  return (
    <>
    {side && <ThemedText muted variant="caption">{t(side === 'left' ? 'leftSide' : 'rightSide')}</ThemedText>}
    {/* Swipe right marks the set done, on native scrolling so the drag is not lost to the page or to the
        logger re-rendering each second. A done row has nothing to swipe to. The checkbox does the same by tap. */}
    <SwipeStops
      testID={`set-swipe-${exerciseIndex}-${index}${suffix}`}
      start={done ? undefined : { label: t("done"), onCommit: onDone }}
      // A done row tints the full card width.
      style={{ marginHorizontal: -14 }}
    >
    <View
      testID={`set-row-${exerciseIndex}-${index}${suffix}`}
      style={[
        layout.row,
        {
          minHeight: tokens.logger.rowHeight,
          paddingVertical: 4,
          paddingHorizontal: 14,
          borderRadius: 0,
          backgroundColor: done ? colors["accent-tint"] : undefined,
          flexWrap: stacked ? "wrap" : undefined,
          rowGap: stacked ? 6 : undefined,
        },
      ]}
    >
      <Pressable
        // With tags, the tag button beside this one (last time) opens the same menu and carries Remove set, so this
        // copy is skipped by screen readers instead of being read twice. Without tags it only removes, by long press
        // or the Remove set action, so it is not called a button.
        accessible={!onTag}
        importantForAccessibility={onTag ? "no-hide-descendants" : "yes"}
        accessibilityElementsHidden={!!onTag}
        accessibilityLabel={label}
        hitSlop={{ left: 9, right: 9, top: 4, bottom: 4 }}
        onLongPress={onRemove}
        onPress={onTag ? () => setTagsOpen(!tagsOpen) : undefined}
        accessibilityActions={removeAction}
        onAccessibilityAction={onRemoveAction}
        style={[
          layout.cell,
          {
            minWidth: 26,
          },
        ]}
      >
        <ThemedText numeric muted={!tagLetter} style={tagLetter ? { color: done ? colors["accent-2"] : colors.accent, fontWeight: "700" } : undefined}>
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
          accessibilityActions={removeAction}
          onAccessibilityAction={onRemoveAction}
          onPress={() => setTagsOpen(!tagsOpen)}
          style={{ flex: 1, minHeight: 44, justifyContent: "center" }}
        >
          {prev}
        </Pressable>
      ) : (
        <View style={{ flex: 1, justifyContent: "center" }}>{prev}</View>
      )}
      {stacked && <>
        {checkCell}
        {/* Starts the second line: a name over each box, since the column heads are hidden at this size. Screen
            readers skip it; each box already says what it holds. */}
        <View testID={`set-row-${exerciseIndex}-${index}${suffix}-names`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={[layout.row, { flexBasis: "100%" }]}>
          <ThemedText muted variant="caption" style={{ flex: 1 }}>{unit ?? t("weight")}</ThemedText>
          <ThemedText muted variant="caption" style={{ flex: 1 }}>{t("repsHeader")}</ThemedText>
        </View>
      </>}
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
      {!stacked && checkCell}
    </View>
    </SwipeStops>
    {tagsOpen && onTag && <View style={[layout.row, {flexWrap:'wrap', paddingBottom: 6}]}>
      {(['warmup','failure','drop'] as const).map(tag => <Button key={tag} label={t(tag)} selected={draft.tag === tag} variant="secondary" onPress={() => {onTag(draft.tag === tag ? null : tag); setTagsOpen(false);}} />)}
      <Button label={t('clearTag')} variant="secondary" onPress={() => {onTag(null); setTagsOpen(false);}} />
      <Button label={t('removeSet')} variant="secondary" onPress={() => {setTagsOpen(false); onRemove();}} />
    </View>}</>
  );
}
