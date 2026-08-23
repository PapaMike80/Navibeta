/* Test locale del contratto ICS: non richiede credenziali Firebase. */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');

const store = {
  public:{schedule:{date:[{iso:'2026-08-23'}],residenze:{DESENZANO:[{id:'91',agente:'PEDRONI M.',turni:{'2026-08-23':'D2'}}]}}},
  private:{adminUpdates:{userAuth:{'91':{pinHash:crypto.createHash('sha256').update('pin').digest('hex')}},updatedAt:'2026-08-22T10:00:00Z',odsVariations:[],manualVariations:[]}}
};
function at(path, create=false) { let cursor=store; for (const part of path.split('/')) { if (create && !cursor[part]) cursor[part]={}; cursor=cursor?.[part]; } return cursor; }
function ref(path) { return { get:async()=>({val:()=>at(path),exists:()=>at(path)!==undefined}), set:async value=>{const parts=path.split('/'), key=parts.pop(), parent=at(parts.join('/'),true);parent[key]=value;}, remove:async()=>{const parts=path.split('/'),key=parts.pop(),parent=at(parts.join('/'));if(parent)delete parent[key];} }; }
const exported = {};
const sandbox = { require:name => name==='crypto'?crypto:name==='firebase-admin'?{initializeApp(){},database:()=>({ref})}:name==='firebase-functions/v2/https'?{onRequest:(_options, fn)=>fn}:require(name), module:{exports:exported}, exports:exported, process, Buffer, console, Date, JSON, String, Number, Object, Array, RegExp, Set, Promise };
vm.runInNewContext(fs.readFileSync(`${__dirname}/index.js`, 'utf8'), sandbox, {filename:'index.js'});
const api = sandbox.exports;
function response() { const result={headers:{},statusCode:200,body:''};return {result,set(value,key){if(typeof value==='string')result.headers[value]=key;else Object.assign(result.headers,value);return this},status(value){result.statusCode=value;return this},json(value){result.body=JSON.stringify(value);return this},send(value){result.body=value;return this},end(value=''){result.body=value;return this}}; }
async function issue(regenerate=false) { const res=response();await api.calendarToken({method:'POST',body:{agentId:'91',pinHash:store.private.adminUpdates.userAuth['91'].pinHash,regenerate},headers:{}},res);assert.equal(res.result.statusCode,200);return JSON.parse(res.result.body).calendarUrl; }
async function feed(url) { const token=new URL(url).searchParams.get('token'),res=response();await api.calendarFeed({query:{token},headers:{}},res);return res.result; }
(async()=>{
  const url=await issue(); let out=await feed(url);
  assert.equal(out.statusCode,200); assert.match(out.headers['Content-Type'],/text\/calendar/); assert.match(out.body,/SUMMARY:D2 — NaviGarda/);
  const uid=out.body.match(/UID:([^\r\n]+)/)[1];
  store.private.adminUpdates.manualVariations=[{id_agente:'91',data:'2026-08-23',turno_nuovo:'DT',tipo:'MANUALE',requestId:'X'}];store.private.adminUpdates.updatedAt='2026-08-23T12:00:00Z';
  out=await feed(url);assert.match(out.body,/SUMMARY:DT — NaviGarda/);assert.equal(out.body.match(/UID:([^\r\n]+)/)[1],uid);
  store.private.adminUpdates.manualVariations=[{id_agente:'91',data:'2026-08-23',turno_nuovo:'rip',tipo:'MANUALE',requestId:'Y'}];out=await feed(url);assert.ok(!out.body.includes('BEGIN:VEVENT'));
  store.private.adminUpdates.manualVariations=[{id_agente:'91',data:'2026-08-23',turno_nuovo:'D1',tipo:'MANUALE',requestId:'Z'}];out=await feed(url);assert.match(out.body,/SUMMARY:D1 — NaviGarda/);
  const foreignToken=new URL(url).searchParams.get('token'),foreignRes=response();await api.calendarFeed({query:{token:foreignToken,agentId:'999'},headers:{}},foreignRes);assert.match(foreignRes.result.body,/UID:91-2026-08-23@navibeta/);
  const newUrl=await issue(true);assert.equal((await feed(url)).statusCode,404);assert.equal((await feed(newUrl)).statusCode,200);
  console.log('OK calendario: creazione, modifica UID, riposo, nuovo turno e revoca');
})().catch(error=>{console.error(error);process.exitCode=1});
