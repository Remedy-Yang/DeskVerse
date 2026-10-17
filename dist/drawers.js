import * as THREE from 'three';

const named=(root,prefix)=>{let found=null;root.traverse(node=>{if(node.isMesh&&node.name.startsWith(prefix))found=node;});return found;};
const boxOf=root=>{root.updateWorldMatrix(true,true);return new THREE.Box3().setFromObject(root,true);};
const mapRange=(value,a,b,c,d)=>c+(value-a)*(d-c)/(b-a);
function fitPanelAxis(mesh,axis,min,max){
 const before=boxOf(mesh),geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),position=geometry.attributes.position,index=['x','y','z'].indexOf(axis);
 for(let i=0;i<position.count;i++)position.setComponent(i,index,mapRange(position.getComponent(i,index),before.min[axis],before.max[axis],min,max));
 geometry.applyMatrix4(mesh.matrixWorld.clone().invert());geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.computeVertexNormals();mesh.geometry=geometry;
}

// 新模型增加床架、椅子和独立部件；通过桌板锚点维持原尺寸表，不把桌板高度误作整柜高度。
export function prepareDeskModel(model){
 const desktop=named(model,'Desk_top_with_rounded_return');
 if(!desktop)return model;
 model.updateMatrixWorld(true);const whole=boxOf(model),desk=boxOf(desktop),floor=whole.min.y;
 const group=new THREE.Group();group.name='calibrated-desk';
 const mapY=value=>value<=desk.max.y?mapRange(value,floor,desk.max.y,0,76):mapRange(value,desk.max.y,whole.max.y,76,180);
 const mapZ=value=>value<=desk.max.z?mapRange(value,desk.min.z,desk.max.z,-27.5,27.5):mapRange(value,desk.max.z,whole.max.z,27.5,85+(whole.min.z-desk.min.z)*55/(desk.max.z-desk.min.z)-27.5);
 model.traverse(node=>{
  if(!node.isMesh)return;
  const mesh=new THREE.Mesh(node.geometry.clone().applyMatrix4(node.matrixWorld),node.material);mesh.name=node.name;mesh.userData.noCollision=/^(Hinge_|Drawer_runner)/.test(mesh.name);
  const position=mesh.geometry.attributes.position;
  for(let index=0;index<position.count;index++)position.setXYZ(index,mapRange(position.getX(index),desk.min.x,desk.max.x,-68.5,68.5),mapY(position.getY(index)),mapZ(position.getZ(index)));
  position.needsUpdate=true;mesh.geometry.deleteAttribute('tangent');mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();group.add(mesh);
 });
 return group;
}

export function createDrawerSystem(tableRoot){
 const floor=named(tableRoot,'Drawer_bottom'),front=named(tableRoot,'Drawer_front'),rear=named(tableRoot,'Drawer_rear');
 const sides=[];tableRoot.traverse(node=>{if(node.isMesh&&node.name.startsWith('Drawer_side'))sides.push(node);});
 if(!floor||!front||!rear||sides.length!==2)return null;
 const parent=floor.parent,parts=[floor,front,rear,...sides],group=new THREE.Group();group.name='desk-storage-drawer';parent.add(group);
 for(const part of parts){group.attach(part);part.userData.drawerId='left-drawer';}
 const partition=named(tableRoot,'Cupboard_and_desk_partition');
 const outer=named(tableRoot,'Cupboard_outer_side');if(outer&&partition)fitPanelAxis(front,'x',boxOf(outer).max.x+.2,boxOf(partition).min.x-.2);
 const separator=named(tableRoot,'Cupboard_drawer_separator');if(separator&&boxOf(front).max.y>boxOf(separator).min.y-.2)fitPanelAxis(front,'y',boxOf(front).min.y,boxOf(separator).min.y-.2);
 const initialFront=boxOf(front),frontZ=partition?boxOf(partition).max.z:boxOf(floor).max.z;
 const closedShift=frontZ-initialFront.max.z-.6;
 // 原始资产中抽屉已拉出，先沿轨道收回；行程不超过抽屉深度的 80%。
 const scale=tableRoot.getWorldScale(new THREE.Vector3()).z;
 group.position.z+=closedShift/scale;tableRoot.updateMatrixWorld(true);
 const bottom=boxOf(floor),back=boxOf(rear),sideBoxes=sides.map(boxOf),panel=boxOf(front);
 const inner=new THREE.Box3(new THREE.Vector3(Math.min(...sideBoxes.map(box=>box.max.x)),bottom.max.y+.1,back.max.z+.3),new THREE.Vector3(Math.max(...sideBoxes.map(box=>box.min.x)),Math.min(...sideBoxes.map(box=>box.max.y))-.3,panel.min.z-.3));
 inner.min.x+=.3;inner.max.x-=.3;
 if(inner.isEmpty())throw new Error('抽屉内部尺寸无效，请检查模型部件。');
 const travel=(bottom.max.z-bottom.min.z)*.8;
 const closedPosition=group.position.z;let opening=0;
 return {id:'left-drawer',name:'左侧抽屉',group,parts,travel,direction:new THREE.Vector3(0,0,1),estimated:false,
  get opening(){return opening;},
  setOpening(value){if(!Number.isFinite(value))throw new Error('抽屉开合值必须是有效数字。');opening=THREE.MathUtils.clamp(value,0,1);group.position.z=closedPosition+travel*opening/scale;tableRoot.updateMatrixWorld(true);},
  bounds(){return inner.clone().translate(new THREE.Vector3(0,0,travel*opening));},
  state(){const box=this.bounds();return {id:this.id,name:this.name,opening,travelCm:travel,interiorCm:{min:box.min.toArray(),max:box.max.toArray()},dimensionsCm:box.getSize(new THREE.Vector3()).toArray()};}
 };
}

export function createDrawerSystems(tableRoot){
 const left=createDrawerSystem(tableRoot),systems=left?[left]:[];
 for(let index=1;index<=3;index++){
  const front=named(tableRoot,`Pedestal_drawer_${index}__`),pull=named(tableRoot,`Pedestal_finger_pull_${index}__`);
  const outer=named(tableRoot,'Right_desk_pedestal_outer_side'),back=named(tableRoot,'Right_pedestal_back'),face=named(tableRoot,'Right_desk_pedestal_front');
  if(!front||!outer||!back||!face)continue;
  let panel=boxOf(front);const outerBox=boxOf(outer),backBox=boxOf(back),faceBox=boxOf(face),rail=named(tableRoot,'Desk_rear_support_rail');
  const rearClearance=Math.max(backBox.max.z,rail?boxOf(rail).max.z:backBox.max.z)+.4;
  if(panel.min.z<rearClearance){
   fitPanelAxis(front,'z',rearClearance,panel.max.z);panel=boxOf(front);
  }
  const id=`right-drawer-${index}`,group=new THREE.Group();group.name=id;tableRoot.attach(group);
  const parts=[front,...(pull?[pull]:[])];for(const part of parts)group.attach(part);
  const min=new THREE.Vector3(panel.max.x+.4,panel.min.y+.4,rearClearance),max=new THREE.Vector3(outerBox.min.x-.5,panel.max.y-.4,faceBox.min.z-.5);
  // These trays are reconstructed inside the existing cabinet, not merchant
  // measurements. Their explicit walls also participate in collisions.
  const material=new THREE.MeshStandardMaterial({color:'#b6b8ab',roughness:.85}),thickness=.6;
  const addPanel=(name,lo,hi)=>{const size=hi.clone().sub(lo),mesh=new THREE.Mesh(new THREE.BoxGeometry(...size.toArray()),material);mesh.name=id+'-'+name;mesh.position.copy(lo).add(hi).multiplyScalar(.5);group.attach(mesh);parts.push(mesh);return mesh;};
  const floor=addPanel('bottom',min,new THREE.Vector3(max.x,min.y+thickness,max.z));floor.userData.storageFloor=true;
  addPanel('rear',new THREE.Vector3(max.x-thickness,min.y,min.z),max);
  addPanel('side-a',min,new THREE.Vector3(max.x,max.y,min.z+thickness));
  addPanel('side-b',new THREE.Vector3(min.x,min.y,max.z-thickness),max);
  const inner=new THREE.Box3(new THREE.Vector3(min.x+.2,min.y+thickness+.1,min.z+thickness+.15),new THREE.Vector3(max.x-thickness-.2,max.y-.2,max.z-thickness-.15));
  const direction=new THREE.Vector3(-1,0,0),travel=(max.x-min.x)*.78,closed=group.position.clone();let opening=0;
  const localDelta=tableRoot.worldToLocal(direction.clone().multiplyScalar(travel)).sub(tableRoot.worldToLocal(new THREE.Vector3()));
  for(const part of parts)part.userData.drawerId=id;
  systems.push({id,name:`右侧${['下','中','上'][index-1]}层抽屉`,group,parts,travel,direction,estimated:true,
   get opening(){return opening;},
   setOpening(value){if(!Number.isFinite(value))throw new Error('抽屉开合值必须是有效数字。');opening=THREE.MathUtils.clamp(value,0,1);group.position.copy(closed).addScaledVector(localDelta,opening);tableRoot.updateMatrixWorld(true);},
   bounds(){return inner.clone().translate(direction.clone().multiplyScalar(travel*opening));},
   state(){const box=this.bounds();return {id,name:this.name,opening,travelCm:travel,direction:direction.toArray(),estimated:true,interiorCm:{min:box.min.toArray(),max:box.max.toArray()},dimensionsCm:box.getSize(new THREE.Vector3()).toArray()};}
  });
 }
 return systems;
}

export function createDoorSystem(tableRoot){
 const part=named(tableRoot,'Open_cupboard_door');if(!part)return null;
 const box=boxOf(part),pivot=new THREE.Vector3(box.max.x,box.min.y,box.min.z),group=new THREE.Group();group.name='cupboard-door-hinge';group.position.copy(pivot);tableRoot.attach(group);group.attach(part);part.userData.doorId='cupboard-door';
 const rotation=group.rotation.y,span=box.getSize(new THREE.Vector3()),approxAngle=Math.atan2(span.z,-span.x),maxAngle=THREE.MathUtils.degToRad(130);
 // Bake the authored diagonal door into a hinge-aligned local frame. Its OBB
 // must be the actual thin panel, not the large empty rectangle around it.
 group.updateWorldMatrix(true,true);const worldGeometry=part.geometry.clone().applyMatrix4(part.matrixWorld);
 const source=worldGeometry.attributes.position;let angle=approxAngle,bestDepth=Infinity;
 for(let step=-200;step<=200;step++){
  const candidate=approxAngle+THREE.MathUtils.degToRad(step*.05),sin=Math.sin(candidate),cos=Math.cos(candidate);let min=Infinity,max=-Infinity;
  for(let i=0;i<source.count;i++){const z=-sin*source.getX(i)+cos*source.getZ(i);min=Math.min(min,z);max=Math.max(max,z);}
  if(max-min<bestDepth){bestDepth=max-min;angle=candidate;}
 }
 let opening=angle/maxAngle;
 worldGeometry.translate(-pivot.x,-pivot.y,-pivot.z).applyMatrix4(new THREE.Matrix4().makeRotationY(angle));
 // The source door is narrower than the cabinet opening. Extend only its
 // local horizontal span so the closed panel reaches the partition without
 // changing the calibrated desk height or the hinge position.
 const outer= named(tableRoot,'Cupboard_outer_side'),partition=named(tableRoot,'Cupboard_and_desk_partition');
 const targetWidth=outer&&partition?Math.abs(boxOf(partition).min.x-boxOf(outer).max.x)+1:54;
 worldGeometry.computeBoundingBox();
 const currentWidth=worldGeometry.boundingBox.max.x-worldGeometry.boundingBox.min.x;
 if(currentWidth>1&&targetWidth>currentWidth){
  const positions=worldGeometry.attributes.position,minX=worldGeometry.boundingBox.min.x;
  for(let i=0;i<positions.count;i++)positions.setX(i,minX+(positions.getX(i)-minX)*targetWidth/currentWidth);
  positions.needsUpdate=true;
 }
 const beam=named(tableRoot,'Loft_front_beam'),roof=beam?boxOf(beam).min.y-.3:box.max.y;
 // The supplied door clips the bed beam at its hinge. Trim that hidden top
 // overlap so a real hinge can turn, leaving overall desk calibration intact.
 if(roof<box.max.y){const positions=worldGeometry.attributes.position;for(let i=0;i<positions.count;i++)positions.setY(i,positions.getY(i)*(roof-pivot.y)/(box.max.y-pivot.y));worldGeometry.computeVertexNormals();}
 worldGeometry.computeBoundingBox();worldGeometry.computeBoundingSphere();
 part.geometry=worldGeometry;part.position.set(0,0,0);part.rotation.set(0,-angle,0);part.scale.set(1,1,1);group.updateWorldMatrix(true,true);
 const system={id:'cupboard-door',group,parts:[part],get opening(){return opening;},setOpening(value){if(!Number.isFinite(value))throw new Error('柜门角度无效。');opening=THREE.MathUtils.clamp(value,0,1);group.rotation.y=rotation+angle-opening*maxAngle;tableRoot.updateMatrixWorld(true);},state(){return {id:this.id,opening,angleDegrees:opening*THREE.MathUtils.radToDeg(maxAngle)};}};
 system.setOpening(1);return system;
}

export function extractChair(tableRoot){
 const parts=[];tableRoot.updateWorldMatrix(true,true);tableRoot.traverse(node=>{if(node.isMesh&&node.name.startsWith('Chair_'))parts.push(node);});if(!parts.length)return null;
 const group=new THREE.Group();for(const part of parts)group.attach(part);return group;
}

export function findStoragePosition(itemBox,interior,occupied=[]){
 if(itemBox.isEmpty()||interior.isEmpty())return null;
 const size=itemBox.getSize(new THREE.Vector3()),space=interior.getSize(new THREE.Vector3());
 if(size.x>space.x+1e-5||size.y>space.y+1e-5||size.z>space.z+1e-5)return null;
 const center=interior.getCenter(new THREE.Vector3());
 const xs=[center.x,interior.min.x+size.x/2,interior.max.x-size.x/2,...occupied.flatMap(box=>[box.max.x+size.x/2+.2,box.min.x-size.x/2-.2])];
 const zs=[center.z,interior.min.z+size.z/2,interior.max.z-size.z/2,...occupied.flatMap(box=>[box.max.z+size.z/2+.2,box.min.z-size.z/2-.2])];
 for(const z of zs)for(const x of xs){
  const candidate=new THREE.Box3(new THREE.Vector3(x-size.x/2,interior.min.y,z-size.z/2),new THREE.Vector3(x+size.x/2,interior.min.y+size.y,z+size.z/2));
  if(!interior.clone().expandByScalar(1e-5).containsBox(candidate))continue;
  if(occupied.some(box=>candidate.intersectsBox(box)))continue;
  return new THREE.Vector3(x,interior.min.y,z);
 }
 return null;
}
