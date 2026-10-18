import { Redirect, useLocalSearchParams } from 'expo-router';
export default function StartWorkout() { const {routine}=useLocalSearchParams<{routine?:string}>();return <Redirect href={{pathname:'/workout',params:routine?{routine}:{}}}/>; }
