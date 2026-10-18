import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { createContext, useContext, type PropsWithChildren } from 'react';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/design/theme-provider';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/card';
import { touchTarget, Button } from '@/components/button';
import { t } from '@/i18n/en';
export const layout = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  stack: {
    gap: 12
  },
  content: {
    padding: 16,
    gap: 16
  },
  input: {
    minHeight: 48,
    borderRadius: 8,
    padding: 12
  },
  card: {
    padding: 16,
    borderRadius: 12,
    gap: 12
  },
  cell: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    gap: 16,
    maxHeight: '94%'
  },
  number: {
    fontVariant: ['tabular-nums']
  }
});
export function Panel({
  children,
  style
}: PropsWithChildren<{
  style?: ViewStyle;
}>) {
  return <Card style={[layout.card, style]}>{children}</Card>;
}
export function Line({
  name,
  color,
  size = 24
}: {
  name: 'check' | 'down' | 'close' | 'more' | 'summit' | 'backspace' | 'trend';
  color?: string;
  size?: number;
}) {
  const {
    colors
  } = useTheme();
  const paths = {
    check: 'M4 12L9 17L20 6',
    down: 'M5 8L12 15L19 8',
    close: 'M5 5L19 19M19 5L5 19',
    more: 'M4 12H5M11 12H12M18 12H19',
    summit: 'M3 20L12 4L21 20Z',
    backspace: 'M9 5H21V19H9L3 12ZM12 9L18 15M18 9L12 15',
    trend: 'M3 18L9 12L14 15L21 6M15 6H21V12'
  };
  return <Svg accessible={false} width={size} height={size} viewBox="0 0 24 24"><Path d={paths[name]} fill="none" stroke={color ?? colors.text} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
export function IconButton({
  label,
  onPress,
  name
}: {
  label: string;
  onPress: () => void;
  name: Parameters<typeof Line>[0]['name'];
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={layout.cell}><Line name={name} /></Pressable>;
}
// The logger owns one native presenter: switching sheets never races two iOS modals.
const HostedSheet = createContext(false);
export function SheetHost({ children, visible, onClose }: PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
}>) {
  const { reduceMotion } = useTheme();
  return <Modal testID="workout-sheet-host" transparent visible={visible} animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => {
    Keyboard.dismiss();
    onClose();
  }}><HostedSheet.Provider value={true}>{children}</HostedSheet.Provider></Modal>;
}
export function Sheet({
  children,
  onClose,
  label,
  testID,
  closeTestID,
  expanded = false
}: PropsWithChildren<{
  onClose: () => void;
  label: string;
  testID?: string;
  closeTestID?: string;
  expanded?: boolean;
}>) {
  const { colors } = useTheme();
  const hosted = useContext(HostedSheet);
  const close = () => {
    Keyboard.dismiss();
    onClose();
  };
  const content = <SafeAreaProvider style={{ flex: 1 }}><SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{
    flex: 1,
    backgroundColor: '#00000077'
  }}><KeyboardAvoidingView testID="sheet-keyboard-container" behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
    <Pressable testID="sheet-backdrop" style={StyleSheet.absoluteFill} accessible={false} importantForAccessibility="no" onPress={close} />
    <View collapsable={false} accessible={false} accessibilityViewIsModal testID={testID} style={[layout.sheet, {
      backgroundColor: colors.surface,
      flexShrink: 1,
      ...(expanded ? { flex: 1 } : {})
    }]}>
      <View style={layout.row}><ThemedText variant="headline" accessibilityRole="header" style={{ flex: 1 }}>{label}</ThemedText><Button testID={closeTestID} label={t('close')} variant="secondary" onPress={close} /></View>{children}
    </View>
  </KeyboardAvoidingView></SafeAreaView></SafeAreaProvider>;
  return hosted ? content : <SheetHost visible onClose={onClose}>{content}</SheetHost>;
}
export const clock = (input: number) => {
  const seconds = Number.isFinite(input) ? input : 0;
  return `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds)) % 60).padStart(2, '0')}`;
};
