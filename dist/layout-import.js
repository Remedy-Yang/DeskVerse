// 仅允许仓库内置资源，不接受布局 JSON 提供任意网络地址。
export const LAYOUT_ASSETS={
 desk:{file:'desk-real.glb',role:'table',options:{builtinAsset:'desk',calibrateHeightCm:210,targetSize:210,locked:true}},
 monitor:{file:'monitor-real.glb',role:'item',options:{builtinAsset:'monitor',icon:'monitor',dimensions:[53.9,40.7,16.3]}},
 'demo-lamp':{file:'demo-lamp.glb',role:'item',options:{demo:true,targetSize:38,icon:'lamp'}},
 'demo-monitor':{file:'demo-monitor.glb',role:'item',options:{demo:true,targetSize:48,icon:'monitor'}}
};
export function legacyModel(object){
 const chair=object.sourceFile.endsWith('#chair'),source=object.sourceFile.replace(/#chair$/,'');
 const builtin=source==='desk-real.glb'||source==='agentic_0005_pack_glb_model_material_realwood_upper_bed_200x90.glb'?'desk':source==='monitor_demo.glb'?'monitor':object.demo&&source==='demo-lamp.glb'?'demo-lamp':object.demo&&source==='demo-monitor.glb'?'demo-monitor':null;
 return {key:builtin||source,sourceFile:source,builtin,role:chair?'table':object.role,part:chair?'chair':'root',options:LAYOUT_ASSETS[builtin]?.options||{}};
}
const vector=(value,length=3)=>Array.isArray(value)&&value.length===length&&value.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000);
const positive=value=>vector(value)&&value.every(n=>n>0);
export function validateLayout(state){
 if(!state||state.schemaVersion!==1||state.units!=='cm'||!Array.isArray(state.objects))throw new Error('请选择 DeskVerse 导出的布局 JSON（schemaVersion 1、cm）。');
 if(state.coordinateSystem&&(state.coordinateSystem.up!=='Y'||state.coordinateSystem.rotationUnit!=='degrees'||state.coordinateSystem.rotationOrder!=='XYZ'))throw new Error('布局坐标系不兼容。');
 const ids=new Set();let tables=0;
 for(const object of state.objects){
  if(!object||typeof object.id!=='string'||!object.id||ids.has(object.id)||typeof object.name!=='string'||typeof object.sourceFile!=='string'||!['table','item'].includes(object.role))throw new Error('布局包含无效或重复的物品。');
  ids.add(object.id);if(object.role==='table')tables++;
  if(!vector(object.position)||!vector(object.rotation)||!positive(object.scale)||!vector(object.dimensionsCm)||object.dimensionsCm.some(n=>n<0)||!object.dimensionsCm.some(n=>n>0))throw new Error('物品变换或尺寸无效：'+object.name);
  if(object.rotationOrder&&object.rotationOrder!=='XYZ')throw new Error('物品旋转顺序不兼容。');
  if(object.surfaceY!=null&&(!Number.isFinite(object.surfaceY)||Math.abs(object.surfaceY)>100000))throw new Error('物品贴面高度无效。');
  if(object.modelOrientation!=null&&(!vector(object.modelOrientation,4)||Math.abs(Math.hypot(...object.modelOrientation)-1)>.001))throw new Error('模型朝向无效。');
  if(object.sizeVariants!==undefined&&(!Array.isArray(object.sizeVariants)||object.sizeVariants.some(v=>!v||typeof v.id!=='string'||typeof v.name!=='string'||!positive(v.dimensions))))throw new Error('商品规格无效。');
  if(object.modelKey!==undefined&&(!state.models||!Object.hasOwn(state.models,object.modelKey)))throw new Error('布局缺少模型资源。');
 }
 if(tables>1)throw new Error('一个方案只能包含一张桌子。');
 for(const list of [state.drawers,state.doors])if(list!==undefined&&(!Array.isArray(list)||list.some(d=>!d||typeof d.id!=='string'||!Number.isFinite(d.opening)||d.opening<0||d.opening>1)))throw new Error('家具开合数据无效。');
 for(const object of state.objects)if(object.storage!=null&&(!state.drawers?.some(d=>d.id===object.storage.drawerId)||object.role==='table'))throw new Error('收纳物品缺少对应抽屉。');
 if(state.view&&(!['perspective','top','wireframe'].includes(state.view.mode)||!vector(state.view.position)||!vector(state.view.target)||!Number.isFinite(state.view.zoom)||state.view.zoom<=0||state.view.zoom>100000))throw new Error('布局相机数据无效。');
 if(state.lighting&&(!Number.isFinite(state.lighting.intensity)||state.lighting.intensity<.5||state.lighting.intensity>1.5||!Number.isFinite(state.lighting.warmth)||Math.abs(state.lighting.warmth)>100))throw new Error('布局光照数据无效。');
 return state;
}
export function encodeModel(buffer){
 const bytes=new Uint8Array(buffer),chunks=[];
 for(let offset=0;offset<bytes.length;offset+=32768)chunks.push(String.fromCharCode(...bytes.subarray(offset,offset+32768)));
 return btoa(chunks.join(''));
}
export function decodeModel(value){
 if(typeof value!=='string'||value.length>Math.ceil(80*1024*1024/3)*4)throw new Error('内嵌模型无效或超过 80 MB。');
 const binary=atob(value),bytes=new Uint8Array(binary.length);
 for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
 return bytes.buffer;
}
