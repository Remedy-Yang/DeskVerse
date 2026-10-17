import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const {PNG}=await import(process.env.PNGJS_MODULE||'pngjs');
const output=resolve('.deskverse/qa/furniture');await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/generation/**',route=>route.fulfill({json:route.request().url().endsWith('/config')?{configured:false,csrf:'test'}:{jobs:[]}}));
 await page.goto(process.env.DESKVERSE_URL||'http://127.0.0.1:8002',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.deskverse?.getState().drawers.length===4&&document.getElementById('loading').hidden,null,{timeout:60000});
 const state=()=>page.evaluate(()=>window.deskverse.getState());
 const opening=id=>page.evaluate(id=>window.deskverse.getState().drawers.find(d=>d.id===id).opening,id);
 const setOpening=async(id,value)=>{await page.selectOption('#drawer-select',id);await page.locator('#drawer-'+(value?'open':'close')).click();await page.waitForTimeout(500);};
 const initial=await state(),table=initial.objects.find(item=>item.role==='table'),chair=initial.objects.find(item=>item.name==='椅子');
 assert.equal(initial.objects.length,3);assert.ok(chair);assert.equal(initial.surface.heightCm,0);assert.equal(initial.collision.enabled,true);
 assert.ok(Math.abs(table.dimensionsCm[1]-180)<.001);assert.ok(Math.abs(table.dimensionsCm[2]-85)<.001);assert.equal(chair.surfaceY,-76);
 await setOpening('right-drawer-1',1);assert.ok((await state()).collision.detected);assert.equal((await state()).collision.blocked,false);assert.equal(await opening('right-drawer-1'),1);
 await page.screenshot({path:resolve(output,'collision-chair-blocks-drawer.png'),fullPage:true});
 await setOpening('right-drawer-1',0);await page.locator('#chair-pull').click();
 const moved=(await state()).objects.find(o=>o.id===chair.id);assert.ok(Math.abs(moved.position[2]-chair.position[2]-35)<.001);assert.deepEqual(moved.dimensionsCm,chair.dimensionsCm);
 await page.locator('#undo').click();assert.deepEqual((await state()).objects.find(o=>o.id===chair.id).position,chair.position);await page.locator('#redo').click();
 for(const id of initial.drawers.map(d=>d.id)){
  await setOpening(id,1);assert.equal(await opening(id),1);assert.ok((await state()).drawers.filter(d=>d.id!==id).every(d=>d.opening===0));
  await setOpening(id,0);assert.equal(await opening(id),0);
 }
 for(const id of initial.drawers.map(d=>d.id))await setOpening(id,1);
 assert.ok((await state()).drawers.every(d=>d.opening===1));
 await page.locator('#view-home').click();await page.locator('[data-distance="460"]').click();await page.waitForTimeout(1000);await page.screenshot({path:resolve(output,'all-drawers-open.png'),fullPage:true});
 for(const id of initial.drawers.map(d=>d.id))await setOpening(id,0);
 await page.locator('#door-close').click();await page.waitForTimeout(600);assert.equal((await state()).doors[0].opening,0);
 await setOpening('left-drawer',1);assert.equal(await opening('left-drawer'),1);assert.equal((await state()).doors[0].opening,1);assert.match(await page.locator('#toast').innerText(),/自动打开/);
 if(await opening('left-drawer')>0)await setOpening('left-drawer',0);
 await page.locator('#door-open').click();await page.waitForTimeout(600);assert.equal((await state()).doors[0].opening,1);
 await page.locator('#seat-view').click();await page.waitForTimeout(250);assert.equal(await page.locator('#seat-view-label').innerText(),'退出坐姿视角');assert.equal(await page.locator('#seat-view').getAttribute('aria-pressed'),'true');await page.locator('#seat-view').click();assert.equal(await page.locator('#seat-view-label').innerText(),'坐在椅子上');
 await page.locator('#view-top').click();assert.equal(await page.locator('#view-distance-value').innerText(),'240 cm');assert.equal(await page.locator('#view-top').getAttribute('title'),'斜上方桌面视角，约 240 cm (T)');
 assert.deepEqual(await page.locator('.view-tools button').evaluateAll(buttons=>buttons.map(button=>button.dataset.viewLabel)),['初始','俯视','聚焦','网格']);
 await page.locator('#chair-pull').click();await page.locator('#chair-position-range').fill('-20');await page.locator('#chair-position-range').dispatchEvent('input');const chairAfterPush=(await state()).objects.find(o=>o.name==='椅子');assert.ok(chairAfterPush.position[2]<chair.position[2]+35);
 // Place a real, calibrated mouse into a right drawer and verify X travel.
 await page.locator('#file-input').setInputFiles('deskmodels/鼠标/base_basic_pbr.glb');
 await page.waitForFunction(()=>window.deskverse.getState().objects.length===4&&document.getElementById('loading').hidden,null,{timeout:60000});
 await page.locator('#uniform').uncheck();for(const [id,value] of [['dx','6.4'],['dy','3.9'],['dz','12']]){await page.locator('#'+id).fill(value);await page.locator('#'+id).dispatchEvent('change');}
 await setOpening('right-drawer-1',1);await page.locator('#drawer-store').click();
 const stored=(await state()).objects.at(-1);assert.equal(stored.storage?.drawerId,'right-drawer-1');
 await setOpening('right-drawer-1',0);const closed=(await state()).objects.at(-1),travel=(await state()).drawers[1].travelCm;
 assert.ok(Math.abs(closed.position[0]-stored.position[0]-travel)<.001);assert.deepEqual(closed.dimensionsCm,stored.dimensionsCm);
 await page.locator('#undo').click();assert.equal(await opening('right-drawer-1'),1);assert.deepEqual((await state()).objects.at(-1).position,stored.position);
 await page.locator('#redo').click();await setOpening('right-drawer-1',1);await page.locator('#drawer-focus').click();await page.screenshot({path:resolve(output,'right-drawer-storage.png'),fullPage:true});
 const result=await page.evaluate(id=>window.deskverse.setTransform(id,{position:[8.740997314453125,-76,-150]}),chair.id);
 assert.equal(result.accepted,true);assert.equal(result.collision.blocked,false);assert.ok(result.collision.detected);assert.equal((await state()).objects.find(o=>o.id===chair.id).position[2],-150);await page.locator('#undo').click();
 await page.locator('#view-home').click();await page.locator('[data-distance="460"]').click();await page.waitForTimeout(1800);
 await page.screenshot({path:resolve(output,'furniture-desktop.png'),fullPage:true});
 const canvas=page.locator('#viewport canvas'),frames=[];
 for(let i=0;i<3;i++){frames.push(PNG.sync.read(await canvas.screenshot()));await page.waitForTimeout(200);}
 let colored=0,changed=0;for(let i=0;i<frames[0].data.length;i+=4){if(Math.abs(frames[0].data[i]-241)+Math.abs(frames[0].data[i+1]-243)+Math.abs(frames[0].data[i+2]-246)>80)colored++;if(frames.some(frame=>frame.data[i]!==frames[0].data[i]||frame.data[i+1]!==frames[0].data[i+1]||frame.data[i+2]!==frames[0].data[i+2]))changed++;}
 assert.ok(colored>1000);assert.ok(changed/(frames[0].width*frames[0].height)<.001,`Unstable pixels: ${changed}`);
 // Pointer dragging remains free even when warnings are active.
 await page.evaluate(id=>window.deskverse.select(id),chair.id);await page.locator('[data-mode="drag"]').click();await page.locator('#view-focus').click();await page.waitForTimeout(1000);
 const beforeDrag=(await state()).objects.find(o=>o.id===chair.id),rect=await canvas.boundingBox(),x=rect.x+rect.width*.5,y=rect.y+rect.height*.52;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+70,y+10,{steps:12});await page.mouse.up();
 const afterDrag=(await state()).objects.find(o=>o.id===chair.id);assert.notDeepEqual(afterDrag.position,beforeDrag.position);assert.deepEqual(afterDrag.dimensionsCm,beforeDrag.dimensionsCm);
 await page.setViewportSize({width:390,height:844});await page.locator('#drawer-controls').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(output,'furniture-mobile.png'),fullPage:true});
 const fit=await page.locator('#drawer-controls').evaluate(element=>({scroll:element.scrollWidth,client:element.clientWidth}));assert.ok(fit.scroll<=fit.client+1,JSON.stringify(fit));
 assert.deepEqual(errors,[]);console.log('Furniture UI passed: four independent drawers, right storage, chair pointer drag, door articulation, advisory-only collisions, unrestricted API movement, undo/redo, stable canvas and mobile. Stable pixels changed:',changed,'Evidence:',output);
}finally{await browser.close();}
