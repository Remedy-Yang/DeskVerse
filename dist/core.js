import * as THREE from 'three';
export const AXES = ['x', 'y', 'z'];
export const MAX_FILE_SIZE = 80 * 1024 * 1024;
export function inspectGLB(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 20) throw new Error('文件不完整，请重新导出 GLB。');
  const view = new DataView(buffer);
  if (view.getUint32(0,true)!==0x46546c67 || view.getUint32(4,true)!==2) throw new Error('请选择 glTF 2.0 格式的 .glb 文件。');
  if (view.getUint32(8,true)!==buffer.byteLength) throw new Error('GLB 文件长度不一致，文件可能已损坏。');
  const length=view.getUint32(12,true);
  if (view.getUint32(16,true)!==0x4e4f534a || 20+length>buffer.byteLength) throw new Error('GLB 缺少有效的模型描述。');
  const json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)).trim());
  for(const item of [...(json.buffers||[]),...(json.images||[])]) if(item.uri && !item.uri.startsWith('data:')) throw new Error('该 GLB 引用了外部文件，请重新导出为内嵌贴图和几何的 GLB。');
  return json;
}
export function normalizeModel(model, targetSize) {
  model.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model,true);
  const size=box.getSize(new THREE.Vector3());
  if(box.isEmpty() || !Number.isFinite(size.length()) || Math.max(...size.toArray())<1e-8) throw new Error('模型没有可显示的几何，请检查导出内容。');
  const center=box.getCenter(new THREE.Vector3());
  const root=new THREE.Group();
  const content=new THREE.Group();
  content.add(model);
  content.position.set(-center.x,-box.min.y,-center.z);
  root.add(content);
  root.scale.setScalar(targetSize/Math.max(size.x,size.y,size.z));
  root.updateMatrixWorld(true);
  return {root,baseSize:size};
}
export function boundsOf(root) {root.updateMatrixWorld(true);return new THREE.Box3().setFromObject(root,true);}
export function placeOnSurface(root, height=0) {
  const box=boundsOf(root);
  if(!box.isEmpty()) root.position.y+=height-box.min.y;
  root.updateMatrixWorld(true);
}
export function getDimensions(record) {
  return record.baseSize.clone().multiply(record.root.scale);
}
export function setDimension(record, axis, value, uniform=true) {
  if(!AXES.includes(axis)||!Number.isFinite(value)||value<=0||value>100000) throw new Error('尺寸必须大于 0，且不超过 100000 cm。');
  const old=getDimensions(record)[axis];
  if(old<1e-8)throw new Error('该方向是零厚度平面，不能直接校准厚度。');
  if(uniform)record.root.scale.multiplyScalar(value/old);
  else record.root.scale[axis]=value/record.baseSize[axis];
}
export function estimateSeatHeight(statureCm, ratio=.25) {
  if(!Number.isFinite(statureCm)||!Number.isFinite(ratio)) throw new Error('身高和坐高比例必须是有效数字。');
  // 按人体比例初步估算，并允许用户小幅调整。
  const stature=THREE.MathUtils.clamp(statureCm,120,220);
  const minCm=Math.max(30,stature*.23+2);
  const maxCm=Math.min(70,stature*.27+2);
  const cm=THREE.MathUtils.clamp(stature*THREE.MathUtils.clamp(ratio,.23,.27)+2,minCm,maxCm);
  return {statureCm:stature,cm,minCm,maxCm,ratio:(cm-2)/stature};
}
export function recordState(record) {
  const bounds=boundsOf(record.root);
  return {id:record.id,name:record.name,sourceFile:record.sourceFile,role:record.role,demo:record.demo,locked:!!record.locked,calibrated:record.calibrated,grounded:record.grounded,surfaceY:record.surfaceY??null,
    position:record.root.position.toArray(),rotation:record.root.rotation.toArray().slice(0,3).map(THREE.MathUtils.radToDeg),rotationOrder:'XYZ',
    scale:record.root.scale.toArray(),dimensionsCm:getDimensions(record).toArray(),
    worldBoundsCm:{min:bounds.min.toArray(),max:bounds.max.toArray()}};
}
export class History {
  constructor(limit=60){this.entries=[];this.index=-1;this.limit=limit;}
  push(value){const json=JSON.stringify(value);if(this.entries[this.index]===json)return;this.entries.splice(this.index+1);this.entries.push(json);if(this.entries.length>this.limit)this.entries.shift();this.index=this.entries.length-1;}
  undo(){if(this.index<=0)return null;return JSON.parse(this.entries[--this.index]);}
  redo(){if(this.index>=this.entries.length-1)return null;return JSON.parse(this.entries[++this.index]);}
}
