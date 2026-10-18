import { router } from 'expo-router';
import { Screen } from '../components/screen';
import { ThemedText } from '../components/themed-text';
import { Button } from '../components/button';
import { t } from '../i18n/en';
export default function Onboarding(){return <Screen><ThemedText>{t('onboardingStub')}</ThemedText><Button label={t('backHome')} onPress={()=>router.replace('/')}/></Screen>;}
