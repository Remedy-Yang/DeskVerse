import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLayout,legacyModel,encodeModel,decodeModel} from '../dist/layout-import.js';

const object=()=>({id:'lamp',name:'台灯',sourceFile:'lamp.glb',role:'item',position:[10,0,-8],rotation:[0,45,0],scale:[1,2,1],dimensionsCm:[10,20,10]});
const layout=()=>({schemaVersion:1,units:'cm',objects:[object()]});

test('旧版厘米布局兼容；不接受其他版本、单位和旋转约定',()=>{
 assert.equal(validateLayout(layout()).objects[0].name,'台灯');
 for(const patch of [{schemaVersion:2},{units:'m'},{coordinateSystem:{up:'Z',rotationUnit:'degrees',rotationOrder:'XYZ'}}])assert.throws(()=>validateLayout({...layout(),...patch}));
});
test('拒绝重复物品、多个桌子和损坏的变换，避免半个场景被应用',()=>{
 const a=object();assert.throws(()=>validateLayout({...layout(),objects:[a,a]}));
 assert.throws(()=>validateLayout({...layout(),objects:[{...a,role:'table'},{...a,id:'second',role:'table'}]}));
 for(const patch of [{position:[NaN,0,0]},{rotation:[0,Infinity,0]},{scale:[1,0,1]},{dimensionsCm:[1,-1,1]},{modelOrientation:[0,0,0,0]},{surfaceY:'0'}])assert.throws(()=>validateLayout({...layout(),objects:[{...a,...patch}]}));
});
test('允许零厚度平面，但拒绝完全退化的尺寸',()=>{
 assert.deepEqual(validateLayout({...layout(),objects:[{...object(),dimensionsCm:[10,0,10]}]}).objects[0].dimensionsCm,[10,0,10]);
 assert.throws(()=>validateLayout({...layout(),objects:[{...object(),dimensionsCm:[0,0,0]}]}));
});
test('收纳要求真实抽屉引用，开合与视角必须处于有效范围',()=>{
 const state=layout();state.drawers=[{id:'left-drawer',opening:.75}];state.objects[0].storage={drawerId:'left-drawer'};validateLayout(state);
 assert.throws(()=>validateLayout({...state,drawers:[]}));
 assert.throws(()=>validateLayout({...state,drawers:[{id:'left-drawer',opening:1.1}]}));
 assert.throws(()=>validateLayout({...state,view:{mode:'top',position:[0,500,0],target:[0,0,0],zoom:0}}));
});
test('旧内置桌柜及独立椅子使用同一模型来源；自定义文件保持本地来源',()=>{
 const desk=legacyModel({...object(),sourceFile:'agentic_0005_pack_glb_model_material_realwood_upper_bed_200x90.glb',role:'table'}),chair=legacyModel({...object(),sourceFile:'desk-real.glb#chair'});
 assert.equal(desk.key,chair.key);assert.equal(chair.part,'chair');assert.equal(chair.role,'table');
 assert.equal(legacyModel(object()).builtin,null);
 assert.equal(legacyModel({...object(),sourceFile:'https://example.com/a.glb'}).builtin,null);
});
test('内嵌二进制保持每个字节，含分块边界和非 ASCII 字节',()=>{
 const bytes=Uint8Array.from({length:70001},(_,i)=>i%256);
 assert.deepEqual(new Uint8Array(decodeModel(encodeModel(bytes.buffer))),bytes);
 assert.throws(()=>decodeModel('invalid!'));assert.throws(()=>decodeModel(null));
});
