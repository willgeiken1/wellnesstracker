import { useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { randomUUID } from 'expo-crypto';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { GRABBER_ROOM, Icon, SegmentedControl, Sheet, font, mix, useKit, Tappable } from '@/components/kit';
import { useAuth } from '@/auth/provider';
import { t } from '@/i18n/en';
import { showToast } from '@/features/shell/toast';
import { today as todayKey } from '@/features/onboarding/model';
import { dShort, type Pose } from '../model';
import { fill } from '../format';
import { addPhoto } from '../local';
import { keepPhoto } from '../photo-file';
import { useProgress } from '../use-progress';
import { PhotoBox } from '../tiles/more';
import { Figure } from '../tiles/ui';

const POSES: readonly Pose[] = ['Front', 'Side', 'Back'];
const poseWord = (p: Pose) => t(p === 'Side' ? 'progressPoseSide' : p === 'Back' ? 'progressPoseBack' : 'progressPoseFront');

/** The four corner marks of the viewfinder. */
function Corners({ ink }: { ink: string }) {
  const c = mix(ink, 'transparent', 0.7), b = 2.5;
  const at = [{ left: 18, top: 52, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 8 }, { right: 18, top: 52, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 8 },
    { left: 18, bottom: 18, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 8 }, { right: 18, bottom: 18, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 8 }];
  return <>{at.map((s, i) => <View key={i} pointerEvents="none" style={[{ position: 'absolute', width: 26, height: 26, borderWidth: b, borderColor: c }, s]} />)}</>;
}

/**
 * Take a progress photo: the camera with the last photo's outline to line up with, Front, Side or Back, an optional
 * 3 second timer, and the shutter. The photo is saved on this phone only.
 */
export function PhotoCaptureSheet() {
  const d = useProgress(), k = useKit(), auth = useAuth(), repo = auth.repository;
  const [permission, ask] = useCameraPermissions();
  const cam = useRef<CameraView>(null), flash = useRef(new Animated.Value(0)).current;
  const [pose, setPose] = useState<Pose>('Front'), [front, setFront] = useState(true), [timer, setTimer] = useState(false), [busy, setBusy] = useState(false);
  const live = !!permission?.granted;
  const last = d.photos.length ? d.photos[d.photos.length - 1] : null;
  const ink = k.pillInk;
  useEffect(() => { if (permission && !permission.granted && permission.canAskAgain) void ask(); }, [permission, ask]);
  const shoot = async () => {
    if (busy || !repo) return;
    if (!live || !cam.current) { if (permission?.canAskAgain) void ask(); else showToast(t('progressCameraOff'), { color: 'warning' }); return; }
    setBusy(true);
    try {
      if (timer) { showToast(t('progressPhotoIn3'), { color: 'sleep', ms: 1400 }); await new Promise(r => setTimeout(r, 3000)); }
      if (!k.reduceMotion) { flash.setValue(0.9); Animated.timing(flash, { toValue: 0, duration: 450, useNativeDriver: true }).start(); }
      const shot = await cam.current.takePictureAsync({ quality: 0.85 });
      if (!shot?.uri) throw new Error('no photo');
      const id = randomUUID(), uri = await keepPhoto(shot.uri, id);
      addPhoto(repo, { id, day: todayKey(), kg: null, pose, uri });
      router.back();
      showToast(fill(t('progressPhotoSaved'), { pose: poseWord(pose) }), { color: 'sleep' });
    } catch {
      showToast(t('progressPhotoFailed'), { color: 'warning' });
    } finally { setBusy(false); }
  };
  return <Sheet scroll={false} gap={0}>
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 4, marginTop: GRABBER_ROOM, marginBottom: 4 }}>
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        <Tappable dim="text" onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('kitCancel')} style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 8, marginLeft: -8 }}>
          <Text style={[font(500, 17, undefined, -0.01), { color: k.c.accent }]}>{t('kitCancel')}</Text></Tappable></View>
      <Text accessibilityRole="header" style={[font(700, 17, undefined, -0.02), { color: k.c.text }]}>{t('progressPhotoTitle')}</Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Tappable dim="text" onPress={() => { setFront(!front); showToast(t(front ? 'progressBackCamera' : 'progressFrontCamera'), { color: 'sleep' }); }} accessibilityRole="button" accessibilityLabel={t('progressSwitchCamera')}
          style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}><Icon name="flip" size={24} color={k.c.accent} /></Tappable></View>
    </View>
    <Tappable dim="none" onPress={live ? undefined : () => { if (permission?.canAskAgain) void ask(); }} accessible accessibilityRole="image" accessibilityLabel={t('progressCameraAria')}
      style={{ height: 470, borderRadius: 22, overflow: 'hidden', backgroundColor: k.pill }}>
      {live ? <CameraView ref={cam} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} facing={front ? 'front' : 'back'} mirror={front} animateShutter={false} />
        : <Svg style={{ position: 'absolute', left: 0, top: 0 }} width="100%" height="100%">
            <Defs>{/* radial-gradient(120% 80% at 50% 30%): a unit circle stretched to 1.2 widths by 0.8 heights about its centre, which draws the same oval on every platform */}
              <RadialGradient id="cam" cx="0.5" cy="0.3" r="1" fx="0.5" fy="0.3" gradientTransform="translate(0.5 0.3) scale(1.2 0.8) translate(-0.5 -0.3)"><Stop offset="0" stopColor={mix(k.pill, k.c.recovery, 0.8)} /><Stop offset="0.7" stopColor={k.pill} /><Stop offset="1" stopColor={k.pill} /></RadialGradient></Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#cam)" /></Svg>}
      {[33.3, 66.7].map(p => <View key={`v${p}`} pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: `${p}%`, width: 1, backgroundColor: mix(ink, 'transparent', 0.14) }} />)}
      {[33.3, 66.7].map(p => <View key={`h${p}`} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: `${p}%`, height: 1, backgroundColor: mix(ink, 'transparent', 0.14) }} />)}
      <Figure pose={pose} w={last?.fig ?? 15} ghost style={{ position: 'absolute', left: '50%', top: 56, height: 380, width: 272, marginLeft: -136 }} />
      <Corners ink={ink} />
      <View pointerEvents="none" style={{ position: 'absolute', top: 14, left: 0, right: 0, alignItems: 'center' }}>
        <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: mix(ink, 'transparent', 0.14) }}>
          <Text style={[font(700, 12), { color: ink }]}>{!live && permission && !permission.canAskAgain ? t('progressCameraOff')
            : last ? fill(t('progressLineUp'), { day: dShort(last.day), pose: poseWord(pose).toLowerCase() }) : t('progressLineUpFirst')}</Text></View>
      </View>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: ink, opacity: flash }} />
    </Tappable>
    <View style={{ marginTop: 14 }}>
      <SegmentedControl label={t('progressPose')} value={pose} onChange={setPose} options={POSES.map(p => ({ value: p, label: poseWord(p) }))} />
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingHorizontal: 8 }}>
      <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
        {last ? <Tappable dim="row" onPress={() => router.push('/progress/photos')} accessibilityRole="button" accessibilityLabel={t('progressSeeAllPhotos')}>
          <PhotoBox p={last} w={48} h={60} date={false} radius={10} /></Tappable> : null}
      </View>
      <Tappable dim="fill" onPress={() => { void shoot(); }} disabled={busy} accessibilityRole="button" accessibilityLabel={t('progressTakePhotoBtn')} accessibilityState={{ disabled: busy, busy }}
        style={{ width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: k.c.text }}>
        <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: k.c.text }} />
      </Tappable>
      <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
        <Tappable dim="fill" onPress={() => setTimer(!timer)} accessibilityRole="switch" accessibilityState={{ checked: timer }} accessibilityLabel={t('progressTimer3')}
          style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: timer ? k.c.warning : k.dark ? k.c['surface-2'] : k.c.surface, boxShadow: k.dark ? undefined : `0px 0px 0px 1px ${k.c['hair-2']}` }}>
          <Text style={[font(700, 13), { color: timer ? k.tok('on-accent') : k.c.text }]}>3s</Text></Tappable>
      </View>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 }}>
      <Icon name="lock2" size={14} color={k.c['text-muted']} /><Text style={[font(500, 12.5, 1.45), { color: k.c['text-muted'] }]}>{t('progressSavedPhoneOnly')}</Text>
    </View>
  </Sheet>;
}
