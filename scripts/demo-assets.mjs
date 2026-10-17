import * as T from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { writeFile, mkdir } from 'node:fs/promises';
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(data => {this.result=data; this.onloadend?.();}); }
  readAsDataURL(blob) { blob.arrayBuffer().then(data=>{this.result='data:'+blob.type+';base64,'+Buffer.from(data).toString('base64');this.onloadend?.();}); }
};
const mat=(color,metalness=0,roughness=.65)=>new T.MeshStandardMaterial({color,metalness,roughness});
function mesh(g, geo, material, x=0,y=0,z=0) {const m=new T.Mesh(geo,material);m.position.set(x,y,z);g.add(m);return m;}
const cream=mat('#d7dea9'),charcoal=mat('#253539',.25),silver=mat('#9faeb1',.5,.38),screen=mat('#c8d5e6',.1,.28);
const lamp=new T.Group();lamp.name='示例台灯';
mesh(lamp,new T.CylinderGeometry(9,10,1.8,48),cream,0,.9,0);
mesh(lamp,new T.CylinderGeometry(.7,.7,27,24),charcoal,0,15,-1);
const shade=mesh(lamp,new T.ConeGeometry(11,11,48,1,true),cream,0,32,-1);shade.material.side=T.DoubleSide;
mesh(lamp,new T.SphereGeometry(2,24,16),mat('#fff9d7'),0,29,-1);
mesh(lamp,new T.CylinderGeometry(2.1,2.1,1,24),charcoal,0,37.4,-1);
const monitor=new T.Group();monitor.name='示例显示器';
mesh(monitor,new T.BoxGeometry(22,1,13),silver,0,.5,0);
mesh(monitor,new T.BoxGeometry(3,15,3),silver,0,8,-1);
mesh(monitor,new T.BoxGeometry(48,28,2),charcoal,0,27,-1);
mesh(monitor,new T.PlaneGeometry(46,25),screen,0,27.5,.03);
const accent=mat('#8c9cbd');
mesh(monitor,new T.PlaneGeometry(15,17),accent,-11,27.5,.05);
mesh(monitor,new T.PlaneGeometry(21,2),mat('#edf0f6'),9,32,.06);
mesh(monitor,new T.PlaneGeometry(17,1),mat('#b3c1d7'),7,27,.06);
mesh(monitor,new T.PlaneGeometry(17,1),mat('#b3c1d7'),7,24,.06);
mesh(monitor,new T.SphereGeometry(.25,8,8),mat('#8da6b5'),0,14.2,.1);
const table=new T.Group();table.name='测试桌子';
mesh(table,new T.BoxGeometry(140,3,75),mat('#d6c3a3'),0,73.5,0);
for(const x of [-62,62])for(const z of [-30,30])mesh(table,new T.BoxGeometry(4,72,4),silver,x,36,z);
await mkdir('dist/assets',{recursive:true});
for(const [name,model] of [['demo-lamp',lamp],['demo-monitor',monitor],['demo-table',table]]) {
 const glb=await new GLTFExporter().parseAsync(model,{binary:true});
 await writeFile('dist/assets/'+name+'.glb',Buffer.from(glb));
 console.log(name,glb.byteLength);
}
