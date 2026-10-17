import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {AXES,MAX_FILE_SIZE,inspectGLB,normalizeModel,boundsOf,placeOnSurface,getDimensions,setDimension,estimateSeatHeight,recordState,History} from './core.js';
const $=id=>document.getElementById(id);
const iconPaths={
 cube:'<path d="M12 3 3 8v9l9 5 9-5V8zM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5v5"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
 download:'<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM9 11l2 2 4-4"/>',
 table:'<path d="M3 6h18v5H3zM5 11v9M19 11v9"/>',
 refresh:'<path d="M20 7v5h-5M4 17v-5h5M19 9a7 7 0 0 0-12-4L4 8m1 7a7 7 0 0 0 12 4l3-3"/>',
 home:'<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
 top:'<path d="M5 7h14v14H5zM12 2v8m-3-3 3 3 3-3"/>',
 focus:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/><circle cx="12" cy="12" r="3"/>',
 grid:'<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 9h16M4 15h16M9 4v16M15 4v16"/>',
 hand:'<path d="M8 13V6a2 2 0 0 1 4 0v6-7a2 2 0 0 1 4 0v7-4a2 2 0 0 1 4 0v7c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 2"/>',
 move:'<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4"/>',
 rotate:'<path d="M20 4v6h-6M20 10a8 8 0 1 0 0 5"/>',
 scale:'<rect x="3" y="12" width="9" height="9" rx="1"/><path d="M14 3h7v7M21 3l-9 9M4 8V3h5M16 21h5v-5"/>',
 target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
 eye:'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
 chair:'<path d="M5 4v8h14V4M7 12v8m10-8v8M4 20h16M4 12h16"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 undo:'<path d="M8 5 3 10l5 5M3 10h11a6 6 0 0 1 0 12"/>',
 redo:'<path d="m16 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12"/>',
 sliders:'<path d="M4 5h7m5 0h4M4 12h2m5 0h9M4 19h10m5 0h1"/><circle cx="13" cy="5" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="19" r="2"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
 lamp:'<path d="m12 3-8 9h16zM12 12v8m-5 1h10"/>',
 monitor:'<rect x="2" y="3" width="20" height="14" rx="1"/><path d="M12 17v4M7 21h10"/>'
};
function icon(name){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(iconPaths[name]||iconPaths.cube)+'</svg>';}
for(const el of document.querySelectorAll('[data-icon]'))el.innerHTML=icon(el.dataset.icon);
let toastTimer;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function fatal(message){$('fatal').hidden=false;$('fatal-message').textContent=message;}
$('retry').onclick=()=>location.reload();
try { await start(); } catch(error){console.error(error);fatal('请使用支持 WebGL 2 的 Chrome / Edge 浏览器，并启用硬件加速。'+(error.message?' '+error.message:''));}
async function start(){
const viewport=$('viewport');
const scene=new THREE.Scene();scene.background=new THREE.Color('#f1f3f6');
const camera=new THREE.PerspectiveCamera(36,1,.1,15000);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
viewport.prepend(renderer.domElement);
const canvas=renderer.domElement;
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fatal('显存不足或图形上下文丢失，请刷新页面并尝试较小的模型。');});
const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();const env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.42;room.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight('#ffffff','#ccd1d9',2.4));
const sun=new THREE.DirectionalLight('#fff8ef',3.3);sun.position.set(-100,180,100);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-170,right:170,top:170,bottom:-170,near:.5,far:600});sun.shadow.normalBias=.12;sun.shadow.bias=-.00015;scene.add(sun);
const fill=new THREE.DirectionalLight('#e3e9ff',1.4);fill.position.set(100,80,-100);scene.add(fill);
const reference=new THREE.Group();
const slab=new THREE.Mesh(new THREE.BoxGeometry(140,2.4,75),new THREE.MeshStandardMaterial({color:'#e4d9c3',roughness:.85}));slab.position.y=-1.2;slab.receiveShadow=true;slab.castShadow=true;reference.add(slab);
for(const x of [-63,63])for(const z of [-30,30]){const leg=new THREE.Mesh(new THREE.BoxGeometry(2.4,36,2.4),new THREE.MeshStandardMaterial({color:'#b4bdc2',metalness:.35,roughness:.65}));leg.position.set(x,-20.4,z);leg.castShadow=true;reference.add(leg);}
scene.add(reference);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(2200,2200),new THREE.MeshStandardMaterial({color:'#eef0f4',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-38.9;floor.receiveShadow=true;scene.add(floor);
const grid=new THREE.GridHelper(500,50,'#cfd6e0','#e0e5ec');grid.position.y=-38.8;grid.material.transparent=true;grid.material.opacity=.45;scene.add(grid);
const origin=new THREE.Group();const crossMaterial=new THREE.LineBasicMaterial({color:'#acb6c6',transparent:true,opacity:.65});for(const pts of [[[-2,0,0],[2,0,0]],[[0,0,-2],[0,0,2]]])origin.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p=>new THREE.Vector3(...p))),crossMaterial));origin.position.y=.05;scene.add(origin);
const controls=new OrbitControls(camera,canvas);
controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.ROTATE,RIGHT:THREE.MOUSE.PAN};
// Suppress browser middle-click autoscroll without stopping OrbitControls events.
canvas.addEventListener('pointerdown',event=>{if(event.button===1)event.preventDefault();},true);
canvas.addEventListener('auxclick',event=>{if(event.button===1)event.preventDefault();});
controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=2;controls.maxDistance=8000;controls.maxPolarAngle=Math.PI-.02;controls.screenSpacePanning=true;
controls.addEventListener('change',()=>syncDistanceControl(camera.position.distanceTo(controls.target)));
const transform=new TransformControls(camera,canvas);transform.setSize(.85);transform.setSpace('world');scene.add(transform.getHelper());
const outline=new THREE.Box3Helper(new THREE.Box3(),new THREE.Color('#93a8e1'));outline.visible=false;outline.material.transparent=true;outline.material.opacity=.7;outline.material.depthTest=false;outline.renderOrder=10;scene.add(outline);
const endpointMarker=new THREE.Mesh(new THREE.SphereGeometry(1.35,16,10),new THREE.MeshBasicMaterial({color:'#647bd2',transparent:true,opacity:.9,depthTest:false}));endpointMarker.visible=false;endpointMarker.renderOrder=20;scene.add(endpointMarker);
const draco=new DRACOLoader();draco.setDecoderPath('./vendor/three/addons/libs/draco/gltf/');draco.setWorkerLimit(2);
const ktx2=new KTX2Loader().setTranscoderPath('./vendor/three/addons/libs/basis/').detectSupport(renderer);
const loader=new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
const records=new Map();let activeIds=[],selectedId=null,mode='translate',busy=false,snap=false,restoring=false,totalBytes=0,viewDistance=300,seatDistance=45,chairHeight=44.5,chairHeightRatio=.25,personHeight=170,seatViewActive=false,endpointHit=null;
const history=new History();const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();let activeDrag=null,seatPan=null,seatPanOffsetX=0,pointerDown=null,gizmoGesture=false;
const item=()=>records.get(selectedId);
const table=()=>activeIds.map(id=>records.get(id)).find(r=>r.role==='table');
const topY=()=>table()?boundsOf(table().root).max.y:0;
function resize(){const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(viewport);resize();
function syncDistanceControl(distance){viewDistance=THREE.MathUtils.clamp(Math.round(distance/10)*10,50,360);$('view-distance-range').value=String(viewDistance);$('view-distance-value').textContent=viewDistance+' cm';for(const button of document.querySelectorAll('[data-distance]'))button.classList.toggle('active',Math.abs(Number(button.dataset.distance)-viewDistance)<5);}
function setSeatViewActive(value){seatViewActive=value;$('seat-view').classList.toggle('active',value);controls.enableRotate=!value;controls.enablePan=!value;controls.enableZoom=!value;if(value){transform.detach();canvas.style.cursor='grab';$('scene-hint').textContent='坐姿视角：左键拖动左右移动，使用右侧滑杆调整前后距离';}else{attach();canvas.style.cursor=mode==='drag'?'grab':mode==='place'?'crosshair':'default';$('scene-hint').textContent=mode==='drag'?'直接拖动沿 XZ 平面移动；中键拖动环绕查看':mode==='translate'?'拖动 X / Y / Z 箭头自由移动；中键拖动环绕查看':mode==='place'?'移动鼠标查看坐标，左键单击放置；中键环绕，右键平移':mode==='rotate'?'拖动彩色圆环旋转物品；中键拖动环绕查看':'拖动手柄缩放；中键拖动环绕查看';}}
function experienceTarget(){return new THREE.Vector3(0,topY()+12,0);}
function syncSeatHeight(){const estimate=estimateSeatHeight(Number($('person-height').value)||170,chairHeightRatio);personHeight=estimate.statureCm;chairHeight=estimate.cm;chairHeightRatio=estimate.ratio;$('person-height').value=String(personHeight);const range=$('chair-height-range');range.min=estimate.minCm.toFixed(1);range.max=estimate.maxCm.toFixed(1);range.value=chairHeight.toFixed(1);$('chair-height-value').textContent=chairHeight.toFixed(1)+' cm';$('chair-height-range-note').textContent='调整范围：'+estimate.minCm.toFixed(1)+'–'+estimate.maxCm.toFixed(1)+' cm';}
function setViewDistance(distance){const next=THREE.MathUtils.clamp(Number(distance)||300,50,360);if(seatViewActive){const t=table();const box=t?boundsOf(t.root):new THREE.Box3(new THREE.Vector3(-70,0,-37.5),new THREE.Vector3(70,0,37.5));const floorY=t?box.min.y:-38.9;const eyeY=floorY+chairHeight+personHeight*.48;const targetY=box.getCenter(new THREE.Vector3()).y;const vertical=Math.abs(eyeY-targetY);const horizontal=Math.sqrt(Math.max(1,next*next-vertical*vertical));seatDistance=THREE.MathUtils.clamp(horizontal-box.getSize(new THREE.Vector3()).z/2,25,160);setSeatView(seatDistance);return;}let dir=camera.position.clone().sub(controls.target);if(dir.lengthSq()<1e-6)dir.set(1,.7,1).normalize();dir.normalize();controls.target.copy(experienceTarget());camera.position.copy(controls.target).addScaledVector(dir,next);viewDistance=next;$('view-distance-range').value=String(next);$('view-distance-value').textContent=next+' cm';for(const button of document.querySelectorAll('[data-distance]'))button.classList.toggle('active',Number(button.dataset.distance)===next);setSeatViewActive(false);controls.update();}
function setSeatView(distance=seatDistance){
 seatDistance=THREE.MathUtils.clamp(Number(distance)||45,25,160);
 syncSeatHeight();
 $('seat-distance-range').value=String(seatDistance);$('seat-distance-value').textContent=seatDistance+' cm';
 const t=table();
 const box=t?boundsOf(t.root):new THREE.Box3(new THREE.Vector3(-70,0,-37.5),new THREE.Vector3(70,0,37.5));
 const floorY=t?box.min.y:-38.9;
 const eyeFromFloor=chairHeight+personHeight*.48;
 const eyeY=floorY+eyeFromFloor;
 $('seat-eye-height').textContent=Math.round(eyeFromFloor)+' cm';
 const target=box.getCenter(new THREE.Vector3());
 const frontZ=box.max.z+seatDistance;
 controls.enableDamping=false;
 controls.update();
 target.x+=seatPanOffsetX;
 camera.position.set(target.x,eyeY,frontZ);
 controls.target.copy(target);
 camera.up.set(0,1,0);
 camera.near=.1;camera.far=15000;camera.updateProjectionMatrix();
 controls.update();
 setSeatViewActive(true);
 controls.enableDamping=true;
 syncDistanceControl(camera.position.distanceTo(controls.target));
}
function home(){setSeatViewActive(false);camera.position.set(174,145,196);controls.target.set(0,2,0);camera.up.set(0,1,0);controls.update();syncDistanceControl(camera.position.distanceTo(controls.target));}
function focus(root){setSeatViewActive(false);const box=root?boundsOf(root):new THREE.Box3().setFromObject(reference);if(box.isEmpty())return;const size=box.getSize(new THREE.Vector3());const c=box.getCenter(new THREE.Vector3());const radius=Math.max(size.length()/2,1);const fov=Math.min(THREE.MathUtils.degToRad(camera.fov),2*Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));const distance=radius/Math.sin(fov/2)*1.15;let dir=camera.position.clone().sub(controls.target).normalize();if(!dir.lengthSq())dir.set(1,1,1).normalize();camera.position.copy(c).addScaledVector(dir,distance);controls.target.copy(c);camera.near=Math.max(.01,distance/10000);camera.far=Math.max(15000,distance*8);camera.updateProjectionMatrix();controls.maxDistance=Math.max(8000,distance*4);controls.update();syncDistanceControl(distance);}
syncSeatHeight();home();
function surfaceUpdate(){const t=table();if(t?.locked){t.root.rotation.set(0,0,0);t.root.position.set(0,-getDimensions(t).y,0);t.root.updateMatrixWorld(true);}reference.visible=!t;const height=topY();origin.position.y=height+.05;let floorY=-38.9;if(t){const b=boundsOf(t.root);floorY=b.min.y-.4;$('surface-name').textContent=t.name;$('surface-size').textContent=b.getSize(new THREE.Vector3()).x.toFixed(1)+' × '+b.getSize(new THREE.Vector3()).z.toFixed(1)+' cm · 固定桌面';}else{$('surface-name').textContent='参考桌面';$('surface-size').textContent='140 × 75 cm · 辅助平面';}floor.position.y=floorY;grid.position.y=floorY+.1;for(const id of activeIds){const r=records.get(id);if(r.role!=='table'&&r.grounded){r.surfaceY??=height;placeOnSurface(r.root,r.surfaceY);}}}
function format(n){return Math.abs(n)<.005?'0':Number(n.toFixed(2)).toString();}
function formatSize(values){return values.map(n=>Number(n.toFixed(1))).join(' × ')+' cm';}
function setInput(id,n){$(id).value=format(n);}
function inspector(){const r=item();$('inspector').hidden=!r;$('empty-inspector').hidden=!!r;if(!r){outline.visible=false;for(const id of ['px','py','pz','rx','ry','rz','dx','dy','dz','uniform','grounded','snap','confirm-size','turn-left','turn-right','reset-rotation','center-object','delete-object'])$(id).disabled=false;return;}const locked=Boolean(r.locked);$('selected-name').textContent=r.name;$('selected-meta').textContent=(locked?'固定资产':r.demo?'内置示例':'导入 GLB')+' · '+(r.bytes/1024/1024).toFixed(2)+' MB';const currentDimensions=getDimensions(r).toArray();for(const axis of AXES){setInput('p'+axis,r.root.position[axis]);setInput('r'+axis,THREE.MathUtils.radToDeg(r.root.rotation[axis]));setInput('d'+axis,currentDimensions[AXES.indexOf(axis)]);}$('initial-size').textContent=formatSize(r.initialDimensionsCm||currentDimensions);$('current-size').textContent=formatSize(currentDimensions);$('grounded').checked=r.grounded;$('size-note').textContent=locked?'固定桌面：位置、旋转、尺寸和删除操作均已锁定。':r.calibrated?'当前尺寸已由你确认。旋转不会改变这里的模型局部尺寸。':r.demo?'内置示例尺寸，仅供操作演示。真实资产请按实物尺寸校准。':'已自动缩放以便观察；请输入实物尺寸，再确认校准。';$('size-note').classList.toggle('confirmed',r.calibrated);$('confirm-size').textContent=r.calibrated?'尺寸已确认':'将当前尺寸标记为已校准';for(const id of ['px','py','pz','rx','ry','rz','dx','dy','dz','uniform','grounded','snap','confirm-size','turn-left','turn-right','reset-rotation','center-object','delete-object'])$(id).disabled=locked||(id==='grounded'&&r.role==='table');for(const button of document.querySelectorAll('[data-preset-size]')){button.disabled=locked;button.classList.toggle('active',Math.abs(Math.max(...currentDimensions)-Number(button.dataset.presetSize))<.1);}outline.box.copy(boundsOf(r.root));outline.visible=!locked;}
function renderList(){const list=$('object-list');list.replaceChildren();for(const id of activeIds){const r=records.get(id);const button=document.createElement('button');button.className='object-row'+(id===selectedId?' active':'');button.setAttribute('aria-pressed',String(id===selectedId));button.title=r.sourceFile;const glyph=document.createElement('span');glyph.className='object-icon';glyph.innerHTML=icon(r.role==='table'?'table':r.icon||'cube');const info=document.createElement('span');info.className='row-info';const name=document.createElement('strong');name.textContent=r.name;const sub=document.createElement('small');sub.textContent=r.locked?'固定资产 · 已校准':(r.demo?'示例 GLB':'GLB')+' · '+(r.calibrated?'已校准':'待校准');info.append(name,sub);const dot=document.createElement('span');dot.className='row-dot';button.append(glyph,info,dot);button.onclick=()=>select(id);list.append(button);}$('object-count').textContent=String(activeIds.length);$('status-text').textContent=activeIds.length+' 个独立模型 · '+(activeIds.filter(id=>records.get(id).calibrated).length)+' 个已校准';}
function attach(){transform.detach();const r=item();if(!r||r.locked||seatViewActive||mode==='drag'||mode==='place')return;transform.attach(r.root);transform.setMode(mode);transform.setSpace(mode==='scale'?'local':'world');transform.showX=true;transform.showY=true;transform.showZ=true;}
function select(id){selectedId=id&&activeIds.includes(id)?id:null;attach();renderList();inspector();}
function setMode(next){if(seatViewActive)setSeatViewActive(false);mode=next;for(const el of document.querySelectorAll('[data-mode]')){el.classList.toggle('active',el.dataset.mode===mode);el.setAttribute('aria-pressed',String(el.dataset.mode===mode));}attach();if(mode!=='place')hideSurfacePreview();$('scene-hint').textContent=mode==='drag'?'直接拖动沿 XZ 平面移动；中键拖动环绕查看':mode==='translate'?'拖动 X / Y / Z 箭头自由移动；中键拖动环绕查看':mode==='place'?'移动鼠标查看坐标，左键单击放置；中键环绕，右键平移':mode==='rotate'?'拖动彩色圆环旋转物品；中键拖动环绕查看':'拖动手柄缩放；中键拖动环绕查看';canvas.style.cursor=mode==='drag'?'grab':mode==='place'?'crosshair':'default';}
function snapshot(){return {selectedId,items:activeIds.map(id=>{const r=records.get(id);return {id,position:r.root.position.toArray(),rotation:r.root.rotation.toArray(),scale:r.root.scale.toArray(),grounded:r.grounded,surfaceY:r.surfaceY,calibrated:r.calibrated};})};}
function historyButtons(){$('undo').disabled=history.index<=0||busy;$('redo').disabled=history.index>=history.entries.length-1||busy;}
function checkpoint(){if(!restoring)history.push(snapshot());historyButtons();}
function restore(state){if(!state)return;restoring=true;transform.detach();for(const id of activeIds)scene.remove(records.get(id).root);activeIds=state.items.map(s=>s.id);for(const s of state.items){const r=records.get(s.id);r.root.position.fromArray(s.position);r.root.rotation.fromArray(s.rotation);r.root.scale.fromArray(s.scale);r.grounded=s.grounded;r.surfaceY=s.surfaceY;r.calibrated=s.calibrated;scene.add(r.root);}surfaceUpdate();select(state.selectedId);restoring=false;historyButtons();emit();}
function exportState(){return {schemaVersion:1,units:'cm',coordinateSystem:{handedness:'right',up:'Y',horizontal:'X',depth:'Z',rotationUnit:'degrees',rotationOrder:'XYZ',pivot:'bottom-center-before-rotation'},surface:{type:table()?'model-world-aabb-top':'reference-plane',heightCm:topY(),tableId:table()?.id||null,referenceSizeCm:[140,75]},objects:activeIds.map(id=>recordState(records.get(id)))};}
function emit(){window.dispatchEvent(new CustomEvent('deskverse:change',{detail:exportState()}));}
function changed(calibrationInvalid=false){const r=item();if(r){for(const axis of AXES)r.root.scale[axis]=Math.max(.00001,Math.abs(r.root.scale[axis]));if(calibrationInvalid)r.calibrated=false;}surfaceUpdate();inspector();emit();}
function mutate(fn,{invalid=false}={}){if(!item()||busy||item().locked)return;try{fn(item());changed(invalid);renderList();checkpoint();}catch(e){toast(e.message);inspector();}}
transform.addEventListener('dragging-changed',e=>{controls.enabled=!e.value;if(e.value)gizmoGesture=true;else{renderList();checkpoint();}});
transform.addEventListener('mouseDown',()=>{
 const r=item();
 // Vertical and camera-plane translation explicitly opt out of surface snapping.
 if(r&&mode==='translate'&&transform.axis?.includes('Y')){r.grounded=false;inspector();}
});
transform.addEventListener('objectChange',()=>changed(mode==='scale'));
function point(event){const rect=canvas.getBoundingClientRect();pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);}
function hit(event){point(event);const roots=activeIds.filter(id=>records.get(id).role!=='table').map(id=>records.get(id).root);const hits=raycaster.intersectObjects(roots,true);for(const h of hits){let o=h.object;while(o&&!o.userData.recordId)o=o.parent;if(o?.userData.recordId)return records.get(o.userData.recordId);}return null;}
function surfacePoint(event){point(event);const t=table();if(t){const hits=raycaster.intersectObject(t.root,true);let fallback=null;for(const hit of hits){if(!hit.face)continue;const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();const result={point:hit.point.clone(),normal,valid:normal.y>.65};if(result.valid)return result;fallback??=result;}return fallback;}const pointOnPlane=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-topY()),new THREE.Vector3());return pointOnPlane?{point:pointOnPlane,normal:new THREE.Vector3(0,1,0),valid:true}:null;}
function hideSurfacePreview(){endpointHit=null;endpointMarker.visible=false;$('surface-readout').hidden=true;$('surface-readout').classList.remove('invalid');}
function updateSurfacePreview(event){const hit=surfacePoint(event);if(!hit){hideSurfacePreview();return;}const p=hit.point.clone();if(snap){p.x=Math.round(p.x);p.z=Math.round(p.z);}endpointHit={...hit,point:p};endpointMarker.material.color.set(hit.valid?'#647bd2':'#c88478');endpointMarker.position.copy(p).addScaledVector(hit.normal,.8);endpointMarker.visible=true;const readout=$('surface-readout');readout.hidden=false;readout.classList.toggle('invalid',!hit.valid);$('surface-readout-value').textContent='X '+format(p.x)+' · Y '+format(p.y)+' · Z '+format(p.z)+(hit.valid?'':' · 请指向水平表面');const rect=canvas.getBoundingClientRect();readout.style.left=Math.min(Math.max(event.clientX-rect.left+14,12),rect.width-readout.offsetWidth-12)+'px';readout.style.top=Math.min(Math.max(event.clientY-rect.top+14,52),rect.height-readout.offsetHeight-12)+'px';}
function placeSelected(event){const r=item();if(!r||r.role==='table'){toast('请先选中一个可摆放的物品。');return;}const hit=surfacePoint(event);if(!hit||!hit.valid){toast('请点击桌面或架子的水平表面。');return;}const p=hit.point.clone();if(snap){p.x=Math.round(p.x);p.z=Math.round(p.z);}r.root.position.x=p.x;r.root.position.z=p.z;r.surfaceY=p.y;placeOnSurface(r.root,r.surfaceY);r.grounded=true;changed();renderList();checkpoint();toast('已将 '+r.name+' 放到坐标 X '+format(p.x)+' / Z '+format(p.z)+'。');setMode('translate');}
canvas.addEventListener('pointerdown',event=>{if(busy)return;if(seatViewActive&&event.button===0){event.preventDefault();event.stopImmediatePropagation();seatPan={pointerId:event.pointerId,lastX:event.clientX};controls.enabled=false;canvas.setPointerCapture(event.pointerId);canvas.style.cursor='grabbing';return;}pointerDown={x:event.clientX,y:event.clientY};gizmoGesture=false;if(mode==='place'&&event.button===0){event.preventDefault();event.stopImmediatePropagation();updateSurfacePreview(event);return;}if(event.button!==0||mode!=='drag')return;const r=hit(event);if(!r)return;event.preventDefault();event.stopImmediatePropagation();select(r.id);point(event);const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-r.root.position.y);const p=raycaster.ray.intersectPlane(plane,new THREE.Vector3());if(!p)return;activeDrag={id:r.id,pointerId:event.pointerId,plane,offset:r.root.position.clone().sub(p)};controls.enabled=false;canvas.setPointerCapture(event.pointerId);canvas.style.cursor='grabbing';},true);
canvas.addEventListener('pointermove',event=>{if(!activeDrag||event.pointerId!==activeDrag.pointerId)return;event.preventDefault();event.stopImmediatePropagation();point(event);const p=raycaster.ray.intersectPlane(activeDrag.plane,new THREE.Vector3());if(!p)return;const r=records.get(activeDrag.id);r.root.position.x=p.x+activeDrag.offset.x;r.root.position.z=p.z+activeDrag.offset.z;if(snap){r.root.position.x=Math.round(r.root.position.x);r.root.position.z=Math.round(r.root.position.z);}changed();},true);
canvas.addEventListener('pointermove',event=>{if(!seatPan||event.pointerId!==seatPan.pointerId)return;event.preventDefault();event.stopImmediatePropagation();const deltaX=event.clientX-seatPan.lastX;seatPan.lastX=event.clientX;const distance=camera.position.distanceTo(controls.target);const worldPerPixel=2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/canvas.clientHeight;const shift=-deltaX*worldPerPixel;seatPanOffsetX+=shift;camera.position.x+=shift;controls.target.x+=shift;controls.update();},true);
canvas.addEventListener('pointermove',event=>{if(mode==='place'&&!activeDrag&&!busy)updateSurfacePreview(event);});
canvas.addEventListener('pointerleave',()=>{if(mode==='place')hideSurfacePreview();});
function endDrag(event){if(activeDrag&&event.pointerId===activeDrag.pointerId){event.stopImmediatePropagation();if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);activeDrag=null;controls.enabled=true;canvas.style.cursor='grab';checkpoint();return true;}return false;}
function endSeatPan(event){if(seatPan&&event.pointerId===seatPan.pointerId){event.preventDefault();event.stopImmediatePropagation();if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);seatPan=null;controls.enabled=true;canvas.style.cursor='grab';return true;}return false;}
canvas.addEventListener('pointerup',event=>{if(endSeatPan(event)||endDrag(event))return;if(event.button!==0||!pointerDown||gizmoGesture||busy)return;const distance=Math.hypot(event.clientX-pointerDown.x,event.clientY-pointerDown.y);if(distance>=5)return;if(mode==='place'){event.preventDefault();event.stopImmediatePropagation();placeSelected(event);return;}const r=hit(event);select(r?.id);},true);
canvas.addEventListener('pointercancel',event=>{if(!endSeatPan(event))endDrag(event);},true);
canvas.addEventListener('dblclick',event=>{const r=hit(event);if(r){select(r.id);focus(r.root);}});
function setBusy(value,text){busy=value;$('loading').hidden=!value;if(text)$('loading-text').textContent=text;for(const id of ['import-top','upload-zone','import-table','load-real','load-demo','delete-object','confirm-size','center-object','turn-left','turn-right','reset-rotation','export','view-distance-range','seat-view','seat-distance-range','chair-height-range','person-height'])$(id).disabled=value;historyButtons();}
async function addBuffer(buffer,sourceFile,role='item',options={}){
 if(buffer.byteLength>MAX_FILE_SIZE)throw new Error('单个模型不能超过 80 MB，请先简化网格或贴图。');
 if(totalBytes+buffer.byteLength>240*1024*1024)throw new Error('本次会话已载入较多模型，请导出布局后刷新页面再继续。');
 inspectGLB(buffer);const gltf=await loader.parseAsync(buffer,'');let hasMesh=false;gltf.scene.traverse(o=>{if(o.isMesh){hasMesh=true;o.castShadow=true;o.receiveShadow=true;}});if(!hasMesh)throw new Error('GLB 中没有网格模型。');
 const {root,baseSize}=normalizeModel(gltf.scene,options.targetSize||(role==='table'?140:32));
 const id=crypto.randomUUID();root.userData.recordId=id;
 const r={id,root,baseSize,name:options.name||sourceFile.replace(/\.glb$/i,''),sourceFile,role,bytes:buffer.byteLength,demo:!!options.demo,calibrated:false,grounded:false,surfaceY:role==='table'?null:topY(),locked:role==='table'||Boolean(options.locked),icon:options.icon,initialDimensionsCm:null};
 if(options.dimensions){for(const [index,axis] of AXES.entries())setDimension(r,axis,options.dimensions[index],false);r.calibrated=options.calibrated!==false;}
 r.initialDimensionsCm=getDimensions(r).toArray();
 if(role==='table'){root.position.y=-getDimensions(r).y;}else{root.position.x=options.x??(activeIds.filter(id=>records.get(id).role==='item').length%4-1.5)*18;root.position.z=options.z??0;placeOnSurface(root,topY());}
 if(options.yaw)root.rotation.y=THREE.MathUtils.degToRad(options.yaw);
 records.set(id,r);activeIds.push(id);scene.add(root);totalBytes+=buffer.byteLength;surfaceUpdate();select(id);emit();return r;
}
async function importFiles(files,role='item'){
 if(busy)return;const list=[...files];if(!list.length)return;
 if(role==='table'&&table()){toast('已有真实桌子，请先选中并删除它，再导入新桌子。');return;}
 setBusy(true,'准备导入…');let loaded=0,failed=0,last=null;let lastError='';
 for(const [index,file]of list.entries()){try{if(!/\.glb$/i.test(file.name))throw new Error('仅支持 .glb 文件。');if(file.size>MAX_FILE_SIZE)throw new Error('文件超过 80 MB。');$('loading-text').textContent='正在导入 '+(index+1)+'/'+list.length+' · '+file.name;last=await addBuffer(await file.arrayBuffer(),file.name,role);loaded++;}catch(e){failed++;lastError=file.name+'：'+e.message;console.warn('GLB import failed',e);}}
 setBusy(false);if(loaded){focus(last.root);checkpoint();toast('已导入 '+loaded+' 个模型'+(failed?'，'+failed+' 个失败。'+lastError:'。请在右侧校准真实尺寸。'));}else toast(lastError||'没有导入模型。');
}
async function loadDemo(){if(busy)return;if(activeIds.some(id=>records.get(id).demo)){toast('场景中已有示例模型，可直接选择并操作。');return;}setBusy(true,'正在载入示例 GLB…');let loaded=0;try{for(const config of [{file:'demo-lamp.glb',name:'弧光台灯 · 示例',targetSize:38,x:-38,z:-3,icon:'lamp'},{file:'demo-monitor.glb',name:'桌面显示器 · 示例',targetSize:48,x:15,z:-8,icon:'monitor',yaw:-8}]){const response=await fetch('./assets/'+config.file);if(!response.ok)throw new Error('示例文件加载失败');await addBuffer(await response.arrayBuffer(),config.file,'item',{...config,demo:true});loaded++;}select(activeIds.find(id=>records.get(id).demo));home();}catch(e){toast(e.message);}finally{setBusy(false);if(loaded)checkpoint();}}
async function loadRealScene(){if(busy)return;if(activeIds.some(id=>records.get(id).sourceFile==='base_basic_pbr.glb'||records.get(id).sourceFile==='monitor_demo.glb')){toast('真实桌子和显示器已经在场景中。');return;}setBusy(true,'正在载入你的桌子和显示器…');let loaded=0;try{const tableResponse=await fetch('./assets/desk-real.glb');if(!tableResponse.ok)throw new Error('桌子 GLB 加载失败');await addBuffer(await tableResponse.arrayBuffer(),'base_basic_pbr.glb','table',{name:'我的桌子 · 137 × 76 × 55 cm',dimensions:[137,76,55],calibrated:true,locked:true,targetSize:180});loaded++;const monitorResponse=await fetch('./assets/monitor-real.glb');if(!monitorResponse.ok)throw new Error('显示器 GLB 加载失败');await addBuffer(await monitorResponse.arrayBuffer(),'monitor_demo.glb','item',{name:'我的显示器 · 53.9 × 40.7 × 16.3 cm',dimensions:[53.9,40.7,16.3],calibrated:true,icon:'monitor',x:0,z:0});loaded++;select(activeIds.find(id=>records.get(id).sourceFile==='monitor_demo.glb'));focus(item()?.root);toast('已载入你的桌子和显示器，可点击落点或使用缩放工具。');}catch(e){toast(e.message);}finally{setBusy(false);if(loaded)checkpoint();}}
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>{if(button.dataset.mode==='place'&&(!item()||item().role==='table')){toast('请先选中一个可摆放的物品。');return;}setMode(button.dataset.mode);};
$('import-top').onclick=$('upload-zone').onclick=()=>$('file-input').click();$('import-table').onclick=()=>$('table-input').click();
$('file-input').onchange=async e=>{await importFiles(e.target.files);e.target.value='';};$('table-input').onchange=async e=>{await importFiles(e.target.files,'table');e.target.value='';};
let dragDepth=0;document.addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();dragDepth++;$('drop-overlay').hidden=false;}});document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}});document.addEventListener('dragleave',e=>{if(e.dataTransfer?.types.includes('Files')){dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('drop-overlay').hidden=true;}});document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop-overlay').hidden=true;if(e.dataTransfer?.files.length)importFiles(e.dataTransfer.files);});
$('load-real').onclick=loadRealScene;$('load-demo').onclick=loadDemo;$('view-home').onclick=home;$('view-focus').onclick=()=>focus(item()?.root);$('seat-view').onclick=()=>{seatPanOffsetX=0;setSeatView();};$('seat-distance-range').oninput=e=>setSeatView(Number(e.target.value));$('chair-height-range').oninput=e=>{personHeight=THREE.MathUtils.clamp(Number($('person-height').value)||170,120,220);chairHeightRatio=(Number(e.target.value)-2)/personHeight;setSeatView(seatDistance);};$('person-height').onchange=()=>setSeatView(seatDistance);
$('view-top').onclick=()=>{setSeatViewActive(false);const target=item()?boundsOf(item().root).getCenter(new THREE.Vector3()):new THREE.Vector3(0,0,0);const d=Math.max(camera.position.distanceTo(controls.target),130);controls.target.copy(target);camera.position.copy(target).add(new THREE.Vector3(0,d,.001));controls.update();syncDistanceControl(d);};
$('grid-toggle').onclick=()=>{grid.visible=!grid.visible;origin.visible=grid.visible;$('grid-toggle').classList.toggle('active',grid.visible);$('grid-toggle').setAttribute('aria-pressed',String(grid.visible));};
$('view-distance-range').oninput=e=>setViewDistance(Number(e.target.value));
for(const button of document.querySelectorAll('[data-distance]'))button.onclick=()=>setViewDistance(Number(button.dataset.distance));
$('grounded').onchange=()=>mutate(r=>{r.grounded=$('grounded').checked;if(r.grounded){r.surfaceY=topY();placeOnSurface(r.root,r.surfaceY);}attach();});
$('snap').onchange=()=>{snap=$('snap').checked;transform.setTranslationSnap(snap?1:null);transform.setRotationSnap(snap?THREE.MathUtils.degToRad(15):null);transform.setScaleSnap(snap ? .05 : null);};
for(const axis of AXES){
 $('p'+axis).onchange=e=>mutate(r=>{const v=Number(e.target.value);if(e.target.value.trim()===''||!Number.isFinite(v)||Math.abs(v)>100000)throw new Error('位置请输入 -100000 至 100000 cm 的数字。');r.root.position[axis]=v;if(axis==='y')r.grounded=false;});
 $('r'+axis).onchange=e=>mutate(r=>{const v=Number(e.target.value);if(e.target.value.trim()===''||!Number.isFinite(v)||Math.abs(v)>360000)throw new Error('请输入有效的旋转角度。');r.root.rotation[axis]=THREE.MathUtils.degToRad(v%360);});
 $('d'+axis).onchange=e=>mutate(r=>setDimension(r,axis,Number(e.target.value),$('uniform').checked),{invalid:true});
}
for(const button of document.querySelectorAll('[data-preset-size]'))button.onclick=()=>mutate(r=>{const dimensions=getDimensions(r).toArray();const largest=dimensions.indexOf(Math.max(...dimensions));setDimension(r,AXES[largest],Number(button.dataset.presetSize),true);},{invalid:true});
$('confirm-size').onclick=()=>mutate(r=>{r.calibrated=true;toast('已标记为尺寸已校准。');});
$('turn-left').onclick=()=>mutate(r=>r.root.rotation.y-=Math.PI/4);$('turn-right').onclick=()=>mutate(r=>r.root.rotation.y+=Math.PI/4);$('reset-rotation').onclick=()=>mutate(r=>r.root.rotation.set(0,0,0));
$('center-object').onclick=()=>mutate(r=>{r.root.position.x=0;r.root.position.z=0;});
function removeSelected(){if(!item()||busy)return;const r=item();if(r.locked){toast('桌子是固定资产，不能删除。');return;}transform.detach();scene.remove(r.root);activeIds=activeIds.filter(id=>id!==r.id);surfaceUpdate();select(activeIds.at(-1));checkpoint();emit();toast('已删除 '+r.name+'，可撤销恢复。');}
$('delete-object').onclick=removeSelected;$('undo').onclick=()=>restore(history.undo());$('redo').onclick=()=>restore(history.redo());
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({...exportState(),note:'布局数据不包含 GLB 文件。请将原始 GLB 与此 JSON 一起交给开发同伴。'},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='DeskVerse-layout.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出布局 JSON。请同时保留原始 GLB 文件。');};
window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||busy)return;const key=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&key==='z'){e.preventDefault();restore(e.shiftKey?history.redo():history.undo());return;}if(e.ctrlKey||e.metaKey||e.altKey)return;if({v:'drag',g:'translate',r:'rotate',s:'scale'}[key]){e.preventDefault();setMode({v:'drag',g:'translate',r:'rotate',s:'scale'}[key]);}if(key==='f')focus(item()?.root);if(key==='h')home();if(key==='escape')select(null);if(key==='delete'||key==='backspace'){e.preventDefault();removeSelected();}});
// Public integration API: one source of truth for teammate #4. All numbers use cm/degrees.
window.deskverse={getState:exportState,select,setTransform(id,patch){if(busy)throw new Error('模型正在加载');const r=records.get(id);if(!r||!activeIds.includes(id))throw new Error('Unknown object id');if(r.locked)throw new Error('固定资产不能修改');
 const staged={};for(const key of ['position','rotation','scale']){if(patch[key]!==undefined){const v=patch[key];if(!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite))throw new Error(key+' must contain three finite numbers');if(key==='scale'&&v.some(n=>n<=0||n>100000))throw new Error('Invalid scale');if(key!=='scale'&&v.some(n=>Math.abs(n)>100000))throw new Error('Transform out of range');staged[key]=v;}}
 select(id);if(staged.position){if(staged.position[1]!==r.root.position.y&&patch.grounded===undefined)r.grounded=false;r.root.position.fromArray(staged.position);}if(staged.rotation)r.root.rotation.set(...staged.rotation.map(THREE.MathUtils.degToRad));if(staged.scale){r.root.scale.fromArray(staged.scale);r.calibrated=false;}if(typeof patch.grounded==='boolean'&&r.role!=='table')r.grounded=patch.grounded;changed();attach();renderList();checkpoint();
},importFiles};
checkpoint();setMode('translate');
renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
await loadRealScene();
}
