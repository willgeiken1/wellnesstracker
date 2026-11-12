import { useState } from 'react';
import { useAuth } from '../../auth/provider';
import { Screen } from '../../components/screen';
import { ThemedText } from '../../components/themed-text';
import { t } from '../../i18n/en';
import { ProfileFields, profileErrors } from './fields';
import { Notice, PrimaryButton } from './parts';
import { emptyProfile, readProfile, saveProfile, validProfile } from './model';
export function Profile() {
  const {repository}=useAuth();
  const [input,setInput]=useState(()=>repository?readProfile(repository):emptyProfile()),[status,setStatus]=useState<'preferenceSaved'|'invalidProfile'|null>(null);
  // The profile check and a failed write share one status. A profile that passes the check failed on the write.
  const invalid=status==='invalidProfile'&&!validProfile(input),unsaved=status==='invalidProfile'&&!invalid;
  const save=()=>{try{if(repository)saveProfile(repository,input);setStatus('preferenceSaved');}catch{setStatus('invalidProfile');}};
  return <Screen title={t('profile')}>
    <ProfileFields value={input} settings errors={invalid?profileErrors(input):undefined} onChange={value=>{setInput(value);setStatus(null);}}/>
    {status==='preferenceSaved'&&<ThemedText testID="profile-saved" muted variant="caption" accessibilityLiveRegion="polite" style={{textAlign:'center'}}>{t(status)}</ThemedText>}
    {invalid&&<Notice testID="profile-invalid" text={t('profileCheckFields')}/>}
    {unsaved&&<Notice testID="profile-save-error" text={t('workoutSaveError')} onRetry={save}/>}
    <PrimaryButton testID="profile-save" label={t('saveProfileLabel')} disabled={!repository} onPress={save}/>
  </Screen>;
}
