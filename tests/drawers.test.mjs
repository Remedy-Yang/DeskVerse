import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {prepareDeskModel,createDrawerSystem,createDrawerSystems,createDoorSystem,extractChair,findStoragePosition} from '../dist/drawers.js';
import {colliders,sweep,firstOverlap} from '../dist/collision.js';
import {normalizeModel,setDimension,boundsOf,getDimensions} from '../dist/core.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-4,`${actual} != ${expected}`);
async function desk(){
 const buffer=await readFile(new URL('../dist/assets/desk-real.glb',import.meta.url));
 // 只验收几何，不在 Node 中解码材质；源文件和浏览器纹理均不修改。
 const loader=new GLTFLoader();loader.register(parser=>({name:'test-material',loadMaterial:()=>Promise.resolve(new T.MeshBasicMaterial())}));
 const {scene}=await loader.parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
 const r=normalizeModel(prepareDeskModel(scene),210);setDimension(r,'y',210,true);r.root.position.y=-76;r.root.updateMatrixWorld(true);return r;
}
test('Realwood bed retains its 200 by 90 footprint and 210 height with the worktop at 76 cm',async()=>{
 const r=await desk(),box=boundsOf(r.root);near(getDimensions(r).y,210);near(box.min.y,-76);near(box.max.y,134);
 const bed=boundsOf(r.root.getObjectByName('Upper_bed_edge-aligned_guard_rails_with_entry_post')),bedSize=bed.getSize(new T.Vector3());near(bedSize.x,200);near(bedSize.z,90);
 const top=boundsOf(r.root.getObjectByName('Desk_top_with_rounded_return__asset'));near(top.max.y,0);
 const fixed=top.clone().union(boundsOf(r.root.getObjectByName('Cupboard_outer_side__asset'))).union(boundsOf(r.root.getObjectByName('Right_desk_pedestal_outer_side__asset'))),fixedSize=fixed.getSize(new T.Vector3());near(fixedSize.x,200);near(fixedSize.z,90);
});
test('Drawer groups five real panels, leaves runners fixed, and translates without scaling',async()=>{
 const r=await desk(),drawer=createDrawerSystem(r.root);assert.ok(drawer);assert.equal(drawer.parts.length,5);
 const closed=boundsOf(drawer.group),scale=drawer.group.scale.toArray();const runner=r.root.getObjectByName('Drawer_runner__asset'),runnerBox=boundsOf(runner);
 drawer.setOpening(1);const open=boundsOf(drawer.group);near(open.min.z-closed.min.z,drawer.travel);near(open.min.x,closed.min.x);near(open.min.y,closed.min.y);assert.deepEqual(drawer.group.scale.toArray(),scale);
 assert.deepEqual(boundsOf(runner).min.toArray(),runnerBox.min.toArray());drawer.setOpening(0);near(boundsOf(drawer.group).min.z,closed.min.z);
});
test('Drawer opening is bounded and rejects nonfinite inputs',async()=>{
 const drawer=createDrawerSystem((await desk()).root);drawer.setOpening(4);near(drawer.opening,1);drawer.setOpening(-1);near(drawer.opening,0);assert.throws(()=>drawer.setOpening(NaN));assert.throws(()=>drawer.setOpening(Infinity));
});
test('Storage rejects a tall cup and fits flat objects without altering dimensions',async()=>{
 const drawer=createDrawerSystem((await desk()).root),inside=drawer.bounds();
 const cup=new T.Box3(new T.Vector3(0,0,0),new T.Vector3(7.5,24,7.6));assert.equal(findStoragePosition(cup,inside),null);
 const mouse=new T.Box3(new T.Vector3(0,0,0),new T.Vector3(6.4,3.9,12));const before=mouse.clone();assert.ok(findStoragePosition(mouse,inside));assert.deepEqual(mouse,before);
});
test('Storage finds a free slot and refuses overlapping or oversized objects',()=>{
 const inside=new T.Box3(new T.Vector3(0,0,0),new T.Vector3(30,6,30));const item=new T.Box3(new T.Vector3(),new T.Vector3(8,4,8));
 const occupied=new T.Box3(new T.Vector3(11,0,11),new T.Vector3(19,4,19));const target=findStoragePosition(item,inside,[occupied]);assert.ok(target);assert.notEqual(target.x,15);
 assert.equal(findStoragePosition(item,inside,[inside]),null);assert.equal(findStoragePosition(new T.Box3(new T.Vector3(),new T.Vector3(35,4,8)),inside),null);
});
test('Models without named drawer panels are not assigned a fake storage volume',()=>{assert.equal(createDrawerSystem(new T.Group()),null);const group=new T.Group();assert.equal(prepareDeskModel(group),group);});
test('Four drawers have independent travel, solid trays and collision-free empty paths',async()=>{
 const r=await desk(),drawers=createDrawerSystems(r.root);extractChair(r.root);createDoorSystem(r.root);assert.equal(drawers.length,4);
 for(const drawer of drawers){
  const parts=new Set(drawer.parts),obstacles=colliders(r.root,mesh=>parts.has(mesh)||drawer.id==='left-drawer'&&mesh.name.startsWith('Drawer_runner'));
  const hit=sweep(colliders(drawer.group),obstacles,drawer.direction.clone().multiplyScalar(drawer.travel));
  assert.equal(hit.fraction,1,JSON.stringify({drawer:drawer.id,a:hit.contact?.a.name,b:hit.contact?.b.name,fraction:hit.fraction}));
  const before=drawer.bounds();drawer.setOpening(1);const delta=drawer.bounds().min.clone().sub(before.min);near(delta.distanceTo(drawer.direction.clone().multiplyScalar(drawer.travel)),0);
  assert.ok(drawers.filter(d=>d!==drawer).every(d=>d.opening===0));drawer.setOpening(0);
 }
});
test('Hinged door clears the bed beam and extracted chair preserves independent parts',async()=>{
 const r=await desk();createDrawerSystems(r.root);const doorMesh=r.root.getObjectByName('Open_cupboard_door__asset'),before=boundsOf(doorMesh),door=createDoorSystem(r.root),after=boundsOf(doorMesh);
 near(before.min.y,after.min.y);assert.ok(after.max.y<before.max.y);near(door.opening,1);
 const chair=extractChair(r.root);assert.ok(chair);assert.equal(chair.children.length,16);assert.equal(r.root.getObjectByName('Chair_solid_seat__asset'),undefined);
 const obstacles=colliders(r.root,mesh=>door.parts.includes(mesh)||mesh.name.startsWith('Hinge_'));
 for(let step=1;step<=240;step++){door.setOpening(1-step/240);const hit=firstOverlap(colliders(door.group),obstacles);assert.ok(!hit,JSON.stringify({step,a:hit?.a.name,b:hit?.b.name}));}
});
test('Cupboard door spans the opening when closed',async()=>{
 const r=await desk(),drawers=createDrawerSystems(r.root),door=createDoorSystem(r.root);door.setOpening(0);
 const closed=boundsOf(door.group),outer=boundsOf(r.root.getObjectByName('Cupboard_outer_side__asset')),partition=boundsOf(r.root.getObjectByName('Cupboard_and_desk_partition__asset'));
 assert.ok(closed.min.x<=outer.max.x+.5);assert.ok(closed.max.x>=partition.min.x-.5);
 assert.ok(closed.min.x>=outer.max.x-.01);assert.ok(closed.max.x<=partition.min.x+.01);
 assert.equal(drawers.length,4);
});
