import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { Repository } from '../data/repository';
import type { LosingVersion } from '../data/losing-version';
import { Button } from '../components/button';
import { ThemedText } from '../components/themed-text';
import { restoreVersionLabel, t } from '../i18n/en';

/** Recovery payloads stay in SQLite; the view shows no row values or telemetry. */
export function SyncRecovery({repository}: {repository: Repository | null}) {
  const [versions,setVersions]=useState<LosingVersion[]>([]),[failed,setFailed]=useState(false);
  useEffect(()=>{
    const refresh=()=>{
      try {setVersions(repository?.losingVersions?.()??[]);setFailed(false);}
      catch {setFailed(true);}
    };
    refresh();
    const unsubscribe=repository?.subscribe?.(refresh);
    const foreground=AppState.addEventListener('change',state=>{if(state==='active')refresh();});
    const timer=setInterval(refresh,60_000);
    return ()=>{unsubscribe?.();foreground.remove();clearInterval(timer);};
  },[repository]);
  // Number by key so reordering the recovery list does not change its labels.
  const copyNumbers = new Map(versions.map(version=>version.key).sort().map((key,index)=>[key,index+1]));
  return <>
    {versions.length>0&&<>
      <ThemedText muted accessibilityLiveRegion="polite">{t('changedOtherPhone')}</ThemedText>
      <ThemedText muted>{t('restoreVersionHelp')}</ThemedText>
      {versions.map(version=><Button key={version.key}
        label={restoreVersionLabel(version.row,copyNumbers.get(version.key)!)}
        variant="secondary" onPress={()=>{
          try {
            if(!repository?.restoreLosingVersion(version.key)){setVersions(repository?.losingVersions()??[]);setFailed(true);}
          } catch {setFailed(true);}
        }}/>) }
    </>}
    {failed&&<ThemedText accessibilityRole="alert">{t('restoreVersionFailed')}</ThemedText>}
  </>;
}
