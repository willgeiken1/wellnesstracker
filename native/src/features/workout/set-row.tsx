import { useState } from "react";
import { Button } from "@/components/button";
import { PanResponder, Pressable, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/design/theme-provider";
import type { Draft } from "@/data/workout/store";
import { t } from "@/i18n/en";
import { Line, layout } from "./primitives";
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
  return (
    <>
    {side && <ThemedText muted variant="caption">{t(side === 'left' ? 'leftSide' : 'rightSide')}</ThemedText>}
    <View
      testID={`set-row-${exerciseIndex}-${index}${side === "right" ? "-right" : ""}`}
      {...pan.panHandlers}
      style={[
        layout.row,
        {
          paddingVertical: 5,
          paddingHorizontal: 14,
          marginHorizontal: -14,
          minHeight: 48,
          backgroundColor: draft.setId ? colors["accent-tint"] : undefined,
          borderRadius: 0,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${t("removeSet")}`}
        hitSlop={{ left: 9, right: 9 }}
        onLongPress={onRemove}
        onPress={() => {}}
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
        <ThemedText numeric muted>
          {index + 1}
        </ThemedText>
      </Pressable>
      <ThemedText muted variant="caption" style={{ fontSize: 14, flex: 1 }}>
        {previous || "—"}
      </ThemedText>
      {(["weight", "reps"] as const).map((field) => (
        <Pressable
          testID={`set-${exerciseIndex}-${index}${side === "right" ? "-right" : ""}-${field}`}
          key={field}
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${t(field)}, ${draft[field] || t("blank")}`}
          hitSlop={3}
          onPress={() => onEdit(field)}
          style={[
            layout.cell,
            {
              flex: field === "weight" ? 1.15 : 0.95,
              minWidth: 0,
              minHeight: 38,
              borderWidth: 0,
              backgroundColor: draft.setId ? undefined : colors["surface-2"],
            },
          ]}
        >
          <ThemedText numeric muted={!draft[field]}>
            {draft[field] || (field === "weight" ? hint : repsHint || "—")}
          </ThemedText>
        </Pressable>
      ))}
      <Pressable
        testID={`set-${exerciseIndex}-${index}${side === "right" ? "-right" : ""}-done`}
        accessibilityRole="checkbox"
        accessibilityLabel={`${label}, ${t("done")}`}
        accessibilityState={{
          checked: !!draft.setId,
        }}
        hitSlop={3}
        onPress={onDone}
        style={[
          layout.cell,
          {
            width: 38,
            minWidth: 38,
            minHeight: 38,
            backgroundColor: draft.setId ? colors.accent : colors["surface-2"],
          },
        ]}
      >
        <Line
          name="check"
          size={18}
          color={draft.setId ? colors["on-accent"] : colors["text-muted"]}
        />
      </Pressable>
    </View>
    {onTag && <Pressable accessibilityRole="button"
      accessibilityLabel={`${label}, ${t('setTag')}${draft.tag ? `, ${t(draft.tag)}` : ''}`}
      accessibilityState={{expanded:tagsOpen}}
      onPress={() => setTagsOpen(!tagsOpen)}
      style={{minHeight:44, justifyContent:'center'}}>
      <ThemedText muted variant="caption">{draft.tag ? t(draft.tag) : t('setTag')}</ThemedText>
    </Pressable>}
    {tagsOpen && onTag && <View style={[layout.row, {flexWrap:'wrap'}]}>
      {(['warmup','failure','drop'] as const).map(tag => <Button key={tag} label={t(tag)} selected={draft.tag === tag} variant="secondary" onPress={() => {onTag(draft.tag === tag ? null : tag); setTagsOpen(false);}} />)}
      <Button label={t('clearTag')} variant="secondary" onPress={() => {onTag(null); setTagsOpen(false);}} />
    </View>}</>
  );
}
