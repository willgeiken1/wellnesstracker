import { View } from 'react-native';
import { useKit } from './kit-style';
import { KitText } from './themed-text';

/** The kit's `.badge` (`ui.badge`): a 22 pt pill of bold 11.5 pt text in `color` on a 16 percent tint of it. */
export function Badge({ label, color, testID }: { label: string; /** A theme colour token, the accent unless given. */ color?: string; testID?: string }) {
  const k = useKit();
  const c = k.tok(color);
  return <View testID={testID} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 22, paddingHorizontal: 8,
    borderRadius: 999, backgroundColor: k.tint(c, 0.16) }}>
    <KitText weight={700} size={11.5} lineHeight={1} tracking={0.02} color={c}>{label}</KitText>
  </View>;
}
