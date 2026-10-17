import { router } from 'expo-router';
import { Screen } from '@/components/screen';
import { Card } from '@/components/card';
import { ListRow } from '@/components/list-row';
import { Button } from '@/components/button';
import { settingsSections } from '@/features/settings/sections';
import { t } from '@/i18n/en';
export default function Settings() {
  return <Screen><Card>{settingsSections.map(section => <ListRow key={section.route} label={t(section.label)}
    onPress={() => section.route === 'appearance' ? router.push('/settings/appearance') : router.push({ pathname: '/settings/[section]', params: { section: section.route } })} />)}</Card>
    <Button label={t('backHome')} variant="secondary" onPress={() => router.navigate('/')} /></Screen>;
}
