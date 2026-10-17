import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=resolve('.deskverse/qa/lighting');await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/generation/**',route=>route.fulfill({json:route.request().url().endsWith('/config')?{configured:false,csrf:'test'}:{jobs:[]}}));
 await page.goto(process.env.DESKVERSE_URL||'http://127.0.0.1:8002',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.deskverse?.getState().objects.length===3&&document.getElementById('loading').hidden,null,{timeout:60000});
 await page.locator('[data-panel-tab="lighting"]').click();
 const state=()=>page.evaluate(()=>window.deskverse.getState());assert.equal((await state()).lighting.preset,'dorm-day');
 for(const preset of ['dorm-day','window-side','dorm-night','desk-lamp','studio']){await page.selectOption('#lighting-preset',preset);await page.waitForTimeout(180);assert.equal((await state()).lighting.preset,preset);await page.screenshot({path:resolve(output,preset+'.png'),fullPage:true});}
 await page.locator('#lighting-intensity').fill('65');await page.locator('#lighting-warmth').fill('-50');const adjusted=(await state()).lighting;assert.equal(adjusted.intensity,.65);assert.equal(adjusted.warmth,-50);
 assert.deepEqual(errors,[]);console.log('Lighting UI passed: five dorm presets, brightness, warmth, export state, no page errors. Evidence:',output);
}finally{await browser.close();}
