import { useEffect, useState, type RefObject } from 'react';
import { useWindowDimensions } from 'react-native';
import { useTheme } from '@/design/theme-provider';
import { t } from '@/i18n/en';
import { useShellPrefs } from '@/features/shell/prefs';
import { Coach, type Hole } from './coach';
import { TIPS, TIPS_DELAY, finishTips, tipsDue, type TipsStore } from './model';
import { deviceInsetBottom, measureHole, plusHole, type Measurable } from './targets';

export interface HomeTipsProps {
  store: TipsStore | null;
  /** The hero (date, greeting, map and This week): tip 1. */
  hero: RefObject<Measurable | null>;
  /** The initial at the top right that opens Settings: tip 3. */
  avatar: RefObject<Measurable | null>;
}

/**
 * The three tips on the first Home after setup (ob-tips to ob-tips-3): Your day in one number over the hero, Log from
 * anywhere over the +, Settings live here over the initial. They show once, when setup has left `onboarding:tips` at '1',
 * never on sample data; the last tap clears the flag and marks them seen.
 */
export function HomeTips({ store, hero, avatar }: HomeTipsProps) {
  const { reduceMotion } = useTheme();
  const { width, height } = useWindowDimensions();
  const insetBottom = deviceInsetBottom();
  const [prefs] = useShellPrefs();
  const [step, setStep] = useState(-1);
  const [hole, setHole] = useState<Hole | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const W = size?.width ?? width, H = size?.height ?? height;

  // Wait for Home's own reveal before the first tip.
  useEffect(() => {
    if (!tipsDue(store)) return;
    const id = setTimeout(() => setStep(0), reduceMotion ? 60 : TIPS_DELAY);
    return () => clearTimeout(id);
  }, [store, reduceMotion]);

  useEffect(() => {
    if (step < 0) return;
    let live = true;
    const place = async () => {
      const target = TIPS[step].target;
      const next = target === 'plus' ? plusHole({ width: W, height: H, insetBottom }, 'home', prefs.hidden)
        : target === 'hero' ? await measureHole(hero.current, 4, 24) : await measureHole(avatar.current, 6, 30);
      if (live && next) setHole(next);
    };
    void place();
    // Measure again once Home has finished moving things in.
    const again = setTimeout(place, reduceMotion ? 60 : 720);
    return () => { live = false; clearTimeout(again); };
  }, [step, W, H, insetBottom, prefs.hidden, hero, avatar, reduceMotion]);

  if (step < 0 || !store) return null;
  const tip = TIPS[step];
  const next = () => {
    if (step < TIPS.length - 1) { setStep(step + 1); return; }
    finishTips(store);
    setStep(-1);
  };
  return <Coach kind="tips" hole={hole} side={tip.target === 'plus' ? 'above' : tip.target === 'hero' ? 'below' : 'auto'}
    eyebrow={t('obaTipEyebrow').replace('{n}', String(step + 1))} title={t(tip.title)} body={t(tip.body)}
    index={step} count={TIPS.length} onNext={next} onSize={setSize} />;
}
