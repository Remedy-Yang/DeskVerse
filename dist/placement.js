import * as THREE from 'three';

const EPS=1e-6,SUPPORT_TOLERANCE=.5,WELD_EPS=1e-5;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const ringArea=polygon=>{let twiceArea=0;for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length];twiceArea+=p[0]*q[1]-q[0]*p[1];}return Math.abs(twiceArea)/2;};
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

// 几何拓扑是静态的；只在属性版本变化时重新焊接并提取顶面边界。
const topologyCache=new WeakMap();
function positionVersion(geometry){const position=geometry.getAttribute('position'),index=geometry.index;return {position,index,version:`${position?.version??-1}:${position?.count??0}:${index?.version??-1}:${index?.count??0}`};}
// 分片网格可能存在 T 接缝：长边先按共线端点切开，再按奇偶次数抵消内部子边。
function splitBoundaryEdges(edges,vertices){
 const ids=new Set();for(const edge of edges){ids.add(edge.a);ids.add(edge.b);}const sorted=new Map(),pieces=new Map();
 for(const edge of edges){
  const a=vertices[edge.a],b=vertices[edge.b],direction=b.map((value,index)=>value-a[index]),length2=direction.reduce((sum,value)=>sum+value*value,0);if(length2<=WELD_EPS*WELD_EPS)continue;
  let axis=0;for(let i=1;i<3;i++)if(Math.abs(direction[i])>Math.abs(direction[axis]))axis=i;
  if(!sorted.has(axis))sorted.set(axis,[...ids].sort((x,y)=>vertices[x][axis]-vertices[y][axis]));const candidates=sorted.get(axis),low=Math.min(a[axis],b[axis])-WELD_EPS,high=Math.max(a[axis],b[axis])+WELD_EPS;
  let left=0,right=candidates.length;while(left<right){const middle=(left+right)>>>1;if(vertices[candidates[middle]][axis]<low)left=middle+1;else right=middle;}
  const cuts=[{id:edge.a,t:0},{id:edge.b,t:1}];
  for(let i=left;i<candidates.length&&vertices[candidates[i]][axis]<=high;i++){const id=candidates[i];if(id===edge.a||id===edge.b)continue;const point=vertices[id],t=point.reduce((sum,value,index)=>sum+(value-a[index])*direction[index],0)/length2;if(t<=0||t>=1)continue;const distance2=point.reduce((sum,value,index)=>sum+(value-a[index]-t*direction[index])**2,0);if(distance2<=WELD_EPS*WELD_EPS)cuts.push({id,t});}
  cuts.sort((x,y)=>x.t-y.t);for(let i=1;i<cuts.length;i++){const x=cuts[i-1].id,y=cuts[i].id;if(x===y)continue;const key=x<y?`${x}:${y}`:`${y}:${x}`,piece=pieces.get(key);if(piece)piece.count++;else pieces.set(key,{a:Math.min(x,y),b:Math.max(x,y),count:1});}
 }
 return [...pieces.values()].filter(edge=>edge.count%2===1);
}
function extractTopTopology(geometry){
 const position=geometry.getAttribute('position');if(!position||position.count<3)return {rings:[],topY:null};
 const cached=topologyCache.get(geometry),signature=positionVersion(geometry);if(cached?.position===signature.position&&cached?.index===signature.index&&cached.version===signature.version)return cached.value;
 const values=[];for(let i=0;i<position.count;i++)values.push([position.getX(i),position.getY(i),position.getZ(i)]);
 const index=geometry.index,triangleCount=index?Math.floor(index.count/3):Math.floor(position.count/3),triangles=[],candidate=[];let minY=Infinity,maxY=-Infinity;
 for(const point of values){minY=Math.min(minY,point[1]);maxY=Math.max(maxY,point[1]);}
 const pointAt=i=>values[index?index.getX(i):i];
 for(let i=0;i<triangleCount;i++){
  const a=pointAt(i*3),b=pointAt(i*3+1),c=pointAt(i*3+2),normal=[(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]),(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]),(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])],length=Math.hypot(...normal);
  if(length<=WELD_EPS||Math.abs(normal[1])/length<.5)continue;
  const y=(a[1]+b[1]+c[1])/3;triangles.push([a,b,c,y]);candidate.push(y);
 }
 if(!candidate.length){const value={rings:[],topY:null};topologyCache.set(geometry,{...positionVersion(geometry),value});return value;}
 let highest=-Infinity;for(const value of candidate)highest=Math.max(highest,value);const tol=Math.max(1e-4,(maxY-minY)*1e-4),selected=triangles.filter(triangle=>Math.abs(triangle[3]-highest)<=tol);
 const welded=[],buckets=new Map(),findPoint=point=>{const bx=Math.round(point[0]/WELD_EPS),by=Math.round(point[1]/WELD_EPS),bz=Math.round(point[2]/WELD_EPS);for(let x=bx-1;x<=bx+1;x++)for(let y=by-1;y<=by+1;y++)for(let z=bz-1;z<=bz+1;z++)for(const found of buckets.get(`${x},${y},${z}`)||[]){const q=welded[found];if(Math.hypot(point[0]-q[0],point[1]-q[1],point[2]-q[2])<=WELD_EPS)return found;}const found=welded.length;welded.push(point.slice());const key=`${bx},${by},${bz}`;let list=buckets.get(key);if(!list)buckets.set(key,list=[]);list.push(found);return found;};
 const edges=new Map(),addEdge=(a,b)=>{if(a===b)return;const key=a<b?`${a}:${b}`:`${b}:${a}`;const edge=edges.get(key);if(edge)edge.count++;else edges.set(key,{a:Math.min(a,b),b:Math.max(a,b),count:1});};
 for(const [a,b,c] of selected){const ia=findPoint(a),ib=findPoint(b),ic=findPoint(c);addEdge(ia,ib);addEdge(ib,ic);addEdge(ic,ia);}
 const boundary=splitBoundaryEdges([...edges.values()].filter(edge=>edge.count%2===1),welded),adjacency=new Map();for(const edge of boundary){let a=adjacency.get(edge.a);if(!a)adjacency.set(edge.a,a=[]);a.push(edge);let b=adjacency.get(edge.b);if(!b)adjacency.set(edge.b,b=[]);b.push(edge);}
 const used=new Set(),rings=[];
 for(const first of boundary){const firstKey=first.a<first.b?`${first.a}:${first.b}`:`${first.b}:${first.a}`;if(used.has(firstKey))continue;const ring=[],start=first.a,current={value:first.a,edge:first};let guard=0,closed=false;
  while(current.edge&&guard++<=boundary.length+1){const edge=current.edge,key=edge.a<edge.b?`${edge.a}:${edge.b}`:`${edge.b}:${edge.a}`;used.add(key);const vertex=current.value;ring.push(welded[vertex].slice());const next=vertex===edge.a?edge.b:edge.a;if(next===start){closed=true;break;}const options=(adjacency.get(next)||[]).filter(candidateEdge=>{const candidateKey=candidateEdge.a<candidateEdge.b?`${candidateEdge.a}:${candidateEdge.b}`:`${candidateEdge.b}:${candidateEdge.a}`;return !used.has(candidateKey);});current.value=next;current.edge=options[0]||null;}
  if(closed&&ring.length>=3){const projected=ring.map(point=>[point[0],point[2]]);if(Math.abs(projected.reduce((sum,p,i)=>{const q=projected[(i+1)%projected.length];return sum+p[0]*q[1]-q[0]*p[1];},0))>WELD_EPS)rings.push(ring);}
 }
 const value={rings,topY:highest};topologyCache.set(geometry,{...positionVersion(geometry),value});return value;
}
function worldRings(mesh,topology){const point=new THREE.Vector3();let topY=-Infinity,minY=Infinity;const rings=topology.rings.map(ring=>ring.map(([x,y,z])=>{point.set(x,y,z).applyMatrix4(mesh.matrixWorld);topY=Math.max(topY,point.y);minY=Math.min(minY,point.y);return [point.x,point.z];}));return {rings,topY,minY};}
function findTopMesh(root,namedOnly=false){const candidates=[];root.traverse(node=>{if(!node.isMesh||!node.geometry||namedOnly&&!node.name.startsWith('Desk_top_with_rounded_return'))return;const candidate=meshTop(node);if(candidate)candidates.push(candidate);});if(!candidates.length)return null;candidates.sort((a,b)=>ringArea(b.polygon)-ringArea(a.polygon));if(!namedOnly&&candidates.length>1&&ringArea(candidates[1].polygon)>ringArea(candidates[0].polygon)*.35)return null;return candidates[0];}
function meshTop(mesh){if(!mesh?.geometry)return null;const up=new THREE.Vector3(0,1,0).transformDirection(mesh.matrixWorld);if(up.y<.9)return null;const topology=extractTopTopology(mesh.geometry);if(!topology.rings.length)return null;const world=worldRings(mesh,topology),rings=world.rings,polygon=rings.slice().sort((a,b)=>ringArea(b)-ringArea(a))[0];if(!polygon?.length||ringArea(polygon)<=WELD_EPS)return null;const box=new THREE.Box3().setFromObject(mesh,true);if(!finiteBox(box))return null;const levelTolerance=Math.max(.001,(box.max.y-box.min.y)*.001);if(world.topY-world.minY>levelTolerance||Math.abs(world.topY-box.max.y)>levelTolerance)return null;return {min:box.min.toArray(),max:box.max.toArray(),polygon,rings,topY:world.topY,mesh};}
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
 if(table){table.root.updateWorldMatrix(true,true);const named=findTopMesh(table.root,true),top=named||findTopMesh(table.root,false);if(top)return {kind:'desktop',label:table.name||'桌面',min:top.min,max:top.max,estimated:table.calibrated!==true,polygon:top.polygon,rings:top.rings,shapeSource:named?'named-top-mesh':'inferred-top-mesh'};const position=table.root.getWorldPosition(new THREE.Vector3()),dimensions=table.surfaceFootprintCm,valid=Array.isArray(dimensions)&&dimensions.length===2&&dimensions.every(n=>Number.isFinite(n)&&n>0),[width,depth]=valid?dimensions:[140,75],height=Number.isFinite(surfaceY)?surfaceY:0,min=[position.x-width/2,height,position.z-depth/2],max=[position.x+width/2,height,position.z+depth/2],polygon=rectangle(min,max);return {kind:'desktop',label:table.name||'桌面',min,max,estimated:true,polygon,shapeSource:'estimated-footprint'};}
 const min=[-70,0,-37.5],max=[70,0,37.5],polygon=rectangle(min,max);return {kind:'reference',label:'参考桌面 · 140 × 75 cm',min,max,estimated:true,polygon,shapeSource:'reference-footprint'};
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
function onSegment(a,b,p){return Math.abs(cross(a,b,p))<=EPS&&p[0]>=Math.min(a[0],b[0])-EPS&&p[0]<=Math.max(a[0],b[0])+EPS&&p[1]>=Math.min(a[1],b[1])-EPS&&p[1]<=Math.max(a[1],b[1])+EPS;}
function pointInRings(point,rings){let inside=false;for(const ring of rings){for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if(onSegment(a,b,point))continue;const crosses=(a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0];if(crosses)inside=!inside;}}return inside||rings.some(ring=>ring.some((a,i)=>onSegment(a,ring[(i+1)%ring.length],point)));}
function strictPointInRing(point,ring){let inside=false;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if(onSegment(a,b,point))return false;const crosses=(a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0];if(crosses)inside=!inside;}return inside;}
function pointInPolygon(point,polygon){return pointInRings(point,[polygon]);}
function ringDepth(ring,rings){const point=ring[0];let depth=0;for(const other of rings)if(other!==ring&&strictPointInRing(point,other))depth++;return depth;}
function segmentParameters(a,b,c,d){const r=[b[0]-a[0],b[1]-a[1]],s=[d[0]-c[0],d[1]-c[1]],den=r[0]*s[1]-r[1]*s[0],out=[];if(Math.abs(den)>EPS){const t=((c[0]-a[0])*s[1]-(c[1]-a[1])*s[0])/den,u=((c[0]-a[0])*r[1]-(c[1]-a[1])*r[0])/den;if(t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS)out.push(Math.max(0,Math.min(1,t)));return out;}if(Math.abs((c[0]-a[0])*r[1]-(c[1]-a[1])*r[0])>EPS)return out;const length=r[0]*r[0]+r[1]*r[1];if(length<=EPS)return onSegment(c,d,a)?[0]:out;for(const p of [c,d]){const t=((p[0]-a[0])*r[0]+(p[1]-a[1])*r[1])/length;if(t>=-EPS&&t<=1+EPS)out.push(Math.max(0,Math.min(1,t)));}return out;}
function polygonWithin(polygon,support){const rings=support.rings?.length?support.rings:[support.polygon];if(!rings?.length||polygon.length<3)return false;for(const point of polygon)if(!pointInRings(point,rings))return false;for(const ring of rings)if(ringDepth(ring,rings)%2===1&&ring.every(point=>pointInPolygon(point,polygon)))return false;for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],parameters=[0,1];for(const ring of rings)for(let j=0;j<ring.length;j++)parameters.push(...segmentParameters(a,b,ring[j],ring[(j+1)%ring.length]));parameters.sort((x,y)=>x-y);const unique=parameters.filter((value,index)=>!index||value-parameters[index-1]>EPS);for(let j=0;j<unique.length-1;j++){const t=(unique[j]+unique[j+1])/2,mid=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];if(!pointInRings(mid,rings))return false;}}return true;}
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
  const inside=drawer||polygonWithin(item.polygon,support),boundaryOk=inside&&margin>=-EPS;
  boundary={...status(boundaryOk?'ok':'warning',boundaryOk?`${drawer?'抽屉内腔':'桌面'}范围内${support.estimated?'（估算）':''}`:`超出${drawer?'抽屉内腔':'桌面'}边界`),marginCm:Math.abs(margin)<EPS?0:margin};
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
