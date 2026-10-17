import * as THREE from 'three';

const EPS=1e-6,SUPPORT_TOLERANCE=.5;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const finiteBox=box=>!box.isEmpty()&&[...box.min.toArray(),...box.max.toArray()].every(Number.isFinite);
const rectangle=(min,max)=>[[min[0],min[2]],[max[0],min[2]],[max[0],max[2]],[min[0],max[2]]];
function hull(points){
 const sorted=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]).filter((p,i,list)=>!i||p[0]!==list[i-1][0]||p[1]!==list[i-1][1]);
 if(sorted.length<3)return sorted;
 const lower=[],upper=[];
 for(const p of sorted){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
 for(let i=sorted.length-1;i>=0;i--){const p=sorted[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
 lower.pop();upper.pop();return lower.concat(upper);
}
function footprint(root){
 root.updateWorldMatrix(true,true);const points=[],point=new THREE.Vector3();let minY=Infinity,maxY=-Infinity;
 // 逐部件变换局部包围盒角点，保留旋转、非均匀缩放和剪切；凸包会保守填满凹形及部件间空隙，并非精确接触检测。
 root.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.geometry)return;
  if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
  const box=mesh.geometry.boundingBox;if(!box||!finiteBox(box))return;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
   point.set(x,y,z).applyMatrix4(mesh.matrixWorld);if(!point.toArray().every(Number.isFinite))continue;
   points.push([point.x,point.z]);minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);
  }
 });
 return {polygon:hull(points),minY:Number.isFinite(minY)?minY:null,maxY:Number.isFinite(maxY)?maxY:null};
}
function desktop(table,surfaceY){
 if(table){
  table.root.updateWorldMatrix(true,true);let top=null;
  table.root.traverse(node=>{if(!top&&node.isMesh&&node.name.startsWith('Desk_top_with_rounded_return'))top=node;});
  if(top){
   const box=new THREE.Box3().setFromObject(top,true);
   if(finiteBox(box)){const min=box.min.toArray(),max=box.max.toArray();return {kind:'desktop',label:table.name||'桌面',min,max,estimated:table.calibrated!==true,polygon:rectangle(min,max)};}
  }
  const position=table.root.getWorldPosition(new THREE.Vector3()),dimensions=table.surfaceFootprintCm;
  const valid=Array.isArray(dimensions)&&dimensions.length===2&&dimensions.every(n=>Number.isFinite(n)&&n>0);
  const [width,depth]=valid?dimensions:[140,75],height=Number.isFinite(surfaceY)?surfaceY:0;
  const min=[position.x-width/2,height,position.z-depth/2],max=[position.x+width/2,height,position.z+depth/2];
  return {kind:'desktop',label:table.name||'桌面',min,max,estimated:true,polygon:rectangle(min,max)};
 }
 const min=[-70,0,-37.5],max=[70,0,37.5];return {kind:'reference',label:'参考桌面 · 140 × 75 cm',min,max,estimated:true,polygon:rectangle(min,max)};
}
function drawerSupports(drawers){
 return drawers.flatMap(drawer=>{
  const box=drawer.bounds();if(!finiteBox(box))return [];
  const min=box.min.toArray(),max=box.max.toArray();
  return [{kind:'drawer',id:drawer.id,label:drawer.name||'抽屉',min,max,estimated:!!drawer.estimated,polygon:rectangle(min,max)}];
 });
}
function extent(polygon){
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(const [x,z] of polygon){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
 return {minX,maxX,minZ,maxZ,width:maxX-minX,depth:maxZ-minZ};
}
function intersects(a,b){
 if(a.length<3||b.length<3)return false;
 // 凸多边形 SAT：仅边界接触不算相交；使用单位法线保持容差的厘米语义。
 for(const polygon of [a,b])for(let i=0;i<polygon.length;i++){
  const p=polygon[i],q=polygon[(i+1)%polygon.length],length=Math.hypot(q[0]-p[0],q[1]-p[1]);if(length<=EPS)continue;
  const x=-(q[1]-p[1])/length,z=(q[0]-p[0])/length;
  let minA=Infinity,maxA=-Infinity,minB=Infinity,maxB=-Infinity;
  for(const point of a){const n=point[0]*x+point[1]*z;minA=Math.min(minA,n);maxA=Math.max(maxA,n);}
  for(const point of b){const n=point[0]*x+point[1]*z;minB=Math.min(minB,n);maxB=Math.max(maxB,n);}
  if(Math.min(maxA,maxB)-Math.max(minA,minB)<=EPS)return false;
 }
 return true;
}
const status=(state,label)=>({state,label});
function dimensionsValid(record,item){
 const size=record.baseSize,scale=record.root.scale;
 return size&&[size.x,size.y,size.z,scale.x,scale.y,scale.z].every(Number.isFinite)&&[Math.abs(size.x*scale.x),Math.abs(size.y*scale.y),Math.abs(size.z*scale.z)].every(n=>n>EPS)&&item.polygon.length>=3&&item.minY!==null&&item.maxY-item.minY>EPS;
}
function selectedChecks(record,item,support){
 let boundary,size;
 const valid=dimensionsValid(record,item);
 if(!valid){boundary=status('na','几何尺寸无效，无法判断边界');size=status('warning',record.calibrated===true?'尺寸无效，请检查模型':'待校准 · 尺寸无效');}
 else if(!support){
  boundary=status('na',item.scope==='floor'?'地面范围未定义，不检查桌面边界':'当前高度的支撑面未知');
  size=record.calibrated===true?status('na',item.scope==='floor'?'地面可用尺寸未知':'支撑面尺寸未知'):status('warning','待校准 · 尺寸仅供参考');
 }else{
  const box=extent(item.polygon),width=support.max[0]-support.min[0],depth=support.max[2]-support.min[2],drawer=support.kind==='drawer';
  const margins=[box.minX-support.min[0],support.max[0]-box.maxX,box.minZ-support.min[2],support.max[2]-box.maxZ];
  if(drawer)margins.push(item.minY-support.min[1],support.max[1]-item.maxY);
  const margin=Math.min(...margins),fits=box.width<=width+EPS&&box.depth<=depth+EPS&&(!drawer||item.maxY-item.minY<=support.max[1]-support.min[1]+EPS);
  boundary={...status(margin>=-EPS?'ok':'warning',margin>=-EPS?`${drawer?'抽屉内腔':'桌面'}范围内${support.estimated?'（估算）':''}`:`超出${drawer?'抽屉内腔':'桌面'}边界`),marginCm:Math.abs(margin)<EPS?0:margin};
  const fitLabel=fits?`占地${drawer?'及高度':''}适合${drawer?'抽屉内腔':'桌面'}`:`占地${drawer?'或高度':''}超出${drawer?'抽屉内腔':'桌面'}尺寸`;
  size=status(record.calibrated!==true||!fits?'warning':'ok',record.calibrated!==true?'待校准 · '+fitLabel:fitLabel);
 }
 return {boundary,size};
}

export function placementReport(records,{selectedId=null,table=null,drawers=[],surfaceY=0}={}){
 const list=Array.from(records),surface=desktop(table,surfaceY),supports=drawerSupports(drawers),supportById=new Map(supports.map(support=>[support.id,support]));
 const items=[],supportByItem=new Map();
 for(const record of list){
  if(record===table||record.role==='table')continue;
  const shape=footprint(record.root);let scope='unknown',support=null;
  if(record.storage?.drawerId){support=supportById.get(record.storage.drawerId)||null;scope=support?'drawer':'unknown';}
  else if(record.furniture==='chair')scope='floor';
  else if(shape.minY!==null&&Math.abs(shape.minY-surface.max[1])<=SUPPORT_TOLERANCE){scope='desktop';support=surface;}
  const item={id:record.id,name:record.name||'未命名物品',...shape,scope,selected:record.id===selectedId};items.push(item);supportByItem.set(record.id,support);
 }
 const record=list.find(record=>record.id===selectedId)||(table?.id===selectedId?table:null),item=items.find(item=>item.id===selectedId);let selected=null;
 if(record){
  if(!item)selected={id:record.id,scope:'fixed',supportKind:null,supportId:null,boundary:status('na','固定桌体不检查自身边界'),size:status('na','请选择可摆放物品'),conflict:{...status('na','固定桌体不参与占地冲突'),ids:[]}};
  else{
   const checks=selectedChecks(record,item,supportByItem.get(item.id)),ids=[];
   if(item.minY!==null)for(const other of items){
    if(other.id===item.id||other.minY===null||Math.min(item.maxY,other.maxY)-Math.max(item.minY,other.minY)<=EPS)continue;
    if(intersects(item.polygon,other.polygon))ids.push(other.id);
   }
   const usable=item.polygon.length>=3&&item.minY!==null&&item.maxY-item.minY>EPS;
   const support=supportByItem.get(item.id);
   selected={id:item.id,scope:item.scope,supportKind:support?.kind??null,supportId:support?.id??(support===surface?table?.id??null:null),...checks,conflict:{...status(!usable?'na':ids.length?'warning':'ok',!usable?'几何尺寸无效，无法判断冲突':ids.length?`与 ${ids.length} 件物品占地重叠（保守凸包）`:'未发现同高度占地重叠（保守凸包）'),ids}};
  }
 }
 return {method:'projected-convex-hull',surface,supports,items,selected};
}
