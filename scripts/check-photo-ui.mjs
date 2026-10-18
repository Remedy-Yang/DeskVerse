import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const {PNG}=await import(process.env.PNGJS_MODULE||'pngjs');
const base=process.env.DESKVERSE_URL||'http://127.0.0.1:8002';
const output=resolve('.deskverse/qa');
await mkdir(output,{recursive:true});
const fixture=await readFile('dist/assets/demo-lamp.glb');
const photoBytes=await readFile('deskmodels/杯子/尺寸图.jpg');
const tiny=new PNG({width:1,height:1});tiny.data.set([24,128,240,255]);
const secondBytes=PNG.sync.write(tiny);
const firstPhoto={name:'杯子正面.jpg',mimeType:'image/jpeg',buffer:photoBytes};
const secondPhoto={name:'杯子侧面.png',mimeType:'image/png',buffer:secondBytes};
const paddedPhoto=(name,size)=>{const buffer=Buffer.alloc(size);secondBytes.copy(buffer);return {name,mimeType:'image/png',buffer};};
const expectedImages=[photoBytes.toString('base64'),secondBytes.toString('base64')];
const testKey='mock-ui-session-key';
let configured=false,keySaves=0;
const config=()=>({configured,sessionKey:configured,csrf:'mock-only',provider:'rodin',tier:'Regular'});
const waitPreviews=async(page,count)=>{
 await page.waitForFunction(count=>document.querySelectorAll('#photo-previews figure.photo-thumbnail').length===count,count);
 await page.locator('#photo-previews img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
 assert.deepEqual(await page.locator('[data-remove-photo]').evaluateAll(buttons=>buttons.map(button=>button.getAttribute('data-remove-photo'))),Array.from({length:count},(_,index)=>String(index)));
 assert.match(await page.locator('#photo-filename').innerText(),new RegExp(String(count)));
};
const browser=await chromium.launch({channel:'chrome',headless:true});
let submissions=0;
const jobs=new Map(),polls=new Map(),consoleErrors=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,acceptDownloads:true});
 await context.route('**/api/generation/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path.endsWith('/config')){
   if(request.method()==='POST'){
    assert.equal(request.headers()['x-deskverse-token'],'mock-only');
    assert.deepEqual(request.postDataJSON(),{apiKey:testKey});configured=true;keySaves++;
   }else assert.equal(request.method(),'GET');
   return route.fulfill({json:config()});
  }
  if(path.endsWith('/jobs')&&request.method()==='GET')return route.fulfill({json:{jobs:[...jobs.values()]}});
  if(path.endsWith('/jobs')&&request.method()==='POST'){
   assert.equal(configured,true);submissions++;const payload=request.postDataJSON();assert.equal(payload.confirmed,true);assert.equal('image' in payload,false);assert.deepEqual(payload.images,expectedImages);assert.equal(payload.images.length,2);assert.equal(request.headers()['x-deskverse-token'],'mock-only');
   const job={id:payload.id,name:payload.name,imageCount:payload.images.length,status:'submitting',consumed:.5,created:Date.now()/1000,error:''};jobs.set(job.id,job);return route.fulfill({status:202,json:job});
  }
  if(path.includes('/jobs/')){
   const id=path.split('/').at(-1),job=jobs.get(id);assert.ok(job);const count=(polls.get(id)||0)+1;polls.set(id,count);
   // 仅生成任务使用模拟；模型指向同源静态 fixture，避免 Chrome 取消拦截响应的下载。
   job.status=count===1?'queued':count===2?'generating':'ready';if(job.status==='ready')job.modelUrl='/assets/demo-lamp.glb';return route.fulfill({json:job});
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
 assert.equal(await page.locator('#photo-input').getAttribute('multiple')!==null,true);
 await page.locator('#photo-input').setInputFiles(firstPhoto);await waitPreviews(page,1);
 await page.locator('#photo-input').setInputFiles(secondPhoto);await waitPreviews(page,2);
 const secondSource=await page.locator('#photo-previews img').nth(1).getAttribute('src');
 await page.locator('[data-remove-photo="0"]').click();await waitPreviews(page,1);
 assert.equal(await page.locator('#photo-previews img').getAttribute('src'),secondSource);
 await page.locator('[data-remove-photo="0"]').click();await page.waitForFunction(()=>document.querySelectorAll('#photo-previews figure.photo-thumbnail').length===0);
 await page.locator('#photo-input').setInputFiles([firstPhoto,secondPhoto]);await waitPreviews(page,2);
 const originalSources=await page.locator('#photo-previews img').evaluateAll(images=>images.map(image=>image.src));
 // 每种超限必须拒绝整个追加批次，原有选择和顺序都不能改变。
 for(const [files,message] of [
  [Array.from({length:4},(_,index)=>({...secondPhoto,name:`额外视角${index}.png`})),/5/],
  [[paddedPhoto('单张超限.png',20*1024*1024+1)],/20/],
  [Array.from({length:3},(_,index)=>paddedPhoto(`总量超限${index}.png`,15*1024*1024)),/40/]
 ]){
  await page.locator('#photo-input').setInputFiles(files);
  await page.locator('#photo-error').waitFor({state:'visible'});assert.match(await page.locator('#photo-error').innerText(),message);
  await waitPreviews(page,2);assert.deepEqual(await page.locator('#photo-previews img').evaluateAll(images=>images.map(image=>image.src)),originalSources);
  assert.equal(submissions,0);
 }
 await page.locator('#photo-name').fill('保温杯测试');
 // 即使已勾选付费确认，未配置密钥时也不得提交。
 await page.locator('#photo-consent').check();assert.equal(await page.locator('#photo-submit').isDisabled(),true);assert.equal(submissions,0);
 const settings=page.locator('#generation-key-settings');if(!await settings.evaluate(element=>element.open))await settings.locator('summary').click();
 assert.equal(await page.locator('#generation-key').getAttribute('type'),'password');
 await page.locator('#generation-key').fill(testKey);
 await page.locator('#generation-key-save').click();
 await page.waitForFunction(()=>document.getElementById('generation-key').value===''&&!document.getElementById('photo-submit').disabled);
 assert.equal(keySaves,1);assert.equal(configured,true);assert.ok((await page.locator('#generation-key-message').innerText()).trim());
 // 配置成功后仍必须遵守 consent gate。
 await page.locator('#photo-consent').uncheck();assert.equal(await page.locator('#photo-submit').isDisabled(),true);assert.equal(submissions,0);
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
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('.generation-job a').click()]);
 assert.equal(download.suggestedFilename(),'DeskVerse-'+[...jobs.keys()][0]+'.glb');
 const stream=await download.createReadStream();assert.ok(stream);const chunks=[];for await(const chunk of stream)chunks.push(chunk);
 assert.deepEqual(Buffer.concat(chunks),fixture,'浏览器实际下载的 GLB 字节必须与 fixture 一致');assert.equal(await download.failure(),null);
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
 await page.locator('#photo-open').click();if(!await settings.evaluate(element=>element.open))await settings.locator('summary').click();
 await page.locator('#generation-key').fill('must-clear-on-close');await page.locator('#photo-close').click();
 assert.equal(await page.locator('#generation-key').inputValue(),'');assert.equal(submissions,1);assert.equal(keySaves,1);
 const mobile=await context.newPage();await mobile.setViewportSize({width:390,height:844});mobile.on('pageerror',error=>consoleErrors.push(error.message));
 await mobile.goto(base,{waitUntil:'networkidle'});
 await mobile.waitForFunction(()=>window.deskverse?.getState().objects.length===3&&document.getElementById('loading').hidden,null,{timeout:60000});
 await mobile.locator('#toggle-assets').click();await mobile.locator('#photo-open').click();await mobile.locator('#photo-input').setInputFiles(firstPhoto);await mobile.locator('#photo-input').setInputFiles(secondPhoto);await waitPreviews(mobile,2);
 const fit=await mobile.locator('#photo-dialog').evaluate(element=>{const box=element.getBoundingClientRect();return {left:box.left,right:box.right,width:window.innerWidth,scroll:element.scrollWidth,client:element.clientWidth};});
 assert.ok(fit.left>=0&&fit.right<=fit.width&&fit.scroll<=fit.client+1,'Mobile dialog must fit viewport without horizontal overflow');
 await mobile.screenshot({path:resolve(output,'photo-dialog-mobile.png'),fullPage:true});
 assert.equal(submissions,1);assert.deepEqual(consoleErrors,[]);
 await context.close();
 console.log('Photo UI verified: multi-photo append/remove, count/per-file/total limits preserve selection, unconfigured gate, session key save/clear, consent gate, exact ordered images payload, one submission, queued/generating/ready, GLB auto-import, byte-exact browser download, refresh recovery, manual reimport, desktop/mobile screenshots, nonblank canvas.');
 console.log('All Rodin routes were mocked. No paid generation was submitted. Evidence:',output);
}catch(error){
 console.error('Browser diagnostics:',consoleErrors);
 for(const context of browser.contexts())for(const page of context.pages()){
  console.error(await page.evaluate(()=>({fatal:document.getElementById('fatal-message')?.textContent,toast:document.getElementById('toast')?.textContent,objects:window.deskverse?.getState().objects.length})).catch(()=>({})));
  await page.screenshot({path:resolve(output,'photo-failure.png'),fullPage:true}).catch(()=>{});
 }
 throw error;
}finally{await browser.close();}
