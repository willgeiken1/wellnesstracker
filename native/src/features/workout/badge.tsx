import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTheme } from "@/design/theme-provider";
import { Line } from "./primitives";
import { ThemedText } from "@/components/themed-text";
import { t } from "@/i18n/en";
export function SyncBadge({
  local,
  pending,
  status,
}: {
  local: boolean;
  pending: number;
  status: "idle" | "syncing" | "offline";
}) {
  const { colors } = useTheme();
  const busy = pending > 0 || status !== "idle";
  const [transition, setTransition] = useState({
    busy,
    local,
    synced: false,
  });
  // A prop transition derives the brief acknowledgement without an effect cascade.
  if (transition.busy !== busy || transition.local !== local)
    setTransition({
      busy,
      local,
      synced: !local && !busy && transition.busy,
    });
  useEffect(() => {
    if (!transition.synced) return;
    const timer = setTimeout(
      () =>
        setTransition((value) => ({
          ...value,
          synced: false,
        })),
      1500,
    );
    return () => clearTimeout(timer);
  }, [transition.synced]);
  const label =
    status === "offline"
      ? t("offlineSaved")
      : local
        ? t("savedPhone")
        : busy
          ? t("pendingSaved")
          : transition.synced
            ? t("synced")
            : null;
  return label ? (
    <View
      testID="sync-chip"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 99,
        backgroundColor: colors["surface-2"],
      }}
    >
      <Line
        size={16}
        name={status === "offline" ? "cloud-off" : "check"}
        color={colors["text-muted"]}
      />
      <ThemedText accessibilityLiveRegion="polite" muted variant="caption">
        {label}
      </ThemedText>
    </View>
  ) : null;
}
