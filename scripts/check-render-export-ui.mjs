import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');

const base=process.env.DESKVERSE_URL||'http://127.0.0.1:8000';
const output=resolve('.deskverse/qa/render-export');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const angles=['current','front','left','right','top'];
const sizes={
 '1080':{width:1920,height:1080},
 '2k':{width:2560,height:1440},
 '4k':{width:3840,height:2160}
};

const errors=[];

const canonicalState=state=>({
 workspace:state.workspace,
 appearance:state.appearance,
 view:{mode:state.view.mode,cameraType:state.view.cameraType,position:state.view.position.map(value=>+value.toFixed(6)),target:state.view.target.map(value=>+value.toFixed(6)),zoom:+state.view.zoom.toFixed(6)},
 lighting:state.lighting,
 surface:state.surface,
 placement:state.placement,
 coordinateSystem:state.coordinateSystem,
 objects:state.objects.map(object=>({id:object.id,name:object.name,role:object.role,position:object.position.map(value=>+value.toFixed(6)),rotation:object.rotation.map(value=>+value.toFixed(6)),dimensionsCm:object.dimensionsCm.map(value=>+value.toFixed(6)),scale:object.scale?.map(value=>+value.toFixed(6)),grounded:object.grounded,storage:object.storage})),
 drawers:state.drawers,doors:state.doors
});
const readState=page=>page.evaluate(()=>window.deskverse.getState());
const historyState=page=>page.evaluate(()=>({undo:document.getElementById('undo').disabled,redo:document.getElementById('redo').disabled}));
const setLightingRange=(page,id,value)=>page.locator('#'+id).evaluate((input,next)=>{input.value=String(next);input.dispatchEvent(new Event('input',{bubbles:true}));},value);
const assertHeightOnly=(before,after,height)=>{
 assert.ok(Math.abs(after.view.position[1]-height)<1e-6,'相机 Y 必须采用输入高度');
 for(const axis of [0,2])assert.ok(Math.abs(after.view.position[axis]-before.view.position[axis])<1e-6,'高度调节不能改变 X/Z');
 assert.deepEqual(after.view.target,before.view.target);assert.equal(after.view.zoom,before.view.zoom);assert.equal(after.view.mode,before.view.mode);assert.equal(after.view.cameraType,before.view.cameraType);
 const {view:beforeView,...beforeLayout}=before,{view:afterView,...afterLayout}=after;assert.deepEqual(afterLayout,beforeLayout,'相机高度不能修改模型、方案或灯光');
};
const editHeight=async(page,height)=>{await page.locator('#camera-height-input').fill(String(height));await page.locator('#camera-height-input').press('Tab');};
const readRenderJson=async page=>{const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#render-json').click()]);const path=await download.path();assert.ok(path,'布局 JSON 下载必须有文件路径');return JSON.parse(await readFile(path,'utf8'));};
const previewPixels=page=>page.locator('#render-preview canvas').evaluate(canvas=>{
 const context=canvas.getContext('2d',{willReadFrequently:true});
 if(!context)return {width:canvas.width,height:canvas.height,readable:false,uniqueColors:0,nonUniform:0,hash:0};
 const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
 const stride=4*4,background=pixels.slice(0,3),colors=new Set();let nonUniform=0,hash=2166136261,luminance=0,samples=0;
 for(let offset=0;offset<pixels.length;offset+=stride){
  const red=pixels[offset],green=pixels[offset+1],blue=pixels[offset+2];
  colors.add((red>>3)+','+(green>>3)+','+(blue>>3));
  luminance+=.2126*red+.7152*green+.0722*blue;samples++;
  if(Math.abs(red-background[0])+Math.abs(green-background[1])+Math.abs(blue-background[2])>24)nonUniform++;
  hash^=red;hash=Math.imul(hash,16777619);hash^=green;hash=Math.imul(hash,16777619);hash^=blue;hash=Math.imul(hash,16777619);
 }
 return {width:canvas.width,height:canvas.height,readable:true,uniqueColors:colors.size,nonUniform,hash:hash>>>0,meanLuma:luminance/samples};
});
const pngRaster=async(page,bytes)=>page.evaluate(async base64=>{
 const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();
 const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
 const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
 const pixels=context.getImageData(0,0,canvas.width,canvas.height).data,background=pixels.slice(0,3),stride=Math.max(4,Math.floor(Math.sqrt(canvas.width*canvas.height/250000)))*4;
 const colors=new Set();let nonUniform=0,hash=2166136261,luminance=0,samples=0;
 for(let offset=0;offset<pixels.length;offset+=stride){
  const red=pixels[offset],green=pixels[offset+1],blue=pixels[offset+2];colors.add((red>>3)+','+(green>>3)+','+(blue>>3));
  hash^=red;hash=Math.imul(hash,16777619);hash^=green;hash=Math.imul(hash,16777619);hash^=blue;hash=Math.imul(hash,16777619);luminance+=.2126*red+.7152*green+.0722*blue;samples++;
  if(Math.abs(red-background[0])+Math.abs(green-background[1])+Math.abs(blue-background[2])>24)nonUniform++;
 }
 return {width:image.naturalWidth,height:image.naturalHeight,uniqueColors:colors.size,nonUniform,hash:hash>>>0,meanLuma:luminance/samples};
},bytes.toString('base64'));
const savePng=async(page,sizeId,workspace,angle,evidenceName)=>{
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#render-save').click()]);await page.waitForFunction(()=>document.getElementById('render-status')?.textContent.includes('已生成'));
 const filename=download.suggestedFilename();assert.match(filename,/^DeskVerse-[AB]-(current|front|left|right|top)-(1920x1080|2560x1440|3840x2160)\.png$/);
 const expected=sizes[sizeId];assert.equal(filename,`DeskVerse-${workspace}-${angle}-${expected.width}x${expected.height}.png`);
 const path=resolve(output,evidenceName||filename);await download.saveAs(path);
 const bytes=await readFile(path);
 assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10],'下载文件必须为 PNG');
 assert.equal(bytes.readUInt32BE(8),13,'PNG 必须包含 IHDR');assert.equal(bytes.readUInt32BE(12),0x49484452,'PNG 首块必须为 IHDR');
 assert.equal(bytes.readUInt32BE(16),expected.width);assert.equal(bytes.readUInt32BE(20),expected.height);
 const raster=await pngRaster(page,bytes);assert.equal(raster.width,expected.width);assert.equal(raster.height,expected.height);assert.ok(raster.uniqueColors>30&&raster.nonUniform>500,'PNG 解码后必须有有意义的非均匀画面');
 return {filename,raster};
};
const openRender=async page=>{await page.locator('#render-export').click();await page.locator('#render-dialog[open]').waitFor({state:'visible'});await page.locator('#render-preview canvas').waitFor();await page.waitForFunction(()=>{const canvas=document.querySelector('#render-preview canvas'),error=document.getElementById('render-error');return canvas?.width===960&&canvas?.height===540&&error?.hidden;});assert.equal(await page.locator('#render-error').isHidden(),true);assert.equal(await page.locator('#render-angle').inputValue(),'current','每次打开效果图都应使用当前视角');};
const closeRender=async page=>{await page.locator('#render-close').click();await page.locator('#render-dialog[open]').waitFor({state:'hidden'});};

try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 await context.route('**/api/generation/**',route=>{
  const request=route.request();assert.equal(request.method(),'GET','生成 API 检查只允许 GET');
  return route.fulfill({json:request.url().endsWith('/config')?{configured:false,csrf:'qa'}:{jobs:[]}});
 });
 const page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 page.on('requestfailed',request=>errors.push(request.url()+' '+(request.failure()?.errorText||'')));
 await page.goto(base,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.deskverse?.getState().objects.length===3&&document.getElementById('loading').hidden,null,{timeout:60000});
 const state=()=>readState(page);
await page.locator('[data-panel-tab="lighting"]').click();await page.selectOption('#lighting-preset','dorm-day');await setLightingRange(page,'lighting-intensity',100);await setLightingRange(page,'lighting-warmth',0);
 await page.locator('[data-projection="perspective"]').click();
 // 底部独立高度按钮只移动当前相机；数值提交、惯性、各投影和坐姿不得改动布局。
 const heightBaseline=await state(),heightHistory=await historyState(page);
 await openRender(page);const originalCurrentRaster=await previewPixels(page);await page.selectOption('#render-angle','right');await closeRender(page);
 await page.locator('#camera-height-toggle').click();await page.locator('#camera-height-panel').waitFor({state:'visible'});
 assert.equal(await page.locator('#camera-height-input').evaluate(input=>input.validity.valid),true,'当前相机的小数高度不能被标成无效');
 await page.locator('#camera-height-range').evaluate(input=>{input.value='123.5';input.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForTimeout(150);assertHeightOnly(heightBaseline,await state(),123.5);
 for(const invalid of ['', '100001']){await editHeight(page,invalid);assertHeightOnly(heightBaseline,await state(),123.5);}
 await page.locator('#camera-height-input').fill('240.55');assert.equal(await page.locator('#camera-height-input').evaluate(input=>input.validity.valid),true);await openRender(page);assertHeightOnly(heightBaseline,await state(),240.55);assert.equal(await page.locator('#camera-height-panel').isHidden(),true);assert.notEqual((await previewPixels(page)).hash,originalCurrentRaster.hash,'当前视角预览必须反映相机高度');await savePng(page,'2k','A','current','camera-height-current.png');await closeRender(page);
 for(const mode of ['wireframe','top','perspective']){
  await page.locator(`[data-projection="${mode}"]`).click();const before=await state(),height=before.view.position[1]+25;
  await page.locator('#camera-height-toggle').click();await editHeight(page,height);await page.waitForTimeout(100);assertHeightOnly(before,await state(),height);
  if(mode==='top'){await editHeight(page,before.view.target[1]);assertHeightOnly(before,await state(),height);const low=Number(await page.locator('#camera-height-input').getAttribute('min'))+.05;await editHeight(page,low);assertHeightOnly(before,await state(),low);assert.equal(await page.locator('#camera-height-input').evaluate(input=>input.validity.valid),true);}
  await page.keyboard.press('Escape');assert.equal(await page.locator('#camera-height-panel').isHidden(),true);assert.equal(await page.locator('#camera-height-toggle').evaluate(element=>element===document.activeElement),true);
 }
 const beforeOrbit=await state(),orbitBox=await page.locator('#viewport canvas').boundingBox(),orbitX=orbitBox.x+orbitBox.width*.55,orbitY=orbitBox.y+orbitBox.height*.35;
 await page.mouse.move(orbitX,orbitY);await page.mouse.down({button:'middle'});await page.mouse.move(orbitX+55,orbitY+35,{steps:4});await page.mouse.up({button:'middle'});assert.notDeepEqual((await state()).view.position,beforeOrbit.view.position);
 await page.locator('#camera-height-toggle').click();const settled=await state();await page.waitForTimeout(180);assertHeightOnly(settled,await state(),settled.view.position[1]);await editHeight(page,settled.view.position[1]+20);assertHeightOnly(settled,await state(),settled.view.position[1]+20);await page.keyboard.press('Escape');
 await page.locator('.view-distance summary').click();await page.locator('#seat-view').click();const seatBeforeHeight=await state();await page.locator('#camera-height-toggle').click();await editHeight(page,150.25);assertHeightOnly(seatBeforeHeight,await state(),150.25);await page.keyboard.press('Escape');assert.equal(await page.locator('#seat-view').getAttribute('aria-pressed'),'true');await page.locator('#seat-view').click();await page.locator('.view-distance summary').click();
 await page.locator('#view-home').click();await page.locator('.view-distance summary').click();await setLightingRange(page,'view-distance-range',560);await page.locator('.view-distance summary').click();
 await page.locator('#camera-height-toggle').click();assert.ok(Math.abs(Number(await page.locator('#camera-height-input').inputValue())-(await state()).view.position[1])<.01);await page.locator('#toast').waitFor({state:'hidden'});await page.screenshot({path:resolve(output,'camera-height-desktop.png'),fullPage:true});await page.keyboard.press('Escape');assert.deepEqual(await historyState(page),heightHistory);
 const initial=await state();assert.equal(initial.workspace.id,'a');assert.equal(initial.view.mode,'perspective');assert.equal(initial.lighting.preset,'dorm-day');
 const initialHistory=await historyState(page);
 // 既有布局导出仍须是真实 JSON，且不能改变当前方案。
 const [layoutDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
 assert.equal(layoutDownload.suggestedFilename(),'DeskVerse-layout.json');const layoutPath=await layoutDownload.path();assert.ok(layoutPath);const layoutJson=JSON.parse(await readFile(layoutPath,'utf8'));assert.deepEqual(canonicalState(layoutJson),canonicalState(initial));
 // 先进入透视网格，确认导出只临时隐藏辅助显示，回来后仍保持当前工具状态。
await page.locator('[data-projection="wireframe"]').click();const wireframeBefore=await state();assert.equal(wireframeBefore.view.mode,'wireframe');
const dayBefore=await state();await openRender(page);const dayRenderJson=await readRenderJson(page);assert.deepEqual(canonicalState(dayRenderJson),canonicalState(dayBefore));assert.match(await page.locator('#render-lighting').innerText(),/宿舍白天/);assert.match(await page.locator('#render-lighting').innerText(),/100/);
 await page.selectOption('#render-angle','right');await page.selectOption('#render-resolution','2k');await page.waitForTimeout(180);
 const angleRasters=new Map();
for(const angle of angles){
 await page.selectOption('#render-angle',angle);await page.waitForTimeout(180);const raster=await previewPixels(page);assert.equal(raster.width,960);assert.equal(raster.height,540);assert.equal(raster.readable,true);assert.ok(raster.uniqueColors>30&&raster.nonUniform>150,'每个预设视角都必须是非均匀真实画面');angleRasters.set(angle,raster.hash);await page.screenshot({path:resolve(output,'day-'+angle+'.png'),fullPage:true});
}
 assert.equal(new Set(angleRasters.values()).size,angles.length,'五个视角必须生成不同位图');
 await page.selectOption('#render-angle','right');await page.selectOption('#render-resolution','2k');await page.waitForTimeout(100);const dayPng=await savePng(page,'2k','A','right');
 await page.selectOption('#render-resolution','1080');await page.waitForTimeout(100);await savePng(page,'1080','A','right');
 await page.selectOption('#render-resolution','4k');await page.waitForTimeout(100);await savePng(page,'4k','A','right');
 await page.selectOption('#render-resolution','2k');await closeRender(page);
 assert.deepEqual(canonicalState(await state()),canonicalState(dayBefore));assert.deepEqual(await historyState(page),initialHistory);assert.equal(await page.locator('[data-projection="wireframe"]').evaluate(button=>button.classList.contains('active')),true);
 // 关闭与 Escape 都不能把 Escape / Delete 传给底层编辑器。
const wireframeAfterClose=await state();await openRender(page);await page.keyboard.press('Delete');await page.keyboard.press('t');await page.keyboard.press('Escape');await page.locator('#render-dialog[open]').waitFor({state:'hidden'});assert.deepEqual(canonicalState(await state()),canonicalState(wireframeAfterClose));assert.deepEqual(await historyState(page),initialHistory);assert.equal(await page.locator('[data-projection="wireframe"]').evaluate(button=>button.classList.contains('active')),true);
 // 当前光照改变后，标签和光栅必须同时反映实际日夜、亮度和冷暖。
await page.locator('[data-panel-tab="lighting"]').click();await page.selectOption('#lighting-preset','dorm-night');await setLightingRange(page,'lighting-intensity',72);await setLightingRange(page,'lighting-warmth',-45);const nightBefore=await state();assert.equal(nightBefore.lighting.preset,'dorm-night');assert.equal(nightBefore.lighting.intensity,.72);assert.equal(nightBefore.lighting.warmth,-45);
await openRender(page);const lightingText=await page.locator('#render-lighting').innerText();assert.match(lightingText,/宿舍夜晚/);assert.match(lightingText,/72/);assert.ok(lightingText.includes('-45')||lightingText.includes('偏冷'),'光照标签必须反映冷暖调整');const nightJson=await readRenderJson(page);assert.deepEqual(canonicalState(nightJson),canonicalState(nightBefore));await page.selectOption('#render-angle','right');await page.selectOption('#render-resolution','2k');await page.waitForTimeout(180);
const nightRaster=await previewPixels(page);assert.equal(nightRaster.width,960);assert.equal(nightRaster.height,540);assert.equal(nightRaster.readable,true);assert.notEqual(nightRaster.hash,angleRasters.get('right'),'日夜光照必须改变解码后的位图');
const nightPng=await savePng(page,'2k','A','right','night-DeskVerse-A-right-2560x1440.png');
assert.notEqual(nightPng.raster.hash,dayPng.raster.hash,'下载的高清 PNG 必须体现当前日夜布光，不能只更新预览');
assert.ok(nightPng.raster.meanLuma<dayPng.raster.meanLuma*.8,'低亮度夜景 PNG 必须保留明显低于白天的整体明度');
assert.ok(Math.abs(nightPng.raster.meanLuma-nightRaster.meanLuma)<5,'预览和高清 PNG 必须使用一致的当前光照');
console.log('Downloaded PNG lighting:',JSON.stringify({dayMeanLuma:dayPng.raster.meanLuma,nightMeanLuma:nightPng.raster.meanLuma,nightPreviewMeanLuma:nightRaster.meanLuma}));
await page.screenshot({path:resolve(output,'night-right-adjusted.png'),fullPage:true});assert.deepEqual(canonicalState(await state()),canonicalState(nightBefore));await closeRender(page);assert.deepEqual(canonicalState(await state()),canonicalState(nightBefore));
 // 当前相机切到正交俯视后，渲染 JSON 仍保留相机和对象，不污染工作区历史。
await page.locator('#view-top').click();await page.waitForFunction(()=>window.deskverse.getState().view.mode==='top');const topBefore=await state();await openRender(page);const topJson=await readRenderJson(page);assert.equal(topJson.view.mode,'top');assert.deepEqual(canonicalState(topJson),canonicalState(topBefore));await closeRender(page);assert.deepEqual(canonicalState(await state()),canonicalState(topBefore));
// 椅子近景是当前相机的合法构图，即使部分场景在相机后方也不能被强行改成全景。
await page.locator('[data-projection="perspective"]').click();await page.locator('.view-distance summary').click();await page.locator('#seat-view').click();await page.waitForFunction(()=>document.getElementById('seat-view').getAttribute('aria-pressed')==='true');const seatedBefore=await state();await openRender(page);await page.selectOption('#render-angle','current');await page.waitForTimeout(180);const seatedRaster=await previewPixels(page);assert.equal(seatedRaster.width,960);assert.equal(seatedRaster.height,540);assert.equal(seatedRaster.readable,true);assert.ok(seatedRaster.nonUniform>150);const seatedJson=await readRenderJson(page);assert.deepEqual(canonicalState(seatedJson),canonicalState(seatedBefore));await page.screenshot({path:resolve(output,'current-seated.png'),fullPage:true});await closeRender(page);assert.deepEqual(canonicalState(await state()),canonicalState(seatedBefore));await page.locator('#seat-view').click();
 // B 方案导出使用独立文件名和独立布局。
await page.locator('[data-workspace="b"]').click();await page.waitForFunction(()=>window.deskverse.getState().workspace.id==='b');await page.locator('[data-projection="perspective"]').click();const bBefore=await state();const projectionBeforeB=bBefore.view.mode;assert.equal(bBefore.workspace.id,'b');await openRender(page);await page.selectOption('#render-angle','right');await page.selectOption('#render-resolution','2k');await page.waitForTimeout(180);const bJson=await readRenderJson(page);assert.equal(bJson.workspace.id,'b');assert.deepEqual(canonicalState(bJson),canonicalState(await state()));const bRenderBefore=await state();
// 真实消费者失败时必须显示错误并恢复控件，再用原生 toBlob 重试一次。
await page.evaluate(()=>{const original=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.__qaOriginalToBlob=original;HTMLCanvasElement.prototype.toBlob=function(callback){HTMLCanvasElement.prototype.toBlob=original;callback(null);};});await page.locator('#render-save').click();await page.locator('#render-error').waitFor({state:'visible'});assert.ok((await page.locator('#render-error').innerText()).length>0);assert.deepEqual(canonicalState(await state()),canonicalState(bRenderBefore));assert.deepEqual(await page.locator('#render-save').isDisabled(),false);assert.deepEqual(await page.locator('#render-angle').isDisabled(),false);assert.deepEqual(await page.locator('#render-resolution').isDisabled(),false);await page.evaluate(()=>{const original=HTMLCanvasElement.prototype.__qaOriginalToBlob;if(original)HTMLCanvasElement.prototype.toBlob=original;delete HTMLCanvasElement.prototype.__qaOriginalToBlob;});
for(const id of ['render-save','render-close','render-angle','render-resolution','render-json'])assert.equal(await page.locator('#'+id).isDisabled(),false);
await savePng(page,'2k','B','right');await closeRender(page);assert.deepEqual(canonicalState(await state()),canonicalState(bBefore));
await page.locator('[data-workspace="a"]').click();await page.waitForFunction(()=>window.deskverse.getState().workspace.id==='a');const aAfterB=await state();assert.equal(aAfterB.view.mode,projectionBeforeB);assert.deepEqual(canonicalState(aAfterB).objects,canonicalState(dayBefore).objects);assert.deepEqual(await historyState(page),initialHistory);
 // 窄屏对话框不能横向溢出，保存按钮仍须可见且可达。
 await page.setViewportSize({width:390,height:844});await openRender(page);const fit=await page.locator('#render-dialog').evaluate(element=>{const box=element.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,scroll:element.scrollWidth,client:element.clientWidth,viewport:innerWidth};});assert.ok(fit.left>=0&&fit.right<=fit.viewport&&fit.scroll<=fit.client+1,'窄屏渲染对话框不能横向溢出');const saveBox=await page.locator('#render-save').boundingBox();assert.ok(saveBox&&saveBox.x>=0&&saveBox.x+saveBox.width<=390&&saveBox.y+saveBox.height<=844,'窄屏保存按钮必须可达');await page.screenshot({path:resolve(output,'mobile-dialog.png'),fullPage:true});await closeRender(page);
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});const before=await state();await page.locator('#camera-height-toggle').click();await editHeight(page,before.view.position[1]+15);assertHeightOnly(before,await state(),before.view.position[1]+15);
  for(const selector of ['.tool-dock','#camera-height-panel']){const fit=await page.locator(selector).evaluate(element=>{const box=element.getBoundingClientRect();return {left:box.left,right:box.right,bottom:box.bottom,scroll:element.scrollWidth,client:element.clientWidth};});assert.ok(fit.left>=0&&fit.right<=width&&fit.bottom<=844&&fit.scroll<=fit.client+1,'手机高度控件和工具栏必须完整可达');}
  await page.locator('#toast').waitFor({state:'hidden'});await page.screenshot({path:resolve(output,`camera-height-mobile-${width}.png`),fullPage:true});await page.keyboard.press('Escape');
 }
 assert.deepEqual(errors,[]);await context.close();console.log('Render export UI passed: current-view defaults on every opening; isolated camera Y editing via slider/numeric entry in perspective, wireframe, top and seated views; unchanged layouts/history, current-view PNG, keyboard and 320/390px height controls; real angles, lighting, A/B JSON and PNG downloads (1080/2K/4K), failure recovery and mobile dialog. Generation routes were mocked as GET only; no paid calls. Evidence:',output);
}finally{await browser.close();}
