const $=id=>document.getElementById(id);
const labels={submitting:'提交中',queued:'排队中',generating:'正在建模',downloading:'下载中',ready:'GLB 已就绪',failed:'生成失败',uncertain:'提交结果待核对'};
const running=job=>['submitting','queued','generating','downloading'].includes(job.status);

export async function initPhotoGeneration({importModel,isInScene,toast}){
 let config=null,photo=null,previewUrl=null,requestId=null,submitting=false,polling=false;
 const jobs=new Map(),autoImport=new Set(),importing=new Set();
 const dialog=$('photo-dialog'),submit=$('photo-submit');
 async function api(path,options={}){
  const response=await fetch('/api/generation/'+path,{cache:'no-store',...options});
  if(!(response.headers.get('content-type')||'').includes('application/json'))throw new Error('照片建模需使用 python3 start.py 启动，静态预览服务不支持。');
  const data=await response.json();if(!response.ok)throw new Error(data.error||'本机建模服务不可用。');return data;
 }
 function updateSubmit(){submit.disabled=!config?.configured||!photo||!$('photo-consent').checked||!$('photo-name').value.trim()||submitting;}
 function showError(message){$('photo-error').textContent=message;$('photo-error').hidden=!message;}
 async function importJob(job){
  if(importing.has(job.id)||isInScene(job.id))return;
  importing.add(job.id);renderJobs();
  try{
   const response=await fetch(job.modelUrl);if(!response.ok)throw new Error('GLB 尚未下载完成。');
   const blob=await response.blob();
   const file=new File([blob],'DeskVerse-'+job.id+'.glb',{type:'model/gltf-binary'});
   if(!await importModel(file,job))throw new Error('模型暂未导入，请稍后点击放入场景重试。');
   autoImport.delete(job.id);toast(job.name+' 已放入场景，请确认真实尺寸。');
  }catch(error){autoImport.delete(job.id);toast(error.message);}finally{importing.delete(job.id);renderJobs();}
 }
 function renderJobs(){
  const list=$('generation-jobs');list.replaceChildren();
  for(const job of jobs.values()){
   const row=document.createElement('div');row.className='generation-job';
   const title=document.createElement('strong');title.textContent=job.name;
   const status=document.createElement('span');status.className='generation-job-status';status.textContent=importing.has(job.id)?'正在放入场景':isInScene(job.id)?'已在场景中':labels[job.status]||'等待查询';
   row.append(title,status);
   if(job.consumed!==null&&job.consumed!==undefined){const credits=document.createElement('small');credits.textContent='已消耗 '+job.consumed+' 积分';row.append(credits);}
   if(job.error){const error=document.createElement('small');error.className='generation-job-error';error.textContent=job.error;row.append(error);}
   if(job.status==='ready'){
    const actions=document.createElement('div');actions.className='generation-job-actions';
    const add=document.createElement('button');add.type='button';add.className='text-button';add.textContent=isInScene(job.id)?'已放置':'放入场景';add.disabled=importing.has(job.id)||isInScene(job.id);add.onclick=()=>importJob(job);
    const download=document.createElement('a');download.href=job.modelUrl;download.download='DeskVerse-'+job.id+'.glb';download.textContent='下载 GLB';actions.append(add,download);row.append(actions);
   }
   list.append(row);
  }
 }
 async function loadConfig(){
  try{config=await api('config');$('generation-config').textContent=config.configured?'Rodin 已配置 · 生成按账户 API 价格计费':'尚未配置密钥：请在本机 .env 设置 RODIN_API_KEY 并重启服务。';}
  catch(error){config=null;$('generation-config').textContent=error.message;}
  updateSubmit();
 }
 async function loadJobs(){
  try{const data=await api('jobs');for(const job of data.jobs)jobs.set(job.id,job);renderJobs();}
  catch(error){if(config)$('generation-config').textContent=error.message;}
 }
 async function poll(){
  if(polling||!config)return;polling=true;
  try{for(const job of jobs.values()){
   if(!running(job)||job.status==='submitting')continue;
   try{const current=await api('jobs/'+job.id);jobs.set(job.id,current);renderJobs();if(current.status==='ready'&&autoImport.has(current.id))await importJob(current);}
   catch(error){job.error=error.message;renderJobs();}
  }}finally{polling=false;}
 }
 $('photo-open').onclick=()=>{showError('');dialog.showModal();loadConfig();};
 $('photo-close').onclick=()=>dialog.close();
 $('photo-choose').onclick=()=>$('photo-input').click();
 $('photo-input').onchange=event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024){showError('请选择 20 MB 以内的 PNG、JPG 或 WebP 照片。');return;}
  if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(file);photo=file;requestId=crypto.randomUUID();
  $('photo-preview').src=previewUrl;$('photo-preview').hidden=false;$('photo-filename').textContent=file.name;
  $('photo-name').value=file.name.replace(/\.[^.]+$/,'');$('photo-consent').checked=false;showError('');updateSubmit();
 };
 $('photo-name').oninput=updateSubmit;$('photo-consent').onchange=updateSubmit;
 $('photo-form').onsubmit=async event=>{
  event.preventDefault();if(submit.disabled)return;
  submitting=true;updateSubmit();showError('');$('photo-choose').disabled=true;
  try{
   const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(new Error('照片读取失败。'));reader.readAsDataURL(photo);});
   const job=await api('jobs',{method:'POST',headers:{'Content-Type':'application/json','X-DeskVerse-Token':config.csrf},body:JSON.stringify({id:requestId,name:$('photo-name').value.trim(),image,confirmed:true})});
   jobs.set(job.id,job);if(running(job)||job.status==='ready')autoImport.add(job.id);renderJobs();
   if(job.status==='uncertain'){showError(job.error+' 请在 Rodin 控制台核对，本站不会自动重新提交。');}
   else{dialog.close();toast('任务已提交，生成完成后将自动放入场景。');if(job.status==='ready')await importJob(job);}
   // 同一照片不自动创建新编号，重复点击只会查询已有任务，避免重复扣费。
  }catch(error){showError(error.message+' 请勿反复创建任务；可刷新查看任务列表。');await loadJobs();}
  finally{submitting=false;$('photo-choose').disabled=false;updateSubmit();}
 };
 window.addEventListener('deskverse:change',renderJobs);
 window.addEventListener('beforeunload',()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);});
 await loadConfig();if(config){await loadJobs();poll();}
 const interval=setInterval(poll,6000);window.addEventListener('pagehide',()=>clearInterval(interval),{once:true});
}
