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
}: {
  exerciseIndex?: number;
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
  const label = `${exercise}, ${t("set")} ${index + 1}`;
  const pan = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      g.dx > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderRelease: (_, g) => {
      if (g.dx > 65 && !draft.setId) onDone();
    },
  });
  return (
    <View
      testID={`set-row-${exerciseIndex}-${index}`}
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
          testID={`set-${exerciseIndex}-${index}-${field}`}
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
        testID={`set-${exerciseIndex}-${index}-done`}
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
  );
}
