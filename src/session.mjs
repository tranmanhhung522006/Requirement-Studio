import {randomBytes,createHash,scryptSync,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt),hash=s=>createHash('sha256').update(s).digest('hex');
const COOKIE='__Host-rs_session',TTL=12*60*60*1000;
const read=header=>typeof header==='string'?header.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1):undefined;
export function createSessions(username,password){
 const salt=randomBytes(16),expected=scryptSync(password,salt,32),sessions=new Map();let failures=0,until=0,inflight=0;
 function prune(now){for(const [k,v] of sessions)if(v<=now)sessions.delete(k);if(now>=until){failures=0;until=now+60000;}}
 const clearCookie=COOKIE+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0';
 return {
  clearCookie,
  async login(user,pass){
   const now=Date.now();prune(now);if(failures>=12||inflight>=2)return {status:429};
   if(typeof user!=='string'||typeof pass!=='string'||user.length>128||pass.length>512){failures++;return {status:401};}
   inflight++;let actual;try{actual=await derive(pass,salt,32);}finally{inflight--;}
   if(!timingSafeEqual(actual,expected)||user!==username){failures++;return {status:401};}
   failures=0;const token=randomBytes(32).toString('base64url');if(sessions.size>=30)sessions.delete(sessions.keys().next().value);sessions.set(hash(token),Date.now()+TTL);
   return {status:200,cookie:COOKIE+'='+token+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+TTL/1000};
  },
  valid(header){const now=Date.now();prune(now);const token=read(header);return Boolean(token&&/^[A-Za-z0-9_-]{43}$/.test(token)&&(sessions.get(hash(token))??0)>now);},
  revoke(header){const token=read(header);if(token)sessions.delete(hash(token));}
 };
}
