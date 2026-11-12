import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function setup() {
  const props: Record<string,string> = {Q4_GITHUB_PAT:"private-test-token",Q4_TIMERS_ENABLED:"true"};
  const calls: {url:string; options:any}[]=[];
  const logs: string[]=[];
  let triggers: any[]=[{getHandlerFunction:()=>"unrelated"}];
  let code=204, native=true;
  const lock={tryLock:()=>true,waitLock:()=>{},releaseLock:()=>{}};
  const context=vm.createContext({
    console:{log:(s:string)=>logs.push(s)},
    PropertiesService:{getScriptProperties:()=>({getProperty:(k:string)=>props[k],setProperty:(k:string,v:string)=>{props[k]=v;}})},
    LockService:{getScriptLock:()=>lock},
    Utilities:{formatDate:()=>"2026-11-12"},
    UrlFetchApp:{fetch:(url:string,options:any)=>{
      calls.push({url,options});
      if(url.includes('/contents/')) return {getResponseCode:()=>200,getContentText:()=>native?"on:\n  schedule:\n":"on:\n  workflow_dispatch:\n"};
      if(url.endsWith('/actions/runs/123')) return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({event:'workflow_dispatch',conclusion:'success',head_branch:'main',path:'.github/workflows/pages.yml',display_title:'Q4 · gas_test · test-2026-11-12'})};
      return {getResponseCode:()=>code,getContentText:()=>''};
    }},
    ScriptApp:{getProjectTriggers:()=>triggers,deleteTrigger:(t:any)=>{triggers=triggers.filter(x=>x!==t);},newTrigger:(name:string)=>{
      const spec:any={handler:name}; const builder:any={};
      for(const method of ['timeBased','atHour','nearMinute','everyDays','inTimezone']) builder[method]=(v:any)=>{spec[method]=v;return builder;};
      builder.create=()=>triggers.push({...spec,getHandlerFunction:()=>name});return builder;
    }},
  });
  vm.runInContext(fs.readFileSync('gas/Scheduler.gs','utf8'),context);
  return {context,props,calls,logs,triggers:()=>triggers,setCode:(v:number)=>{code=v;},disableNative:()=>{native=false;}};
}
test('GAS dispatch uses header token, correct workflow/source, and deduplicates daily slots',()=>{
  const f=setup(); f.context.q4MorningTimer();f.context.q4MorningTimer();f.context.q4EveningTimer();
  assert.equal(f.calls.length,2);
  const request=f.calls[0];
  assert.ok(request.url.endsWith('/actions/workflows/pages.yml/dispatches'));
  assert.equal(request.options.headers.Authorization,'Bearer private-test-token');
  assert.deepEqual(JSON.parse(request.options.payload),{ref:'main',inputs:{source:'gas_timer',slot:'2026-11-12-AM'}});
  assert.equal(f.logs.join('').includes('private-test-token'),false);
});
test('failed or uncertain dispatch is recorded without automatic duplicate retries',()=>{
  const f=setup();f.setCode(401);
  assert.throws(()=>f.context.q4MorningTimer(),/HTTP 401/);
  f.context.q4MorningTimer();assert.equal(f.calls.length,1);
  assert.equal(JSON.parse(f.props.Q4_LAST_AM).status,'failed_or_unknown');
});
test('installer requires successful matching test and native cron removal; reinstall keeps exactly two timers',()=>{
  const f=setup();assert.throws(()=>f.context.installQ4Timers(),/testGitHubDispatch/);
  f.context.testGitHubDispatch();f.props.Q4_GAS_TEST_RUN_ID='123';
  assert.throws(()=>f.context.installQ4Timers(),/Native GitHub schedule/);
  f.disableNative();f.context.installQ4Timers();f.context.installQ4Timers();
  const own=f.triggers().filter(t=>t.handler);
  assert.deepEqual(own.map(t=>[t.atHour,t.nearMinute,t.everyDays,t.inTimezone]),[[9,17,1,'Asia/Shanghai'],[17,17,1,'Asia/Shanghai']]);
  assert.equal(f.triggers().length,3);
  f.context.removeQ4Timers();assert.equal(f.triggers().length,1);
  const before=f.calls.length;f.context.q4MorningTimer();assert.equal(f.calls.length,before);
});
