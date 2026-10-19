import { bootErrorClass, supportURL } from '../src/auth/boot-diagnostics';
test('support body contains exactly three allowlisted non-health fields',()=>{
 const error=Object.assign(new Error('weight=123 note=fixture email=fixture@example.test token=fixture'),{name:'fixture@example.test',health:123,notes:'fixture',access_token:'fixture'});
 const url=supportURL('1.0.0','ios',bootErrorClass(error));
 expect(url).toMatch(/^mailto:[^\s?]+\?subject=[^\s&]+&body=[^\s&]+$/);
 expect(url).toContain('%0A');
 const query=new URLSearchParams(url.split('?')[1]);
 expect(url.split('?')[0]).toBe('mailto:insight.wellnessos@gmail.com');
 expect(query.get('subject')).toBe('Insight Daily app opening help');
 expect(query.get('body')).toBe('App version: 1.0.0\nPlatform: ios\nError class: Error');
 expect(query.get('body')).not.toMatch(/weight|note|email|token|fixture|@/i);
});
test('all diagnostic inputs fail closed, even when strings carry PII',()=>{
 const body=new URLSearchParams(supportURL('fixture@example.test','token=fixture','health=123').split('?')[1]).get('body');
 expect(body).toBe('App version: unknown\nPlatform: unknown\nError class: Error');
 expect(bootErrorClass(new TypeError('private fixture'))).toBe('TypeError');
 expect(bootErrorClass({name:'TypeError',message:'fixture'})).toBe('Error');
});
