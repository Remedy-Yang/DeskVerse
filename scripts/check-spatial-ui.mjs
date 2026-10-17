import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=resolve('.deskverse/qa/spatial');await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-4,`${actual} != ${expected}`);
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',error=>errors.push(error.message));
 // 仅使用本地资产；所有生成请求被隔离，绝不提交付费任务。
 await page.route('**/api/generation/**',route=>{assert.equal(route.request().method(),'GET');return route.fulfill({json:route.request().url().endsWith('/config')?{configured:false,csrf:'qa'}:{jobs:[]}});});
 await page.route('**/vendor/ocr/tesseract.esm.min.js',route=>route.fulfill({contentType:'application/javascript',body:"export default {OEM:{LSTM_ONLY:1},createWorker:async()=>({recognize:async()=>({data:{text:'产品尺寸 10 × 6 × 18 cm\\n产品尺寸 12 × 7 × 22 cm'}}),terminate:async()=>{}})};"}));
 await page.goto(process.env.DESKVERSE_URL||'http://127.0.0.1:8000',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.deskverse?.getState().objects.length===3&&document.getElementById('loading').hidden,null,{timeout:60000});
 const state=()=>page.evaluate(()=>window.deskverse.getState()),initial=await state();
 const transform=(id,patch)=>page.evaluate(({id,patch})=>window.deskverse.setTransform(id,patch),{id,patch});
 const theme=async id=>{await page.locator('.theme-picker summary').click();await page.locator(`[data-theme-choice="${id}"]`).click();await page.waitForTimeout(500);};
 const palettes=[];
 for(const id of ['atelier','obsidian','blueprint']){
  await theme(id);palettes.push(await page.locator('#inspector-dock').evaluate(el=>{const s=getComputedStyle(el);return s.backgroundColor+'|'+s.color;}));
  assert.deepEqual((await state()).objects.map(o=>[o.id,o.position,o.dimensionsCm]),initial.objects.map(o=>[o.id,o.position,o.dimensionsCm]));
  await page.screenshot({path:resolve(output,'theme-'+id+'.png'),fullPage:true});
 }
 assert.equal(new Set(palettes).size,3);
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.deskverse?.getState().objects.length===3&&document.getElementById('loading').hidden);
 assert.equal((await state()).appearance.theme,'blueprint');await theme('atelier');
 const live=await state(),main=live.objects.find(o=>o.sourceFile==='monitor_demo.glb'),surface=live.placement.surface;
 const safe=[(surface.min[0]+surface.max[0])/2,0,(surface.min[2]+surface.max[2])/2];
 const dimensions=async values=>{await page.locator('#uniform').uncheck();for(const [index,id]of ['dx','dy','dz'].entries()){await page.locator('#'+id).fill(String(values[index]));await page.locator('#'+id).dispatchEvent('change');}await page.locator('#confirm-size').click();};
 await dimensions([6,10,4]);await transform(main.id,{position:safe});
 let fit=(await state()).placement.selected;assert.equal(fit.boundary.state,'ok');assert.equal(fit.size.state,'ok');assert.equal(fit.conflict.state,'ok');
 await transform(main.id,{position:[surface.max[0]+20,0,safe[2]]});fit=(await state()).placement.selected;assert.equal(fit.boundary.state,'warning');assert.equal(fit.size.state,'ok');
 await transform(main.id,{position:safe});await dimensions([200,10,4]);fit=(await state()).placement.selected;assert.equal(fit.size.state,'warning');
 await dimensions([6,10,4]);await page.locator('#file-input').setInputFiles('dist/assets/demo-lamp.glb');await page.waitForFunction(()=>window.deskverse.getState().objects.length===4&&document.getElementById('loading').hidden);
 const lamp=(await state()).objects.at(-1);await dimensions([6,10,4]);await transform(lamp.id,{position:safe});
 fit=(await state()).placement.selected;assert.equal(fit.conflict.state,'warning');assert.ok(fit.conflict.ids.includes(main.id));
 await transform(lamp.id,{position:[safe[0],100,safe[2]]});fit=(await state()).placement.selected;assert.equal(fit.conflict.state,'ok');assert.equal(fit.boundary.state,'na');
 await page.locator(`#plan-map [data-object-id="${main.id}"]`).focus();await page.keyboard.press('Enter');assert.equal((await state()).placement.selected.id,main.id);
 assert.equal(await page.locator('#plan-map').isVisible(),true);
 // B 只在首次切换复制，位置、缩放、物品增删、家具机构和历史互不污染。
 await page.locator('[data-workspace="b"]').click();assert.deepEqual((await state()).objects.find(o=>o.id===main.id).position,safe);
 const bPosition=[safe[0]+15,0,safe[2]-5];await transform(main.id,{position:bPosition,rotation:[0,35,0]});
 await page.locator('[data-panel-tab="furniture"]').click();await page.selectOption('#drawer-select','left-drawer');await page.locator('#drawer-open').click();await page.waitForFunction(()=>window.deskverse.getState().drawers[0].opening===1);
 await page.locator('[data-workspace="a"]').click();assert.deepEqual((await state()).objects.find(o=>o.id===main.id).position,safe);assert.equal((await state()).drawers[0].opening,0);
 await page.locator('[data-workspace="b"]').click();assert.deepEqual((await state()).objects.find(o=>o.id===main.id).position,bPosition);assert.equal((await state()).drawers[0].opening,1);
 await page.locator('#undo').click();assert.equal((await state()).drawers[0].opening,0);assert.deepEqual((await state()).objects.find(o=>o.id===main.id).position,bPosition);
 await page.locator('#delete-object').click();assert.ok(!(await state()).objects.some(o=>o.id===main.id));
 await page.locator('[data-workspace="a"]').click();assert.ok((await state()).objects.some(o=>o.id===main.id));
 await page.locator('[data-workspace="b"]').click();assert.ok(!(await state()).objects.some(o=>o.id===main.id));await page.locator('#undo').click();assert.ok((await state()).objects.some(o=>o.id===main.id));
 await page.locator('[data-workspace="a"]').click();await page.evaluate(id=>window.deskverse.select(id),main.id);
 await page.locator('#size-chart-file').setInputFiles('deskmodels/杯子/尺寸图.jpg');await page.waitForFunction(()=>document.querySelectorAll('#size-variant-options button').length===2);
 const aImage=await page.locator('#size-chart-image').getAttribute('src');await page.locator('#size-variant-options button').first().click();const aSize=(await state()).objects.find(o=>o.id===main.id).dimensionsCm;
 await page.locator('[data-workspace="b"]').click();assert.equal(await page.locator('#size-chart-preview').isVisible(),false);
 const chart=await readFile('deskmodels/杯子/尺寸图.jpg');await page.locator('#size-chart-file').setInputFiles({name:'B-chart.jpg',mimeType:'image/jpeg',buffer:chart});await page.waitForFunction(()=>document.querySelectorAll('#size-variant-options button').length===2);await page.locator('#size-variant-options button').last().click();
 const bImage=await page.locator('#size-chart-image').getAttribute('src'),bSize=(await state()).objects.find(o=>o.id===main.id).dimensionsCm;assert.notEqual(aImage,bImage);assert.notDeepEqual(aSize,bSize);
 await page.locator('[data-workspace="a"]').click();assert.equal(await page.locator('#size-chart-image').getAttribute('src'),aImage);assert.deepEqual((await state()).objects.find(o=>o.id===main.id).dimensionsCm,aSize);await page.locator('#size-chart-image').evaluate(image=>image.decode());
 await page.locator('[data-workspace="b"]').click();assert.equal(await page.locator('#size-chart-image').getAttribute('src'),bImage);assert.deepEqual((await state()).objects.find(o=>o.id===main.id).dimensionsCm,bSize);
 // 真正切换相机；缩放/平移和属性编辑仍可使用，二维图不被视角按钮替换。
 const beforeProjection=(await state()).objects.map(o=>[o.id,o.position,o.dimensionsCm]);await page.locator('[data-projection="top"]').click();assert.equal((await state()).view.cameraType,'OrthographicCamera');assert.equal(await page.locator('#plan-map').isVisible(),true);
 const beforeZoom=(await state()).view.zoom;await page.locator('#viewport canvas').hover();await page.mouse.wheel(0,-180);await page.waitForTimeout(250);assert.ok((await state()).view.zoom>beforeZoom);
 assert.deepEqual((await state()).objects.map(o=>[o.id,o.position,o.dimensionsCm]),beforeProjection);
 await page.locator('#px').fill('55');await page.locator('#px').dispatchEvent('change');near((await state()).objects.find(o=>o.id===main.id).position[0],55);await page.locator('#undo').click();
 await page.screenshot({path:resolve(output,'orthographic-plan.png'),fullPage:true});await page.locator('[data-projection="perspective"]').click();assert.equal((await state()).view.cameraType,'PerspectiveCamera');
 // 网格仅叠加在实体地板上；截图供阴影、材质和布局复核。
 await page.locator('#view-home').click();await page.locator('.view-distance summary').click();await page.locator('[data-distance="460"]').click();await page.locator('.view-distance summary').click();
 for(const id of ['dorm-day','dorm-night','desk-lamp']){await page.locator('[data-panel-tab="lighting"]').click();await page.selectOption('#lighting-preset',id);await page.screenshot({path:resolve(output,'floor-'+id+'.png'),fullPage:true});}
 await page.selectOption('#lighting-preset','dorm-day');await page.locator('#grid-toggle').click();await page.screenshot({path:resolve(output,'floor-with-optional-grid.png'),fullPage:true});await page.locator('#grid-toggle').click();
 for(const size of [{width:1280,height:720},{width:768,height:1024},{width:390,height:844}]){
  await page.setViewportSize(size);if(size.width<=1100)await page.locator('#toggle-inspector').click();
  assert.equal(await page.locator('#plan-map').isVisible(),true);
  const fitWidth=await page.locator('#placement-panel').evaluate(el=>el.scrollWidth<=el.clientWidth+1);assert.ok(fitWidth);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:resolve(output,'layout-'+size.width+'.png'),fullPage:true});
  if(size.width<=1100)await page.locator('#toggle-inspector').click();
 }
 await theme('obsidian');await page.locator('#toggle-inspector').click();await page.screenshot({path:resolve(output,'mobile-dark-plan.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('Spatial UI passed: three persistent themes, selected fit boundaries/size/overlap, keyboard plan selection, independent A/B objects/drawers/history/specs/images, real orthographic and perspective editing, solid-floor lighting presets and responsive plan. OCR mocked; no paid requests. Evidence:',output);
}finally{await browser.close();}
