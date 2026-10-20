/** Never copy arbitrary exception names/messages into an outbound diagnostic. */
const classes = ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'DatabaseOpenError', 'DatabaseMigrationError'] as const;
export function bootErrorClass(error: unknown): string {
  return error instanceof Error && classes.some(name => name === error.name) ? error.name : 'Error';
}
export function supportURL(version: string, platform: string, errorClass: string): string {
  const safeVersion = /^\d+\.\d+\.\d+$/.test(version) ? version : 'unknown';
  const safePlatform = ['ios', 'android', 'web'].includes(platform) ? platform : 'unknown';
  const safeClass = classes.some(name => name === errorClass) ? errorClass : 'Error';
  return `mailto:insight.wellnessos@gmail.com?subject=${encodeURIComponent('Insight Daily app opening help')}&body=${encodeURIComponent(`App version: ${safeVersion}\nPlatform: ${safePlatform}\nError class: ${safeClass}`)}`;
}
