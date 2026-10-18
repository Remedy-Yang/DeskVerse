import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {bindAssetLights} from '../dist/asset-lights.js';
import {normalizeModel,boundsOf,placeOnSurface} from '../dist/core.js';
import {colliders} from '../dist/collision.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} ≠ ${expected}`);
async function load(name){
 const bytes=await readFile(new URL(`../models/03-照明/${name}/${name}.glb`,import.meta.url));
 return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
}
for(const [name,profileId,targetSize,materialName,color] of [
 ['灯带','light-strip',50,'Blue LED emitters','#087dff'],
 ['立灯','floor-lamp',40,'Recessed light channel','#ffe2ad']
])test(`${profileId} illuminates only luminous parts without changing placement or collision bounds`,async()=>{
 const model=await load(name),{root}=normalizeModel(model,targetSize),before=boundsOf(root),parts=colliders(root).length,original=new Map();
 model.traverse(mesh=>{if(mesh.isMesh&&!['Blue LED emitters','Recessed light channel','Opal diffuser'].includes(mesh.material.name))original.set(mesh,mesh.material.emissive.clone());});
 bindAssetLights(model,profileId);
 const lights=[],glows=[],emitters=[];
 model.traverse(node=>{if(node.isLight)lights.push(node);if(node.userData.noCollision)glows.push(node);if(node.material?.name===materialName)emitters.push(node);});
 assert.equal(lights.length,3);assert.equal(glows.length,name==='灯带'?12:3);
 for(const emitter of emitters){assert.equal(emitter.material.emissive.getHex(),new T.Color(color).getHex());assert.ok(emitter.material.emissiveIntensity>1);}
 for(const [mesh,emissive] of original)assert.ok(mesh.material.emissive.equals(emissive),'Housing and contacts must not emit');
 const after=boundsOf(root);before.min.toArray().forEach((value,i)=>near(after.min.getComponent(i),value));before.max.toArray().forEach((value,i)=>near(after.max.getComponent(i),value));
 assert.equal(colliders(root).length,parts,'Visual glow must not become a collision surface');
 const light=lights[0],local=root.worldToLocal(light.getWorldPosition(new T.Vector3()));
 root.position.set(12,7,-9);root.rotation.set(.4,.7,-.2);root.scale.multiply(new T.Vector3(1.2,.8,1.1));placeOnSurface(root,75);
 near(boundsOf(root).min.y,75);const expected=root.localToWorld(local),actual=light.getWorldPosition(new T.Vector3());near(actual.distanceTo(expected),0);
 const scene=new T.Scene();scene.add(root);assert.equal(scene.getObjectById(light.id),light);root.removeFromParent();assert.equal(scene.getObjectById(light.id),undefined);scene.add(root);assert.equal(scene.getObjectById(light.id),light);
});
