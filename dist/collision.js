import * as T from 'three';
import {OBB} from 'three/addons/math/OBB.js';

// Per-part OBBs keep furniture cavities usable. Imported single-mesh assets
// deliberately use a conservative box rather than pretending to know cavities.
export function colliders(root,exclude=()=>false){
 root.updateWorldMatrix(true,true);const result=[];
 root.traverse(mesh=>{
  if(!mesh.isMesh||exclude(mesh)||mesh.userData.noCollision)return;
  if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
  const matrix=mesh.matrixWorld,e=matrix.elements,x=new T.Vector3(e[0],e[1],e[2]).normalize(),y=new T.Vector3(e[4],e[5],e[6]).normalize(),z=new T.Vector3(e[8],e[9],e[10]).normalize();
  if(matrix.determinant()<0||Math.max(Math.abs(x.dot(y)),Math.abs(x.dot(z)),Math.abs(y.dot(z)))>1e-5){result.push({obb:new OBB().fromBox3(mesh.geometry.boundingBox.clone().applyMatrix4(matrix)),mesh,name:mesh.name||'物体'});return;}
  const obb=new OBB().fromBox3(mesh.geometry.boundingBox),center=obb.center.clone().applyMatrix4(matrix);
  obb.applyMatrix4(mesh.matrixWorld);obb.center.copy(center);
  result.push({obb,mesh,name:mesh.name||root.name||'物体'});
 });
 return result;
}
const axes=obb=>{const e=obb.rotation.elements;return [new T.Vector3(e[0],e[1],e[2]),new T.Vector3(e[3],e[4],e[5]),new T.Vector3(e[6],e[7],e[8])];};
const radius=(obb,basis,axis)=>basis.reduce((sum,v,index)=>sum+Math.abs(v.dot(axis))*obb.halfSize.getComponent(index),0);

// Continuous SAT: intersect time intervals on the 15 OBB separating axes.
// This catches thin panels even when a pointer or numeric edit jumps past them.
export function sweepTime(a,b,delta,clearance=1e-6){
 const aa=axes(a),bb=axes(b),separation=b.center.clone().sub(a.center);
 const candidates=[...aa,...bb,...aa.flatMap(x=>bb.map(y=>new T.Vector3().crossVectors(x,y)))];
 let enter=-Infinity,exit=Infinity;
 for(const axis of candidates){
  if(axis.lengthSq()<1e-12)continue;axis.normalize();
  const extent=Math.max(0,radius(a,aa,axis)+radius(b,bb,axis)-clearance),distance=separation.dot(axis),speed=delta.dot(axis);
  if(Math.abs(speed)<1e-10){if(Math.abs(distance)>=extent)return null;continue;}
  const t1=(distance-extent)/speed,t2=(distance+extent)/speed;
  enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));
  if(enter>=exit)return null;
 }
 if(exit<=0||enter>=1)return null;
 return Math.max(0,enter);
}
export function overlaps(a,b,tolerance=.015){
 const reduced=a.clone();reduced.halfSize.subScalar(tolerance).max(new T.Vector3(.00001,.00001,.00001));
 return reduced.intersectsOBB(b,1e-8);
}
export function firstOverlap(moving,obstacles){
 for(const a of moving)for(const b of obstacles)if(overlaps(a.obb,b.obb))return {a,b};
 return null;
}
export function sweep(moving,obstacles,delta){
 let fraction=1,contact=null;
 for(const a of moving)for(const b of obstacles){const time=sweepTime(a.obb,b.obb,delta);if(time!==null&&time<fraction){fraction=Math.max(0,time-1e-5);contact={a,b};}}
 return {fraction,contact};
}
export const capturePose=root=>({position:root.position.clone(),quaternion:root.quaternion.clone(),scale:root.scale.clone()});
export function applyPose(root,pose){root.position.copy(pose.position);root.quaternion.copy(pose.quaternion);root.scale.copy(pose.scale);root.updateWorldMatrix(true,true);}

export function assessTransform(root,previous,obstacles,{floorY=-Infinity,path=true}={}){
 const moving=colliders(root),contact=firstOverlap(moving,obstacles);
 if(contact)return {detected:true,blocked:false,kind:'overlap',contact};
 if(new T.Box3().setFromObject(root,true).min.y<floorY-.015)return {detected:true,blocked:false,kind:'floor',contact:{floor:true}};
 if(previous&&path&&previous.quaternion.angleTo(root.quaternion)<1e-8&&previous.scale.distanceTo(root.scale)<1e-8){
  const delta=root.position.clone().sub(previous.position);
  const before=moving.map(part=>{const obb=part.obb.clone();obb.center.sub(delta);return {...part,obb};});
  const crossed=sweep(before,obstacles,delta);
  if(crossed.contact)return {detected:true,blocked:false,kind:'path',contact:crossed.contact};
 }
 return {detected:false,blocked:false,kind:null,contact:null};
}

// Ignore assembly contacts within a fixed desk, except independently articulated
// drawers/doors. Warnings are read-only and remain visible after deselection.
export function sceneContact(records,{floorY=-Infinity}={}){
 const parts=records.flatMap(record=>colliders(record.root).map(part=>({...part,ownerId:record.id,ownerName:record.name,locked:record.locked,componentId:part.mesh.userData.drawerId||part.mesh.userData.doorId||null})));
 for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++){
  const a=parts[i],b=parts[j];
  if(a.ownerId===b.ownerId){
   const articulatedPair=(a.componentId==='cupboard-door'&&b.componentId?.includes('drawer'))||(b.componentId==='cupboard-door'&&a.componentId?.includes('drawer'));
   if(!articulatedPair)continue;
  }
  if(overlaps(a.obb,b.obb))return {detected:true,blocked:false,kind:'overlap',contact:{a,b}};
 }
 for(const record of records)if(!record.locked&&new T.Box3().setFromObject(record.root,true).min.y<floorY-.015)return {detected:true,blocked:false,kind:'floor',contact:{floor:true,a:{ownerId:record.id,ownerName:record.name}}};
 return {detected:false,blocked:false,kind:null,contact:null};
}
