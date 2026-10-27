import { TextInput, Switch, View } from 'react-native';
import { useTheme } from '../../design/theme-provider';
import { touchTarget } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { SegmentedControl } from '../../components/segmented-control';
import { t } from '../../i18n/en';
import { changeUnits, type ProfileInput, type DevicePreferences } from './model';
export function Field({label,value,onChange,numeric=false,disabled=false}:{label:string;value:string;onChange:(text:string)=>void;numeric?:boolean;disabled?:boolean}) {
  const {colors}=useTheme();return <View style={{gap:6}}><ThemedText>{label}</ThemedText><TextInput accessibilityLabel={label} value={value} onChangeText={onChange}
    autoCapitalize="none" autoCorrect={false} keyboardType={numeric?'decimal-pad':'default'} editable={!disabled}
    style={{color:colors.text,backgroundColor:colors['surface-2'],minHeight:touchTarget,padding:12,borderRadius:8,fontSize:16}}/></View>;
}
export function ProfileFields({value,onChange,settings=false}:{value:ProfileInput;onChange:(value:ProfileInput)=>void;settings?:boolean}) {
  return <>
    {settings&&<Field label={t('profileName')} value={value.name} onChange={name=>onChange({...value,name})}/>}
    <Field label={t('birthDate')} value={value.dob} onChange={dob=>onChange({...value,dob})}/>
    <SegmentedControl label={t('profileUnits')} value={value.unit} options={[{value:'lb',label:t('imperialUnits')},{value:'kg',label:t('metricUnits')}]}
      onChange={unit=>onChange(changeUnits(value,unit))}/>
    {!settings&&<ThemedText muted>{t('optionalStats')}</ThemedText>}
    <Field label={t('profileHeight').replace('{unit}',value.unit==='kg'?'cm':'in')} numeric value={value.height} onChange={height=>onChange({...value,height})}/>
    {!settings&&<Field label={t('profileWeight').replace('{unit}',value.unit)} numeric value={value.weight} onChange={weight=>onChange({...value,weight})}/>}
    <ThemedText>{t('profileSex')}</ThemedText>
    <SegmentedControl label={t('profileSex')} value={value.sex} options={[{value:'',label:t('skipSex')},{value:'male',label:t('sexMale')},{value:'female',label:t('sexFemale')}]}
      onChange={sex=>onChange({...value,sex})}/>
    {settings&&<><ThemedText>{t('activityEstimated')}</ThemedText><SegmentedControl label={t('activityLevel')} value={value.activity}
      options={[{value:'sitting',label:t('activitySitting')},{value:'light',label:t('activityLight')},{value:'active',label:t('activityActive')},{value:'very',label:t('activityVery')}]}
      onChange={activity=>onChange({...value,activity})}/><ThemedText muted>{t('profileLocalExtras')}</ThemedText></>}
  </>;
}
export function PreferenceFields({value,onChange}:{value:DevicePreferences;onChange:(value:DevicePreferences)=>void}) {
  return <><ThemedText variant="title">{t('devicePrefs')}</ThemedText><ThemedText>{t('devicePrefsHelp')}</ThemedText>
    <View style={{minHeight:touchTarget,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><ThemedText style={{flex:1}}>{t('crashReportsPref')}</ThemedText><Switch accessibilityLabel={t('crashReportsPref')} value={value.crashReports} onValueChange={crashReports=>onChange({...value,crashReports})}/></View>
    <View style={{minHeight:touchTarget,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><ThemedText style={{flex:1}}>{t('analyticsPref')}</ThemedText><Switch accessibilityLabel={t('analyticsPref')} value={value.analytics} onValueChange={analytics=>onChange({...value,analytics})}/></View></>;
}
