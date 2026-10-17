import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {placementReport} from '../dist/placement.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} != ${expected}`);
function record(id,dimensions=[10,5,10],position=[0,0,0],extra={}){
 const geometry=new T.BoxGeometry(...dimensions);geometry.translate(0,dimensions[1]/2,0);
 const root=new T.Group();root.add(new T.Mesh(geometry));root.position.fromArray(position);
 return {id,name:id,root,baseSize:new T.Vector3(...dimensions),role:'item',calibrated:true,surfaceY:position[1],...extra};
}
const report=(records,selectedId,options={})=>placementReport(records,{selectedId,...options});
const area=polygon=>Math.abs(polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;

test('Projected hull follows rotation and nonuniform scale instead of world yaw AABB',()=>{
 const object=record('rotated',[12,4,2],[10,0,-7]);object.root.scale.set(2,3,4);object.root.rotation.y=Math.PI/4;
 const result=report([object],object.id),item=result.items[0];
 assert.equal(result.method,'projected-convex-hull');assert.equal(item.polygon.length,4);near(area(item.polygon),192);near(item.minY,0);near(item.maxY,12);
 const expected=[];
 for(const x of [-6,6])for(const z of [-1,1]){const p=new T.Vector3(x,0,z).applyMatrix4(object.root.matrixWorld);expected.push([p.x,p.z]);}
 for(const [x,z] of expected)assert.ok(item.polygon.some(p=>Math.hypot(p[0]-x,p[1]-z)<1e-5));
 assert.equal(result.selected.boundary.state,'ok');assert.equal(result.selected.size.state,'ok');
});

test('Transformed child corners retain parent-induced shear and mirror without a world AABB',()=>{
 const object=record('sheared',[12,4,2]),mesh=object.root.children[0];object.root.scale.set(-3,2,1);mesh.rotation.y=.6;
 const item=report([object],object.id).items[0];
 near(area(item.polygon),72);near(item.maxY-item.minY,8);
 const xs=item.polygon.map(p=>p[0]),zs=item.polygon.map(p=>p[1]);
 assert.ok((Math.max(...xs)-Math.min(...xs))*(Math.max(...zs)-Math.min(...zs))>area(item.polygon));
});

test('Position boundary and footprint size are independent checks',()=>{
 const small=record('small',[10,5,10],[68,0,0]),outside=report([small],small.id).selected;
 assert.equal(outside.boundary.state,'warning');assert.ok(outside.boundary.marginCm<0);assert.equal(outside.size.state,'ok');assert.equal(outside.conflict.state,'ok');
 const large=record('large',[160,5,10]),oversize=report([large],large.id).selected;
 assert.equal(oversize.boundary.state,'warning');assert.equal(oversize.size.state,'warning');assert.equal(oversize.conflict.state,'ok');
});

test('Exact footprint and height touching are not collisions, positive overlap is',()=>{
 const a=record('a',[10,5,10]),b=record('b',[10,5,10],[10,0,0]);
 assert.deepEqual(report([a,b],'a').selected.conflict.ids,[]);
 b.root.position.x=9.99;assert.deepEqual(report([a,b],'a').selected.conflict.ids,['b']);
 b.root.position.set(0,5,0);assert.deepEqual(report([a,b],'a').selected.conflict.ids,[]);
 b.root.position.y=4.99;assert.deepEqual(report([a,b],'a').selected.conflict.ids,['b']);
 const edge=record('edge',[10,5,10],[65,0,0]);const boundary=report([edge],'edge').selected.boundary;
 assert.equal(boundary.state,'ok');assert.equal(boundary.marginCm,0);
});

test('Overlapping yaw AABBs do not make disjoint thin footprints conflict',()=>{
 const a=record('a',[20,3,1]),b=record('b',[20,3,1],[2,0,2]);a.root.rotation.y=b.root.rotation.y=Math.PI/4;
 a.root.updateWorldMatrix(true,true);b.root.updateWorldMatrix(true,true);
 assert.ok(new T.Box3().setFromObject(a.root,true).intersectsBox(new T.Box3().setFromObject(b.root,true)));
 assert.deepEqual(report([a,b],'a').selected.conflict.ids,[]);
});

test('Disjoint vertical levels and unrelated scene overlaps do not warn the selection',()=>{
 const a=record('a'),b=record('b'),c=record('c',[10,5,10],[40,0,0]),upper=record('upper',[10,5,10],[0,20,0]);
 assert.deepEqual(report([a,b,c,upper],'a').selected.conflict.ids,['b']);
 assert.equal(report([a,b,c,upper],'c').selected.conflict.state,'ok');
 assert.deepEqual(report([a,b,c,upper],'upper').selected.conflict.ids,[]);
 assert.equal(report([a,b,c],null).selected,null);
});

test('Desktop uses the named tabletop world box, not the whole desk cabinet',()=>{
 const table=record('desk',[300,180,100],[200,-75,300],{role:'table'}),top=new T.Mesh(new T.BoxGeometry(100,2,40));
 top.geometry.translate(0,79,0);top.name='Desk_top_with_rounded_return__asset';table.root.add(top);
 const object=record('cup',[5,8,5],[200,5,300]),result=report([table,object],'cup',{table,surfaceY:100});
 assert.deepEqual(result.surface.min,[150,3,280]);assert.deepEqual(result.surface.max,[250,5,320]);assert.equal(result.surface.estimated,false);
 assert.equal(result.items.length,1);assert.equal(result.items[0].scope,'desktop');assert.equal(result.selected.boundary.state,'ok');assert.deepEqual(result.selected.conflict.ids,[]);
 const selectedTable=report([table,object],'desk',{table}).selected;
 assert.equal(selectedTable.boundary.state,'na');assert.equal(selectedTable.size.state,'na');assert.equal(selectedTable.conflict.state,'na');
});

test('Fallback footprints use table world XZ center and a labelled reference surface',()=>{
 const table=record('desk',[20,80,20],[30,-80,40],{role:'table',surfaceFootprintCm:[160,60]});
 const result=report([table],'desk',{table,surfaceY:8});
 assert.deepEqual(result.surface.min,[-50,8,10]);assert.deepEqual(result.surface.max,[110,8,70]);assert.equal(result.surface.estimated,true);
 const empty=report([],null,{surfaceY:500});assert.equal(empty.surface.kind,'reference');assert.deepEqual(empty.surface.min,[-70,0,-37.5]);assert.deepEqual(empty.surface.max,[70,0,37.5]);assert.deepEqual(empty.items,[]);
});

test('Drawer scope checks actual owning interior including its available height',()=>{
 let opening=0;
 const drawer={id:'tray',name:'测试抽屉',estimated:true,bounds:()=>new T.Box3(new T.Vector3(-10,-20,-8+opening),new T.Vector3(10,-10,8+opening))};
 const object=record('stored',[5,4,5],[0,-20,0],{storage:{drawerId:'tray'}});
 const initial=report([object],'stored',{drawers:[drawer]});
 assert.equal(initial.items[0].scope,'drawer');assert.equal(initial.selected.boundary.state,'ok');assert.equal(initial.selected.size.state,'ok');
 assert.equal(initial.selected.scope,'drawer');assert.equal(initial.selected.supportKind,'drawer');assert.equal(initial.selected.supportId,'tray');
 assert.equal(initial.supports[0].id,'tray');assert.equal(initial.supports[0].estimated,true);assert.deepEqual(initial.supports[0].min,[-10,-20,-8]);
 object.root.position.y=-12;const raised=report([object],'stored',{drawers:[drawer]}).selected;
 assert.equal(raised.boundary.state,'warning');assert.equal(raised.size.state,'ok');
 const tall=record('tall',[5,11,5],[0,-20,0],{storage:{drawerId:'tray'}}),overflow=report([tall],'tall',{drawers:[drawer]}).selected;
 assert.equal(overflow.boundary.state,'warning');assert.equal(overflow.size.state,'warning');
 object.root.position.y=-20;opening=30;
 assert.equal(report([object],'stored',{drawers:[drawer]}).selected.boundary.state,'warning');
 object.root.position.z=30;assert.equal(report([object],'stored',{drawers:[drawer]}).selected.boundary.state,'ok');
});

test('Chair floor, other heights and missing drawers are not fake-safe desktop placements',()=>{
 const chair=record('chair',[40,80,40],[1000,-76,0],{furniture:'chair'}),shelf=record('shelf',[10,5,10],[0,20,0],{surfaceY:20}),missing=record('missing',[10,5,10],[0,0,0],{storage:{drawerId:'missing'}});
 for(const [object,scope] of [[chair,'floor'],[shelf,'unknown'],[missing,'unknown']]){
  const result=report([object],object.id);assert.equal(result.items[0].scope,scope);assert.equal(result.selected.boundary.state,'na');assert.equal(result.selected.size.state,'na');
  assert.equal(result.selected.scope,scope);assert.equal(result.selected.supportKind,null);assert.equal(result.selected.supportId,null);
 }
 const floating=record('floating',[10,5,10],[0,10,0],{surfaceY:0});assert.equal(report([floating],'floating').items[0].scope,'unknown');
});

test('Uncalibrated size warns independently from safe boundary and conflict states',()=>{
 const object=record('reference',[10,5,10],[0,0,0],{calibrated:false}),result=report([object],object.id);
 assert.equal(result.selected.boundary.state,'ok');assert.equal(result.selected.size.state,'warning');assert.match(result.selected.size.label,/待校准/);assert.equal(result.selected.conflict.state,'ok');
 assert.deepEqual(JSON.parse(JSON.stringify(result)),result);
 object.root.position.y=20;assert.equal(report([object],object.id).selected.boundary.state,'na');assert.match(report([object],object.id).selected.size.label,/待校准/);
});

test('Invalid dimensions and empty geometry cannot produce a safe size or conflict claim',()=>{
 const object=record('invalid');object.root.scale.x=0;const invalid=report([object],object.id).selected;
 assert.equal(invalid.boundary.state,'na');assert.equal(invalid.size.state,'warning');assert.equal(invalid.conflict.state,'na');
 const empty={...record('empty'),root:new T.Group()},result=report([empty],'empty');
 assert.deepEqual(result.items[0].polygon,[]);assert.equal(result.items[0].minY,null);assert.equal(result.items[0].maxY,null);assert.equal(result.selected.conflict.state,'na');assert.deepEqual(JSON.parse(JSON.stringify(result)),result);
});
