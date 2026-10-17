import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {colliders,capturePose,assessTransform,sceneContact,firstOverlap,sweep} from '../dist/collision.js';
const mesh=(x,y,z,w=2,h=2,d=2)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d));m.position.set(x,y,z);return m;};
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
test('OBB center follows offset geometry under scaled and rotated parents',()=>{
 const root=new T.Group(),m=mesh(4,3,-5);m.geometry.translate(2,0,0);root.add(m);root.scale.set(2,3,4);root.rotation.y=.7;root.position.set(10,-76,20);
 const c=colliders(root)[0].obb;const expected=new T.Vector3(2,0,0).applyMatrix4(m.matrixWorld);near(c.center.distanceTo(expected),0);
});
test('A jump through a thin wall warns without changing the requested position',()=>{
 const moving=mesh(-10,1,0),wall=mesh(0,2,0,.2,4,20),pose=capturePose(moving);moving.position.x=1000;
 const result=assessTransform(moving,pose,colliders(wall));assert.ok(result.detected);assert.equal(result.blocked,false);assert.equal(result.kind,'path');near(moving.position.x,1000);
 assert.ok(!firstOverlap(colliders(moving),colliders(wall)));
});
test('Penetration and below-floor placement warn without enforcing a floor constraint',()=>{
 const object=mesh(0,1,0),table=mesh(0,-1,0,20,2,20);assert.ok(!firstOverlap(colliders(object),colliders(table)));
 const pose=capturePose(object);object.position.y=-100;assert.ok(assessTransform(object,pose,colliders(table),{floorY:-10}).detected);near(object.position.y,-100);
 const floating=mesh(30,1,0),previous=capturePose(floating);floating.position.y=-100;const warning=assessTransform(floating,previous,[],{floorY:0});assert.equal(warning.kind,'floor');near(floating.position.y,-100);
});
test('Separate furniture parts leave usable empty leg space',()=>{
 const desk=new T.Group();desk.add(mesh(-10,4,0,2,8,8),mesh(10,4,0,2,8,8),mesh(0,9,0,22,2,8));
 const chair=mesh(0,2,12,4,4,4),pose=capturePose(chair);chair.position.z=0;assert.equal(assessTransform(chair,pose,colliders(desk)).detected,false);
});
test('Overlapping rotation, scale and placement remain exactly as requested',()=>{
 const object=mesh(0,1,0,8,2,1),wall=mesh(0,1,3,20,3,1),obstacles=colliders(wall),pose=capturePose(object);object.rotation.y=Math.PI/2;
 assert.ok(assessTransform(object,pose,obstacles).detected);near(object.rotation.y,Math.PI/2);
 const before=capturePose(object);object.position.z=3;assert.ok(assessTransform(object,before,obstacles,{path:false}).detected);near(object.position.z,3);
 const box=mesh(20,1,0),p=capturePose(box);box.scale.set(100,100,100);assert.ok(assessTransform(box,p,obstacles,{floorY:0}).detected);assert.deepEqual(box.scale.toArray(),[100,100,100]);
});
test('Scene warnings ignore fixed assembly joints but include articulated parts',()=>{
 const table=new T.Group(),a=mesh(0,1,0),b=mesh(0,1,0);table.add(a,b);const records=[{id:'desk',root:table,name:'Desk',locked:true}];
 assert.equal(sceneContact(records).detected,false);a.userData.drawerId='drawer';b.userData.doorId='cupboard-door';assert.equal(sceneContact(records).detected,true);
 b.userData.drawerId='drawer';delete b.userData.doorId;assert.equal(sceneContact(records).detected,false);
 const object=mesh(0,1,0);records.push({id:'cup',root:object,name:'Cup',locked:false});assert.equal(sceneContact(records).detected,true);
 object.position.x=20;assert.equal(sceneContact(records).detected,false);
});
test('Sheared and mirrored child meshes use conservative world boxes',()=>{
 const root=new T.Group(),child=mesh(2,0,0,4,2,2);root.scale.set(3,1,1);child.rotation.y=.6;root.add(child);
 const c=colliders(root)[0].obb;assert.ok(c.rotation.equals(new T.Matrix3()));
 const box=new T.Box3().setFromObject(root,true);near(c.center.distanceTo(box.getCenter(new T.Vector3())),0);
 root.scale.x=-3;assert.ok(colliders(root)[0].obb.halfSize.x>0);
});
test('Parallel movement and moving away from touching walls remain free',()=>{
 const moving=mesh(-1.1,1,0),wall=mesh(0,2,0,.2,4,20);assert.equal(sweep(colliders(moving),colliders(wall),new T.Vector3(-10,0,0)).fraction,1);assert.equal(sweep(colliders(moving),colliders(wall),new T.Vector3(0,0,10)).fraction,1);
});
