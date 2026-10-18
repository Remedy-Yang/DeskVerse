import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {inspectGLB,MAX_FILE_SIZE} from './core.js';
import {MODEL_ASSETS} from './model-catalog.js';
export {MODEL_ASSETS} from './model-catalog.js';

const WIDTH=320,HEIGHT=240;

// 每次解析独立的 GLB；释放全部场景中的共享资源，避免缩略图累积显存。
function releaseModel(gltf){
 const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set(),images=new Set();
 for(const root of gltf?.scenes||[gltf?.scene])root?.traverse(object=>{
  if(object.geometry)geometries.add(object.geometry);
  if(object.skeleton)skeletons.add(object.skeleton);
  for(const material of Array.isArray(object.material)?object.material:[object.material])if(material)materials.add(material);
 });
 for(const material of materials){
  for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
  for(const uniform of Object.values(material.uniforms||{}))if(uniform.value?.isTexture)textures.add(uniform.value);
 }
 for(const texture of textures){
  for(const image of Array.isArray(texture.source?.data)?texture.source.data:[texture.source?.data])if(image?.close)images.add(image);
  texture.dispose();
 }
 for(const skeleton of skeletons)skeleton.dispose();
 for(const geometry of geometries)geometry.dispose();
 for(const material of materials)material.dispose();
 for(const image of images)image.close();
}

function createPreviewStudio(){
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
 let environment;
 try{
  renderer.setPixelRatio(1);renderer.setSize(WIDTH,HEIGHT,false);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#eee8dc');
  const generator=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
  try{environment=generator.fromScene(room,.04);}finally{room.dispose();generator.dispose();}
  scene.environment=environment.texture;scene.environmentIntensity=.65;
  scene.add(new THREE.HemisphereLight('#fff8e9','#8c99a8',1.6));
  const key=new THREE.DirectionalLight('#fff4df',2.5);key.position.set(-3,5,4);scene.add(key);
  const fill=new THREE.DirectionalLight('#e7f0ff',1.2);fill.position.set(4,2,-3);scene.add(fill);
  const studio={renderer,scene,environment,camera:new THREE.PerspectiveCamera(36,WIDTH/HEIGHT,.01,30),lost:false};
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();studio.lost=true;});
  return studio;
 }catch(error){environment?.dispose();renderer.dispose();renderer.forceContextLoss();throw error;}
}
function releaseStudio(studio){
 if(!studio)return;
 studio.scene.environment=null;studio.environment.dispose();studio.renderer.dispose();studio.renderer.forceContextLoss();
}

function frameModel(model,asset,studio){
 // 只应用已核对的目录姿态修正；等比归一化不改写模型几何或材质。
 const root=new THREE.Group();root.add(model);
 if(asset.options.rotationDeg)root.rotation.set(...asset.options.rotationDeg.map(THREE.MathUtils.degToRad));
 root.updateMatrixWorld(true);
 const box=new THREE.Box3().setFromObject(root,true),size=box.getSize(new THREE.Vector3());
 let hasMesh=false;model.traverse(object=>{if(object.isMesh)hasMesh=true;});
 const longest=Math.max(size.x,size.y,size.z);
 if(!hasMesh||box.isEmpty()||!Number.isFinite(longest)||longest<1e-8)throw new Error('模型没有可预览的有效几何。');
 const center=box.getCenter(new THREE.Vector3()),scale=2/longest;
 root.scale.setScalar(scale);root.position.copy(center).multiplyScalar(-scale);root.updateMatrixWorld(true);
 box.min.sub(center).multiplyScalar(scale);box.max.sub(center).multiplyScalar(scale);
 const camera=studio.camera,direction=new THREE.Vector3(...(asset.previewDirection||[1,.72,1.2])).normalize();
 camera.position.copy(direction);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 const inverse=camera.quaternion.clone().invert(),tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanX=tanY*camera.aspect;
 let distance=0;
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
  const corner=new THREE.Vector3(x,y,z).applyQuaternion(inverse);
  distance=Math.max(distance,corner.z+1.15*Math.max(Math.abs(corner.x)/tanX,Math.abs(corner.y)/tanY));
 }
 const radius=box.getSize(size).length()/2;
 camera.position.copy(direction).multiplyScalar(distance);camera.near=Math.max(.01,distance-radius*1.5);camera.far=distance+radius*2+1;
 camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
 return root;
}

function node(tag,className,text){
 const element=document.createElement(tag);if(className)element.className=className;if(text)element.textContent=text;return element;
}

export function initModelLibrary({container,loader,onAdd,onError}){
 const cards=[],cache=new Map();
 let disposed=false,started=false,busy=false,adding=null,running=false,scheduled=null,studio=null,controller=null;
 const report=(error,asset,phase)=>onError?.(error,asset,phase);
 function syncButtons(){
  for(const card of cards){
   card.add.disabled=disposed||!!card.asset.fixed||busy||!!adding;
   card.add.textContent=card.asset.fixed?'固定场景':adding===card.asset.id?'正在添加…':'＋ 添加';
   card.retry.disabled=disposed||busy||!!adding;
  }
 }
 function setPreview(card,state,message){
  card.state=state;card.element.dataset.preview=state;
  card.image.hidden=state!=='ready';card.status.hidden=state==='ready';
  card.status.textContent=message||({idle:'滚动到此处加载预览',loading:'正在渲染模型…',error:'预览失败，可重试'}[state]||'');
  card.retry.hidden=state!=='error';card.preview.setAttribute('aria-busy',String(state==='loading'));
 }
 for(const category of [...new Set(MODEL_ASSETS.map(asset=>asset.category))]){
  const section=node('section','model-library-group'),heading=node('h3','model-library-category',category),grid=node('div','model-library-grid');
  section.setAttribute('aria-label',category);section.append(heading,grid);container.append(section);
  for(const asset of MODEL_ASSETS.filter(asset=>asset.category===category)){
   const element=node('article','model-library-card');element.dataset.assetId=asset.id;
   const preview=node('div','model-library-preview'),image=node('img','model-library-image');
   image.width=WIDTH;image.height=HEIGHT;image.alt=`${asset.name}模型预览`;image.decoding='async';
   const status=node('span','model-library-preview-status'),retry=node('button','model-library-retry','重试预览');
   retry.type='button';retry.setAttribute('aria-label',`重新加载${asset.name}的预览`);
   preview.append(image,status,retry);
   const body=node('div','model-library-body'),name=node('h4','model-library-name',asset.name),size=node('p','model-library-size',asset.sizeLabel);
   size.title=asset.sizeNote;
   const add=node('button','model-library-add');add.type='button';
   add.setAttribute('aria-label',asset.fixed?'固定桌柜已由默认场景提供，不可重复添加':`添加${asset.name}，${asset.sizeLabel}`);
   body.append(name,size);
   if(asset.fixed)body.append(node('p','model-library-fixed-note','默认场景已提供，不重复添加。'));
   body.append(add);element.append(preview,body);grid.append(element);
   const card={asset,element,preview,image,status,retry,add,state:'idle',visible:false};cards.push(card);setPreview(card,'idle');
   retry.addEventListener('click',()=>{if(disposed||busy||adding)return;setPreview(card,'idle');schedule();});
   add.addEventListener('click',async()=>{
    if(disposed||busy||adding||asset.fixed)return;
    adding=asset.id;syncButtons();
    try{await onAdd(asset);}catch(error){if(!disposed)report(error,asset,'add');}
    finally{adding=null;if(!disposed){syncButtons();schedule();}}
   });
   element.addEventListener('click',event=>{if(!event.target.closest('button'))add.click();});
  }
 }
 const observer=new IntersectionObserver(entries=>{
  for(const entry of entries){const card=cards.find(item=>item.element===entry.target);if(card)card.visible=entry.isIntersecting;}
  schedule();
 },{root:null,rootMargin:'60px 0px',threshold:0});
 for(const card of cards)observer.observe(card.element);
 syncButtons();

 function schedule(){
  if(disposed||!started||busy||adding||running||scheduled!==null||!cards.some(card=>card.visible&&card.state==='idle'))return;
  const run=()=>{scheduled=null;void next();};
  scheduled=typeof requestIdleCallback==='function'?requestIdleCallback(run,{timeout:800}):setTimeout(run,40);
 }
 async function next(){
  if(disposed||busy||adding||running)return;
  const card=cards.find(item=>item.visible&&item.state==='idle');if(!card)return;
  running=true;setPreview(card,'loading');
  let gltf,root;
  try{
   let url=cache.get(card.asset.path);
   if(!url){
    controller=new AbortController();
    const response=await fetch(card.asset.path,{signal:controller.signal});
    if(!response.ok)throw new Error(`模型请求失败（HTTP ${response.status}）。`);
    if(Number(response.headers.get('Content-Length'))>MAX_FILE_SIZE)throw new Error('预览文件超过 80 MB。');
    const buffer=await response.arrayBuffer();
    if(disposed)return;
    if(buffer.byteLength>MAX_FILE_SIZE)throw new Error('预览文件超过 80 MB。');
    inspectGLB(buffer);gltf=await loader.parseAsync(buffer,'');
    if(disposed)return;
    if(!studio)studio=createPreviewStudio();
    if(studio.lost)throw new Error('缩略图图形上下文已丢失，请重试。');
    root=frameModel(gltf.scene,card.asset,studio);studio.scene.add(root);studio.renderer.toneMappingExposure=card.asset.previewExposure??1;studio.renderer.render(studio.scene,studio.camera);
    const blob=await new Promise((resolve,reject)=>studio.renderer.domElement.toBlob(value=>value?resolve(value):reject(new Error('无法生成模型预览。')),'image/png'));
    if(disposed)return;
    if(studio.lost)throw new Error('缩略图图形上下文已丢失，请重试。');
    url=URL.createObjectURL(blob);cache.set(card.asset.path,url);
   }
   card.image.src=url;setPreview(card,'ready');
  }catch(error){
   if(!disposed){setPreview(card,'error',`预览失败：${error.message||'无法渲染模型'}`);report(error,card.asset,'preview');}
   if(studio){releaseStudio(studio);studio=null;}
  }finally{
   root?.removeFromParent();releaseModel(gltf);studio?.renderer.renderLists.dispose();controller=null;running=false;
   if(disposed){releaseStudio(studio);studio=null;}else schedule();
  }
 }
 return {
  setBusy(value){if(disposed)return;busy=!!value;syncButtons();if(!busy)schedule();},
  // 主场景载入结束后显式启动，避免首屏与大模型并发抢占解码和显存。
  startPreviews(){if(disposed)return;started=true;schedule();},
  dispose(){
   if(disposed)return;disposed=true;observer.disconnect();controller?.abort();
   if(scheduled!==null){if(typeof cancelIdleCallback==='function')cancelIdleCallback(scheduled);else clearTimeout(scheduled);scheduled=null;}
   for(const url of cache.values())URL.revokeObjectURL(url);cache.clear();
   for(const card of cards)card.element.remove();
   for(const section of container.querySelectorAll('.model-library-group'))section.remove();
   if(!running){releaseStudio(studio);studio=null;}
  }
 };
}
