// npm install --no-save --package-lock=false playwright (or set PLAYWRIGHT_MODULE to its absolute entry).
// Build Pages first. Uses installed Edge on Windows; otherwise Playwright Chromium.
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = path.resolve('.pages-build/out');
const prefix = '/q4-operations-dashboard';
const seed = JSON.parse(await fs.readFile('pages-seed/tv-snapshot-v1.json', 'utf8'));
const preview = {...seed, fetchedAt:new Date().toISOString(), timing:{progress:.0191,day:1}};
const mime = {'.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json'};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname).replace(new RegExp(`^${prefix}`), '');
    const file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + path.sep)) throw Error('Invalid path');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch {res.statusCode=404;res.end();}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch(process.platform === 'win32' ? {channel:'msedge'} : {});
const page = await browser.newPage();
const errors=[]; page.on('pageerror', error => errors.push(error.message));
const base = `http://127.0.0.1:${server.address().port}${prefix}`;
await fs.mkdir('.private/tv-qa', {recursive:true});
async function checkBounds(label) {
  const bounds = await page.evaluate(() => {
    const outside = [...document.querySelectorAll('.tv-screen *')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width && r.height && (r.left < -1 || r.top < -1 || r.right > innerWidth+1 || r.bottom > innerHeight+1 || el.scrollWidth > el.clientWidth+1 || el.scrollHeight > el.clientHeight+1);
    }).map(el => ({tag:el.tagName, class:el.className, width:el.clientWidth, sw:el.scrollWidth, height:el.clientHeight, sh:el.scrollHeight}));
    return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,outside};
  });
  assert.equal(bounds.scrollWidth,bounds.width, label);
  assert.equal(bounds.scrollHeight,bounds.height, label);
  assert.deepEqual(bounds.outside,[],label);
  console.log(label, 'no page scroll, clipping or overflowing elements');
}
try {
  await page.route('**/tv-snapshot.json?*', route => route.fulfill({json:preview}));
  for (const [width,height] of [[1920,1080],[1366,768]]) {
    await page.setViewportSize({width,height});
    await page.goto(base+'/tv/');
    await page.getByText((seed.q4[0].sales*100).toFixed(2)+'%', {exact:true}).waitFor();
    assert.equal(await page.locator('.tv-pending').count(),10);
    assert.equal(await page.getByText('时间进度 · 第 1/12 天',{exact:true}).count(),1);
    assert.equal(await page.getByText('1.91%',{exact:true}).count(),1);
    assert.equal(await page.locator('.tv-mascot-head').count(),1);
    assert.equal(await page.locator('.tv-mascot text').count(),0);
    assert.equal(await page.locator('.tv-mascot-line').first().evaluate(el=>getComputedStyle(el).strokeLinecap),'round');
    const timingRatio=await page.locator('.tv-time-progress').evaluate(el=>el.firstElementChild.getBoundingClientRect().width/el.getBoundingClientRect().width);
    assert.ok(Math.abs(timingRatio-.0191)<.001);
    assert.notEqual(await page.locator('.tv-mascot-bob').evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.tv-mascot-bob').evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.emulateMedia({reducedMotion:'no-preference'});
    for (let i=0;i<4;i++) {
      const row=page.locator('.tv-group-row').nth(i);
      for (const key of ['previous','sales','salesAdvanced','profit','profitAdvanced']) assert.ok((await row.innerText()).includes((seed.q4[i+1][key]*100).toFixed(2)+'%'));
    }
    await page.screenshot({path:`.private/tv-qa/${width}x${height}.png`,fullPage:true});
    await checkBounds(`${width}x${height}`);
  }
  await page.unroute('**/tv-snapshot.json?*');
  let next={...preview,fetchedAt:new Date().toISOString(),ok:true};
  let fail=false;
  await page.route('**/tv-snapshot.json?*', route => fail ? route.fulfill({status:503,body:'Unavailable'}) : route.fulfill({json:next}));
  await page.clock.install();
  await page.reload();
  await page.getByText((seed.q4[0].sales*100).toFixed(2)+'%',{exact:true}).waitFor();
  next=structuredClone(next); next.fetchedAt=new Date(Date.now()+60000).toISOString(); next.q4[0].sales=.8765;
  await page.clock.runFor(180100);
  await page.getByText('87.65%',{exact:true}).waitFor();
  fail=true; await page.clock.runFor(180100);
  await page.getByText('数据更新延迟',{exact:true}).waitFor();
  assert.equal(await page.getByText('87.65%',{exact:true}).count(),1);
  fail=false; next.ok=false; next.q4.forEach(row=>Object.keys(row).filter(k=>k!=='name').forEach(k=>row[k]=null));
  await page.clock.runFor(180100); await page.locator('.tv-core .tv-primary .tv-missing').first().waitFor();
  await checkBounds('all missing');
  let sequence=Date.now()+10*60*1000;
  for (const [progress,day,label] of [[0,0,'0.00%'],[.5,6,'50.00%'],[1,12,'100.00%']]) {
    next=structuredClone(preview); next.fetchedAt=new Date(sequence+=1000).toISOString(); next.timing={progress,day};
    await page.clock.runFor(180100); await page.getByText(label,{exact:true}).waitFor(); await checkBounds(`timing ${label}`);
  }
  next=structuredClone(preview); next.fetchedAt=new Date(sequence+=1000).toISOString(); next.timing={progress:null,day:null};
  await page.clock.runFor(180100); await page.locator('.tv-timing-pending').waitFor();
  assert.equal(await page.locator('.tv-mascot').count(),0); await checkBounds('timing missing');
  console.log('180-second update, failed fetch retains data and shows delay, missing data: passed');
  await page.goto(base+'/');
  const link=page.getByRole('link',{name:'电视投屏 ↗'});
  assert.equal(await link.getAttribute('href'),prefix+'/tv/'); assert.equal(await link.getAttribute('target'),'_blank');
  assert.deepEqual(errors,[]);
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
