import { Redirect } from 'expo-router';
/** Legacy links enter About you before any credentials or account creation. */
export default function CreateAccount(){return <Redirect href="/onboarding"/>;}
