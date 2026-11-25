import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { t } from '@/i18n/en';
import { Icon } from './icon';
import { font, KIT, useKit } from './kit-style';
import { KitText } from './themed-text';

type InputProps = Omit<TextInputProps, 'style' | 'placeholderTextColor'>;

/**
 * The kit's `.field` (`ui.field`): a labelled input on a surface with 14 pt corners, the label in 600 12 pt muted
 * above 600 17 pt text, and an optional unit after it. An accent ring shows while it has focus. On a dark sheet it
 * sits a step up.
 */
export function TextField({ label, unit, testID, onFocus, onBlur, ...input }: InputProps & { label: string; unit?: string; testID?: string }) {
  const k = useKit();
  const [focused, setFocused] = useState(false);
  return <View testID={testID} style={{ backgroundColor: k.cardBg, borderRadius: KIT.radius.field,
    paddingVertical: 10, paddingHorizontal: 14, boxShadow: focused ? `0px 0px 0px 1.5px ${k.c.accent}` : k.cardEdge }}>
    <KitText weight={600} size={12} color="text-muted">{label}</KitText>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
      <TextInput accessibilityLabel={label} {...input} allowFontScaling maxFontSizeMultiplier={0}
        placeholderTextColor={k.tint(k.c['text-muted'], 0.78)} selectionColor={k.c.accent} cursorColor={k.c.accent}
        onFocus={e => { setFocused(true); onFocus?.(e); }} onBlur={e => { setFocused(false); onBlur?.(e); }}
        style={[font(600, 17), { flex: 1, color: k.c.text, paddingTop: 2, paddingBottom: 0, paddingHorizontal: 0, minHeight: 26 }]} />
      {unit ? <KitText weight={600} size={14} color="text-muted">{unit}</KitText> : null}
    </View>
  </View>;
}

/**
 * The kit's `.search` (`ui.search`): a 44 pt rounded field (12 pt corners) on surface 2 with the search icon, 500 16 pt
 * text and a muted placeholder. An accent ring shows while it has focus.
 */
export function SearchField({ placeholder, testID, onFocus, onBlur, ...input }: InputProps & { testID?: string }) {
  const k = useKit();
  const [focused, setFocused] = useState(false);
  const label = placeholder ?? t('kitSearch');
  return <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: KIT.radius.search,
    backgroundColor: k.dark ? k.c['surface-2'] : k.fill, boxShadow: focused ? `0px 0px 0px 1.5px ${k.c.accent}` : undefined }}>
    <Icon name="search" size={18} color={k.c['text-muted']} />
    <TextInput accessibilityLabel={label} accessibilityRole="search" placeholder={label} returnKeyType="search" clearButtonMode="while-editing"
      autoCorrect={false} {...input} allowFontScaling maxFontSizeMultiplier={0}
      placeholderTextColor={k.tint(k.c['text-muted'], 0.78)} selectionColor={k.c.accent} cursorColor={k.c.accent}
      onFocus={e => { setFocused(true); onFocus?.(e); }} onBlur={e => { setFocused(false); onBlur?.(e); }}
      style={[font(500, 16), { flex: 1, minWidth: 0, color: k.c.text, paddingVertical: 0, paddingHorizontal: 0, minHeight: 44 }]} />
  </View>;
}
