import { useState } from 'react';
import { useAuth } from '../../auth/provider';
import { Screen } from '../../components/screen';
import { Button } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { t } from '../../i18n/en';
import { ProfileFields } from './fields';
import { emptyProfile, readProfile, saveProfile } from './model';
export function Profile() {
  const {repository}=useAuth();
  const [input,setInput]=useState(()=>repository?readProfile(repository):emptyProfile()),[status,setStatus]=useState<'preferenceSaved'|'invalidProfile'|null>(null);
  return <Screen title={t('profile')}><ProfileFields value={input} settings onChange={value=>{setInput(value);setStatus(null);}}/>
    {status&&<ThemedText accessibilityRole={status==='invalidProfile'?'alert':undefined} accessibilityLiveRegion="polite">{t(status)}</ThemedText>}
    <Button label={t('saveProfileLabel')} disabled={!repository} onPress={()=>{try{if(repository)saveProfile(repository,input);setStatus('preferenceSaved');}catch{setStatus('invalidProfile');}}}/>
  </Screen>;
}
