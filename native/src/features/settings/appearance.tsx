import { Pressable, View } from 'react-native';
import Svg from 'react-native-svg';
import { RingArc } from '@/components/ring-arc';
import { INTENSITIES, MOTIONS, PRESET_IDS, PRESETS, RING_LOOKS, type Intensity, type Motion, type Preset, type RingLook } from '@/design/looks';
import { Screen } from '@/components/screen';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { SegmentedControl } from '@/components/segmented-control';
import { useTheme } from '@/design/theme-provider';
import { paletteLocked, palettes, tokens, type Palette, type ThemeOverride } from '@/design/tokens';
import { t } from '@/i18n/en';

/** One theme, drawn in its own colours for the current light or dark mode: a small card, the accent and the three pillar colours. */
function ThemeTile({ id, selected, onPress }: { id: Palette; selected: boolean; onPress: () => void }) {
  const { mode, colors } = useTheme();
  const palette = tokens.palettes[id], c = palette[mode], locked = paletteLocked(id);
  return <Pressable testID={`theme-${id}`} accessibilityRole="button"
    accessibilityLabel={locked ? `${palette.name}, ${t('themeLocked')}` : palette.name}
    accessibilityState={{ selected, disabled: locked }} disabled={locked} onPress={onPress}
    style={{ flexGrow: 1, flexBasis: '45%', minHeight: 112, padding: tokens.spacing[2], gap: tokens.spacing[1],
      borderRadius: tokens.radii.card, backgroundColor: c.bg, opacity: locked ? 0.5 : 1,
      borderWidth: 2, borderColor: selected ? colors.accent : c['hair-2'] }}>
    <View accessible={false} style={{ backgroundColor: c.surface, borderRadius: tokens.radii.input, padding: tokens.spacing[1], gap: tokens.spacing[1] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[0] }}>
        <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: c.accent }} />
        <View style={{ width: 18, height: 8, borderRadius: 4, backgroundColor: c['surface-2'] }} />
      </View>
      <View style={{ flexDirection: 'row', gap: tokens.spacing[0] }}>
        {([c.training, c.food, c.sleep] as const).map((color, index) =>
          <View key={index} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: color }} />)}
      </View>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[0] }}>
      <ThemedText variant="caption" style={{ color: c.text, flex: 1, fontWeight: selected ? '600' : '400' }}>{palette.name}</ThemedText>
      {selected && <View testID="theme-selected-mark" style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} />}
    </View>
  </Pressable>;
}

const RING_NAME = { contour: 'ringContour', liquid: 'ringLiquid', glass: 'ringGlass' } as const;
/** One ring look, shown as a small ring at 70 percent in the accent colour. */
function RingTile({ look, selected, onPress }: { look: RingLook; selected: boolean; onPress: () => void }) {
  const { colors, mode, ringMotion, intensity } = useTheme();
  return <Pressable testID={`ring-look-${look}`} accessibilityRole="button" accessibilityLabel={t(RING_NAME[look])}
    accessibilityState={{ selected }} onPress={onPress}
    style={{ flexGrow: 1, flexBasis: '28%', minHeight: 112, alignItems: 'center', justifyContent: 'center', padding: tokens.spacing[1],
      gap: tokens.spacing[1], borderRadius: tokens.radii.card, backgroundColor: colors.bg,
      borderWidth: 2, borderColor: selected ? colors.accent : colors['hair-2'] }}>
    <Svg width={64} height={64} viewBox="0 0 64 64" accessible={false}>
      <RingArc look={look} cx={32} cy={32} r={22} width={10} progress={0.7} color={colors.accent} track={colors['surface-2']}
        ink={colors.text} dark={mode === 'dark'} motion={ringMotion} intensity={intensity} />
    </Svg>
    <ThemedText variant="caption" style={{ fontWeight: selected ? '600' : '400' }}>{t(RING_NAME[look])}</ThemedText>
  </Pressable>;
}

const PRESET_NAME = { basic: ['presetBasic', 'presetBasicSub'], calm: ['presetCalm', 'presetCalmSub'], fluid: ['presetFluid', 'presetFluidSub'], glass: ['presetGlass', 'presetGlassSub'] } as const;
/** One preset: its ring, still, with its name and a line on what it sets. */
function PresetTile({ id, selected, onPress }: { id: Preset; selected: boolean; onPress: () => void }) {
  const { colors, mode, intensity } = useTheme();
  const [name, sub] = PRESET_NAME[id];
  return <Pressable testID={`preset-${id}`} accessibilityRole="button" accessibilityLabel={`${t(name)}. ${t(sub)}`}
    accessibilityState={{ selected }} onPress={onPress}
    style={{ flexGrow: 1, flexBasis: '45%', minHeight: 76, flexDirection: 'row', alignItems: 'center', padding: tokens.spacing[1],
      gap: tokens.spacing[1], borderRadius: tokens.radii.card, backgroundColor: colors.bg,
      borderWidth: 2, borderColor: selected ? colors.accent : colors['hair-2'] }}>
    <Svg width={44} height={44} viewBox="0 0 64 64" accessible={false}>
      <RingArc look={PRESETS[id].ring} cx={32} cy={32} r={22} width={10} progress={0.7} color={colors.accent} track={colors['surface-2']}
        ink={colors.text} dark={mode === 'dark'} intensity={intensity} />
    </Svg>
    <View style={{ flex: 1 }}>
      <ThemedText style={{ fontWeight: selected ? '600' : '400' }}>{t(name)}</ThemedText>
      <ThemedText muted variant="caption">{t(sub)}</ThemedText>
    </View>
  </Pressable>;
}
const MOTION_NAME = { basic: 'motionBasic', calm: 'motionCalm', lively: 'motionLively' } as const;
const STRENGTH_NAME = { 1: 'strengthSubtle', 2: 'strengthMedium', 3: 'strengthFull' } as const;

export default function Appearance() {
  const { override, setOverride, palette, setPalette, ringLook, setRingLook, persistenceError,
    preset, applyPreset, motionStyle, setMotionStyle, intensity, setIntensity, reduceMotion, reduceMotionReady } = useTheme();
  return <Screen><Card>
    <ThemedText variant="headline" accessibilityRole="header">{t('themeMode')}</ThemedText>
    <SegmentedControl label={t('themeMode')} value={override} onChange={setOverride}
      options={(['system', 'light', 'dark'] as ThemeOverride[]).map(value => ({ value, label: t(value) }))} />
  </Card><Card>
    <ThemedText variant="headline" accessibilityRole="header">{t('presets')}</ThemedText>
    <ThemedText muted variant="caption">{t(preset ? 'presetsBody' : 'presetsCustom')}</ThemedText>
    <View testID="preset-grid" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[1] }}>
      {PRESET_IDS.map(id => <PresetTile key={id} id={id} selected={preset === id} onPress={() => applyPreset(id)} />)}
    </View>
  </Card><Card>
    <ThemedText variant="headline" accessibilityRole="header">{t('theme')}</ThemedText>
    <ThemedText muted variant="caption">{t('themeBody')}</ThemedText>
    <View testID="theme-grid" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[1] }}>
      {palettes.map(id => <ThemeTile key={id} id={id} selected={palette === id} onPress={() => setPalette(id)} />)}
      {palettes.length % 2 === 1 && <View style={{ flexGrow: 1, flexBasis: '45%' }} />}
    </View>
  </Card><Card>
    <ThemedText variant="headline" accessibilityRole="header">{t('ringLooks')}</ThemedText>
    <ThemedText muted variant="caption">{t('ringLooksBody')}</ThemedText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[1] }}>
      {RING_LOOKS.map(look => <RingTile key={look} look={look} selected={ringLook === look} onPress={() => setRingLook(look)} />)}
    </View>
  </Card><Card>
    <ThemedText variant="headline" accessibilityRole="header">{t('motionTitle')}</ThemedText>
    <SegmentedControl label={t('motionTitle')} value={motionStyle} onChange={setMotionStyle}
      options={MOTIONS.map((value: Motion) => ({ value, label: t(MOTION_NAME[value]) }))} />
    {reduceMotionReady && reduceMotion && <ThemedText testID="motion-reduced" muted variant="caption">{t('motionReduced')}</ThemedText>}
    <ThemedText variant="headline" accessibilityRole="header">{t('strengthTitle')}</ThemedText>
    <ThemedText muted variant="caption">{t('strengthBody')}</ThemedText>
    <SegmentedControl label={t('strengthTitle')} value={String(intensity)} onChange={value => setIntensity(Number(value) as Intensity)}
      options={INTENSITIES.map(value => ({ value: String(value), label: t(STRENGTH_NAME[value]) }))} />
    <ThemedText muted variant="caption">{t('appearanceHint')}</ThemedText>
    {persistenceError && <ThemedText accessibilityRole="alert">{t('preferenceError')}</ThemedText>}
  </Card></Screen>;
}
