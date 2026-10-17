import * as T from 'three';
import {getDimensions,setDimensions,setDimension,placeOnSurface,boundsOf} from './core.js';

// Editorial reference sizes, not measurements recovered from a photograph.
// Vectors always use width X, height Y, depth Z in centimeters.
export const REFERENCE_PROFILES=[
 {id:'generic',name:'通用物件',match:null,sizes:[['小件',10],['中件',20],['大件',30]],defaultIndex:1},
 {id:'bottle',name:'饮料瓶',match:/雪碧|可乐|矿泉水|饮料|水瓶|bottle|sprite|cola/i,sizes:[['330 ml',[6,18,6]],['500 ml',[6.5,23,6.5]],['1 L',[8,28,8]]],defaultIndex:1},
 {id:'can',name:'易拉罐',match:/易拉罐|听装|罐装|饮料罐|\bcan\b/i,sizes:[['小罐',[5.3,10.5,5.3]],['330 ml',[6.6,12.2,6.6]],['高罐',[6.6,16.8,6.6]]],defaultIndex:1},
 {id:'cup',name:'保温杯 / 水杯',match:/保温杯|水杯|杯子|tumbler|thermos|cup/i,sizes:[['小杯',[6.5,17,6.5]],['标准杯',[7.5,24,7.6]],['大杯',[8.5,28,8.5]]],defaultIndex:1},
 {id:'mug',name:'马克杯',match:/马克杯|咖啡杯|mug/i,sizes:[['小杯',[9,8,7]],['标准杯',[11,10,8.5]],['大杯',[12.5,12,10]]],defaultIndex:1},
 {id:'mouse',name:'鼠标',match:/鼠标|mouse/i,sizes:[['小型',[5.5,3.5,10]],['标准',[6.4,3.9,12]],['大型',[7.5,4.5,13]]],defaultIndex:1},
 {id:'keyboard',name:'键盘',match:/键盘|keyboard/i,sizes:[['紧凑',[30,3,11]],['中型',[36,3.5,13]],['全尺寸',[44,3.5,14]]],defaultIndex:2},
 {id:'monitor',name:'显示器',match:/显示器|monitor|display/i,sizes:[['小屏',[48,36,16]],['标准屏',[53.9,40.7,16.3]],['大屏',[61,46,20]]],defaultIndex:1},
 {id:'phone',name:'手机',match:/手机|iphone|phone/i,sizes:[['小型',[6.5,13.5,.8]],['标准',[7.2,15,.8]],['大型',[7.8,16.5,.9]]],defaultIndex:1},
 {id:'speaker',name:'音箱',match:/音箱|音响|speaker/i,sizes:[['小型',[8,12,8]],['桌面型',[12,20,12]],['大型',[15,28,15]]],defaultIndex:1},
 {id:'lamp',name:'台灯',match:/台灯|灯具|lamp/i,sizes:[['小型',[12,30,12]],['桌面型',[16,40,16]],['大型',[20,50,20]]],defaultIndex:1},
 {id:'plant',name:'盆栽',match:/盆栽|绿植|植物|plant/i,sizes:[['小型',[10,15,10]],['桌面型',[15,25,15]],['大型',[20,40,20]]],defaultIndex:1},
 {id:'card',name:'卡牌 / 卡片',match:/卡牌|卡片|card/i,sizes:[['小卡',[5.9,.1,8.6]],['标准卡',[6.3,.1,8.8]],['大卡',[7,.1,10]]],defaultIndex:1},
 {id:'book',name:'书本 / 笔记本',match:/书本|书籍|笔记本|notebook|book/i,sizes:[['小本',[10.5,1.5,14.8]],['中本',[14.8,2,21]],['大本',[21,2.5,29.7]]],defaultIndex:1},
 {id:'chair',name:'椅子',match:/椅子|chair/i,sizes:[['小型',[40,75,40]],['标准',[45,85,45]],['大型',[50,95,50]]],defaultIndex:1}
];
export const profileFor=id=>REFERENCE_PROFILES.find(profile=>profile.id===id)||REFERENCE_PROFILES[0];
export function inferCategory(name='',data=null){
 if(/雪碧|可乐|sprite|cola/i.test(name)&&!/瓶|bottle/i.test(name)){
  if(!data)return 'can';
  const size=data.box.getSize(new T.Vector3()),axis=size.toArray().indexOf(Math.max(...size.toArray())),cross=[0,1,2].filter(i=>i!==axis),extent=size.getComponent(axis);
  const ends=[new T.Box3(),new T.Box3()];
  for(const point of data.samples){const t=(point.getComponent(axis)-data.box.min.getComponent(axis))/extent;if(t<.1)ends[0].expandByPoint(point);if(t>.9)ends[1].expandByPoint(point);}
  const neck=ends.some(box=>{if(box.isEmpty())return false;const end=box.getSize(new T.Vector3());return cross.reduce((product,i)=>product*end.getComponent(i)/Math.max(size.getComponent(i),1e-8),1)<.42;});
  return neck?'bottle':'can';
 }
 // Prefer specific terms such as mug over the generic cup suffix.
 return [...REFERENCE_PROFILES].reverse().find(profile=>profile.match?.test(name))?.id||'generic';
}
export function referenceLabel(size){return Array.isArray(size)?size.map(value=>Number(value.toFixed(1))).join(' × ')+' cm':'最长边 '+size+' cm';}
const orientations=[];
for(let x=0;x<4;x++)for(let y=0;y<4;y++)for(let z=0;z<4;z++){
 const q=new T.Quaternion().setFromEuler(new T.Euler(x*Math.PI/2,y*Math.PI/2,z*Math.PI/2));
 if(!orientations.some(other=>Math.abs(other.dot(q))>1-1e-8))orientations.push(q);
}
export function measureReferenceModel(model){
 model.updateWorldMatrix(true,true);const box=new T.Box3().setFromObject(model,true),meshes=[];let count=0;
 model.traverse(mesh=>{if(mesh.isMesh){meshes.push(mesh);count+=mesh.geometry.attributes.position.count;}});
 const step=Math.max(1,Math.ceil(count/12000)),samples=[];
 for(const mesh of meshes){const positions=mesh.geometry.attributes.position;for(let i=0;i<positions.count;i+=step)samples.push(new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld));}
 return {box,samples};
}
export function estimateOrientation(data,category='generic'){
 const profile=profileFor(category),reference=profile.sizes[profile.defaultIndex][1],sourceSize=data.box.getSize(new T.Vector3());
 const sorted=sourceSize.toArray().sort((a,b)=>a-b);
 const target=Array.isArray(reference)?reference:sorted[0]/sorted[2]<.25?[1,.1,.7]:[.65,1,.65];
 let best=new T.Quaternion(),bestScore=Infinity;
 for(const q of orientations){
  const matrix=new T.Matrix4().makeRotationFromQuaternion(q),box=data.box.clone().applyMatrix4(matrix),size=box.getSize(new T.Vector3());
  const logs=size.toArray().map((value,index)=>Math.log(Math.max(value,1e-8)/target[index])),mean=logs.reduce((sum,v)=>sum+v,0)/3;
  let score=logs.reduce((sum,v)=>sum+(v-mean)**2,0),support=new T.Box3();
  for(const point of data.samples){const p=point.clone().applyQuaternion(q);if(p.y<=box.min.y+size.y*.08)support.expandByPoint(p);}
  if(!support.isEmpty()){const base=support.getSize(new T.Vector3());score-=.1*base.x*base.z/Math.max(size.x*size.z,1e-8);}
  score+=.002*q.angleTo(new T.Quaternion());
  if(score<bestScore-1e-8){bestScore=score;best=q;}
 }
 return best.clone();
}
export function prepareReferenceModel(model,{category='generic',name='',automatic=false}={}){
 const data=measureReferenceModel(model),group=new T.Group();group.name='reference-orientation';group.add(model);
 const categoryId=category==='auto'?inferCategory(name,data):profileFor(category).id;
 if(automatic)group.quaternion.copy(estimateOrientation(data,categoryId));
 return {model:group,referenceData:data,orientationRoot:group,categoryId};
}
export function setModelOrientation(record,quaternion){
 if(!record.orientationRoot||!record.referenceData)return false;
 record.orientationRoot.quaternion.copy(quaternion);
 const box=record.referenceData.box.clone().applyMatrix4(new T.Matrix4().makeRotationFromQuaternion(quaternion)),center=box.getCenter(new T.Vector3());
 record.baseSize.copy(box.getSize(new T.Vector3()));record.root.children[0].position.set(-center.x,-box.min.y,-center.z);record.root.updateWorldMatrix(true,true);return true;
}
function reorientRecord(record,next,{preserveSize=true}={}){
 if(!record.orientationRoot)return false;
 const bottom=boundsOf(record.root).min.y,previous=record.orientationRoot.quaternion.clone(),scale=record.root.scale.clone();
 if(preserveSize){const delta=new T.Matrix4().makeRotationFromQuaternion(next.clone().multiply(previous.invert())),e=delta.elements;record.root.scale.set(Math.abs(e[0])*scale.x+Math.abs(e[4])*scale.y+Math.abs(e[8])*scale.z,Math.abs(e[1])*scale.x+Math.abs(e[5])*scale.y+Math.abs(e[9])*scale.z,Math.abs(e[2])*scale.x+Math.abs(e[6])*scale.y+Math.abs(e[10])*scale.z);}
 setModelOrientation(record,next);placeOnSurface(record.root,bottom);return true;
}
export function orientRecord(record,category,options){if(!record.referenceData)return false;return reorientRecord(record,estimateOrientation(record.referenceData,category),options);}
export function rotateRecord(record,axis){if(!record.orientationRoot)return false;const vector=new T.Vector3();vector[axis]=1;return reorientRecord(record,new T.Quaternion().setFromAxisAngle(vector,Math.PI/2).multiply(record.orientationRoot.quaternion));}
export function applyReferenceSize(record,category,index=profileFor(category).defaultIndex){
 const profile=profileFor(category),size=profile.sizes[index]?.[1];if(size===undefined)throw new Error('找不到该参考尺寸。');
 if(Array.isArray(size)){
  if(record.baseSize.toArray().every(value=>value>=1e-8))setDimensions(record,size);
  else for(const [index,axis] of ['x','y','z'].entries())if(record.baseSize[axis]>=1e-8)setDimension(record,axis,size[index],false);
 }else{const dimensions=getDimensions(record).toArray(),axis=['x','y','z'][dimensions.indexOf(Math.max(...dimensions))];setDimension(record,axis,size,true);}
 record.referenceCategoryId=profile.id;record.referenceSizeIndex=index;record.activeSizeVariantId=null;record.calibrated=false;
}
const preferenceKey='deskverse-photo-categories';
export function photoCategory(storage,id){try{const value=JSON.parse(storage.getItem(preferenceKey)||'{}')[id];return value==='auto'||REFERENCE_PROFILES.some(profile=>profile.id===value)?value:null;}catch{return null;}}
export function savePhotoCategory(storage,id,category){try{const values=JSON.parse(storage.getItem(preferenceKey)||'{}');storage.setItem(preferenceKey,JSON.stringify({...values,[id]:category}));}catch{}}
