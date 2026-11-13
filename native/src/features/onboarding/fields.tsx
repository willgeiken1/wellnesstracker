import { forwardRef, useState, type ComponentRef, type ReactNode } from 'react';
import { TextInput, Switch, View, type TextInputProps } from 'react-native';
import { useTheme } from '../../design/theme-provider';
import { tokens } from '../../design/tokens';
import { touchTarget } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { StatusText } from '@/components/status-text';
import { SegmentedControl } from '../../components/segmented-control';
import { t } from '../../i18n/en';
import { ageOn, changeUnits, type ProfileInput, type DevicePreferences } from './model';
import { Group, semibold } from './parts';
import { useFieldOutline } from '@/components/field-outline';

type FieldProps = { label: string; value: string; onChange: (text: string) => void; numeric?: boolean; disabled?: boolean;
  /** A plain line under the box saying what to type. */ helper?: string;
  /** What is wrong with this field, shown under it. */ error?: string | null;
  input?: Omit<TextInputProps, 'value' | 'onChangeText' | 'style' | 'editable' | 'accessibilityLabel'> };
export type FieldInput = ComponentRef<typeof TextInput>;
/** One labelled text box. The border turns to the accent colour while it has focus. */
export const Field = forwardRef<FieldInput, FieldProps>(function Field({ label, value, onChange, numeric = false, disabled = false, helper, error, input }, ref) {
  const { colors } = useTheme();
  const outline = useFieldOutline();
  const [focused, setFocused] = useState(false);
  return <View style={{ gap: 6 }}>
    <ThemedText style={[semibold, { fontSize: 14 }]}>{label}</ThemedText>
    <TextInput ref={ref} accessibilityLabel={label} accessibilityHint={helper} value={value} onChangeText={onChange}
      autoCapitalize="none" autoCorrect={false} keyboardType={numeric ? 'decimal-pad' : 'default'} editable={!disabled}
      placeholderTextColor={colors['text-muted']} selectionColor={colors.accent} {...input}
      onFocus={event => { setFocused(true); input?.onFocus?.(event); }} onBlur={event => { setFocused(false); input?.onBlur?.(event); }}
      style={{ color: colors.text, backgroundColor: colors['surface-2'], minHeight: Math.max(touchTarget, 48), paddingHorizontal: 14, paddingVertical: tokens.spacing[2],
        borderRadius: tokens.radii.card, fontSize: 16, borderWidth: 1.5, borderColor: focused ? colors.accent : outline?.borderColor ?? colors['hair-2'], opacity: disabled ? 0.6 : 1 }} />
    {helper && <ThemedText muted variant="caption" style={{ lineHeight: 18 }}>{helper}</ThemedText>}
    {error && <StatusText accessibilityRole="alert" variant="caption" style={[semibold, { lineHeight: 18 }]}>{error}</StatusText>}
  </View>;
});

/** A label over a row of choices. */
function Choice({ label, children }: { label: string; children: ReactNode }) {
  return <View style={{ gap: 6 }}><ThemedText style={[semibold, { fontSize: 14 }]}>{label}</ThemedText>{children}</View>;
}
export type ProfileErrors = { dob?: string | null; stats?: string | null };
/** Which field the one profile check failed on, so the message sits under that field. */
export function profileErrors(profile: ProfileInput): ProfileErrors {
  return ageOn(profile.dob) === null ? { dob: t('birthDateInvalid') } : { stats: t('statsInvalid') };
}
export function ProfileFields({ value, onChange, settings = false, errors }: { value: ProfileInput; onChange: (value: ProfileInput) => void; settings?: boolean; errors?: ProfileErrors }) {
  return <>
    <Group testID="profile-basics">
      {settings && <Field label={t('profileName')} value={value.name} onChange={name => onChange({ ...value, name })}
        input={{ autoCapitalize: 'words', autoComplete: 'name', textContentType: 'name' }} />}
      <Field label={t('birthDate')} value={value.dob} onChange={dob => onChange({ ...value, dob })} helper={t('birthDateHelp')} error={errors?.dob}
        input={{ placeholder: t('birthDatePlaceholder'), keyboardType: 'numbers-and-punctuation', maxLength: 10, autoComplete: 'off', textContentType: 'none' }} />
      <Choice label={t('profileUnits')}>
        <SegmentedControl label={t('profileUnits')} value={value.unit} options={[{ value: 'lb', label: t('imperialUnits') }, { value: 'kg', label: t('metricUnits') }]}
          onChange={unit => onChange(changeUnits(value, unit))} />
      </Choice>
    </Group>
    <Group testID="profile-stats" title={t('bodyStats')} body={settings ? undefined : t('optionalStats')}>
      <Field label={t('profileHeight').replace('{unit}', value.unit === 'kg' ? 'cm' : 'in')} numeric value={value.height} onChange={height => onChange({ ...value, height })} />
      {!settings && <Field label={t('profileWeight').replace('{unit}', value.unit)} numeric value={value.weight} onChange={weight => onChange({ ...value, weight })} />}
      {errors?.stats && <StatusText accessibilityRole="alert" variant="caption" style={[semibold, { lineHeight: 18 }]}>{errors.stats}</StatusText>}
      <Choice label={t('profileSex')}>
        <SegmentedControl label={t('profileSex')} value={value.sex} options={[{ value: '', label: t('skipSex') }, { value: 'male', label: t('sexMale') }, { value: 'female', label: t('sexFemale') }]}
          onChange={sex => onChange({ ...value, sex })} />
      </Choice>
      {settings && <>
        <Choice label={t('activityEstimated')}>
          <SegmentedControl label={t('activityLevel')} value={value.activity}
            options={[{ value: 'sitting', label: t('activitySitting') }, { value: 'light', label: t('activityLight') }, { value: 'active', label: t('activityActive') }, { value: 'very', label: t('activityVery') }]}
            onChange={activity => onChange({ ...value, activity })} />
        </Choice>
        <ThemedText muted variant="caption" style={{ lineHeight: 18 }}>{t('profileLocalExtras')}</ThemedText>
      </>}
    </Group>
  </>;
}

function Toggle({ label, value, onChange, first = false }: { label: string; value: boolean; onChange: (value: boolean) => void; first?: boolean }) {
  const { colors } = useTheme();
  return <View style={{ minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacing[2],
    paddingVertical: tokens.spacing[1], borderTopWidth: first ? 0 : 1, borderTopColor: colors['surface-2'] }}>
    <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
    <Switch hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors['hair-2'] }} />
  </View>;
}
export function PreferenceFields({ value, onChange }: { value: DevicePreferences; onChange: (value: DevicePreferences) => void }) {
  return <Group testID="device-preferences" title={t('devicePrefs')} body={t('devicePrefsHelp')}>
    <View>
      <Toggle first label={t('crashReportsPref')} value={value.crashReports} onChange={crashReports => onChange({ ...value, crashReports })} />
      <Toggle label={t('analyticsPref')} value={value.analytics} onChange={analytics => onChange({ ...value, analytics })} />
    </View>
  </Group>;
}
