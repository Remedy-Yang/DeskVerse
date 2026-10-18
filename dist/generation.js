import {REFERENCE_PROFILES,inferCategory,profileFor,referenceLabel,photoCategory,savePhotoCategory} from './reference.js';
const $=id=>document.getElementById(id);
const labels={submitting:'提交中',queued:'排队中',generating:'正在建模',downloading:'下载中',ready:'GLB 已就绪',failed:'生成失败',uncertain:'提交结果待核对'};
const running=job=>['submitting','queued','generating','downloading'].includes(job.status);

export async function initPhotoGeneration({importModel,isInScene,toast}){
 let config=null,requestId=null,submitting=false,polling=false,savingKey=false;
 const photos=[];
 const jobs=new Map(),autoImport=new Set(),importing=new Set();
 try{const pending=JSON.parse(sessionStorage.getItem('deskverse-generation-pending')||'[]');if(Array.isArray(pending))for(const id of pending)if(typeof id==='string')autoImport.add(id);}catch{}
 function rememberPending(){try{sessionStorage.setItem('deskverse-generation-pending',JSON.stringify([...autoImport]));}catch{}}
 const dialog=$('photo-dialog'),submit=$('photo-submit');
 const category=$('photo-category');category.replaceChildren(new Option('自动','auto'),...REFERENCE_PROFILES.map(profile=>new Option(profile.name,profile.id)));
 function updateReference(){const profile=profileFor(category.value==='auto'?inferCategory($('photo-name').value):category.value);$('photo-reference-size').textContent=profile.name+' · '+referenceLabel(profile.sizes[profile.defaultIndex][1])+'（参考）';}
 category.onchange=updateReference;updateReference();
 async function api(path,options={}){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),35000);
  try{const response=await fetch('/api/generation/'+path,{cache:'no-store',signal:controller.signal,...options});
   if(!(response.headers.get('content-type')||'').includes('application/json'))throw new Error('照片建模需使用 python3 start.py 启动，静态预览服务不支持。');
   const data=await response.json();if(!response.ok)throw new Error(data.error||'本机建模服务不可用。');return data;
  }catch(error){if(error.name==='AbortError')throw new Error('本机服务响应超时，任务可能已受理，请先查看任务列表。');throw error;}finally{clearTimeout(timeout);}
 }
 function updateSubmit(){const submitted=jobs.has(requestId);submit.disabled=!config?.configured||!photos.length||!$('photo-consent').checked||!$('photo-name').value.trim()||submitting||savingKey||submitted;$('photo-submit-label').textContent=submitting?'正在提交…':submitted?'该任务已提交':'确认并生成';$('photo-choose').disabled=submitting;$('photo-name').disabled=submitting;category.disabled=submitting;$('photo-consent').disabled=submitting;$('generation-key-save').disabled=!config?.csrf||submitting||savingKey;$('generation-key').disabled=submitting||savingKey;for(const button of $('photo-previews').querySelectorAll('button'))button.disabled=submitting;}
 function showError(message){$('photo-error').textContent=message;$('photo-error').hidden=!message;}
 function renderPhotos(){
  const list=$('photo-previews');list.replaceChildren();
  photos.forEach(({file,url},index)=>{const item=document.createElement('figure');item.className='photo-thumbnail';const image=document.createElement('img');image.src=url;image.alt='参考照片 '+(index+1)+'：'+file.name;const caption=document.createElement('figcaption');caption.textContent=(index+1)+' · '+file.name;const remove=document.createElement('button');remove.type='button';remove.dataset.removePhoto=index;remove.textContent='×';remove.setAttribute('aria-label','移除照片 '+(index+1)+'：'+file.name);remove.onclick=()=>{if(submitting)return;URL.revokeObjectURL(photos[index].url);photos.splice(index,1);selectionChanged();};item.append(image,caption,remove);list.append(item);});
  $('photo-filename').textContent=photos.length?'已选 '+photos.length+' / 5 张 · '+(photos.reduce((sum,item)=>sum+item.file.size,0)/1024/1024).toFixed(1)+' MB':'尚未选择照片 · 最多 5 张';
 }
 function selectionChanged(){requestId=photos.length?crypto.randomUUID():null;$('photo-consent').checked=false;showError('');renderPhotos();updateSubmit();}
 async function importJob(job){
  if(importing.has(job.id))return;if(isInScene(job.id)){autoImport.delete(job.id);rememberPending();return;}
  importing.add(job.id);renderJobs();
  try{
   const response=await fetch(job.modelUrl);if(!response.ok)throw new Error('GLB 尚未下载完成。');
   const blob=await response.blob();
   const file=new File([blob],'DeskVerse-'+job.id+'.glb',{type:'model/gltf-binary'});
   const categoryId=photoCategory(localStorage,job.id)||'auto';
   if(!await importModel(file,{...job,categoryId}))throw new Error('模型暂未导入，请稍后点击放入场景重试。');
   autoImport.delete(job.id);toast(job.name+' 已放入场景，请确认真实尺寸。');
  }catch(error){autoImport.delete(job.id);toast(error.message);}finally{rememberPending();importing.delete(job.id);renderJobs();}
 }
 function renderJobs(){
  const list=$('generation-jobs');list.replaceChildren();
  for(const job of jobs.values()){
   const row=document.createElement('div');row.className='generation-job';
   const title=document.createElement('strong');title.textContent=job.name;
   const status=document.createElement('span');status.className='generation-job-status';status.textContent=importing.has(job.id)?'正在放入场景':isInScene(job.id)?'已在场景中':labels[job.status]||'等待查询';
   row.append(title,status);
   const views=document.createElement('small');views.textContent=(job.imageCount||1)+' 张参考照片 · 一个模型';row.append(views);
   if(job.consumed!==null&&job.consumed!==undefined){const credits=document.createElement('small');credits.textContent='已消耗 '+job.consumed+' 积分';row.append(credits);}
   if(job.error){const error=document.createElement('small');error.className='generation-job-error';error.textContent=job.error;row.append(error);}
   if(running(job))row.setAttribute('aria-busy','true');
   if(job.status==='ready'){
    const actions=document.createElement('div');actions.className='generation-job-actions';
    const add=document.createElement('button');add.type='button';add.className='text-button';add.textContent=isInScene(job.id)?'已放置':'放入场景';add.disabled=importing.has(job.id)||isInScene(job.id);add.onclick=()=>importJob(job);
    const download=document.createElement('a');download.href=job.modelUrl;download.download='DeskVerse-'+job.id+'.glb';download.textContent='下载 GLB';actions.append(add,download);row.append(actions);
   }
   if(job.status==='uncertain'){const note=document.createElement('small');note.textContent='请在 Rodin 控制台核对，避免重复扣费。';row.append(note);}
   list.append(row);
  }
 }
 function renderConfig(){
  $('generation-config').textContent=config.configured?(config.sessionKey?'本次自定义密钥已启用':'Rodin 已配置')+' · 生成按账户 API 价格计费':'尚未配置密钥：可在下方粘贴自己的 Rodin API Key。';
  if(!config.configured)$('generation-key-settings').open=true;updateSubmit();
 }
 async function loadConfig(){
  try{config=await api('config');renderConfig();}
  catch(error){config=null;$('generation-config').textContent=error.message;updateSubmit();}
 }
 async function loadJobs(){
  try{const data=await api('jobs');if(!Array.isArray(data.jobs))throw new Error('任务列表格式无效。');for(const job of data.jobs)jobs.set(job.id,job);renderJobs();for(const job of jobs.values())if(job.status==='ready'&&autoImport.has(job.id))await importJob(job);}
  catch(error){if(config)$('generation-config').textContent=error.message;}
 }
 async function poll(){
  if(polling||!config)return;polling=true;
  try{for(const job of jobs.values()){
   if(!running(job))continue;
   try{const current=await api('jobs/'+job.id);jobs.set(job.id,current);renderJobs();if(current.status==='ready'&&autoImport.has(current.id))await importJob(current);if(['failed','uncertain'].includes(current.status)){autoImport.delete(current.id);rememberPending();}}
   catch(error){job.error=error.message;renderJobs();}
  }}finally{polling=false;}
 }
 $('photo-open').onclick=()=>{showError('');dialog.showModal();loadConfig();};
 $('photo-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{$('generation-key').value='';});
 $('generation-key-form').onsubmit=async event=>{
  event.preventDefault();if(!config?.csrf||submitting||savingKey)return;
  const apiKey=$('generation-key').value.trim();const message=$('generation-key-message');
  if(!apiKey||apiKey.length>4096||/[^\x21-\x7e]/.test(apiKey)){message.textContent='请输入不含空白的有效 API Key。';return;}
  savingKey=true;message.textContent='正在配置本机服务…';updateSubmit();
  try{config=await api('config',{method:'POST',headers:{'Content-Type':'application/json','X-DeskVerse-Token':config.csrf},body:JSON.stringify({apiKey})});$('generation-key').value='';renderConfig();message.textContent='已启用，仅本次服务运行有效；密钥权限和额度将在生成时由 Rodin 校验。';}
  catch(error){message.textContent=error.message;}
  finally{savingKey=false;updateSubmit();}
 };
 $('photo-choose').onclick=()=>$('photo-input').click();
 $('photo-input').onchange=event=>{
  const files=Array.from(event.target.files||[]);event.target.value='';if(!files.length||submitting)return;
  if(photos.length+files.length>5){showError('同一物品最多选择 5 张照片，请先移除不需要的视角。');return;}
  if(files.some(file=>!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>20*1024*1024)){showError('请选择 20 MB 以内的 PNG、JPG 或 WebP 照片。');return;}
  if([...photos.map(item=>item.file),...files].reduce((sum,file)=>sum+file.size,0)>40*1024*1024){showError('所选照片合计不能超过 40 MB，请压缩照片或移除部分视角。');return;}
  if(!photos.length&&!$('photo-name').value.trim()){$('photo-name').value=files[0].name.replace(/\.[^.]+$/,'');category.value='auto';updateReference();}
  photos.push(...files.map(file=>({file,url:URL.createObjectURL(file)})));selectionChanged();
 };
 $('photo-name').oninput=()=>{updateSubmit();updateReference();};$('photo-consent').onchange=updateSubmit;
 $('photo-form').onsubmit=async event=>{
  event.preventDefault();if(submit.disabled)return;
  submitting=true;updateSubmit();showError('');
  const categoryId=category.value;savePhotoCategory(localStorage,requestId,categoryId);
  try{
   const images=[];for(const {file} of photos)images.push(await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(new Error('照片读取失败。'));reader.readAsDataURL(file);}));
   const job=await api('jobs',{method:'POST',headers:{'Content-Type':'application/json','X-DeskVerse-Token':config.csrf},body:JSON.stringify({id:requestId,name:$('photo-name').value.trim(),images,confirmed:true})});
   requestId=job.id;savePhotoCategory(localStorage,job.id,categoryId);jobs.set(job.id,job);if(running(job)||job.status==='ready')autoImport.add(job.id);rememberPending();renderJobs();
   if(job.status==='uncertain'){showError(job.error+' 请在 Rodin 控制台核对，本站不会自动重新提交。');}
   else if(job.status==='failed'){showError(job.error||'生成失败，请核对账户后重新选择照片。');}
   else{dialog.close();toast('任务已提交，生成完成后将自动放入场景。');if(job.status==='ready')await importJob(job);}
   // 同一组照片不自动创建新编号，重复点击只查询已有任务，避免重复扣费。
  }catch(error){showError(error.message+' 请勿反复创建任务；可刷新查看任务列表。');if(requestId){autoImport.add(requestId);rememberPending();}await loadJobs();}
  finally{submitting=false;updateSubmit();}
 };
 window.addEventListener('deskverse:change',renderJobs);
 window.addEventListener('beforeunload',()=>{for(const {url} of photos)URL.revokeObjectURL(url);});
 await loadConfig();if(config){await loadJobs();poll();}
 const interval=setInterval(poll,6000);window.addEventListener('pagehide',()=>clearInterval(interval),{once:true});
}
