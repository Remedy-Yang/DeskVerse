import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {DeskWireframe} from '../dist/desk-view.js';

test('Desk wireframe leaves assets sharing its original material shaded and restores desk appearance',()=>{
  const original=new T.MeshStandardMaterial({color:'#a87f52'}),desk=new T.Group(),panel=new T.Mesh(new T.BoxGeometry(),original),chair=new T.Mesh(new T.BoxGeometry(),original);
  panel.castShadow=true;panel.receiveShadow=true;desk.add(panel);
  const view=new DeskWireframe();view.set(desk,true);
  assert.equal(panel.material.wireframe,true);assert.equal(panel.material.depthWrite,false);assert.equal(original.wireframe,false);assert.equal(chair.material,original);assert.equal(chair.material.wireframe,false);
  view.set(desk,false);assert.equal(panel.material,original);assert.equal(panel.castShadow,true);assert.equal(panel.receiveShadow,true);
  view.dispose();
});

test('Multi-material tables and newly replaced tables can switch styles independently',()=>{
  const a=new T.MeshStandardMaterial(),b=new T.MeshStandardMaterial(),first=new T.Mesh(new T.BoxGeometry(),[a,b]),second=new T.Mesh(new T.BoxGeometry(),a),view=new DeskWireframe();
  view.set(first,true);assert.ok(first.material.every(material=>material.wireframe));
  view.set(second,true);assert.equal(second.material.wireframe,true);view.set(first,false);
  assert.deepEqual(first.material,[a,b]);assert.equal(second.material.wireframe,true);assert.equal(a.wireframe,false);assert.equal(b.wireframe,false);
  view.set(second,false);assert.equal(second.material,a);view.dispose();
});
