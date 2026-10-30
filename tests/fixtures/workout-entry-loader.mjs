import {readFile} from 'node:fs/promises';

export async function load(url,context,nextLoad) {
 if(url.endsWith('/_shared/http.ts')) {
  const source=await readFile(new URL(url),'utf8');
  // Node 22.6's TypeScript translator requires bytes rather than a string.
  return {format:'module-typescript',shortCircuit:true,source:Buffer.from(source.slice(source.indexOf('export const cors'),source.indexOf('export function serverKey'))+'\nexport const requireUser=globalThis.workoutEntryTestDeps.requireUser;')};
 }
 if(url.endsWith('/_shared/quota.ts')) return {format:'module',shortCircuit:true,source:'export const {consumeQuota,releaseQuota}=globalThis.workoutEntryTestDeps;'};
 return nextLoad(url,context);
}
