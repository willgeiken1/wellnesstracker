import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { HomeItem } from './model';

/** Home slot for one placed widget. A locked one stays in place, grayed, with its service message and Reconnect (§2.5, FP73). */
export function HomeWidgetCard({ item, onReconnect }: { item: HomeItem; onReconnect: (item: HomeItem) => void }) {
  const { disconnected } = item;
  return (
    <View testID={`home-widget-${item.id}`} accessibilityState={{ disabled: item.locked }} style={[styles.card, item.locked && styles.locked]}>
      <Text style={styles.title}>{item.title}</Text>
      {disconnected ? (
        <>
          <Text style={styles.message}>{disconnected.message}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`${disconnected.action} ${item.title}`} onPress={() => onReconnect(item)}>
            <Text style={styles.action}>{disconnected.action}</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: '#8885' },
  locked: { opacity: 0.45 },
  title: { fontSize: 16, fontWeight: '600' },
  message: { fontSize: 14, marginTop: 4 },
  action: { fontSize: 14, fontWeight: '600', marginTop: 8 },
});
