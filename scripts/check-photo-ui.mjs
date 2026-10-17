import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const {PNG}=await import(process.env.PNGJS_MODULE||'pngjs');
const base=process.env.DESKVERSE_URL||'http://127.0.0.1:8002';
const output=resolve('.deskverse/qa');
await mkdir(output,{recursive:true});
const fixture=await readFile('dist/assets/demo-lamp.glb');
const browser=await chromium.launch({channel:'chrome',headless:true});
let submissions=0;
const jobs=new Map(),polls=new Map(),consoleErrors=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 await context.route('**/api/generation/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path.endsWith('/config'))return route.fulfill({json:{configured:true,csrf:'mock-only',tier:'Regular'}});
  if(path.endsWith('/jobs')&&request.method()==='GET')return route.fulfill({json:{jobs:[...jobs.values()]}});
  if(path.endsWith('/jobs')&&request.method()==='POST'){
   submissions++;const payload=request.postDataJSON();assert.equal(payload.confirmed,true);assert.ok(payload.image.length>0);assert.equal(request.headers()['x-deskverse-token'],'mock-only');
   const job={id:payload.id,name:payload.name,status:'submitting',consumed:.5,created:Date.now()/1000,error:''};jobs.set(job.id,job);return route.fulfill({status:202,json:job});
  }
  if(path.includes('/models/'))return route.fulfill({contentType:'model/gltf-binary',body:fixture});
  if(path.includes('/jobs/')){
   const id=path.split('/').at(-1),job=jobs.get(id);assert.ok(job);const count=(polls.get(id)||0)+1;polls.set(id,count);
   job.status=count===1?'queued':count===2?'generating':'ready';if(job.status==='ready')job.modelUrl='/api/generation/models/'+id+'.glb';return route.fulfill({json:job});
  }
  throw new Error('Unexpected generation route: '+path);
 });
 const page=await context.newPage();page.on('pageerror',error=>consoleErrors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
 page.on('requestfailed',request=>consoleErrors.push(request.url()+' '+request.failure()?.errorText));
 await page.goto(base,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.deskverse?.getState().objects.length===3&&document.getElementById('loading').hidden,null,{timeout:60000});
 await page.locator('#photo-open').click();
 await page.locator('#photo-dialog').waitFor({state:'visible'});
 assert.equal(await page.locator('#photo-submit').isDisabled(),true);
 await page.locator('#photo-input').setInputFiles('deskmodels/杯子/尺寸图.jpg');
 await page.locator('#photo-name').fill('保温杯测试');
 await page.locator('#photo-preview').evaluate(image=>image.decode());
 assert.equal(await page.locator('#photo-submit').isDisabled(),true);
 await page.screenshot({path:resolve(output,'photo-dialog-desktop.png'),fullPage:true});
 await page.locator('#photo-consent').check();
 await page.locator('#photo-submit').click();
 await page.locator('#photo-dialog').waitFor({state:'hidden'});
 await page.waitForFunction(()=>window.deskverse.getState().objects.some(item=>item.name==='保温杯测试'),null,{timeout:40000});
 assert.equal(submissions,1);
 const generated=await page.evaluate(()=>window.deskverse.getState().objects.find(item=>item.name==='保温杯测试'));
 assert.deepEqual(generated.dimensionsCm.map(n=>+n.toFixed(3)),[7.5,24,7.6]);assert.equal(generated.calibrated,false);assert.equal(generated.referenceSize.category,'cup');
 assert.equal(await page.locator('#reference-options button').count(),3);assert.equal(await page.locator('#size-chart-button').isEnabled(),true);
 assert.equal(await page.locator('.generation-job').count(),1);
 assert.match(await page.locator('.generation-job').innerText(),/已在场景中/);
 assert.equal(await page.locator('.generation-job a').getAttribute('download'),'DeskVerse-'+[...jobs.keys()][0]+'.glb');
 await page.screenshot({path:resolve(output,'photo-result-desktop.png'),fullPage:true});
 const canvas=page.locator('#viewport canvas');const rendered=PNG.sync.read(await canvas.screenshot());let nonblank=0;
 const background=rendered.data.subarray(0,3);for(let index=0;index<rendered.data.length;index+=4){if(Math.abs(rendered.data[index]-background[0])+Math.abs(rendered.data[index+1]-background[1])+Math.abs(rendered.data[index+2]-background[2])>75)nonblank++;}
 assert.ok(nonblank>1000,'3D canvas must contain visible scene pixels');
 // 刷新恢复任务，但已导入过的任务不再次自动创建对象。
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.deskverse?.getState().objects.length===3&&document.getElementById('loading').hidden,null,{timeout:60000});
 await page.locator('.generation-job').waitFor();assert.equal(submissions,1);
 await page.locator('.generation-job button').click();
 await page.waitForFunction(()=>window.deskverse.getState().objects.length===4,null,{timeout:15000});
 assert.equal(submissions,1);
 // 未确认提交的表单取消后不产生调用。
 await page.locator('#photo-open').click();await page.locator('#photo-close').click();assert.equal(submissions,1);
 const mobile=await context.newPage();await mobile.setViewportSize({width:390,height:844});mobile.on('pageerror',error=>consoleErrors.push(error.message));
 await mobile.goto(base,{waitUntil:'networkidle'});
 await mobile.waitForFunction(()=>window.deskverse?.getState().objects.length===3&&document.getElementById('loading').hidden,null,{timeout:60000});
 await mobile.locator('#toggle-assets').click();await mobile.locator('#photo-open').click();await mobile.locator('#photo-input').setInputFiles('deskmodels/杯子/尺寸图.jpg');await mobile.locator('#photo-preview').evaluate(image=>image.decode());
 const fit=await mobile.locator('#photo-dialog').evaluate(element=>{const box=element.getBoundingClientRect();return {left:box.left,right:box.right,width:window.innerWidth,scroll:element.scrollWidth,client:element.clientWidth};});
 assert.ok(fit.left>=0&&fit.right<=fit.width&&fit.scroll<=fit.client+1,'Mobile dialog must fit viewport without horizontal overflow');
 await mobile.screenshot({path:resolve(output,'photo-dialog-mobile.png'),fullPage:true});
 assert.equal(submissions,1);assert.deepEqual(consoleErrors,[]);
 await context.close();
 console.log('Photo UI verified: preview, consent gate, one submission, queued/generating/ready, GLB auto-import, download, refresh recovery, manual reimport, desktop/mobile screenshots, nonblank canvas.');
 console.log('All Rodin routes were mocked. No paid generation was submitted. Evidence:',output);
}catch(error){
 console.error('Browser diagnostics:',consoleErrors);
 for(const context of browser.contexts())for(const page of context.pages()){
  console.error(await page.evaluate(()=>({fatal:document.getElementById('fatal-message')?.textContent,toast:document.getElementById('toast')?.textContent,objects:window.deskverse?.getState().objects.length})).catch(()=>({})));
  await page.screenshot({path:resolve(output,'photo-failure.png'),fullPage:true}).catch(()=>{});
 }
 throw error;
}finally{await browser.close();}
