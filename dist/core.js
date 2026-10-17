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
export function setDimensions(record, dimensions) {
  if(!Array.isArray(dimensions)||dimensions.length!==3||dimensions.some(value=>!Number.isFinite(value)||value<=0||value>100000)) throw new Error('宽、高、深都必须是大于 0 且不超过 100000 cm 的数字。');
  for(const axis of AXES)if(record.baseSize[axis]<1e-8)throw new Error('该方向是零厚度平面，不能直接校准厚度。');
  for(const [index,axis] of AXES.entries())record.root.scale[axis]=dimensions[index]/record.baseSize[axis];
}
export function parseSizeChart(text) {
  if(typeof text!=='string'||!text.trim())return [];
  const normalized=text.replace(/[０-９]/g,char=>String.fromCharCode(char.charCodeAt(0)-0xfee0)).replace(/[．。]/g,'.').replace(/[＊✕✖×xX*]/g,'×');
  const lines=normalized.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const packaging=/彩盒|外箱|包装|箱规|外包装|carton|package/i;
  const preferred=lines.flatMap((line,index)=>{
    if(packaging.test(line)||!/(产品|商品|本体|机身)?尺寸|规格|dimension|size/i.test(line))return [];
    const next=lines[index+1];return /\d/.test(line)?[line]:next&&!packaging.test(next)?[line,next]:[line];
  });
  const candidates=[];
  const pattern=/(\d{1,4}(?:\.\d+)?)\s*(?:毫米|mm|厘米|cm)?\s*×\s*(\d{1,4}(?:\.\d+)?)\s*(?:毫米|mm|厘米|cm)?(?:\s*×\s*(\d{1,4}(?:\.\d+)?)\s*(?:毫米|mm|厘米|cm)?)?(?:\s*(毫米|mm|厘米|cm))?/gi;
  const scan=sourceLines=>{
    for(const line of sourceLines){
      if(packaging.test(line))continue;
      const labels=[...line.matchAll(/[（(]\s*(长|宽|高)\s*[）)]/g)].map(match=>match[1]);
      const numericLine=line.replace(/[（(]\s*(?:长|宽|高)\s*[）)]/g,' ');
      for(const match of numericLine.matchAll(pattern)){
        const numbers=[match[1],match[2],match[3]].filter(Boolean).map(Number);
        const millimeters=/毫米|mm/i.test(match[0])||(!/厘米|cm/i.test(line)&&/毫米|mm/i.test(line));
        const scale=millimeters ? .1 : 1;
        let dimensions;
        if(numbers.length===2)dimensions=[numbers[0],numbers[1],numbers[0]];
        else if(labels.length>=3&&['长','宽','高'].every(label=>labels.includes(label))){const values=Object.fromEntries(labels.slice(0,3).map((label,index)=>[label,numbers[index]]));dimensions=[values.宽,values.高,values.长];}
        else dimensions=[numbers[1],numbers[2],numbers[0]];
        dimensions=dimensions.map(value=>Number((value*scale).toFixed(3)));
        if(dimensions.every(value=>Number.isFinite(value)&&value>0&&value<=100000)&&!candidates.some(item=>item.dimensions.every((value,index)=>Math.abs(value-dimensions[index])<.01)))candidates.push({dimensions});
      }
    }
  };
  scan(preferred);
  if(!candidates.length)scan(lines);
  const capacities=[...new Set([...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(ml|毫升)/gi)].map(match=>`${match[1]} ${match[2].toLowerCase()==='ml'?'ml':'毫升'}`))];
  return candidates.slice(0,12).map((candidate,index)=>({...candidate,name:capacities.length===candidates.length?capacities[index]:`规格 ${index+1}`}));
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
