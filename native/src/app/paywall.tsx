import { Redirect } from 'expo-router';

/** Insight has no paywall and no paid plan. An old link to this path lands on Home. */
export default function PaywallRoute() {
  return <Redirect href="/" />;
}
