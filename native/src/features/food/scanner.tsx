import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Picker } from '@react-native-picker/picker';
import type { Repository } from '../../data/repository';
import { Button } from '../../components/button';
import { ThemedText } from '../../components/themed-text';
import { useTheme } from '../../design/theme-provider';
import { Field } from '../onboarding/fields';
import { t } from '../../i18n/en';
import { calorieMismatch, lookupBarcode, normalizeBarcode, scannedPortion, type ScannedFood } from './barcode';
import type { Food } from './model';
export function FoodScanner({repo,onChoose,onManual,onClose}:{repo:Repository;onChoose:(food:Food)=>void;onManual:()=>void;onClose:()=>void}) {
  const {colors}=useTheme();
  const [permission,requestPermission]=useCameraPermissions();
  const [camera,setCamera]=useState(false),[torch,setTorch]=useState(false),[code,setCode]=useState('');
  const [busy,setBusy]=useState(false),[result,setResult]=useState<ScannedFood|null>(null),[message,setMessage]=useState<string|null>(null);
  const [grams,setGrams]=useState(100),[macro,setMacro]=useState(false),[saveError,setSaveError]=useState(false);
  const lock=useRef(false),generation=useRef(0),cameraOpen=useRef(false),request=useRef<AbortController|null>(null);
  const [denied,setDenied]=useState(false);
  useEffect(()=>()=>{generation.current++;cameraOpen.current=false;request.current?.abort();},[]);
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>{if(state!=='active'){cameraOpen.current=false;setCamera(false);setTorch(false);}});return ()=>sub.remove();},[]);
  async function lookup(value:string) {
    if(lock.current)return;lock.current=true;const current=++generation.current;
    request.current=new AbortController();cameraOpen.current=false;
    setBusy(true);setCamera(false);setTorch(false);setMessage(null);setResult(null);setMacro(false);setSaveError(false);
    try {
      const found=await lookupBarcode(repo,value,undefined,request.current.signal);
      if(current!==generation.current)return;
      setResult(found);setGrams(found?.servingGrams??100);if(!found)setMessage(t('barcodeNotFound'));
    } catch {if(current===generation.current)setMessage(t('barcodeFailure'));}
    finally {lock.current=false;if(current===generation.current)setBusy(false);}
  }
  return <View style={{gap:8}}>
    <ThemedText variant="headline">{t('barcodeTitle')}</ThemedText>
    <ThemedText muted>{t('barcodePrivacy')}</ThemedText>
    {!result&&<>
      <Button label={t('barcodeCamera')} disabled={busy} onPress={async()=>{
        try {const granted=permission?.granted?permission:await requestPermission();cameraOpen.current=granted.granted;setCamera(granted.granted);setDenied(!granted.granted);if(!granted.granted)setMessage(t('barcodeDenied'));}
        catch {setDenied(true);setMessage(t('barcodeDenied'));}
      }}/>
      {camera&&<><CameraView style={{height:240}} facing="back" enableTorch={torch} animateShutter={false}
        barcodeScannerSettings={{barcodeTypes:['ean13','ean8','upc_a','upc_e']}} onMountError={()=>{cameraOpen.current=false;setDenied(true);setCamera(false);setTorch(false);setMessage(t('barcodeDenied'));}}
        onBarcodeScanned={({data,type})=>{if(!cameraOpen.current)return;cameraOpen.current=false;try {const normalized=normalizeBarcode(data,type);setCode(normalized);void lookup(normalized);}catch{setCamera(false);setMessage(t('barcodeFailure'));}}}/>
        <Button label={t(torch?'barcodeTorchOff':'barcodeTorchOn')} variant="secondary" onPress={()=>setTorch(!torch)}/></>}
      <Field label={t('barcodeCode')} value={code} onChange={setCode} numeric disabled={busy}/>
      <Button label={t('barcodeLookup')} disabled={busy||!code} onPress={()=>void lookup(code.trim())}/>
    </>}
    {busy&&<ThemedText accessibilityLiveRegion="polite">{t('barcodeLoading')}</ThemedText>}
    {message&&<ThemedText accessibilityLiveRegion="polite">{message}</ThemedText>}
    {result&&<>
      <ThemedText>{String(result.food.name)}</ThemedText><ThemedText muted>{t('barcodeSource')}</ThemedText>
      <Picker accessibilityLabel={t('barcodeServing')} selectedValue={grams} onValueChange={value=>setGrams(Number(value))} style={{color:colors.text}}>
        {result.servingGrams!==null&&result.servingGrams!==100&&result.servingGrams!==50&&<Picker.Item label={t('barcodeLabelServing').replace('{grams}',String(result.servingGrams))} value={result.servingGrams}/>}
        <Picker.Item label={t('barcode100g')} value={100}/><Picker.Item label={t('barcode50g')} value={50}/>
      </Picker>
      {calorieMismatch(result.food).mismatch&&<><ThemedText muted>{t(macro?'barcodeMacroSelected':'barcodeMismatch')}</ThemedText><Button label={t(macro?'barcodeUseLabel':'barcodeUseMacros')} variant="secondary" onPress={()=>setMacro(!macro)}/></>}
      <ThemedText>{t('foodEnergy').replace('{value}',result.food.energy_kj===null?'—':String(Math.round(Number(scannedPortion(result,grams,macro).energy_kj)/4.184)))}</ThemedText>
      <Button label={t('barcodeChoose')} onPress={()=>{try {onChoose(scannedPortion(result,grams,macro));}catch{setSaveError(true);}}}/>
      {saveError&&<ThemedText accessibilityRole="alert">{t('foodFailure')}</ThemedText>}
      <Button label={t('barcodeAgain')} variant="secondary" onPress={()=>{setResult(null);setMessage(null);}}/>
    </>}
    <Button label={t('barcodeManual')} variant="secondary" onPress={onManual}/>
    {denied&&<Button label={t('barcodeSettings')} variant="secondary" onPress={()=>{void Linking.openSettings().catch(()=>setMessage(t('barcodeDenied')));}}/>}
    <Button label={t('cancel')} variant="secondary" onPress={onClose}/>
  </View>;
}
