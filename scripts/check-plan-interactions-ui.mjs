import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=resolve('.deskverse/qa/plan-interactions');await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
const near=(a,b,tolerance=1e-4)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const area=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2);
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1.25});page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/generation/**',route=>{assert.equal(route.request().method(),'GET');return route.fulfill({json:route.request().url().endsWith('/config')?{configured:false,csrf:'qa'}:{jobs:[]}});});
 await page.goto(process.env.DESKVERSE_URL||'http://127.0.0.1:8000',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.deskverse?.getState().objects.length===3&&document.getElementById('loading').hidden,null,{timeout:60000});
 const state=()=>page.evaluate(()=>window.deskverse.getState()),initial=await state(),originalTable=initial.objects.find(o=>o.role==='table'),chair=initial.objects.find(o=>o.name==='椅子'),monitor=initial.objects.find(o=>o.sourceFile==='monitor_demo.glb');
 const object=async id=>(await state()).objects.find(o=>o.id===id),select=id=>page.evaluate(id=>window.deskverse.select(id),id),transform=(id,patch)=>page.evaluate(({id,patch})=>window.deskverse.setTransform(id,patch),{id,patch});
 const surface=initial.placement.surface,outline=surface.polygon,rectangleArea=(surface.max[0]-surface.min[0])*(surface.max[2]-surface.min[2]);
 assert.equal(surface.shapeSource,'named-top-mesh');assert.ok(area(outline)<rectangleArea-1);
 const signs=outline.map((p,i)=>{const a=outline[(i+outline.length-1)%outline.length],b=outline[(i+1)%outline.length];return (p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]);});assert.ok(signs.some(n=>n>1e-4)&&signs.some(n=>n< -1e-4),'The real desktop must retain its concave return');
 const assertPlanFraming=async()=>{
  const framing=await page.locator('#plan-map').evaluate(svg=>{
   const boxes=[...svg.querySelectorAll('.plan-surface,.plan-support,.plan-item')].map(shape=>shape.getBBox());
   return {left:Math.min(...boxes.map(box=>box.x)),right:Math.max(...boxes.map(box=>box.x+box.width)),top:Math.min(...boxes.map(box=>box.y)),bottom:Math.max(...boxes.map(box=>box.y+box.height))};
  });
  assert.ok(framing.left>=18&&framing.right<=342&&framing.top>=20&&framing.bottom<=196,'桌面、抽屉与物品的正常轮廓应完整显示');
  near(framing.left+framing.right,360,2);
 };
 await assertPlanFraming();
 await page.screenshot({path:resolve(output,'real-curved-outline.png'),fullPage:true});
 const setDimensions=async values=>{await page.locator('#uniform').uncheck();for(const [index,id]of ['dx','dy','dz'].entries()){await page.locator('#'+id).fill(String(values[index]));await page.locator('#'+id).dispatchEvent('change');}await page.locator('#confirm-size').click();};
 await select(monitor.id);await setDimensions([8,10,5]);await page.locator('#snap').uncheck();
 await transform(monitor.id,{position:[(surface.min[0]+surface.max[0])/2,0,surface.min[2]+12]});
 const center=async id=>{const box=await page.locator(`#plan-map [data-object-id="${id}"] .plan-item`).boundingBox();assert.ok(box);return {x:box.x+box.width/2,y:box.y+box.height/2};};
 async function drag(id,dx,dy,{cancel=null,scaled=false}={}){
  if(scaled)await page.locator('#plan-map').evaluate(svg=>{svg.style.transform='scale(.83)';});
  const before=await object(id),start=await center(id);
  if(cancel==='pointercancel')await page.locator('#plan-map').evaluate(svg=>svg.addEventListener('pointerdown',event=>{window.qaPlanPointerId=event.pointerId;},{once:true}));
  await page.mouse.move(start.x,start.y);await page.mouse.down();assert.deepEqual((await object(id)).position,before.position,'Pointer down must not jump the object');
  await page.mouse.move(start.x+dx/2,start.y+dy/2,{steps:5});await page.mouse.move(start.x+dx,start.y+dy,{steps:7});
  const moved=await object(id),visual=await center(id);near(visual.x-start.x,dx,1.5);near(visual.y-start.y,dy,1.5);near(moved.position[1],before.position[1]);assert.deepEqual(moved.dimensionsCm,before.dimensionsCm);
  if(cancel==='escape')await page.keyboard.press('Escape');
  if(cancel==='pointercancel'){const pointerId=await page.evaluate(()=>window.qaPlanPointerId);await page.locator('#plan-map').dispatchEvent('pointercancel',{pointerId,isPrimary:true,pointerType:'mouse'});}
  await page.mouse.up();const after=await object(id);
  if(cancel)assert.deepEqual(after.position,before.position);else{assert.ok(after.position[0]>before.position[0]);assert.ok(after.position[2]>before.position[2]);await page.locator('#undo').click();assert.deepEqual((await object(id)).position,before.position);await page.locator('#redo').click();assert.deepEqual((await object(id)).position,after.position);}
  if(scaled)await page.locator('#plan-map').evaluate(svg=>{svg.style.transform='';});
  return {before,after};
 }
 await drag(monitor.id,25,10);await drag(monitor.id,18,9,{scaled:true});await drag(monitor.id,20,8,{cancel:'escape'});await drag(monitor.id,20,8,{cancel:'pointercancel'});
 await page.screenshot({path:resolve(output,'plan-drag-synchronized.png'),fullPage:true});
 // 界面明确提供三个模式，线框模式仍允许自由环绕且不改变物品变换。
 assert.deepEqual(await page.locator('[data-projection]').evaluateAll(buttons=>buttons.map(button=>button.dataset.projection)),['perspective','top','wireframe']);
 await page.locator('[data-projection="top"]').click();assert.equal((await state()).view.cameraType,'OrthographicCamera');
 await page.locator('[data-projection="wireframe"]').click();assert.equal((await state()).view.cameraType,'PerspectiveCamera');assert.equal((await state()).view.mode,'wireframe');
 const beforeOrbit=await state(),canvas=await page.locator('#viewport canvas').boundingBox();await page.mouse.move(canvas.x+canvas.width*.52,canvas.y+canvas.height*.65);await page.mouse.down({button:'middle'});await page.mouse.move(canvas.x+canvas.width*.57,canvas.y+canvas.height*.68,{steps:8});await page.mouse.up({button:'middle'});await page.waitForTimeout(300);
 assert.notDeepEqual((await state()).view.position,beforeOrbit.view.position);assert.deepEqual((await state()).objects.map(o=>[o.id,o.position,o.dimensionsCm]),beforeOrbit.objects.map(o=>[o.id,o.position,o.dimensionsCm]));
 await page.screenshot({path:resolve(output,'desk-only-wireframe.png'),fullPage:true});await page.locator('[data-projection="perspective"]').click();assert.equal((await state()).view.mode,'perspective');
 // B 保存原桌柜，A 的替换不能移除 B 的桌柜，也不能清空独立资产。
 await page.locator('[data-workspace="b"]').click();await page.locator('[data-workspace="a"]').click();
 await page.locator('#file-input').setInputFiles('dist/assets/demo-lamp.glb');await page.waitForFunction(()=>window.deskverse.getState().objects.length===4&&document.getElementById('loading').hidden);
 const lamp=(await state()).objects.at(-1);await setDimensions([4,3,6]);await page.locator('[data-panel-tab="furniture"]').click();await page.selectOption('#drawer-select','left-drawer');await page.locator('#drawer-open').click();await page.waitForFunction(()=>window.deskverse.getState().drawers[0].opening===1);await page.locator('#drawer-store').click();assert.equal((await object(lamp.id)).storage.drawerId,'left-drawer');
 await assertPlanFraming();
 await page.locator('[data-projection="wireframe"]').click();
 const beforeReplacement=await state();
 const unchanged=async()=>{const current=await state();assert.deepEqual(current.objects,beforeReplacement.objects);assert.deepEqual(current.drawers,beforeReplacement.drawers);assert.equal(current.view.mode,'wireframe');};
 async function uploadTable(file){await page.locator('#table-input').setInputFiles(file);await page.waitForFunction(()=>document.getElementById('table-input').value===''&&document.getElementById('loading').hidden);}
 await uploadTable({name:'broken.glb',mimeType:'model/gltf-binary',buffer:Buffer.from('not a GLB')});await unchanged();
 const json=Buffer.from(JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{}]})),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);const empty=Buffer.alloc(20+padded.length);empty.writeUInt32LE(0x46546c67,0);empty.writeUInt32LE(2,4);empty.writeUInt32LE(empty.length,8);empty.writeUInt32LE(padded.length,12);empty.writeUInt32LE(0x4e4f534a,16);padded.copy(empty,20);
 await uploadTable({name:'empty.glb',mimeType:'model/gltf-binary',buffer:empty});await unchanged();
 await uploadTable('dist/assets/demo-table.glb');const replaced=await state(),newTable=replaced.objects.find(o=>o.role==='table');
 assert.notEqual(newTable.id,originalTable.id);assert.equal(replaced.objects.filter(o=>o.role==='table').length,1);assert.equal(replaced.drawers.length,0);assert.equal(replaced.doors.length,0);assert.ok(replaced.objects.some(o=>o.id===chair.id));assert.ok(replaced.objects.some(o=>o.id===monitor.id));
 assert.deepEqual((await object(monitor.id)).dimensionsCm,beforeReplacement.objects.find(o=>o.id===monitor.id).dimensionsCm);assert.deepEqual((await object(monitor.id)).position,beforeReplacement.objects.find(o=>o.id===monitor.id).position);
 assert.equal((await object(lamp.id)).storage,null);near((await object(lamp.id)).worldBoundsCm.min[1],0);assert.deepEqual((await object(lamp.id)).dimensionsCm,(beforeReplacement.objects.find(o=>o.id===lamp.id)).dimensionsCm);
 assert.equal(replaced.view.mode,'wireframe');assert.equal(replaced.surface.tableId,newTable.id);near(replaced.surface.heightCm,0);assert.equal(await page.locator('#delete-object').isDisabled(),true);
 await page.screenshot({path:resolve(output,'replaced-table-wireframe.png'),fullPage:true});
 await page.locator('#undo').click();assert.equal((await state()).surface.tableId,originalTable.id);assert.equal((await object(lamp.id)).storage.drawerId,'left-drawer');assert.equal((await state()).drawers[0].opening,1);
 await page.locator('#redo').click();assert.equal((await state()).surface.tableId,newTable.id);assert.equal((await object(lamp.id)).storage,null);
 await page.locator('[data-workspace="b"]').click();assert.equal((await state()).surface.tableId,originalTable.id);assert.equal((await state()).objects.length,3);
 await page.locator('[data-workspace="a"]').click();assert.equal((await state()).surface.tableId,newTable.id);assert.equal((await state()).objects.length,4);
 // 内置场景可重新载入，但不重复加入仍在场景中的显示器和独立椅子。
 await page.locator('[data-panel-tab="assets"]').click();await page.locator('#load-real').click();await page.waitForFunction(()=>document.getElementById('loading').hidden&&window.deskverse.getState().drawers.length===4);
 const restored=await state();assert.equal(restored.objects.filter(o=>o.sourceFile==='monitor_demo.glb').length,1);assert.equal(restored.objects.filter(o=>o.name==='椅子').length,1);assert.ok(restored.objects.some(o=>o.id===chair.id));assert.ok(restored.objects.some(o=>o.id===lamp.id));assert.equal(restored.placement.surface.shapeSource,'named-top-mesh');
 await select(monitor.id);await transform(monitor.id,{position:[(surface.min[0]+surface.max[0])/2,0,surface.min[2]+12]});await page.setViewportSize({width:390,height:844});await page.locator('#toggle-inspector').click();
 await drag(monitor.id,14,8);await page.screenshot({path:resolve(output,'mobile-curved-plan-drag.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);console.log('Plan interactions passed: real concave desktop, continuous/scaled/mobile XZ drag preserving Y, undo/redo and cancellation, three views with free wireframe orbit, failed-table retention, atomic replacement retaining independent assets and clearing storage, A/B isolation and builtin asset reuse. No paid requests. Evidence:',output);
}finally{await browser.close();}
