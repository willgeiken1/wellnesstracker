import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Picker } from '@react-native-picker/picker';
import type { Repository } from '../../data/repository';
import { ThemedText } from '../../components/themed-text';
import { useTheme } from '../../design/theme-provider';
import { tokens } from '../../design/tokens';
import { t } from '../../i18n/en';
import { calorieMismatch, lookupBarcode, normalizeBarcode, scannedPortion, type ScannedFood } from './barcode';
import type { Food } from './model';
import { FieldRow, Glyph, Group, GroupLabel, ItemRow, kcalOf, macroText, NoticeRow, PanelHeader, PrimaryAction, QuietAction, semibold, SoftAction } from './parts';

/** Four corner marks that show where to hold the barcode. Drawn over the camera, or over the idle panel in a quieter colour. */
function FrameGuide({ color }: { color: string }) {
  const corner = { position: 'absolute', width: 26, height: 26, borderColor: color } as const, edge = 3, inset = '14%', top = '22%';
  return <View pointerEvents="none" accessible={false} testID="barcode-frame" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
    <View style={[corner, { top, left: inset, borderTopWidth: edge, borderLeftWidth: edge, borderTopLeftRadius: 8 }]} />
    <View style={[corner, { top, right: inset, borderTopWidth: edge, borderRightWidth: edge, borderTopRightRadius: 8 }]} />
    <View style={[corner, { bottom: top, left: inset, borderBottomWidth: edge, borderLeftWidth: edge, borderBottomLeftRadius: 8 }]} />
    <View style={[corner, { bottom: top, right: inset, borderBottomWidth: edge, borderRightWidth: edge, borderBottomRightRadius: 8 }]} />
  </View>;
}
/**
 * Barcode lookup: the camera with a framing guide, or the number typed by hand.
 * `onSearch`, when given, adds a row that leads to food search.
 */
export function FoodScanner({repo,onChoose,onManual,onClose,onSearch}:{repo:Repository;onChoose:(food:Food)=>void;onManual:()=>void;onClose:()=>void;onSearch?:()=>void}) {
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
  const chosen=result?scannedPortion(result,grams,macro):null,chosenKcal=chosen&&result!.food.energy_kj!==null?kcalOf(chosen.energy_kj):null;
  return <View style={{gap:tokens.spacing[2]}} testID="food-scanner">
    <PanelHeader title={t('barcodeTitle')} action={{label:t('cancel'),onPress:onClose}}/>
    {!result&&<>
      {camera?<View style={{height:240,borderRadius:16,overflow:'hidden',backgroundColor:colors['surface-2']}}>
        <CameraView style={{flex:1}} facing="back" enableTorch={torch} animateShutter={false}
        barcodeScannerSettings={{barcodeTypes:['ean13','ean8','upc_a','upc_e']}} onMountError={()=>{cameraOpen.current=false;setDenied(true);setCamera(false);setTorch(false);setMessage(t('barcodeDenied'));}}
        onBarcodeScanned={({data,type})=>{if(!cameraOpen.current)return;cameraOpen.current=false;try {const normalized=normalizeBarcode(data,type);setCode(normalized);void lookup(normalized);}catch{setCamera(false);setMessage(t('barcodeFailure'));}}}/>
        <FrameGuide color={colors.accent}/>
        <Pressable accessibilityRole="button" accessibilityLabel={t(torch?'barcodeTorchOff':'barcodeTorchOn')} accessibilityState={{selected:torch}} onPress={()=>setTorch(!torch)}
          style={({pressed})=>({position:'absolute',right:10,bottom:10,minHeight:44,paddingHorizontal:14,borderRadius:22,flexDirection:'row',alignItems:'center',gap:6,backgroundColor:torch?colors.accent:colors.surface,opacity:pressed?0.75:1})}>
          <Glyph name="torch" size={18} color={torch?colors['on-accent']:colors.text}/>
          <ThemedText style={[semibold,{fontSize:14,color:torch?colors['on-accent']:colors.text}]}>{t(torch?'barcodeTorchLabelOn':'barcodeTorchLabel')}</ThemedText>
        </Pressable>
      </View>:<View style={{borderRadius:16,backgroundColor:colors['surface-2'],paddingHorizontal:tokens.spacing[3],paddingVertical:tokens.spacing[4],gap:tokens.spacing[2],alignItems:'center'}} testID={denied?'barcode-camera-off':'barcode-camera-idle'}>
        <Glyph name={denied?'cameraOff':'scan'} size={34} color={colors['text-muted']} width={1.6}/>
        <ThemedText style={[semibold,{textAlign:'center'}]}>{t(denied?'barcodeCameraOff':'barcodeCameraIdle')}</ThemedText>
        <ThemedText muted variant="caption" accessibilityLiveRegion="polite" style={{textAlign:'center'}}>{t(denied?'barcodeDenied':'barcodeCameraIdleBody')}</ThemedText>
        <View style={{alignSelf:'stretch',gap:tokens.spacing[1]}}>
          <PrimaryAction label={t('barcodeCamera')} disabled={busy} onPress={async()=>{
            try {const granted=permission?.granted?permission:await requestPermission();cameraOpen.current=granted.granted;setCamera(granted.granted);setDenied(!granted.granted);if(!granted.granted)setMessage(t('barcodeDenied'));}
            catch {setDenied(true);setMessage(t('barcodeDenied'));}
          }}/>
          {denied&&<SoftAction label={t('barcodeSettings')} onPress={()=>{void Linking.openSettings().catch(()=>setMessage(t('barcodeDenied')));}}/>}
        </View>
      </View>}
      {camera&&<ThemedText muted variant="caption" style={{textAlign:'center'}}>{t('barcodeInstruction')}</ThemedText>}
      <View style={{gap:6}}>
        <GroupLabel>{t('barcodeTypeIt')}</GroupLabel>
        <Group><FieldRow first label={t('barcodeCode')} title={t('barcodeCodeShort')} placeholder={t('barcodeCodeHint')} value={code} onChange={setCode} numeric integer disabled={busy}/></Group>
        <SoftAction label={t('barcodeLookup')} disabled={busy||!code} onPress={()=>void lookup(code.trim())}/>
      </View>
    </>}
    {busy&&<NoticeRow busy text={t('barcodeLoading')}/>}
    {message&&!(denied&&!camera&&!result&&message===t('barcodeDenied'))&&<NoticeRow text={message} action={message===t('barcodeFailure')&&code&&!busy?{label:t('foodRetry'),onPress:()=>void lookup(code.trim())}:undefined}/>}
    {result&&chosen&&<>
      <View style={{gap:2}}>
        <ThemedText variant="headline" style={semibold}>{String(result.food.name)}</ThemedText>
        <ThemedText numeric style={{fontSize:26,lineHeight:32,fontWeight:'600'}} testID="barcode-energy">{chosenKcal===null?t('barcodeNoCalories'):chosenKcal.toLocaleString('en-US')}
          {chosenKcal!==null&&<ThemedText muted variant="caption">{' '}{t('foodUnitKcal')}</ThemedText>}</ThemedText>
        {macroText(chosen)&&<ThemedText muted numeric variant="caption">{macroText(chosen)}</ThemedText>}
      </View>
      <View style={{gap:6}}>
        <GroupLabel>{t('barcodeServing')}</GroupLabel>
        <Group>
      <Picker accessibilityLabel={t('barcodeServing')} selectedValue={grams} onValueChange={value=>setGrams(Number(value))} style={{color:colors.text}} itemStyle={{color:colors.text}}>
        {result.servingGrams!==null&&result.servingGrams!==100&&result.servingGrams!==50&&<Picker.Item label={t('barcodeLabelServing').replace('{grams}',String(result.servingGrams))} value={result.servingGrams}/>}
        <Picker.Item label={t('barcode100g')} value={100}/><Picker.Item label={t('barcode50g')} value={50}/>
      </Picker>
        </Group>
      </View>
      {calorieMismatch(result.food).mismatch&&<NoticeRow text={t(macro?'barcodeMacroSelected':'barcodeMismatch')} action={{label:t(macro?'barcodeUseLabel':'barcodeUseMacros'),onPress:()=>setMacro(!macro)}}/>}
      <PrimaryAction label={t('barcodeChoose')} onPress={()=>{try {onChoose(scannedPortion(result,grams,macro));}catch{setSaveError(true);}}}/>
      {saveError&&<NoticeRow alert text={t('foodFailure')}/>}
      <QuietAction label={t('barcodeAgain')} onPress={()=>{setResult(null);setMessage(null);}}/>
      <ThemedText muted variant="caption">{t('barcodeSource')}</ThemedText>
    </>}
    <View>
      <GroupLabel>{t('barcodeNoCode')}</GroupLabel>
      <ItemRow first label={t('barcodeManual')} title={t('barcodeManual')} glyph="chevron" onPress={onManual}/>
      {onSearch&&<ItemRow label={t('barcodeSearch')} title={t('barcodeSearch')} glyph="chevron" onPress={onSearch}/>}
    </View>
    <ThemedText muted variant="caption">{t('barcodePrivacy')}</ThemedText>
  </View>;
}
