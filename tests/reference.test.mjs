import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {normalizeModel,getDimensions,boundsOf} from '../dist/core.js';
import {REFERENCE_PROFILES,inferCategory,profileFor,prepareReferenceModel,measureReferenceModel,applyReferenceSize,orientRecord,rotateRecord,setModelOrientation,photoCategory,savePhotoCategory} from '../dist/reference.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
function makeRecord(dimensions=[2,.6,.6],category='bottle'){
 const model=new T.Mesh(new T.BoxGeometry(...dimensions)),prepared=prepareReferenceModel(model,{category,automatic:true}),r={...normalizeModel(prepared.model,32),...prepared,sizeVariants:[{id:'merchant-size'}],calibrated:false};r.root.position.set(12,0,4);return r;
}
test('Object names select specific categories rather than a universal 32 cm size',()=>{
 for(const [name,id] of [['雪碧','can'],['雪碧瓶','bottle'],['易拉罐','can'],['保温杯','cup'],['马克杯','mug'],['鼠标','mouse'],['显示器','monitor'],['卡牌','card'],['IMG_4123','generic']])assert.equal(inferCategory(name),id);
 assert.equal(new Set(REFERENCE_PROFILES.map(p=>p.id)).size,REFERENCE_PROFILES.length);
 for(const p of REFERENCE_PROFILES){assert.equal(p.sizes.length,3);assert.ok(p.sizes[p.defaultIndex]);}
});
test('A lying bottle is oriented vertically and assigned an uncalibrated reference size',()=>{
 const r=makeRecord();assert.ok(r.baseSize.y>r.baseSize.x);applyReferenceSize(r,'bottle');
 const dimensions=getDimensions(r).toArray();for(const [i,n] of [6.5,23,6.5].entries())near(dimensions[i],n);
 assert.equal(r.calibrated,false);assert.equal(r.referenceSizeIndex,1);assert.deepEqual(r.sizeVariants,[{id:'merchant-size'}]);
});
test('Flat objects are laid flat rather than blindly putting the longest edge upright',()=>{
 const r=makeRecord([1,.02,.6],'card');assert.ok(r.baseSize.y<r.baseSize.x&&r.baseSize.y<r.baseSize.z);applyReferenceSize(r,'card');near(getDimensions(r).y,.1);
 const keyboard=makeRecord([.2,.8,3],'keyboard');applyReferenceSize(keyboard,'keyboard');assert.deepEqual(getDimensions(keyboard).toArray().map(n=>+n.toFixed(4)),[44,3.5,14]);
});
test('Bottle orientation prefers the broad base below the neck',()=>{
 const model=new T.Group(),body=new T.Mesh(new T.CylinderGeometry(.35,.4,1.2,24)),neck=new T.Mesh(new T.CylinderGeometry(.12,.15,.5,24));
 body.position.y=.6;neck.position.y=1.45;model.add(body,neck);model.rotation.z=-Math.PI/2;
 const prepared=prepareReferenceModel(model,{category:'bottle',automatic:true}),r={...normalizeModel(prepared.model,32),...prepared};
 r.root.updateWorldMatrix(true,true);assert.ok(neck.getWorldPosition(new T.Vector3()).y>body.getWorldPosition(new T.Vector3()).y);
 assert.equal(inferCategory('雪碧',prepared.referenceData),'bottle');
});
test('A drink brand with a broad cylindrical model resolves to a can rather than a tall bottle',()=>{
 const can=new T.Mesh(new T.CylinderGeometry(.5,.5,1.8,24));can.rotation.z=Math.PI/2;
 assert.equal(inferCategory('雪碧',measureReferenceModel(can)),'can');
 const prepared=prepareReferenceModel(can,{category:'auto',name:'雪碧',automatic:true}),r={...normalizeModel(prepared.model,32),...prepared};applyReferenceSize(r,prepared.categoryId);
 assert.deepEqual(getDimensions(r).toArray().map(n=>+n.toFixed(3)),[6.6,12.2,6.6]);
});
test('Zero-thickness source geometry remains importable without inventing a measured thickness',()=>{
 const r=makeRecord([1,0,.6],'card');assert.doesNotThrow(()=>applyReferenceSize(r,'card'));near(getDimensions(r).y,0);assert.equal(r.calibrated,false);
});
test('Flipping and automatic correction preserve physical size, bottom height and history data',()=>{
 const r=makeRecord();applyReferenceSize(r,'bottle');const initial=getDimensions(r).toArray(),q=r.orientationRoot.quaternion.clone(),scale=r.root.scale.clone(),bottom=boundsOf(r.root).min.y;
 rotateRecord(r,'x');const flipped=getDimensions(r);near(flipped.y,initial[2]);near(flipped.z,initial[1]);near(boundsOf(r.root).min.y,bottom);
 orientRecord(r,'bottle');for(const [i,n] of initial.entries())near(getDimensions(r).getComponent(i),n);
 rotateRecord(r,'z');setModelOrientation(r,q);r.root.scale.copy(scale);for(const [i,n] of initial.entries())near(getDimensions(r).getComponent(i),n);
});
test('Reference choices stay independent of merchant variants and do not imply calibration',()=>{
 const r=makeRecord();r.calibrated=true;applyReferenceSize(r,'cup',2);assert.equal(r.calibrated,false);assert.equal(r.activeSizeVariantId,null);assert.equal(r.sizeVariants[0].id,'merchant-size');
 assert.deepEqual(getDimensions(r).toArray().map(n=>+n.toFixed(3)),[8.5,28,8.5]);assert.equal(profileFor('unknown').id,'generic');
});
test('Photo categories persist for reimport and tolerate unavailable or corrupt storage',()=>{
 let value=null;const storage={getItem:()=>value,setItem:(_,next)=>{value=next;}};savePhotoCategory(storage,'job','cup');assert.equal(photoCategory(storage,'job'),'cup');
 value='bad json';assert.equal(photoCategory(storage,'job'),null);assert.doesNotThrow(()=>savePhotoCategory({getItem:()=>{throw new Error('unavailable');}},'job','cup'));
});
