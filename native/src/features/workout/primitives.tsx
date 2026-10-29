import {
  PanResponder,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { createContext, useContext, type PropsWithChildren } from "react";
import Svg, { Path } from "react-native-svg";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/design/theme-provider";
import { ThemedText } from "@/components/themed-text";
import { tokens } from "@/design/tokens";
import { touchTarget, Button } from "@/components/button";
import { t } from "@/i18n/en";
export const layout = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stack: {
    gap: 12,
  },
  content: {
    padding: 16,
    gap: tokens.logger.gap,
  },
  input: {
    minHeight: 48,
    borderRadius: 8,
    padding: 12,
  },
  card: {
    padding: tokens.logger.cardPadding,
    borderRadius: tokens.logger.cardRadius,
    gap: 8,
  },
  cell: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: tokens.logger.inputRadius,
  },
  sheet: {
    borderTopLeftRadius: tokens.logger.sheetRadius,
    borderTopRightRadius: tokens.logger.sheetRadius,
    padding: 16,
    gap: 16,
    maxHeight: "94%",
  },
  number: {
    fontVariant: ["tabular-nums"],
  },
});
export function WorkoutPanel({
  children,
  style,
  testID,
}: PropsWithChildren<{
  testID?: string;
  style?: ViewStyle;
}>) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        layout.card,
        {
          backgroundColor: colors["surface-2"],
          borderRadius: tokens.radii.card,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
/** Existing callers outside the workout presentation retain their current surface. */
export function Panel({children,style,testID}: PropsWithChildren<{testID?:string;style?:ViewStyle}>) {
  const {colors}=useTheme();
  return <View testID={testID} style={[layout.card,{backgroundColor:colors.surface,...tokens.elevation.ios,shadowOpacity:0.08},style]}>{children}</View>;
}
export function Line({
  name,
  color,
  size = 24,
}: {
  name:
    | "check"
    | "down"
    | "close"
    | "more"
    | "summit"
    | "backspace"
    | "trend"
    | "clock"
    | "cloud-off"
    | "barbell";
  color?: string;
  size?: number;
}) {
  const { colors } = useTheme();
  const paths = {
    check: "M4 12L9 17L20 6",
    down: "M5 8L12 15L19 8",
    close: "M5 5L19 19M19 5L5 19",
    more: "M4 12H5M11 12H12M18 12H19",
    summit: "M3 20L12 4L21 20Z",
    backspace: "M9 5H21V19H9L3 12ZM12 9L18 15M18 9L12 15",
    clock: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18M12 7V12L16 14",
    "cloud-off":
      "M3 3L21 21M6 6a6 6 0 0 1 11 3h1a4 4 0 0 1 3 7M6 10a4 4 0 0 0 0 8h10",
    barbell: "M2 12H22M6 5V19M9 3V21M15 3V21M18 5V19",
    trend: "M3 18L9 12L14 15L21 6M15 6H21V12",
  };
  return (
    <Svg accessible={false} width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={paths[name]}
        fill="none"
        stroke={color ?? colors.text}
        strokeWidth={name === "more" ? 3 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
export function IconButton({
  label,
  onPress,
  name,
}: {
  label: string;
  onPress: () => void;
  name: Parameters<typeof Line>[0]["name"];
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={layout.cell}
    >
      <Line name={name} size={name === "more" ? 24 : 20} color={colors["text-muted"]} />
    </Pressable>
  );
}
// The logger owns one native presenter: switching sheets never races two iOS modals.
const HostedSheet = createContext(false);
export function SheetHost({
  children,
  visible,
  onClose,
}: PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
}>) {
  // No native dismissal animation: a quick reopen cannot be swallowed mid-dismissal.
  return (
    <Modal
      testID="workout-sheet-host"
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={() => {
        Keyboard.dismiss();
        onClose();
      }}
    >
      <HostedSheet.Provider value={true}>
        {visible ? children : null}
      </HostedSheet.Provider>
    </Modal>
  );
}
export function Sheet({
  children,
  onClose,
  label,
  testID,
  closeTestID,
  expanded = false,
  minimal = false,
  tall = false,
  onDecrease,
  onSkip,
}: PropsWithChildren<{
  onClose: () => void;
  label: string;
  testID?: string;
  closeTestID?: string;
  expanded?: boolean;
  minimal?: boolean;
  tall?: boolean;
  onDecrease?: () => void;
  onSkip?: () => void;
}>) {
  const { colors } = useTheme();
  const hosted = useContext(HostedSheet);
  const close = () => {
    Keyboard.dismiss();
    onClose();
  };
  const drag = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderRelease: (_, g) => {
      if (g.dy > 35) close();
    },
  });
  const content = (
    <SafeAreaProvider style={{ flex: 1 }}>
      <SafeAreaView
        edges={["top", "left", "right"]}
        style={{
          flex: 1,
          backgroundColor: colors.scrim,
        }}
      >
        <KeyboardAvoidingView
          testID="sheet-keyboard-container"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <Pressable
            testID="sheet-backdrop"
            style={StyleSheet.absoluteFill}
            accessible={false}
            importantForAccessibility="no"
            onPress={close}
          />
          <View
            collapsable={false}
            accessible={false}
            accessibilityViewIsModal
            onAccessibilityEscape={close}
            testID={testID}
            style={[
              layout.sheet,
              {
                backgroundColor: colors.surface,
                flexShrink: 1,
                paddingBottom: 32,
                ...(minimal ? { gap: tall ? 12 : 6 } : {}),
                ...(tall ? { height: "87%", paddingTop: 0 } : {}),
                ...(expanded ? { flex: 1 } : {}),
              },
            ]}
          >
            {minimal ? (
              <View
                testID={`${testID}-handle`}
                {...drag.panHandlers}
                accessible
                accessibilityLabel={label}
                accessibilityActions={[
                  { name: "escape", label: t("close") },
                  ...(onDecrease
                    ? [{ name: "decrement", label: t("minus15") }]
                    : []),
                  ...(onSkip ? [{ name: "skip", label: t("skip") }] : []),
                  { name: "minimize", label: t("minimizeRest") },
                ]}
                onAccessibilityAction={(e) => {
                  if (e.nativeEvent.actionName === "decrement") onDecrease?.();
                  else if (e.nativeEvent.actionName === "skip") onSkip?.();
                  else close();
                }}
                style={{
                  minHeight: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  ...(!tall
                    ? { position: "absolute", top: 0, left: 0, right: 0 }
                    : {}),
                }}
              >
                {tall && (
                  <View
                    style={{
                      width: 38,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: colors["surface-2"],
                    }}
                  />
                )}
              </View>
            ) : null}
            {minimal ? (
              <Pressable
                testID={closeTestID}
                accessibilityRole="button"
                accessibilityLabel={t("close")}
                onPress={close}
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  opacity: 0,
                }}
              />
            ) : (
              <View style={layout.row}>
                <ThemedText
                  variant="headline"
                  accessibilityRole="header"
                  style={{ flex: 1 }}
                >
                  {label}
                </ThemedText>
                <Button
                  testID={closeTestID}
                  label={t("close")}
                  variant="secondary"
                  onPress={close}
                />
              </View>
            )}
            {children}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
  return hosted ? (
    content
  ) : (
    <SheetHost visible onClose={onClose}>
      {content}
    </SheetHost>
  );
}
export const clock = (input: number) => {
  const seconds = Number.isFinite(input) ? input : 0;
  return `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds)) % 60).padStart(2, "0")}`;
};

export function Eyebrow({
  children,
  center = false,
}: PropsWithChildren<{ center?: boolean }>) {
  return (
    <ThemedText
      muted
      variant="caption"
      style={{
        fontSize: tokens.type.caption,
        fontWeight: "600",
        textAlign: center ? "center" : undefined,
      }}
    >
      {children}
    </ThemedText>
  );
}
export function Pill({
  label,
  onPress,
  testID,
  secondary = false,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
  secondary?: boolean;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      hitSlop={compact ? 6 : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: compact ? tokens.logger.finishHeight : secondary ? 50 : 44,
        minWidth: 68,
        paddingHorizontal: compact ? 14 : 16,
        borderRadius: secondary ? 14 : 99,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: secondary ? colors["surface-2"] : colors.accent,
      }}
    >
      <ThemedText
        style={{
          color: secondary ? colors.text : colors["on-accent"],
          fontSize: compact ? tokens.logger.finishLabel : 17,
          fontWeight: "600",
        }}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}
