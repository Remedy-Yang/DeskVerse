import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const {PNG}=await import(process.env.PNGJS_MODULE||'pngjs');
const output=resolve('.deskverse/qa/drawers');await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 // 不调用生成接口，这项验收仅使用现有本机 GLB。
 await page.route('**/api/generation/**',route=>route.fulfill({json:route.request().url().endsWith('/config')?{configured:false,csrf:'test'}:{jobs:[]}}));
 await page.goto(process.env.DESKVERSE_URL||'http://127.0.0.1:8002',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.deskverse?.getState().drawers.length===4&&document.getElementById('loading').hidden,null,{timeout:60000});
 await page.locator('[data-panel-tab="furniture"]').click();
 const state=()=>page.evaluate(()=>window.deskverse.getState());
 const initial=await state();const table=initial.objects.find(item=>item.role==='table');
 assert.ok(Math.abs(table.dimensionsCm[1]-210)<.001);assert.equal(initial.surface.heightCm,0);
 await page.locator('#view-home').click();await page.screenshot({path:resolve(output,'desk-new-textures-closed.png'),fullPage:true});
 await page.locator('#drawer-open').click();await page.waitForFunction(()=>window.deskverse.getState().drawers[0].opening===1);
 await page.locator('#drawer-focus').click();
 await page.screenshot({path:resolve(output,'drawer-open-empty.png'),fullPage:true});
 await page.locator('#drawer-close').click();await page.waitForFunction(()=>window.deskverse.getState().drawers[0].opening===0);
 await page.locator('#drawer-open').click();await page.waitForFunction(()=>window.deskverse.getState().drawers[0].opening===1);
 // 导入真实鼠标，按尺寸图保持 6.4 / 3.9 / 12 cm（XYZ）。
 await page.locator('#file-input').setInputFiles('deskmodels/鼠标/base_basic_pbr.glb');
 await page.waitForFunction(()=>window.deskverse.getState().objects.length===4&&document.getElementById('loading').hidden,null,{timeout:60000});
 await page.locator('#uniform').uncheck();
 for(const [id,value] of [['dx','6.4'],['dy','3.9'],['dz','12']]){await page.locator('#'+id).fill(value);await page.locator('#'+id).dispatchEvent('change');}
 await page.locator('#drawer-store').click();
 const stored=(await state()).objects.at(-1);assert.equal(stored.storage.drawerId,'left-drawer');const openZ=stored.position[2];
 await page.locator('#drawer-focus').click();await page.screenshot({path:resolve(output,'drawer-stored-mouse.png'),fullPage:true});
 await page.locator('#drawer-close').click();await page.waitForFunction(()=>window.deskverse.getState().drawers[0].opening===0);
 const closed=(await state()).objects.at(-1);assert.ok(Math.abs(openZ-closed.position[2]-(await state()).drawers[0].travelCm)<.001);assert.deepEqual(closed.dimensionsCm,stored.dimensionsCm);
 await page.locator('#undo').click();assert.equal((await state()).drawers[0].opening,1);assert.ok(Math.abs((await state()).objects.at(-1).position[2]-openZ)<.001);
 await page.locator('#redo').click();assert.equal((await state()).drawers[0].opening,0);
 await page.locator('#drawer-open').click();await page.waitForFunction(()=>window.deskverse.getState().drawers[0].opening===1);
 await page.locator('#drawer-remove').click();const removed=(await state()).objects.at(-1);assert.equal(removed.storage,null);assert.ok(Math.abs(removed.worldBoundsCm.min[1])<.001);
 // 超出内腔时只提醒，允许放入并保留真实尺寸。
 await page.locator('#dy').fill('24');await page.locator('#dy').dispatchEvent('change');const beforeReject=(await state()).objects.at(-1);
 await page.locator('#drawer-store').click();assert.ok((await state()).collision.detected);assert.deepEqual((await state()).objects.at(-1).dimensionsCm,beforeReject.dimensionsCm);assert.equal((await state()).objects.at(-1).storage.drawerId,'left-drawer');await page.locator('#drawer-remove').click();
 // 手动移出也只提醒，不再拦截或回退。
 await page.locator('#dy').fill('3.9');await page.locator('#dy').dispatchEvent('change');await page.locator('#drawer-store').click();
 const collision=await page.evaluate(id=>window.deskverse.setTransform(id,{position:[0,0,0]}),stored.id);assert.equal(collision.accepted,true);assert.equal(collision.collision.blocked,false);assert.deepEqual((await state()).objects.at(-1).position,[0,0,0]);assert.equal((await state()).objects.at(-1).storage,null);
 await page.locator('#drawer-store').click();await page.locator('#drawer-focus').click();
 const canvas=page.locator('#viewport canvas'),render=PNG.sync.read(await canvas.screenshot()),background=render.data.subarray(0,3);let colored=0;for(let i=0;i<render.data.length;i+=4)if(Math.abs(render.data[i]-background[0])+Math.abs(render.data[i+1]-background[1])+Math.abs(render.data[i+2]-background[2])>80)colored++;assert.ok(colored>1000);
 await page.setViewportSize({width:390,height:844});await page.locator('#toggle-assets').click();await page.locator('#drawer-controls').scrollIntoViewIfNeeded();
 await page.screenshot({path:resolve(output,'drawer-mobile.png'),fullPage:true});
 const fit=await page.locator('#drawer-controls').evaluate(element=>({scroll:element.scrollWidth,client:element.clientWidth,children:[...element.children].map(child=>({id:child.id,width:child.getBoundingClientRect().width,scroll:child.scrollWidth}))}));assert.ok(fit.scroll<=fit.client+1,JSON.stringify(fit));
 await page.setViewportSize({width:1440,height:1000});
 for(let index=0;index<40&&(await state()).objects.length;index++)await page.locator('#undo').click();
 assert.equal((await state()).objects.length,0);assert.equal((await state()).drawers.length,0);assert.ok(await page.locator('#drawer-controls').isHidden());
 await page.locator('#redo').click();assert.equal((await state()).drawers.length,4);assert.ok(await page.locator('#drawer-controls').isVisible());
 assert.deepEqual(errors,[]);await context.close();
 console.log('Drawer UI passed: realwood bed calibration, storage following without scaling, undo/redo, take out, oversized warnings and unrestricted movement, nonblank canvas and mobile layout. Evidence:',output);
}finally{await browser.close();}
