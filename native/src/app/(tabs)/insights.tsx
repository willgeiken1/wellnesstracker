import { Redirect } from 'expo-router';
import ProgressTab from './progress';

/** Insights folded into Progress: its old route opens Progress. */
export default function InsightsRoute() { return <Redirect href="/progress" />; }

/** What used to be the Insights page is now the Progress tab. */
export const InsightsPage = ProgressTab;
