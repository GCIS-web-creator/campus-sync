import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
export const ADMIN_SESSION_COOKIE = 'campussync_admin_session';
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;
function adminPassword(): string { return process.env.CAMPUS_SYNC_ADMIN_PASSWORD || ''; }
function sign(expiresAt: number, nonce: string): string {
  const secret=adminPassword();
  return secret ? createHmac('sha256',secret).update('campussync-admin-session:v1:'+expiresAt+':'+nonce).digest('base64url') : '';
}
export function createAdminSessionToken(now=Date.now()) {
  const expiresAt=Math.floor(now/1000)+ADMIN_SESSION_TTL_SECONDS;
  const nonce=randomBytes(18).toString('base64url');
  const signature=sign(expiresAt,nonce);
  return signature ? {token:expiresAt+'.'+nonce+'.'+signature,expiresAt} : null;
}
export function verifyAdminSessionToken(token:string|null|undefined,now=Date.now()):boolean {
  if(!token)return false;
  const parts=token.split('.');
  if(parts.length!==3)return false;
  const expiresAt=Number(parts[0]),nonce=parts[1];
  const current=Math.floor(now/1000);
  if(!Number.isSafeInteger(expiresAt)||expiresAt<=current||expiresAt>current+ADMIN_SESSION_TTL_SECONDS+60)return false;
  if(!/^[A-Za-z0-9_-]{20,40}$/.test(nonce))return false;
  const expected=Buffer.from(sign(expiresAt,nonce)),received=Buffer.from(parts[2]);
  return expected.length>0&&expected.length===received.length&&timingSafeEqual(expected,received);
}
export function getAdminSessionTokenFromCookieHeader(header:string|null):string|null {
  if(!header)return null;
  for(const part of header.split(';')){
    const index=part.indexOf('=');
    if(index<0||part.slice(0,index).trim()!==ADMIN_SESSION_COOKIE)continue;
    try{return decodeURIComponent(part.slice(index+1).trim());}catch{return null;}
  }
  return null;
}
export function verifyAdminSessionRequest(request:Request):boolean {
  return verifyAdminSessionToken(getAdminSessionTokenFromCookieHeader(request.headers.get('cookie')));
}
export function verifyAdminPassword(value:unknown):boolean {
  const expected=Buffer.from(adminPassword());
  if(!expected.length||typeof value!=='string'||!value)return false;
  const received=Buffer.from(value);
  return expected.length===received.length&&timingSafeEqual(expected,received);
}
export function serializeAdminSessionCookie(token:string):string {
  return [ADMIN_SESSION_COOKIE+'='+encodeURIComponent(token),'Path=/','HttpOnly','SameSite=Strict','Max-Age='+ADMIN_SESSION_TTL_SECONDS,...(process.env.NODE_ENV==='production'?['Secure']:[])].join('; ');
}
export function clearAdminSessionCookie():string {
  return [ADMIN_SESSION_COOKIE+'=','Path=/','HttpOnly','SameSite=Strict','Max-Age=0','Expires=Thu, 01 Jan 1970 00:00:00 GMT',...(process.env.NODE_ENV==='production'?['Secure']:[])].join('; ');
}