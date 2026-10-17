import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {readFile} from 'node:fs/promises';
import {normalizeModel} from '../dist/core.js';
import {prepareDeskModel} from '../dist/drawers.js';
import {placementReport} from '../dist/placement.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5,`${actual} != ${expected}`);
function record(id,dimensions=[10,5,10],position=[0,0,0],extra={}){
 const geometry=new T.BoxGeometry(...dimensions);geometry.translate(0,dimensions[1]/2,0);
 const root=new T.Group();root.add(new T.Mesh(geometry));root.position.fromArray(position);
 return {id,name:id,root,baseSize:new T.Vector3(...dimensions),role:'item',calibrated:true,surfaceY:position[1],...extra};
}
const report=(records,selectedId,options={})=>placementReport(records,{selectedId,...options});
const area=polygon=>Math.abs(polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
function topMesh(rectangles,indexed=false,name='Desk_top_with_rounded_return__asset'){
 const positions=[],indices=[],lookup=new Map();
 const vertex=(x,z)=>{if(!indexed){positions.push(x,0,z);return positions.length/3-1;}const key=`${x},${z}`;if(!lookup.has(key)){lookup.set(key,positions.length/3);positions.push(x,0,z);}return lookup.get(key);};
 const triangle=(a,b,c)=>{const ia=vertex(...a),ib=vertex(...b),ic=vertex(...c);if(indexed)indices.push(ia,ib,ic);};
 for(const [minX,minZ,maxX,maxZ] of rectangles){triangle([minX,minZ],[minX,maxZ],[maxX,minZ]);triangle([maxX,minZ],[minX,maxZ],[maxX,maxZ]);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));if(indexed)geometry.setIndex(indices);geometry.computeBoundingBox();return new T.Mesh(geometry);
}
function surfaceTable(rectangles,indexed=false){const table=record('desk',[200,2,120],[0,0,0],{role:'table'}),mesh=topMesh(rectangles,indexed);mesh.name='Desk_top_with_rounded_return__asset';table.root.add(mesh);return table;}

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

test('Named tabletop preserves a concave loop and welds indexed and seam-duplicated faces',()=>{
 const rectangles=[[-10,-10,2,10],[2,-10,10,-2]];
 for(const indexed of [false,true]){
  const table=surfaceTable(rectangles,indexed),insideNotch=record('notch',[2,2,2],[6,0,6]);
  const result=report([table,insideNotch],'notch',{table});
 assert.equal(result.surface.shapeSource,'named-top-mesh');assert.equal(result.surface.rings.length,1);assert.ok(result.surface.polygon.length>4);near(area(result.surface.polygon),304);assert.equal(result.selected.boundary.state,'warning');
 }
});

test('Desktop outline cache reuses topology while applying current world transforms',()=>{
 const table=surfaceTable([[-10,-10,2,10],[2,-10,10,-2]]),first=report([],null,{table}).surface;
 table.root.position.set(30,4,-20);table.root.scale.set(2,3,4);const moved=report([],null,{table}).surface;
 assert.equal(moved.shapeSource,'named-top-mesh');near(area(moved.polygon),area(first.polygon)*8);assert.ok(moved.polygon.some(([x,z])=>Math.abs(x-10)<1e-5&&Math.abs(z-20)<1e-5));
});

test('Concave surface warns when an object edge bridges a notch despite interior vertices',()=>{
 const table=surfaceTable([[-10,-10,-4,10],[4,-10,10,10],[-4,-10,4,0]]),bridge=record('bridge',[16,2,2],[0,0,5]);
 const result=report([table,bridge],'bridge',{table});
 assert.equal(result.surface.shapeSource,'named-top-mesh');assert.equal(result.selected.boundary.state,'warning');assert.equal(result.selected.size.state,'ok');
});

test('A footprint covering a desktop hole is outside even when every vertex is in the outer ring',()=>{
 const table=surfaceTable([[-10,-10,10,-2],[-10,2,10,10],[-10,-2,-2,2],[2,-2,10,2]]),cover=record('cover',[8,2,8],[0,0,0]);
 const result=report([table,cover],'cover',{table});
 assert.equal(result.surface.rings.length,2);assert.equal(result.selected.boundary.state,'warning');
});

test('Fallback footprints use table world XZ center and a labelled reference surface',()=>{
 const table=record('desk',[20,80,20],[30,-80,40],{role:'table',surfaceFootprintCm:[160,60]});
 table.root.clear();
 const result=report([table],'desk',{table,surfaceY:8});
 assert.deepEqual(result.surface.min,[-50,8,10]);assert.deepEqual(result.surface.max,[110,8,70]);assert.equal(result.surface.estimated,true);
 const empty=report([],null,{surfaceY:500});assert.equal(empty.surface.kind,'reference');assert.deepEqual(empty.surface.min,[-70,0,-37.5]);assert.deepEqual(empty.surface.max,[70,0,37.5]);assert.deepEqual(empty.items,[]);
});

test('Unnamed single-surface desk derives its measured top outline',()=>{
 const table=record('desk',[20,2,20],[5,0,7],{role:'table'}),result=report([],null,{table});
 assert.equal(result.surface.shapeSource,'inferred-top-mesh');assert.equal(result.surface.estimated,false);assert.equal(result.surface.polygon.length,4);assert.deepEqual(result.surface.polygon.map(([x,z])=>[x,z]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),[[-5,-3],[-5,17],[15,-3],[15,17]]);
});

test('Mirrored, sloped and conical surfaces are not labelled as measured horizontal tabletops',()=>{
 const mirrored=record('mirrored',[20,2,20],[0,0,0],{role:'table'});mirrored.root.scale.y=-1;
 const sloped=record('sloped',[20,2,20],[0,0,0],{role:'table'});sloped.root.rotation.x=.2;
 const cone=record('cone',[20,20,20],[0,0,0],{role:'table'});cone.root.children[0].geometry=new T.ConeGeometry(10,20,12);
 for(const table of [mirrored,sloped,cone]){const surface=report([],null,{table}).surface;assert.equal(surface.shapeSource,'estimated-footprint');assert.equal(surface.estimated,true);}
});

test('Replacing a same-sized position attribute invalidates cached desktop topology',()=>{
 const table=surfaceTable([[-10,-10,10,10]]),mesh=table.root.children.at(-1),replacement=topMesh([[-20,-20,20,20]]).geometry;
 mesh.geometry.setAttribute('position',replacement.getAttribute('position'));mesh.geometry.computeBoundingBox();
 const surface=report([],null,{table}).surface;assert.equal(surface.shapeSource,'named-top-mesh');assert.equal(Math.max(...surface.polygon.map(point=>point[0])),20);
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

test('Real desk GLB exposes the curved named desktop outline',async()=>{
 const bytes=await readFile(new URL('../dist/assets/desk-real.glb',import.meta.url)),loader=new GLTFLoader();
 loader.register(()=>({name:'placement-material',loadMaterial:()=>Promise.resolve(new T.MeshBasicMaterial())}));
 const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const geometry=normalizeModel(prepareDeskModel(gltf.scene),210),table={id:'real-desk',name:'真实桌',role:'table',calibrated:true,root:geometry.root,baseSize:geometry.baseSize};
 const surface=report([],null,{table}).surface;
 assert.equal(surface.shapeSource,'named-top-mesh');assert.ok(surface.rings.length>=1);assert.ok(surface.polygon.length>4);assert.ok(area(surface.polygon)>0);assert.ok(surface.max[1]>surface.min[1]);
});
