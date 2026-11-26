import { useEffect, useRef } from 'react';
import { Image, Linking, Platform, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Polygon, Rect } from 'react-native-svg';
import { router } from 'expo-router';
import { Icon, KitText, List, ListFooter, ListRow, SegmentedControl, Tappable as Pressable, alpha, useKit } from '@/components/kit';
import { useTheme } from '@/design/theme-provider';
import { createTheme, palettes, tokens, type Palette, type ThemeOverride } from '@/design/tokens';
import { PAGE_KEYS } from '@/features/shell/pages';
import { useShellPrefs } from '@/features/shell/prefs';
import { APP_ICONS, applyAppIcon, iconArt, iconId, iconsSupported } from './app-icon';
import { st } from './copy';
import { useSettingsPrefs, type AppIconId, type Density } from './prefs';
import { Cl, H, Panel, SetPage } from './ui';
import { MapSection } from './map-section';

/** `.st-tp`: a 78 x 128 pt phone in one look, drawn in the palette's colours for that look. */
function MiniPhone({ palette, look, half, selected }: { palette: Palette; look: 'dark' | 'light' | 'system'; half?: boolean; selected: boolean }) {
  const k = useKit();
  const draw = (mode: 'dark' | 'light') => {
    const c = createTheme(mode, palette);
    return <>
      <Rect x={0} y={0} width={78} height={128} fill={c.bg} />
      <Circle cx={21} cy={21} r={11} stroke={c.accent} strokeWidth={4} fill="none" />
      <Rect x={40} y={13} width={16} height={5} rx={2.5} fill={c.training} />
      <Rect x={40} y={23} width={12} height={5} rx={2.5} fill={c.food} />
      <Rect x={8} y={30} width={62} height={44} rx={9} fill={c.surface} />
      <Rect x={8} y={80} width={62} height={38} rx={9} fill={c.surface} />
      <Rect x={16} y={90} width={30} height={5} rx={2.5} fill={c.recovery} />
      <Rect x={16} y={101} width={20} height={5} rx={2.5} fill={c['hair-2']} />
    </>;
  };
  const edge = look === 'light' ? createTheme('light', palette)['hair-2'] : createTheme('dark', palette)['hair-2'];
  return <View style={{ width: 78, height: 128, borderRadius: 16, overflow: 'hidden',
    boxShadow: selected ? `0px 0px 0px 2.5px ${k.c.accent}` : `0px 0px 0px 1px ${edge}` }}>
    <Svg width={78} height={128} viewBox="0 0 78 128">
      {half ? <>
        <Defs><ClipPath id="st-half"><Polygon points="78,0 78,128 0,128" /></ClipPath></Defs>
        {draw('dark')}
        <G clipPath="url(#st-half)">{draw('light')}</G>
      </> : draw(look === 'light' ? 'light' : 'dark')}
    </Svg>
  </View>;
}

function ThemeOption({ value, label, selected, onPress, art }: { value: ThemeOverride; label: string; selected: boolean; onPress: () => void; art: React.ReactNode }) {
  const k = useKit();
  return <Pressable dim="none" testID={`appearance-theme-${value}`} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }}
    onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 8, paddingVertical: 6, borderRadius: 16 }}>
    {art}
    <KitText weight={600} size={14}>{label}</KitText>
    <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: selected ? k.c.accent : k.c['hair-2'], backgroundColor: selected ? k.c.accent : 'transparent' }}>
      {selected ? <Icon name="check" size={13} color={k.c['on-accent']} /> : null}
    </View>
  </Pressable>;
}

const PILLARS = ['training', 'food', 'recovery', 'sleep', 'water'] as const;
/** `.st-pal`: one palette, its accent as a disc, its five pillar colours under the name, a check on the current one. */
function PaletteRow({ id, first, selected, onPress }: { id: Palette; first: boolean; selected: boolean; onPress: () => void }) {
  const k = useKit(), { mode } = useTheme();
  const p = tokens.palettes[id], c = p[mode], isDefault = id === palettes[0];
  return <Pressable dim="none" testID={`appearance-palette-${id}`} accessibilityRole="radio" accessibilityState={{ checked: selected }}
    accessibilityLabel={p.name + (isDefault ? `, ${st('settingsDefaultLower')}` : '')} onPress={onPress}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 58, paddingVertical: 9, paddingLeft: 14, paddingRight: 16,
      backgroundColor: pressed ? alpha(k.c.text, 0.06) : 'transparent' })}>
    {!first && <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, left: 58, height: 1, backgroundColor: k.c.hair }} />}
    <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.accent,
      boxShadow: selected ? `0px 0px 0px 2px ${k.cardBg}, 0px 0px 0px 4px ${c.accent}` : `inset 0px 0px 0px 1px ${alpha(k.c.text, 0.1)}` }} />
    <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <KitText weight={600} size={15.5} lineHeight={1.2}>{p.name}</KitText>
        {isDefault ? <KitText weight={500} size={13} color="text-muted" style={{ marginLeft: 6 }}>{st('settingsDefault')}</KitText> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {PILLARS.map(key => <View key={key} style={{ width: 16, height: 6, borderRadius: 3, backgroundColor: c[key] }} />)}
      </View>
    </View>
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      {selected ? <Icon name="check" size={18} color={k.c.accent} /> : null}
    </View>
  </Pressable>;
}

/** `.st-icons`: the three app icons, each drawn in the current palette and look. */
function IconOption({ id, name, selected, onPress }: { id: AppIconId; name: string; selected: boolean; onPress: () => void }) {
  const k = useKit(), { palette, mode } = useTheme();
  return <Pressable dim="none" testID={`appearance-icon-${id}`} accessibilityRole="radio" accessibilityLabel={name} accessibilityState={{ checked: selected }}
    onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 9, paddingVertical: 4, borderRadius: 14 }}>
    <View style={{ width: 62, height: 62, borderRadius: 15, overflow: 'hidden',
      boxShadow: selected ? `0px 0px 0px 2.5px ${k.c.bg}, 0px 0px 0px 5px ${k.c.accent}` : `0px 0px 0px 1px ${k.c['hair-2']}` }}>
      <Image source={iconArt(id, palette, mode)} style={{ width: 62, height: 62 }} accessible={false} />
    </View>
    <KitText weight={600} size={13} color={selected ? 'text' : 'text-muted'}>{name}</KitText>
  </Pressable>;
}

const DENSITY_PAD: Record<Density, number> = { airy: 14, balanced: 10, dense: 6 };

/** Settings › Appearance: Theme, Palette and App icon, then Home (the Insight map), Tab bar, Density and Accessibility. */
export default function Appearance() {
  const k = useKit();
  const { override, setOverride, palette, setPalette, mode, trueBlack, setTrueBlack, persistenceError } = useTheme();
  const [prefs, setPref] = useSettingsPrefs();
  const [shell] = useShellPrefs();
  const icon = iconId(prefs.look.icon);
  const now = st(mode === 'dark' ? 'settingsDark' : 'settingsLight');
  const shown = PAGE_KEYS.filter(key => !shell.hidden[key]).length, all = PAGE_KEYS.length;
  const showIcons = Platform.OS === 'web' || iconsSupported();

  // The home screen icon changes once, as the person leaves, and only if the icon, the palette or the look moved here.
  const latest = useRef({ icon, palette, mode }), start = useRef(`${icon}|${palette}|${mode}`);
  latest.current = { icon, palette, mode };
  useEffect(() => () => {
    const { icon: i, palette: p, mode: m } = latest.current;
    if (`${i}|${p}|${m}` !== start.current) void applyAppIcon(i, p, m);
  }, []);

  const dp = DENSITY_PAD[prefs.look.density];
  const rows: [string, string, string][] = [['training', 'Legs A', '24 min'], ['food', st('settingsLunch'), '618 kcal'], ['sleep', st('settingsNightRoutine'), '9:30 PM']];
  return <SetPage back={st('settings')} title={st('appearance')} testID="settings-appearance">
    <H first>{st('settingsTheme')}</H>
    <Panel>
      <View accessibilityRole="radiogroup" accessibilityLabel={st('settingsTheme')} style={{ flexDirection: 'row', gap: 10, paddingTop: 16, paddingHorizontal: 12, paddingBottom: 14 }}>
        <ThemeOption value="system" label={st('settingsSystem')} selected={override === 'system'} onPress={() => setOverride('system')}
          art={<MiniPhone palette={palette} look="system" half selected={override === 'system'} />} />
        <ThemeOption value="dark" label={st('settingsDark')} selected={override === 'dark'} onPress={() => setOverride('dark')}
          art={<MiniPhone palette={palette} look="dark" selected={override === 'dark'} />} />
        <ThemeOption value="light" label={st('settingsLight')} selected={override === 'light'} onPress={() => setOverride('light')}
          art={<MiniPhone palette={palette} look="light" selected={override === 'light'} />} />
      </View>
      <Cl><ListRow testID="appearance-true-black" title={st('settingsTrueBlack')} sub={st(mode === 'dark' ? 'settingsTrueBlackSub' : 'settingsTrueBlackOnlyDark')}
        toggle={trueBlack} onToggle={setTrueBlack} /></Cl>
    </Panel>
    <ListFooter>{override === 'system' ? st('settingsThemeFootSystem', { now }) : st('settingsThemeFootFixed', { now })}</ListFooter>

    <H>{st('settingsPalette')}</H>
    <Panel testID="appearance-palettes">
      <View accessibilityRole="radiogroup" accessibilityLabel={st('settingsPalette')}>
        {palettes.map((id, i) => <PaletteRow key={id} id={id} first={i === 0} selected={palette === id} onPress={() => setPalette(id)} />)}
      </View>
    </Panel>
    <ListFooter>{st('settingsPaletteFoot')}</ListFooter>

    {showIcons && <>
      <H>{st('settingsAppIcon')}</H>
      <Panel testID="appearance-icons">
        <View accessibilityRole="radiogroup" accessibilityLabel={st('settingsAppIcon')} style={{ flexDirection: 'row', gap: 8, paddingTop: 18, paddingHorizontal: 10, paddingBottom: 14 }}>
          {APP_ICONS.map(item => <IconOption key={item.id} id={item.id} name={item.name} selected={icon === item.id} onPress={() => setPref('look.icon', item.id)} />)}
        </View>
      </Panel>
      <ListFooter>{st('settingsAppIconFoot')}</ListFooter>
    </>}

    <MapSection />

    <H>{st('settingsTabBar')}</H>
    <List footer={st(shown < all ? 'settingsTabBarFootHidden' : 'settingsTabBarFoot')}>
      <ListRow testID="appearance-tab-bar" title={st('settingsTabsOnBar')} value={st('settingsNofM', { n: shown, m: all })} chevron onPress={() => router.push('/tab-bar')} />
    </List>

    <H>{st('settingsDensity')}</H>
    <Panel>
      <View style={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 14 }}>
        <SegmentedControl label={st('settingsDensity')} value={prefs.look.density} onChange={v => setPref('look.density', v)}
          options={[{ value: 'airy', label: st('settingsAiry') }, { value: 'balanced', label: st('settingsBalanced') }, { value: 'dense', label: st('settingsDense') }]} />
        <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ marginTop: 12, borderRadius: 14, overflow: 'hidden', backgroundColor: k.dark ? k.c['surface-2'] : k.c.bg }}>
          {rows.map(([color, label, value], i) => <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: dp, paddingHorizontal: 12,
            borderTopWidth: i ? 1 : 0, borderTopColor: k.c.hair }}>
            <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: alpha(k.tok(color), 0.22) }} />
            <KitText weight={600} size={13.5} style={{ flex: 1 }}>{label}</KitText>
            <KitText weight={700} size={13} color="text-muted" numeric>{value}</KitText>
          </View>)}
        </View>
      </View>
    </Panel>
    <ListFooter>{st('settingsDensityFoot')}</ListFooter>

    <H>{st('settingsAccessibility')}</H>
    <List footer={st('settingsReduceTransparencyFoot')}>
      <ListRow testID="appearance-reduce-transparency" title={st('settingsReduceTransparency')} value={st('settingsIosSettings')} chevron={false}
        right={<Icon name="ext" size={16} color={k.c.ghost} />} onPress={() => { void Linking.openSettings().catch(() => {}); }} />
    </List>
    {persistenceError && <KitText weight={500} size={13} color="danger" accessibilityRole="alert" style={{ marginTop: 12, marginHorizontal: 16 }}>{st('preferenceError')}</KitText>}
  </SetPage>;
}
