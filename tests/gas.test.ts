import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { TARGET_RANGES, readTargets } from "../lib/sheets";
import { readGasTargets } from "../lib/gas";

const key = "test-only-shared-key-at-least-32-characters";
function fixture() {
  const accessed: string[] = [];
  let opened = 0;
  const props: Record<string,string> = {Q4_SHARED_KEY:key, Q4_SPREADSHEET_ID:"private-sheet-id"};
  const context = vm.createContext({
    PropertiesService: {getScriptProperties: () => ({getProperty: (name:string) => props[name]})},
    ContentService: {MimeType: {JSON:"json"}, createTextOutput: (text:string) => ({setMimeType: () => JSON.parse(text)})},
    Utilities: {formatDate: (_date:Date, zone:string, format:string) => {
      assert.equal(zone,"America/Los_Angeles"); assert.equal(format,"yyyy-MM-dd"); return "2026-11-08";
    }},
    SpreadsheetApp: {openById: (id:string) => { opened++; assert.equal(id,"private-sheet-id"); return {
      getSpreadsheetTimeZone: () => "America/Los_Angeles",
      getSheetByName: (name:string) => {assert.equal(name,"01_经营目标"); return {getRange: (range:string) => {
        accessed.push(range);
        const m=range.match(/^([A-Z])(\d+):([A-Z])(\d+)$/)!;
        return {getValues: () => Array.from({length:Number(m[4])-Number(m[2])+1}, (_,r) =>
          Array.from({length:m[3].charCodeAt(0)-m[1].charCodeAt(0)+1}, (_,c) =>
            range === "T11:T12" && r===0 ? new Date("2026-11-09T02:00:00Z") : r===0 && c===0 ? 123.45 : ""))};
      }};},
    };}},
  });
  vm.runInContext(fs.readFileSync("gas/Code.gs","utf8"), context);
  return {context, accessed, opened:()=>opened};
}
test("GAS authenticates before opening Sheets; GET/malformed/wrong key never expose data", () => {
  const f=fixture();
  for (const request of [undefined, {postData:{contents:"{"}}, {postData:{contents:JSON.stringify({key:"wrong",action:"readTargets"})}}]) {
    assert.equal(f.context.doPost(request).ok,false);
  }
  assert.equal(f.context.doGet().ok,false);
  assert.equal(f.opened(),0);
});
test("GAS uses only fixed formula-result ranges and spreadsheet-timezone dates", () => {
  const f=fixture();
  const result=f.context.doPost({postData:{contents:JSON.stringify({key,action:"readTargets",range:"ERP!A:Z"})}});
  assert.equal(result.ok,true);
  assert.deepEqual(f.accessed,TARGET_RANGES);
  assert.equal(result.valueRanges[0].values[0][0],"2026-11-08");
  assert.equal(result.valueRanges[1].values[0][0],123.45);
  assert.equal(JSON.stringify(result).includes("private-sheet-id"),false);
  assert.equal(JSON.stringify(result).includes(key),false);
});
test("GAS transport uses POST body only, follows safe response GET and preserves numeric results", async () => {
  const env={...process.env}, original=global.fetch;
  try {
    Object.assign(process.env,{SHEETS_TRANSPORT:"gas",GAS_WEB_APP_URL:"https://script.google.com/macros/s/test/exec",GAS_SHARED_KEY:key});
    const f=fixture(); let calls=0;
    global.fetch=async (url, options) => {
      calls++;
      assert.equal(String(url).includes(key),false);
      if (calls===1) {
        assert.equal(options?.method,"POST"); assert.equal(options?.redirect,"manual");
        assert.equal(JSON.parse(String(options?.body)).key,key);
        return new Response(null,{status:302,headers:{location:"https://script.googleusercontent.com/macros/echo?response=test"}});
      }
      assert.equal(options?.method,"GET"); assert.equal(options?.body,undefined);
      return Response.json(f.context.doPost({postData:{contents:JSON.stringify({key,action:"readTargets"})}}));
    };
    const rows=await readTargets();
    assert.equal(calls,2); assert.equal(rows[10][19],"2026-11-08"); assert.equal(rows[12][0],123.45);
    for (const response of [Response.json({ok:false,error:"UNAUTHORIZED"}), new Response("<html>login</html>"),
      new Response(null,{status:302,headers:{location:"https://attacker.example/"}}), Response.json({ok:true,version:1,valueRanges:[]})]) {
      global.fetch=async () => response;
      await assert.rejects(()=>readGasTargets(TARGET_RANGES),/GAS读取失败/);
    }
  } finally {process.env=env;global.fetch=original;}
});
