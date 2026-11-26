import { BarBackdrop } from '@/components/blur-bar';
import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Linking, Platform, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, RadialGradient, Stop } from 'react-native-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, Icon, KitText, SheetHeader, Tappable, TextField, mix, useKit } from '@/components/kit';
import type { Repository } from '@/data/repository';
import { t } from '@/i18n/en';
import { fill } from '../tiles/ui';
import { mealName, quickAdd } from './actions';
import { calorieMismatch, lookupBarcode, normalizeBarcode, scannedPortion, type ScannedFood } from './barcode';
import { addToCart, cartItem, currentCart } from './cart';
import { dayView, kcalOf, nextMealId, num } from './day';
import type { Food } from './model';
import { foodRoutes } from './nav';
import { useFoodDay } from './selection';
import { closeSheet, foodKey, FoodSheet } from './sheet';
import { Caption } from './ui';
import { showToast } from '../shell/toast';

const CAM_H = 420;
const web = Platform.OS === 'web';
type Phase = 'looking' | 'busy' | 'found' | 'missing' | 'failed';

/** The food a scan adds: one label serving, or 100 g when the label gives none, with the barcode kept beside it. */
export function scannedFood(product: ScannedFood, code: string): Food {
  return { ...scannedPortion(product, product.servingGrams ?? 100, false), barcode: code };
}

/**
 * Scan barcode (`barcode`): the camera fills the top with a frame to line the barcode up in, a torch and a way to
 * type the number. A match shows the product with its macros and Add. Only the barcode is sent to Open Food Facts.
 * On the web there is no live camera: the frame sits over a still picture, and typing the number still works.
 */
export function BarcodeSheet({ repo, meal: asked }: { repo: Repository; meal?: string }) {
  const k = useKit();
  const { day, today } = useFoodDay();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('looking'), [torch, setTorch] = useState(false), [typing, setTyping] = useState(false);
  const [code, setCode] = useState(''), [product, setProduct] = useState<ScannedFood | null>(null);
  const meal = currentCart()?.meal ?? asked ?? nextMealId(dayView(repo, today, { today }));
  const lock = useRef(false), gen = useRef(0), abort = useRef<AbortController | null>(null);
  useEffect(() => () => { gen.current++; abort.current?.abort(); }, []);
  useEffect(() => { const sub = AppState.addEventListener('change', s => { if (s !== 'active') setTorch(false); }); return () => sub.remove(); }, []);
  useEffect(() => { if (!web && permission && !permission.granted && permission.canAskAgain) void requestPermission(); }, [permission, requestPermission]);

  const lookup = async (raw: string) => {
    if (lock.current) return;
    let value: string;
    try { value = normalizeBarcode(raw); } catch { setPhase('failed'); return; }
    lock.current = true; const mine = ++gen.current; abort.current = new AbortController();
    setCode(value); setPhase('busy'); setTorch(false); setTyping(false);
    try {
      const found = await lookupBarcode(repo, value, undefined, abort.current.signal);
      if (mine !== gen.current) return;
      setProduct(found); setPhase(found ? 'found' : 'missing');
    } catch { if (mine === gen.current) setPhase('failed'); } finally { lock.current = false; }
  };
  const again = () => { gen.current++; setProduct(null); setCode(''); setPhase('looking'); };
  const food = product ? scannedFood(product, code) : null, kcal = food ? kcalOf(food.energy_kj) : null, mn = mealName(repo, meal).toLowerCase();
  const add = () => {
    if (!food) return;
    if (currentCart()) { addToCart([cartItem(foodKey(food), food)]); closeSheet(); showToast(t('foodAddedToYourList'), { color: 'food' }); return; }
    closeSheet(); quickAdd(repo, day, meal, food);
  };
  const granted = !!permission?.granted, live = !web && granted && phase === 'looking';
  const found = phase === 'found';
  const hint = found ? t('foodBarcodeFound') : phase === 'busy' ? t('barcodeLoading') : t('foodLineUp');

  return <FoodSheet testID="food-barcode-sheet" bg="bg" header={<SheetHeader title={t('foodTileScan')} left={t('cancel')} onLeft={() => closeSheet()} />}>
    <View accessible accessibilityRole="image" accessibilityLabel={found ? t('foodBarcodeFound') : t('foodCameraA11y')}
      style={{ height: CAM_H, marginHorizontal: -16, overflow: 'hidden', backgroundColor: k.c.bg }}>
      <Backdrop torch={torch} />
      {live ? <CameraView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} facing="back" enableTorch={torch} animateShutter={false}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }} onMountError={() => setPhase('failed')}
        onBarcodeScanned={({ data, type }) => { if (lock.current || phase !== 'looking') return; try { void lookup(normalizeBarcode(data, type)); } catch { /* keeps looking */ } }} /> : null}
      {!live && (web || found || phase === 'busy') ? <Package code={code} /> : null}
      <Frame done={found} scanning={phase === 'looking'} />
      <View style={{ position: 'absolute', top: 302, left: 0, right: 0, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, overflow: 'hidden' }}>
          <BarBackdrop color={k.c.bg} amount={0.72} blur={12} saturate={1} />
          {found ? <Icon name="check" size={16} color={k.c.success} /> : null}
          <KitText weight={600} size={13.5} color={found ? 'success' : 'text'} accessibilityLiveRegion="polite">{hint}</KitText>
        </View>
      </View>
      {!web && !granted && permission && phase === 'looking' ? <View style={{ position: 'absolute', top: 40, left: 16, right: 16, alignItems: 'center', gap: 8 }}>
        <KitText weight={600} size={15} style={{ textAlign: 'center' }}>{t('barcodeCameraOff')}</KitText>
        <Button size="sm" variant="secondary" label={permission.canAskAgain ? t('foodAllowCamera') : t('barcodeSettings')}
          onPress={() => { if (permission.canAskAgain) void requestPermission(); else void Linking.openSettings().catch(() => {}); }} />
      </View> : null}
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={t(torch ? 'barcodeTorchOff' : 'barcodeTorchOn')} accessibilityState={{ selected: torch }}
          disabled={!live} onPress={() => setTorch(!torch)}
          style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: torch ? k.c.text : undefined }}>
          {torch ? null : <BarBackdrop color={k.c['surface-2']} amount={0.8} blur={12} saturate={1} />}
          <Icon name="fd-torch" size={20} color={torch ? k.c.bg : k.c.text} />
        </Tappable>
        <Tappable dim="fill" accessibilityRole="button" accessibilityLabel={t('foodTypeNumber')} onPress={() => setTyping(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingHorizontal: 16, borderRadius: 999, overflow: 'hidden' }}>
          <BarBackdrop color={k.c['surface-2']} amount={0.8} blur={12} saturate={1} />
          <Icon name="fd-keypad" size={18} color={k.c.text} />
          <KitText weight={600} size={14}>{t('foodTypeNumber')}</KitText>
        </Tappable>
      </View>
    </View>
    {typing ? <View style={{ marginTop: 16, gap: 10 }}>
      <TextField label={t('barcodeCode')} value={code} onChangeText={setCode} placeholder={t('barcodeCodeHint')} keyboardType="number-pad" autoFocus
        returnKeyType="search" onSubmitEditing={() => code.trim() && void lookup(code.trim())} />
      <Button full color="food" label={t('barcodeLookup')} disabled={!code.trim()} onPress={() => void lookup(code.trim())} />
    </View> : null}
    {found && food ? <Found food={food} kcal={kcal} mn={mn} onAdd={add} onAgain={again}
      onDetails={() => foodRoutes.item({ food, meal, day, source: 'barcode' })} /> : null}
    {!typing && (phase === 'looking' || phase === 'busy') ? <Waiting text={phase === 'busy' ? t('barcodeLoading') : t('foodLookingFor')} /> : null}
    {phase === 'missing' || phase === 'failed' ? <View style={{ marginTop: 20, gap: 10, alignItems: 'center' }}>
      <KitText weight={600} size={15} style={{ textAlign: 'center' }}>{t(phase === 'missing' ? 'barcodeNotFound' : 'barcodeFailure')}</KitText>
      <Button color="food" variant="secondary" label={t('barcodeManual')} onPress={() => foodRoutes.quick(meal)} />
      <Button variant="quiet" label={t('foodScanAnother')} onPress={again} />
    </View> : null}
    <Caption center style={{ marginTop: 24 }}>{t('foodBarcodePrivacy')}</Caption>
  </FoodSheet>;
}

function Found({ food, kcal, mn, onAdd, onAgain, onDetails }: { food: Food; kcal: number | null; mn: string; onAdd: () => void; onAgain: () => void; onDetails: () => void }) {
  const k = useKit(), g = typeof food.amount_g === 'number' ? food.amount_g : null;
  const v = (x: unknown) => typeof x === 'number' ? `${num(x)} g` : '–';
  return <View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16, padding: 16, borderRadius: 20, backgroundColor: k.cardBg, boxShadow: k.cardEdge }}>
      <View style={{ width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: k.tint(k.c.food, 0.16) }}><Icon name="barcode" size={26} color={k.c.food} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <KitText weight={600} size={16} lineHeight={1.25}>{String(food.name ?? '')}</KitText>
        <KitText weight={500} size={13} color="text-muted" style={{ marginTop: 3 }}>{`${t('foodSrcOff')} · ${g != null ? `${num(g)} g` : t('foodOneServing')}`}</KitText>
      </View>
    </View>
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
      {([[kcal == null ? '–' : num(kcal), t('foodKcal')], [v(food.protein_g), t('foodMacroProtein')], [v(food.carbs_g), t('foodMacroCarbs')], [v(food.fat_g), t('foodMacroFat')]] as const).map(([val, label]) =>
        <View key={label} style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 10, borderRadius: 14, backgroundColor: k.cardBg, boxShadow: k.cardEdge }}>
          <KitText weight={700} size={17} numeric>{val}</KitText>
          <KitText weight={600} size={11.5} color="text-muted">{label}</KitText>
        </View>)}
    </View>
    {calorieMismatch(food).mismatch ? <Caption>{t('barcodeMismatch')}</Caption> : null}
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
      <View style={{ flex: 1 }}><Button full color="food" icon="plus" label={fill(t('foodAddToMeal'), { meal: mn })} onPress={onAdd} testID="food-barcode-add" /></View>
      <Button variant="quiet" label={t('foodDetailsBtn')} onPress={onDetails} />
    </View>
    <Tappable dim="text" accessibilityRole="button" accessibilityLabel={t('foodScanAnother')} onPress={onAgain}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, marginTop: 8 }}>
      <Icon name="repeat" size={16} color={k.c.accent} /><KitText weight={600} size={15} color="accent">{t('foodScanAnother')}</KitText>
    </Tappable>
  </View>;
}

function Waiting({ text }: { text: string }) {
  const k = useKit();
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 120 }}>
    <View style={{ flexDirection: 'row', gap: 4 }}>{[0.45, 0.7, 1].map(o => <View key={o} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: k.c.food, opacity: o }} />)}</View>
    <KitText weight={600} size={15} color="text-muted">{text}</KitText>
  </View>;
}

/** A CSS `radial-gradient(rx ry at cx cy)` for an SVG fill, all as fractions of the box: a unit circle stretched about its centre,
 * which draws the same oval on every platform. */
const oval = (cx: number, cy: number, rx: number, ry: number) => ({ cx, cy, fx: cx, fy: cy, r: 1,
  gradientTransform: `translate(${cx} ${cy}) scale(${rx} ${ry}) translate(${-cx} ${-cy})` });

/** The camera's dim surroundings: soft light from the top left and a glow lower right; brighter with the torch on. */
function Backdrop({ torch }: { torch: boolean }) {
  const k = useKit();
  return <Svg style={{ position: 'absolute', top: 0, left: 0 }} width="100%" height={CAM_H}>
    <Defs>
      <RadialGradient id="a" {...(torch ? oval(0.5, 0.45, 0.7, 0.6) : oval(0.3, 0.2, 1.2, 0.7))}>
        <Stop offset="0" stopColor={torch ? k.c.text : k.c['accent-tint']} stopOpacity={torch ? 0.22 : 1} /><Stop offset="0.6" stopColor={k.c.bg} stopOpacity={0} />
      </RadialGradient>
      <RadialGradient id="b" {...oval(0.8, 0.9, 0.9, 0.6)}><Stop offset="0" stopColor={k.c['surface-2']} /><Stop offset="0.7" stopColor={k.c.bg} stopOpacity={0} /></RadialGradient>
      <RadialGradient id="c" cx="85%" cy="22%" r="60" gradientUnits="userSpaceOnUse"><Stop offset="0" stopColor={k.c.recovery} stopOpacity={0.18} /><Stop offset="1" stopColor={k.c.recovery} stopOpacity={0} /></RadialGradient>
    </Defs>
    <Rect width="100%" height="100%" fill={k.c.bg} />
    <Rect width="100%" height="100%" fill="url(#b)" />
    <Rect width="100%" height="100%" fill="url(#a)" />
    <Rect width="100%" height="100%" fill="url(#c)" />
  </Svg>;
}

/** A still packet with a barcode, for the web and while a found product shows (`.fd-pkg`, `.fd-bc`, `.fd-bcn`). */
function Package({ code }: { code: string }) {
  const k = useKit();
  // The label's stripes repeat every 16 pt: dark at 0-2, 4-5, 8-11 and 12-13, across a 142 x 58 pt window.
  const bars: [number, number][] = [];
  for (let o = 0; o < 142; o += 16) for (const [x0, x1] of [[0, 2], [4, 5], [8, 11], [12, 13]]) if (o + x0 < 142) bars.push([o + x0, Math.min(142, o + x1) - (o + x0)]);
  return <View style={{ position: 'absolute', top: '50%', left: '50%', width: 250, height: 178, marginTop: -100, marginLeft: -125, borderRadius: 16, transform: [{ rotate: '-5deg' }],
    overflow: 'hidden', boxShadow: `0px 20px 40px ${k.tint(k.c.bg, 0.8)}` }}>
    <Svg width={250} height={178} style={{ position: 'absolute' }}>
      <Defs><LinearGradient id="p" x1="0.33" y1="0" x2="0.67" y2="1"><Stop offset="0" stopColor={mix(k.c.food, k.c['surface-2'], 0.3)} /><Stop offset="1" stopColor={k.c['surface-2']} /></LinearGradient></Defs>
      <Rect width={250} height={178} fill="url(#p)" />
    </Svg>
    <View style={{ position: 'absolute', left: 40, right: 40, top: 34, height: 96, borderRadius: 8, backgroundColor: k.tint(k.c.text, 0.9), paddingTop: 12, paddingHorizontal: 14 }}>
      <Svg width={142} height={58}>{bars.map(([x, w]) => <Rect key={x} x={x} y={0} width={w} height={58} fill={k.c.bg} />)}</Svg>
    </View>
    <KitText weight={700} size={11} tracking={0.2} numeric style={{ position: 'absolute', left: 0, right: 0, top: 110, color: k.c.bg, textAlign: 'center' }}>{code || '0 85001 24318 6'}</KitText>
  </View>;
}

/** Four corners and a dimmed surround, with a moving line while it looks (still when Reduce Motion is on). */
function Frame({ done, scanning }: { done: boolean; scanning: boolean }) {
  const k = useKit(), c = done ? k.c.success : k.c.text, W = 272, H = 164;
  const corner = (pos: object, r: object) => <View style={[{ position: 'absolute', width: 34, height: 34, borderColor: c, borderRadius: 2 }, pos, r]} />;
  return <View pointerEvents="none" style={{ position: 'absolute', top: '50%', left: '50%', width: W, height: H, marginTop: -96, marginLeft: -W / 2, borderRadius: 18,
    boxShadow: `0px 0px 0px 999px ${k.tint(k.c.bg, 0.58)}` }}>
    {corner({ left: -2, top: -2 }, { borderTopWidth: 3.5, borderLeftWidth: 3.5, borderTopLeftRadius: 18 })}
    {corner({ right: -2, top: -2 }, { borderTopWidth: 3.5, borderRightWidth: 3.5, borderTopRightRadius: 18 })}
    {corner({ left: -2, bottom: -2 }, { borderBottomWidth: 3.5, borderLeftWidth: 3.5, borderBottomLeftRadius: 18 })}
    {corner({ right: -2, bottom: -2 }, { borderBottomWidth: 3.5, borderRightWidth: 3.5, borderBottomRightRadius: 18 })}
    {scanning ? <ScanLine /> : null}
  </View>;
}

/** The line that sweeps the frame while it looks; with Reduce Motion it stays in the middle and only fades. */
function ScanLine() {
  const k = useKit(), [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const b = Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, duration: k.reduceMotion ? 1200 : 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(v, { toValue: 0, duration: k.reduceMotion ? 1200 : 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' })]));
    b.start(); return () => b.stop();
  }, [v, k.reduceMotion]);
  const style = k.reduceMotion ? { top: 82, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.9] }) }
    : { top: 20, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, 124] }) }] };
  return <Animated.View style={[{ position: 'absolute', left: 14, right: 14, height: 2, borderRadius: 2, backgroundColor: k.c.food, boxShadow: `0px 0px 14px 2px ${k.tint(k.c.food, 0.6)}` }, style]} />;
}
