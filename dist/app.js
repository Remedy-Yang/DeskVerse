import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {AXES,MAX_FILE_SIZE,inspectGLB,normalizeModel,boundsOf,placeOnSurface,getDimensions,setDimension,setDimensions,parseSizeChart,estimateSeatHeight,recordState,sceneModelBytes} from './core.js';
import {initPhotoGeneration} from './generation.js';
import {prepareDeskModel,createDrawerSystems,createDoorSystem,extractChair,findStoragePosition} from './drawers.js';
import {colliders,capturePose,applyPose,assessTransform,sceneContact} from './collision.js';
import {REFERENCE_PROFILES,profileFor,inferCategory,referenceLabel,prepareReferenceModel,setModelOrientation,orientRecord,rotateRecord,applyReferenceSize,savePhotoCategory} from './reference.js';
import {placementReport} from './placement.js';
import {renderPlan} from './plan-view.js';
import {LayoutSchemes} from './workspaces.js';
import {createStudioFloor,fitDirectionalShadow} from './environment.js';
import {DeskWireframe} from './desk-view.js';
import {RENDER_PRESETS,RENDER_SIZES,createRenderCamera,renderSceneCanvas} from './render-export.js';
import {LAYOUT_ASSETS,legacyModel,validateLayout,encodeModel,decodeModel} from './layout-import.js';
import {initPanelResize} from './panel-resize.js';
import {initModelLibrary,MODEL_ASSETS} from './model-library.js';
import {bindAssetLights} from './asset-lights.js';
const $=id=>document.getElementById(id);
const MAX_SIZE_CHART_BYTES=20*1024*1024;
let sizeOcrWorkerPromise=null;
const themePalette={atelier:{background:'#eae6df',floor:'#ffffff',accent:'#c34420'},obsidian:{background:'#151922',floor:'#68717f',accent:'#ff8a5e'},blueprint:{background:'#dce8f3',floor:'#e5eef8',accent:'#075bd8'}};
let themeId='atelier';try{const saved=localStorage.getItem('deskverse-theme');if(Object.hasOwn(themePalette,saved))themeId=saved;}catch{}
document.body.dataset.theme=themeId;
const iconPaths={
 cube:'<path d="M12 3 3 8v9l9 5 9-5V8zM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5v5"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
 download:'<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 camera:'<path d="M3 7h4l2-3h6l2 3h4v14H3z"/><circle cx="12" cy="13" r="4"/>',
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
initPanelResize({panel:$('assets-dock'),handle:$('assets-resizer')});
// 页面工具只管理面板可见性，不保存或改写三维场景状态。
const panelTabs=[...document.querySelectorAll('[data-panel-tab]')];
function showPanelTab(button){for(const tab of panelTabs){const active=tab===button;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$(tab.getAttribute('aria-controls')).hidden=!active;}}
for(const button of panelTabs){button.onclick=()=>showPanelTab(button);button.onkeydown=event=>{const index=panelTabs.indexOf(button),next=event.key==='ArrowRight'?(index+1)%panelTabs.length:event.key==='ArrowLeft'?(index+panelTabs.length-1)%panelTabs.length:event.key==='Home'?0:event.key==='End'?panelTabs.length-1:null;if(next===null)return;event.preventDefault();showPanelTab(panelTabs[next]);panelTabs[next].focus();};}
function openPanel(name){document.body.classList.remove('is-focused');$('focus-ui').setAttribute('aria-pressed','false');if(name)document.body.dataset.openPanel=name;else delete document.body.dataset.openPanel;for(const key of ['assets','inspector'])$('toggle-'+key).setAttribute('aria-expanded',String(name===key));}
for(const name of ['assets','inspector'])$('toggle-'+name).onclick=()=>openPanel(document.body.dataset.openPanel===name?null:name);
$('focus-ui').onclick=()=>{const focused=!document.body.classList.contains('is-focused');openPanel(null);document.body.classList.toggle('is-focused',focused);$('focus-ui').setAttribute('aria-pressed',String(focused));};
document.addEventListener('pointerdown',event=>{if(document.body.dataset.openPanel&&!event.target.closest('.sidebar,.panel-toggle,.assets-resizer'))openPanel(null);});
document.addEventListener('keydown',event=>{if(event.key!=='Escape'||$('photo-dialog').open||$('render-dialog').open)return;const themeMenu=document.querySelector('.theme-picker');if(themeMenu.open){themeMenu.open=false;themeMenu.querySelector('summary').focus();event.stopPropagation();event.preventDefault();return;}const panel=document.body.dataset.openPanel,optics=document.querySelector('.view-distance');if(!panel&&!optics.open&&!document.body.classList.contains('is-focused'))return;event.stopPropagation();event.preventDefault();if($('seat-view').getAttribute('aria-pressed')==='true')$('seat-view').click();if(panel){openPanel(null);$('toggle-'+panel).focus();}else if(optics.open){optics.open=false;optics.querySelector('summary').focus();}else{openPanel(null);$('focus-ui').focus();}});
let toastTimer;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function fatal(message){$('fatal').hidden=false;$('fatal-message').textContent=message;}
$('retry').onclick=()=>location.reload();
try { await start(); } catch(error){console.error(error);fatal('请使用支持 WebGL 2 的 Chrome / Edge 浏览器，并启用硬件加速。'+(error.message?' '+error.message:''));}
async function start(){
const viewport=$('viewport');
const scene=new THREE.Scene();scene.background=new THREE.Color('#eae6df');
const perspectiveCamera=new THREE.PerspectiveCamera(36,1,1,12000),topCamera=new THREE.OrthographicCamera(-150,150,150,-150,.5,12000);topCamera.up.set(0,0,-1);
let camera=perspectiveCamera,projection='perspective';
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,logarithmicDepthBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.98;
viewport.prepend(renderer.domElement);
const canvas=renderer.domElement;
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fatal('显存不足或图形上下文丢失，请刷新页面并尝试较小的模型。');});
const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();const env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.28;room.dispose();pmrem.dispose();
const hemi=new THREE.HemisphereLight('#fffdf7','#9da6b1',1.35);scene.add(hemi);
const sun=new THREE.DirectionalLight('#fff1d9',2.45);sun.position.set(-180,250,150);sun.castShadow=true;scene.add(sun.target);
sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.06;sun.shadow.bias=-.00008;scene.add(sun);
const fill=new THREE.DirectionalLight('#c9d8ff',.65);fill.position.set(100,80,-100);scene.add(fill);
const rim=new THREE.DirectionalLight('#fff5e4',.35);rim.position.set(0,100,-180);scene.add(rim);
const roomPoint=new THREE.PointLight('#ffd3a4',0,500,2);roomPoint.position.set(0,65,55);roomPoint.castShadow=false;scene.add(roomPoint);
const reference=new THREE.Group();
const slab=new THREE.Mesh(new THREE.BoxGeometry(140,2.4,75),new THREE.MeshStandardMaterial({color:'#e4d9c3',roughness:.85}));slab.position.y=-1.2;slab.receiveShadow=true;slab.castShadow=true;reference.add(slab);
for(const x of [-63,63])for(const z of [-30,30]){const leg=new THREE.Mesh(new THREE.BoxGeometry(2.4,36,2.4),new THREE.MeshStandardMaterial({color:'#b4bdc2',metalness:.35,roughness:.65}));leg.position.set(x,-20.4,z);leg.castShadow=true;reference.add(leg);}
scene.add(reference);
const floor=createStudioFloor(renderer);floor.position.y=-38.9;scene.add(floor);
const grid=new THREE.GridHelper(500,50,'#c5bbae','#d8d0c4');grid.position.y=-38.8;grid.material.transparent=true;grid.material.opacity=.25;grid.visible=false;scene.add(grid);
const origin=new THREE.Group();const crossMaterial=new THREE.LineBasicMaterial({color:'#978b7c',transparent:true,opacity:.65});for(const pts of [[[-2,0,0],[2,0,0]],[[0,0,-2],[0,0,2]]])origin.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p=>new THREE.Vector3(...p))),crossMaterial));origin.position.y=.05;origin.visible=false;scene.add(origin);
const lightingPresets={
 'dorm-day':{label:'宿舍白天',note:'柔和日光与低强度补光，桌柜和实体地板接收阴影。',background:'#eae6df',floor:'#ffffff',exposure:.92,environment:.2,hemi:['fffdf7','827c73',.85],key:['fff1d9',2.7,[-180,250,150]],fill:['c9d8ff',.45,[150,90,-100]],rim:['fff5e4',.4,[0,160,-180]],point:['ffd3a4',0,[0,65,55]]},
 'window-side':{label:'窗边侧光',note:'偏冷的窗边光，木纹侧面和层板阴影更明显。',background:'#dfe6ef',floor:'#e7ebf0',exposure:.9,environment:.2,hemi:['f4f8ff','8997aa',.9],key:['fff7e6',3.05,[-180,130,40]],fill:['9dbbff',.48,[120,90,-160]],rim:['d9e7ff',.25,[0,140,-120]],point:['ffd3a4',0,[0,65,55]]},
 'dorm-night':{label:'宿舍夜晚',note:'冷色月光与低亮度室内补光，保留地板纹理和家具暗部。',background:'#202734',floor:'#c2cbd8',exposure:.78,environment:.1,hemi:['b9c9e8','18202d',.36],key:['a8c3ff',.28,[-100,180,100]],fill:['718bc9',.24,[120,80,-140]],rim:['9bb5ff',.35,[0,130,-180]],point:['ffd09b',1.2,[0,60,45]]},
 'desk-lamp':{label:'暖色台灯',note:'按厘米尺度补偿点光衰减，模拟桌面暖色台灯与局部明暗。',background:'#302d2b',floor:'#ece0d0',exposure:.82,environment:.13,hemi:['ffe3bd','28211c',.43],key:['ffcf96',.35,[-70,160,90]],fill:['7f94c1',.2,[120,80,-120]],rim:['ffd5a2',.18,[0,100,-160]],point:['ffbd73',2.6,[0,58,45]]},
 studio:{label:'模型展示',note:'深色背景与轮廓光，保留实体地板上的接触阴影。',background:'#303238',floor:'#b7bbc4',exposure:.88,environment:.2,hemi:['f4eadc','25262b',.52],key:['fff0d3',2.8,[-130,170,110]],fill:['a9c3ff',.8,[130,100,-120]],rim:['ffe0b6',.85,[0,140,-180]],point:['ffd09b',.55,[0,70,35]]}
};
let lightingPresetId='dorm-day',lightingIntensity=1,lightingWarmth=0,shadowDeskId=null;
function applyLighting(){
 const preset=lightingPresets[lightingPresetId]||lightingPresets['dorm-day'],scale=lightingIntensity;
 const warm=lightingWarmth/100,temperature=input=>{const value=new THREE.Color(input);if(warm>0)value.lerp(new THREE.Color('#ffd09b'),warm*.42);if(warm<0)value.lerp(new THREE.Color('#a9c8ff'),-warm*.42);return value;};
 const palette=themePalette[themeId];scene.background.set(lightingPresetId==='dorm-day'?palette.background:preset.background);floor.material.color.set(lightingPresetId==='dorm-day'?palette.floor:preset.floor);scene.environmentIntensity=preset.environment*scale;renderer.toneMappingExposure=preset.exposure*scale;
 document.body.dataset.sceneTone=lightingPresetId==='dorm-night'||lightingPresetId==='desk-lamp'||lightingPresetId==='studio'||themeId==='obsidian'?'dark':'light';
 hemi.color.copy(temperature('#'+preset.hemi[0]));hemi.groundColor.copy(temperature('#'+preset.hemi[1]));hemi.intensity=preset.hemi[2]*scale;
 sun.color.copy(temperature('#'+preset.key[0]));sun.intensity=preset.key[1]*scale;sun.position.set(...preset.key[2]);
 fill.color.copy(temperature('#'+preset.fill[0]));fill.intensity=preset.fill[1]*scale;fill.position.set(...preset.fill[2]);
 rim.color.copy(temperature('#'+preset.rim[0]));rim.intensity=preset.rim[1]*scale;rim.position.set(...preset.rim[2]);
 // 点光按距离平方衰减；世界单位为厘米，需补偿米到厘米的平方倍率。
 roomPoint.color.copy(temperature('#'+preset.point[0]));roomPoint.intensity=preset.point[1]*scale*10000;roomPoint.position.set(...preset.point[2]);
 const shadowBounds=new THREE.Box3(new THREE.Vector3(-130,-76,-90),new THREE.Vector3(130,110,100));scene.traverse(object=>{if(object.userData.recordId&&object.userData.isDesk)shadowBounds.copy(boundsOf(object));});fitDirectionalShadow(sun,shadowBounds);
 $('lighting-preset').value=lightingPresetId;$('lighting-intensity').value=String(Math.round(lightingIntensity*100));$('lighting-intensity-value').textContent=Math.round(lightingIntensity*100)+'%';$('lighting-warmth').value=String(lightingWarmth);$('lighting-warmth-value').textContent=lightingWarmth>8?'偏暖':lightingWarmth<-8?'偏冷':'中性';$('lighting-note').textContent=preset.note;
}
applyLighting();
const perspectiveControls=new OrbitControls(perspectiveCamera,canvas),topControls=new OrbitControls(topCamera,canvas);let controls=perspectiveControls;
perspectiveControls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.ROTATE,RIGHT:THREE.MOUSE.PAN};
topControls.enabled=false;topControls.enableRotate=false;topControls.screenSpacePanning=true;topControls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.PAN};topControls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_PAN};topControls.minZoom=.1;topControls.maxZoom=30;
// Suppress browser middle-click autoscroll without stopping OrbitControls events.
canvas.addEventListener('pointerdown',event=>{if(event.button===1)event.preventDefault();},true);
canvas.addEventListener('auxclick',event=>{if(event.button===1)event.preventDefault();});
controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=2;controls.maxDistance=8000;controls.maxPolarAngle=Math.PI-.02;controls.screenSpacePanning=true;
for(const orbit of [perspectiveControls,topControls])orbit.addEventListener('change',()=>{syncDistanceControl(projection==='top'?300/topCamera.zoom:perspectiveCamera.position.distanceTo(perspectiveControls.target));if(seatViewActive)$('seat-eye-height').textContent=format(camera.position.y-floorHeight)+' cm';});
const transform=new TransformControls(camera,canvas);transform.setSize(.85);transform.setSpace('world');scene.add(transform.getHelper());
const outline=new THREE.Box3Helper(new THREE.Box3(),new THREE.Color('#c34420'));outline.visible=false;outline.material.transparent=true;outline.material.opacity=.7;outline.material.depthTest=false;outline.renderOrder=10;scene.add(outline);
const collisionOutline=new THREE.Box3Helper(new THREE.Box3(),new THREE.Color('#d85c50'));collisionOutline.visible=false;collisionOutline.material.transparent=true;collisionOutline.material.opacity=.95;collisionOutline.material.depthTest=false;collisionOutline.renderOrder=12;scene.add(collisionOutline);
const endpointMarker=new THREE.Mesh(new THREE.SphereGeometry(1.35,16,10),new THREE.MeshBasicMaterial({color:'#c34420',transparent:true,opacity:.9,depthTest:false}));endpointMarker.visible=false;endpointMarker.renderOrder=20;scene.add(endpointMarker);
const draco=new DRACOLoader();draco.setDecoderPath('./vendor/three/addons/libs/draco/gltf/');draco.setWorkerLimit(2);
const ktx2=new KTX2Loader().setTranscoderPath('./vendor/three/addons/libs/basis/').detectSupport(renderer);
const loader=new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
const records=new Map();let activeIds=[],selectedId=null,mode='translate',busy=false,snap=false,restoring=false,viewDistance=300,seatDistance=45,chairHeight=44.5,chairHeightRatio=.25,personHeight=170,seatViewActive=false,endpointHit=null;
let modelLibrary=null;
let drawers=[],drawer=null,door=null,drawerAnimation=0,doorAnimation=0;
const acceptedPoses=new Map();let collisionStatus={detected:false,blocked:false,message:''},collisionToastAt=0;
const layouts=new LayoutSchemes();let history=layouts.history,placementState=null,floorHeight=-38.9,planDrag=null;const sizeChartUrls=new Set(),deskView=new DeskWireframe();
const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();let activeDrag=null,seatPan=null,seatPanOffsetX=0,pointerDown=null,gizmoGesture=false;
const item=()=>records.get(selectedId);
const table=()=>activeIds.map(id=>records.get(id)).find(r=>r.role==='table');
const topY=()=>{const t=table();return t?t.root.position.y+(t.surfaceHeightCm??getDimensions(t).y):0;};
// 竖屏保留横向视野，避免窄画布裁掉家具；缩放只影响投影，不改场景布局。
function resize(){const w=viewport.clientWidth,h=viewport.clientHeight,aspect=w/h;renderer.setSize(w,h);perspectiveCamera.aspect=aspect;perspectiveCamera.zoom=Math.min(1,aspect);perspectiveCamera.updateProjectionMatrix();const halfWidth=150*Math.max(1,aspect),halfHeight=150*Math.max(1,1/aspect);Object.assign(topCamera,{left:-halfWidth,right:halfWidth,top:halfHeight,bottom:-halfHeight});topCamera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(viewport);resize();
function syncDeskView(){deskView.set(table()?.root,projection==='wireframe');}
function setProjection(next){if(next===projection||planDrag)return;setSeatViewActive(false);controls.enabled=false;projection=next;camera=next==='top'?topCamera:perspectiveCamera;controls=next==='top'?topControls:perspectiveControls;controls.enabled=true;controls.enableRotate=next!=='top';controls.enablePan=true;controls.enableZoom=true;transform.camera=camera;if(next==='top'){const box=table()?boundsOf(table().root):boundsOf(reference),center=box.getCenter(new THREE.Vector3());topCamera.zoom=1;topCamera.position.set(center.x,Math.max(box.max.y+500,500),center.z);topControls.target.set(center.x,topY(),center.z);topCamera.lookAt(topControls.target);topCamera.updateProjectionMatrix();}syncDeskView();controls.update();attach();for(const button of document.querySelectorAll('[data-projection]')){const active=button.dataset.projection===projection;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}$('projection-label').textContent=({top:'正交俯视',perspective:'三维自由',wireframe:'桌柜透视网格'})[projection];$('view-distance-range').setAttribute('aria-label',projection==='top'?'俯视短边取景范围，厘米':'距离桌面，厘米');syncDistanceControl(projection==='top'?300/topCamera.zoom:perspectiveCamera.position.distanceTo(perspectiveControls.target));hideSurfacePreview();}
for(const button of document.querySelectorAll('[data-projection]'))button.onclick=()=>setProjection(button.dataset.projection);
function syncDistanceControl(distance){viewDistance=THREE.MathUtils.clamp(Math.round(distance/10)*10,50,600);$('view-distance-range').value=String(viewDistance);$('view-distance-value').textContent=viewDistance+' cm'+(projection==='top'?' · 范围':'');for(const button of document.querySelectorAll('[data-distance]'))button.classList.toggle('active',Math.abs(Number(button.dataset.distance)-viewDistance)<5);}
function setSeatViewActive(value){seatViewActive=value;$('seat-view').classList.toggle('active',value);$('seat-view').setAttribute('aria-pressed',String(value));$('seat-view-label').textContent=value?'退出坐姿视角':'坐在椅子上';$('seat-view').title=value?'退出坐姿视角':'从椅子位置正对桌面，点击可退出';controls.enableRotate=!value&&projection!=='top';controls.enablePan=true;controls.enableZoom=!value;if(value){transform.detach();canvas.style.cursor='grab';$('scene-hint').textContent='坐姿视角：左键拖动左右移动；按住右键拖动平移视角；退出坐姿恢复编辑';}else{perspectiveCamera.fov=36;perspectiveCamera.updateProjectionMatrix();attach();canvas.style.cursor=mode==='drag'?'grab':mode==='place'?'crosshair':'default';$('scene-hint').textContent=(mode==='drag'?'直接拖动沿 XZ 平面移动；中键拖动环绕查看':mode==='translate'?'拖动 X / Y / Z 箭头自由移动；中键拖动环绕查看':mode==='place'?'移动鼠标查看坐标，左键单击放置；中键拖动环绕查看':mode==='rotate'?'拖动彩色圆环旋转物品；中键拖动环绕查看':'拖动手柄缩放；中键拖动环绕查看')+'；按住右键拖动平移视角';}}
function experienceTarget(){return new THREE.Vector3(0,topY()+12,0);}
function syncSeatHeight(){const estimate=estimateSeatHeight(Number($('person-height').value)||170,chairHeightRatio);personHeight=estimate.statureCm;chairHeight=estimate.cm;chairHeightRatio=estimate.ratio;$('person-height').value=String(personHeight);const range=$('chair-height-range');range.min=estimate.minCm.toFixed(1);range.max=estimate.maxCm.toFixed(1);range.value=chairHeight.toFixed(1);$('chair-height-value').textContent=chairHeight.toFixed(1)+' cm';$('chair-height-range-note').textContent='调整范围：'+estimate.minCm.toFixed(1)+'–'+estimate.maxCm.toFixed(1)+' cm';}
function setViewDistance(distance){const next=THREE.MathUtils.clamp(Number(distance)||300,50,600);if(projection==='top'){topCamera.zoom=300/next;topCamera.updateProjectionMatrix();syncDistanceControl(next);return;}if(seatViewActive){const t=table();const box=t?boundsOf(t.root):new THREE.Box3(new THREE.Vector3(-70,0,-37.5),new THREE.Vector3(70,0,37.5));const floorY=t?box.min.y:-38.9;const eyeY=floorY+chairHeight+personHeight*.48;const targetY=box.getCenter(new THREE.Vector3()).y;const vertical=Math.abs(eyeY-targetY);const horizontal=Math.sqrt(Math.max(1,next*next-vertical*vertical));seatDistance=THREE.MathUtils.clamp(horizontal-box.getSize(new THREE.Vector3()).z/2,25,500);setSeatView(seatDistance);return;}let dir=camera.position.clone().sub(controls.target);if(dir.lengthSq()<1e-6)dir.set(1,.7,1).normalize();dir.normalize();controls.target.copy(experienceTarget());camera.position.copy(controls.target).addScaledVector(dir,next);setSeatViewActive(false);controls.update();syncDistanceControl(next);}
function setSeatView(distance=seatDistance){
 setProjection('perspective');
 seatDistance=THREE.MathUtils.clamp(Number(distance)||45,25,500);
 syncSeatHeight();
 $('seat-distance-range').value=String(seatDistance);$('seat-distance-value').textContent=seatDistance+' cm';for(const button of document.querySelectorAll('[data-seat-distance]'))button.classList.toggle('active',Number(button.dataset.seatDistance)===seatDistance);
 const t=table();
 const box=t?boundsOf(t.root):new THREE.Box3(new THREE.Vector3(-70,0,-37.5),new THREE.Vector3(70,0,37.5));
 const floorY=t?box.min.y:-38.9;
 const eyeFromFloor=chairHeight+personHeight*.48;
 const eyeY=floorY+eyeFromFloor;
 $('seat-eye-height').textContent=Math.round(eyeFromFloor)+' cm';
 const chair=activeIds.map(id=>records.get(id)).find(record=>record.furniture==='chair');
 const chairBox=chair?boundsOf(chair.root):box, target=box.getCenter(new THREE.Vector3());
 target.x=chairBox.getCenter(new THREE.Vector3()).x;
 const frontZ=chairBox.max.z+seatDistance;
 controls.enableDamping=false;
 controls.update();
 target.x+=seatPanOffsetX;
 camera.position.set(target.x,eyeY,frontZ);
 controls.target.copy(target);
 camera.up.set(0,1,0);
 camera.fov=30;camera.near=1;camera.far=12000;camera.updateProjectionMatrix();
 controls.update();
 setSeatViewActive(true);
 controls.enableDamping=true;
 syncDistanceControl(camera.position.distanceTo(controls.target));
}
function home(){setProjection('perspective');setSeatViewActive(false);camera.fov=36;camera.position.set(174,145,196);controls.target.set(0,2,0);camera.up.set(0,1,0);camera.updateProjectionMatrix();controls.update();syncDistanceControl(camera.position.distanceTo(controls.target));}
function focus(root){setSeatViewActive(false);const box=root?boundsOf(root):new THREE.Box3().setFromObject(reference);if(box.isEmpty())return;const size=box.getSize(new THREE.Vector3()),c=box.getCenter(new THREE.Vector3());if(projection==='top'){topControls.target.set(c.x,topY(),c.z);topCamera.position.set(c.x,Math.max(box.max.y+500,500),c.z);topCamera.zoom=Math.min((topCamera.right-topCamera.left)/Math.max(size.x,1),(topCamera.top-topCamera.bottom)/Math.max(size.z,1))/1.2;topCamera.lookAt(topControls.target);topCamera.updateProjectionMatrix();topControls.update();syncDistanceControl(300/topCamera.zoom);return;}const radius=Math.max(size.length()/2,1),verticalFov=THREE.MathUtils.degToRad(camera.getEffectiveFOV()),fov=Math.min(verticalFov,2*Math.atan(Math.tan(verticalFov/2)*camera.aspect));const distance=radius/Math.sin(fov/2)*1.15;let dir=camera.position.clone().sub(controls.target).normalize();if(!dir.lengthSq())dir.set(1,1,1).normalize();camera.position.copy(c).addScaledVector(dir,distance);controls.target.copy(c);camera.near=Math.max(.5,distance/1000);camera.far=Math.max(12000,distance*8);camera.updateProjectionMatrix();controls.maxDistance=Math.max(8000,distance*4);controls.update();syncDistanceControl(distance);}
syncSeatHeight();home();
function surfaceUpdate(){const t=table();if(t?.locked){t.root.rotation.set(0,0,0);t.root.position.set(0,-(t.surfaceHeightCm??getDimensions(t).y),0);t.root.updateMatrixWorld(true);}reference.visible=!t;const height=topY();origin.position.y=height+.05;floorHeight=-38.9;let floorY=-38.9;if(t){const b=boundsOf(t.root);const footprint=t.surfaceFootprintCm||[b.getSize(new THREE.Vector3()).x,b.getSize(new THREE.Vector3()).z];floorHeight=t.floorHeightCm??b.min.y;floorY=floorHeight-.4;$('surface-name').textContent=t.name;$('surface-size').textContent=footprint[0].toFixed(1)+' × '+footprint[1].toFixed(1)+' cm · 固定桌面';}else{$('surface-name').textContent='参考桌面';$('surface-size').textContent='140 × 75 cm · 辅助平面';}$('import-table-label').textContent=t?'替换当前桌子 GLB':'导入桌子 GLB';floor.position.y=floorY;grid.position.y=floorY+.1;if(shadowDeskId!==(t?.id||null)){shadowDeskId=t?.id||null;applyLighting();}for(const id of activeIds){const r=records.get(id);if(r.role!=='table'&&r.grounded){r.surfaceY??=height;placeOnSurface(r.root,r.surfaceY);}}}
function format(n){return Math.abs(n)<.005?'0':Number(n.toFixed(2)).toString();}
function formatSize(values){return values.map(n=>Number(n.toFixed(1))).join(' × ')+' cm';}
function setInput(id,n){$(id).value=format(n);}
// 二维拖动只更新 X/Z；整个手势共用起点并在结束时提交一次撤销快照。
const planDragCallbacks={onStart(id){if(busy||planDrag||activeDrag||seatPan||transform.dragging)return false;const record=records.get(id);if(!record||record.locked||!activeIds.includes(id))return false;cancelAnimationFrame(drawerAnimation);cancelAnimationFrame(doorAnimation);checkpoint();planDrag={id,pose:capturePose(record.root),grounded:record.grounded,surfaceY:record.surfaceY,storage:record.storage?{...record.storage}:null,controlsEnabled:controls.enabled,moved:false};controls.enabled=false;select(id);return true;},onMove(id,dx,dz){if(!planDrag||planDrag.id!==id||![dx,dz].every(Number.isFinite))return;const record=records.get(id),start=planDrag.pose.position;let x=THREE.MathUtils.clamp(start.x+dx,-100000,100000),z=THREE.MathUtils.clamp(start.z+dz,-100000,100000);if(snap){x=Math.round(x);z=Math.round(z);}record.root.position.x=x;record.root.position.z=z;if(x!==start.x||z!==start.z)planDrag.moved=true;changed(false,{teleport:true});},onEnd(id,cancelled){const drag=planDrag;if(!drag||drag.id!==id)return;planDrag=null;controls.enabled=drag.controlsEnabled;const record=records.get(id);if(cancelled){applyPose(record.root,drag.pose);Object.assign(record,{grounded:drag.grounded,surfaceY:drag.surfaceY,storage:drag.storage});changed(false,{teleport:true,skipCollision:true});}else if(drag.moved)checkpoint();attach();renderList();updatePlacement();}};
function updatePlacement(){placementState=placementReport(activeIds.map(id=>records.get(id)),{selectedId,table:table(),drawers,surfaceY:topY()});const selected=placementState.selected;for(const key of ['boundary','size','conflict']){const element=$('fit-'+key),status=selected?.[key],label=key==='size'&&status?.state==='ok'?'尺寸合规':key==='conflict'&&status?.state==='warning'?'占地冲突':({boundary:'边界',size:'尺寸检查',conflict:'占地检查'}[key]);element.dataset.state=status?.state||'na';element.textContent=label+'：'+(status?.label||'未选择');}$('placement-summary').textContent=selected?(item()?.name||'当前物品'):'选中物品，查看实时摆放状态';$('plan-note').textContent='拖动物品沿 XZ 移动，保持高度；物品占地为保守投影。'+(placementState.surface.estimated?'桌面范围含估算，请核对。':'桌面轮廓取自模型几何。')+(selected?.scope==='unknown'?'当前支撑高度未知，边界与尺寸不判定。':'');renderPlan($('plan-map'),placementState,select,planDragCallbacks);
}
function setTheme(id){if(!Object.hasOwn(themePalette,id))return;themeId=id;document.body.dataset.theme=id;document.querySelector('meta[name="theme-color"]').content=themePalette[id].background;for(const button of document.querySelectorAll('[data-theme-choice]'))button.setAttribute('aria-pressed',String(button.dataset.themeChoice===id));outline.material.color.set(themePalette[id].accent);endpointMarker.material.color.set(themePalette[id].accent);try{localStorage.setItem('deskverse-theme',id);}catch{}applyLighting();document.querySelector('.theme-picker').open=false;}
for(const button of document.querySelectorAll('[data-theme-choice]'))button.onclick=()=>setTheme(button.dataset.themeChoice);
setTheme(themeId);
function inspector(){updatePlacement();const r=item();$('inspector').hidden=!r;$('empty-inspector').hidden=!!r;if(!r){outline.visible=false;collisionOutline.visible=false;for(const id of ['px','py','pz','rx','ry','rz','dx','dy','dz','uniform','grounded','snap','confirm-size','turn-left','turn-right','reset-rotation','center-object','delete-object'])$(id).disabled=false;return;}const locked=Boolean(r.locked);$('selected-name').textContent=r.name;$('selected-meta').textContent=(locked?'固定资产':r.demo?'内置示例':'导入 GLB')+' · '+(r.bytes/1024/1024).toFixed(2)+' MB';const currentDimensions=getDimensions(r).toArray();for(const axis of AXES){setInput('p'+axis,r.root.position[axis]);setInput('r'+axis,THREE.MathUtils.radToDeg(r.root.rotation[axis]));setInput('d'+axis,currentDimensions[AXES.indexOf(axis)]);}$('initial-size').textContent=formatSize(r.initialDimensionsCm||currentDimensions);$('current-size').textContent=formatSize(currentDimensions);$('grounded').checked=r.grounded;$('size-note').textContent=locked?'固定桌面：位置、旋转、尺寸和删除操作均已锁定。':r.calibrated?'当前尺寸已由你确认。旋转不会改变这里的模型局部尺寸。':r.demo?'内置示例尺寸，仅供操作演示。真实资产请按实物尺寸校准。':'已自动缩放以便观察；请输入实物尺寸，再确认校准。';$('size-note').classList.toggle('confirmed',r.calibrated);$('confirm-size').textContent=r.calibrated?'尺寸已确认':'将当前尺寸标记为已校准';for(const id of ['px','py','pz','rx','ry','rz','dx','dy','dz','uniform','grounded','snap','confirm-size','turn-left','turn-right','reset-rotation','center-object','delete-object'])$(id).disabled=locked||(id==='grounded'&&r.role==='table');for(const button of document.querySelectorAll('[data-preset-size]')){button.disabled=locked;button.classList.toggle('active',Math.abs(Math.max(...currentDimensions)-Number(button.dataset.presetSize))<.1);}outline.box.copy(boundsOf(r.root));outline.visible=!locked;}
function renderList(){const list=$('object-list');list.replaceChildren();for(const id of activeIds){const r=records.get(id);const button=document.createElement('button');button.className='object-row'+(id===selectedId?' active':'');button.setAttribute('aria-pressed',String(id===selectedId));button.title=r.sourceFile;const glyph=document.createElement('span');glyph.className='object-icon';glyph.innerHTML=icon(r.role==='table'?'table':r.icon||'cube');const info=document.createElement('span');info.className='row-info';const name=document.createElement('strong');name.textContent=r.name;const sub=document.createElement('small');sub.textContent=r.locked?'固定资产 · 已校准':(r.demo?'示例 GLB':'GLB')+' · '+(r.calibrated?'已校准':'待校准');info.append(name,sub);const dot=document.createElement('span');dot.className='row-dot';button.append(glyph,info,dot);button.onclick=()=>select(id);list.append(button);}$('object-count').textContent=String(activeIds.length);$('status-text').textContent=activeIds.length+' 个独立模型 · '+(activeIds.filter(id=>records.get(id).calibrated).length)+' 个已校准';}
function attach(){transform.detach();const r=item();if(!r||r.locked||seatViewActive||mode==='drag'||mode==='place')return;transform.attach(r.root);transform.setMode(mode);transform.setSpace(mode==='scale'?'local':'world');transform.showX=true;transform.showY=true;transform.showZ=true;}
function renderSizeVariants(r){
 renderReferenceSizes(r);
 const chartButton=$('size-chart-button'),addButton=$('add-size-variant'),preview=$('size-chart-preview'),image=$('size-chart-image'),status=$('size-ocr-status'),options=$('size-variant-options'),editor=$('size-variant-editor');
 const locked=!r||r.locked;chartButton.disabled=locked||busy;addButton.disabled=locked||busy;$('remove-size-chart').disabled=locked||busy;preview.hidden=!r?.sizeChartUrl;
 status.hidden=!r?.sizeOcrStatus;status.textContent=r?.sizeOcrStatus||'';
 if(r?.sizeChartUrl){image.src=r.sizeChartUrl;image.title=r.sizeChartName||'商品尺寸图';}else image.removeAttribute('src');
 const variants=r?.sizeVariants||[],saved=variants.filter(variant=>variant.saved);options.replaceChildren();options.hidden=!saved.length;
 for(const variant of saved){const button=document.createElement('button');button.type='button';button.className='size-variant-option'+(r.activeSizeVariantId===variant.id?' active':'');button.setAttribute('aria-pressed',String(r.activeSizeVariantId===variant.id));button.title=formatSize(variant.dimensions);const name=document.createElement('strong');name.textContent=variant.name;const dimensions=document.createElement('span');dimensions.textContent=formatSize(variant.dimensions);button.append(name,dimensions);button.onclick=()=>mutate(current=>{setDimensions(current,variant.dimensions);current.activeSizeVariantId=variant.id;current.calibrated=true;});options.append(button);}
 editor.replaceChildren();if(!r)return;
 for(const [index,variant] of variants.entries()){
  const row=document.createElement('div');row.className='size-variant-row';const fields=document.createElement('div');fields.className='size-variant-row-fields';
  const makeField=(labelText,value,type='number')=>{const label=document.createElement('label');label.textContent=labelText;const input=document.createElement('input');input.type=type;input.value=String(value);if(type==='number'){input.min='.01';input.max='100000';input.step='.1';}else input.maxLength=40;label.append(input);fields.append(label);return input;};
  const name=makeField('规格名称',variant.name,'text');const inputs=['宽 X','高 Y','深 Z'].map((label,i)=>makeField(label,variant.dimensions[i]));row.append(fields);
  const actions=document.createElement('div');actions.className='size-variant-row-actions';const save=document.createElement('button');save.type='button';save.className='text-button';save.textContent='保存并应用';save.disabled=locked||busy;save.onclick=()=>{const dimensions=inputs.map(input=>Number(input.value));if(!name.value.trim()||dimensions.some(value=>!Number.isFinite(value)||value<=0||value>100000)){toast('请填写规格名称和有效的宽、高、深。');return;}mutate(current=>{setDimensions(current,dimensions);variant.name=name.value.trim();variant.dimensions=dimensions;variant.saved=true;current.activeSizeVariantId=variant.id;current.calibrated=true;});};
  const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='删除';remove.disabled=locked||busy;remove.onclick=()=>{r.sizeVariants=r.sizeVariants.filter(entry=>entry.id!==variant.id);if(r.activeSizeVariantId===variant.id)r.activeSizeVariantId=null;renderSizeVariants(r);checkpoint();};actions.append(save,remove);row.append(actions);editor.append(row);
 }
}
function applyCommonSize(record,index){
 const bottom=boundsOf(record.root).min.y;orientRecord(record,record.referenceCategoryId,{preserveSize:false});record.root.rotation.x=0;record.root.rotation.z=0;
 applyReferenceSize(record,record.referenceCategoryId,index);placeOnSurface(record.root,bottom);
}
function renderReferenceSizes(record){
 const locked=!record||record.locked,chooser=$('reference-category'),list=$('reference-options');
 if(!chooser.options.length)chooser.replaceChildren(...REFERENCE_PROFILES.map(profile=>new Option(profile.name,profile.id)));
 chooser.disabled=locked||busy;chooser.value=record?.referenceCategoryId||'generic';list.replaceChildren();
 $('orient-model').disabled=locked||busy||!record?.orientationRoot;for(const id of ['orient-x','orient-z'])$(id).disabled=locked||busy||!record?.orientationRoot;
 if(!record||locked){$('reference-note').textContent='';return;}
 const profile=profileFor(record.referenceCategoryId);
 for(const [index,[name,size]] of profile.sizes.entries()){
  const button=document.createElement('button');button.type='button';button.className='size-variant-option'+(record.referenceSizeIndex===index?' active':'');button.disabled=busy;button.setAttribute('aria-pressed',String(record.referenceSizeIndex===index));button.title=name+' · '+referenceLabel(size);
  const title=document.createElement('strong'),dimensions=document.createElement('span');title.textContent=name;dimensions.textContent=referenceLabel(size);button.append(title,dimensions);button.onclick=()=>mutate(r=>applyCommonSize(r,index));list.append(button);
 }
 $('reference-note').textContent=record.baseSize.toArray().some(value=>value<1e-8)?'零厚度模型，无法估算厚度':'参考值，非照片测量尺寸';
 if(!record.calibrated&&record.referenceSizeIndex!==null&&record.referenceSizeIndex!==undefined)$('size-note').textContent='常见参考尺寸，尚未按实物校准。';
}
$('reference-category').onchange=event=>mutate(record=>{record.referenceCategoryId=event.target.value;applyCommonSize(record,profileFor(record.referenceCategoryId).defaultIndex);if(record.photoJobId)savePhotoCategory(localStorage,record.photoJobId,record.referenceCategoryId);});
$('orient-model').onclick=()=>mutate(record=>{const bottom=boundsOf(record.root).min.y;orientRecord(record,record.referenceCategoryId);record.root.rotation.x=0;record.root.rotation.z=0;placeOnSurface(record.root,bottom);});
for(const axis of ['x','z'])$('orient-'+axis).onclick=()=>mutate(record=>{rotateRecord(record,axis);record.referenceSizeIndex=null;});
async function recognizeSizeChart(file){
 if(!sizeOcrWorkerPromise){
 sizeOcrWorkerPromise=import('./vendor/ocr/tesseract.esm.min.js').then(({default:Tesseract})=>Tesseract.createWorker('chi_sim',Tesseract.OEM.LSTM_ONLY,{workerPath:new URL('./vendor/ocr/core/worker.min.js',import.meta.url).href,corePath:new URL('./vendor/ocr/core/tesseract-core-lstm.wasm.js',import.meta.url).href,langPath:new URL('./vendor/ocr/lang/',import.meta.url).href,gzip:false,workerBlobURL:false,logger:message=>{if(message.status==='recognizing text')$('loading-text').textContent='正在识别商品尺寸图 '+Math.round(message.progress*100)+'%';}})).catch(error=>{sizeOcrWorkerPromise=null;throw error;});
 }
 const worker=await sizeOcrWorkerPromise;
 try{return (await worker.recognize(file)).data.text;}catch(error){await worker.terminate().catch(()=>{});sizeOcrWorkerPromise=null;throw error;}
}
function select(id){selectedId=id&&activeIds.includes(id)?id:null;const owner=drawers.find(d=>d.id===item()?.storage?.drawerId);if(owner)drawer=owner;attach();renderList();inspector();renderSizeVariants(item());renderDrawerControls();}
function setMode(next){if(seatViewActive)setSeatViewActive(false);mode=next;for(const el of document.querySelectorAll('[data-mode]')){el.classList.toggle('active',el.dataset.mode===mode);el.setAttribute('aria-pressed',String(el.dataset.mode===mode));}attach();if(mode!=='place')hideSurfacePreview();$('scene-hint').textContent=(mode==='drag'?'直接拖动沿 XZ 平面移动；中键拖动环绕查看':mode==='translate'?'拖动 X / Y / Z 箭头自由移动；中键拖动环绕查看':mode==='place'?'移动鼠标查看坐标，左键单击放置；中键拖动环绕查看':mode==='rotate'?'拖动彩色圆环旋转物品；中键拖动环绕查看':'拖动手柄缩放；中键拖动环绕查看')+'；按住右键拖动平移视角';canvas.style.cursor=mode==='drag'?'grab':mode==='place'?'crosshair':'default';}
function snapshot(){return {selectedId,selectedDrawerId:drawer?.id,drawerOpenings:Object.fromEntries(drawers.map(d=>[d.id,d.opening])),doorOpening:door?.opening??1,items:activeIds.map(id=>{const r=records.get(id);return {id,name:r.name,position:r.root.position.toArray(),rotation:r.root.rotation.toArray(),scale:r.root.scale.toArray(),orientation:r.orientationRoot?.quaternion.toArray(),referenceCategoryId:r.referenceCategoryId,referenceSizeIndex:r.referenceSizeIndex,grounded:r.grounded,surfaceY:r.surfaceY,storage:r.storage?{...r.storage}:null,calibrated:r.calibrated,activeSizeVariantId:r.activeSizeVariantId,sizeVariants:r.sizeVariants.map(variant=>({...variant,dimensions:[...variant.dimensions]})),sizeChartUrl:r.sizeChartUrl,sizeChartName:r.sizeChartName,sizeOcrStatus:r.sizeOcrStatus};})};}
function historyButtons(){$('undo').disabled=history.index<=0||busy;$('redo').disabled=history.index>=history.entries.length-1||busy;}
function checkpoint(){if(!restoring)history.push(snapshot());historyButtons();}
function switchWorkspace(id){if(busy||planDrag||activeDrag||seatPan||transform.dragging||id===layouts.id)return;cancelAnimationFrame(drawerAnimation);cancelAnimationFrame(doorAnimation);const state=layouts.switchTo(id,snapshot());history=layouts.history;hideSurfacePreview();restore(state);for(const button of document.querySelectorAll('[data-workspace]')){const active=button.dataset.workspace===layouts.id;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));}if(seatViewActive)setSeatView();toast('已切换到方案 '+layouts.id.toUpperCase()+'，两套布局与撤销记录独立保留。');}
for(const button of document.querySelectorAll('[data-workspace]'))button.onclick=()=>switchWorkspace(button.dataset.workspace);
function restore(state){if(!state||planDrag)return;cancelAnimationFrame(drawerAnimation);cancelAnimationFrame(doorAnimation);restoring=true;transform.detach();for(const id of activeIds)scene.remove(records.get(id).root);activeIds=state.items.map(s=>s.id);drawers=table()?.drawerSystems||[];drawer=drawers.find(d=>d.id===state.selectedDrawerId)||drawers[0]||null;door=table()?.doorSystem||null;for(const d of drawers)d.setOpening(state.drawerOpenings?.[d.id]??state.drawerOpening??0);door?.setOpening(state.doorOpening??1);for(const s of state.items){const r=records.get(s.id);if(s.orientation)setModelOrientation(r,new THREE.Quaternion().fromArray(s.orientation));r.name=s.name??r.name;r.root.position.fromArray(s.position);r.root.rotation.fromArray(s.rotation);r.root.scale.fromArray(s.scale);r.referenceCategoryId=s.referenceCategoryId??'generic';r.referenceSizeIndex=s.referenceSizeIndex??null;r.grounded=s.grounded;r.surfaceY=s.surfaceY;r.storage=s.storage?{...s.storage}:null;r.calibrated=s.calibrated;r.activeSizeVariantId=s.activeSizeVariantId??null;r.sizeVariants=(s.sizeVariants||[]).map(variant=>({...variant,dimensions:[...variant.dimensions]}));r.sizeChartUrl=s.sizeChartUrl??null;r.sizeChartName=s.sizeChartName??null;r.sizeOcrStatus=s.sizeOcrStatus??null;scene.add(r.root);}syncDeskView();surfaceUpdate();rememberPoses();refreshCollision();select(state.selectedId);restoring=false;historyButtons();emit();}
function exportState(){return {schemaVersion:1,units:'cm',workspace:{id:layouts.id,label:'方案 '+layouts.id.toUpperCase()},appearance:{theme:themeId},view:{mode:projection,cameraType:camera.type,position:camera.position.toArray(),target:controls.target.toArray(),zoom:camera.zoom},placement:structuredClone(placementState),coordinateSystem:{handedness:'right',up:'Y',horizontal:'X',depth:'Z',rotationUnit:'degrees',rotationOrder:'XYZ',pivot:'bottom-center-before-rotation'},surface:{type:table()?'model-work-surface':'reference-plane',heightCm:topY(),tableId:table()?.id||null,referenceSizeCm:[140,75]},lighting:{preset:lightingPresetId,intensity:lightingIntensity,warmth:lightingWarmth},drawers:drawers.map(d=>d.state()),doors:door?[door.state()]:[],collision:{enabled:true,mode:'warn',method:'per-part-obb',...collisionStatus},objects:activeIds.map(id=>{const r=records.get(id);return {...recordState(r),storage:r.storage?{...r.storage}:null,modelOrientation:r.orientationRoot?.quaternion.toArray()??null,referenceSize:r.referenceSizeIndex===null||r.referenceSizeIndex===undefined?null:{category:r.referenceCategoryId,index:r.referenceSizeIndex,estimated:true}};})};}
function emit(){const bytes=sceneModelBytes(activeIds.map(id=>records.get(id)));$('scene-resources').textContent='当前场景模型 '+(bytes/1024/1024).toFixed(1)+' MiB · 不设累计上限';window.dispatchEvent(new CustomEvent('deskverse:change',{detail:exportState()}));}
function rememberPoses(){for(const id of activeIds){const r=records.get(id);acceptedPoses.set(id,{pose:capturePose(r.root),grounded:r.grounded,surfaceY:r.surfaceY,storage:r.storage?{...r.storage}:null,calibrated:r.calibrated,activeSizeVariantId:r.activeSizeVariantId});}}
function reportCollision(result){
 const detected=!!result?.detected,other=result?.contact?.b,previousMessage=collisionStatus.message;
 const name=other?.ownerName||(result?.contact?.floor?'地面':'家具部件'),subject=result?.contact?.a?.ownerName||item()?.name||'物品';
 const message=result?.kind==='capacity'?'收纳尺寸超出 '+name+' 的内腔，位置已保留。':result?.kind==='path'?'移动路径经过 '+name+'，位置已保留。':subject+' 与 '+name+' 可能重叠，可继续自由调整。';
 collisionStatus={detected,blocked:false,kind:result?.kind??null,message:detected?message:'',objectId:other?.ownerId??null,part:other?.name??null};
 $('collision-status').textContent=detected?collisionStatus.message:'自由移动 · 碰撞仅提醒';$('collision-status').classList.toggle('blocked',detected);
 outline.material.color.set(detected?'#ce634c':themePalette[themeId].accent);
 collisionOutline.visible=detected;
 if(detected){
  const ownerId=other?.ownerId||result?.contact?.a?.ownerId,owner=ownerId?records.get(ownerId):item();
  const drawerId=result?.contact?.a?.mesh?.userData?.drawerId||result?.contact?.b?.mesh?.userData?.drawerId;
  const target=drawerId?drawers.find(entry=>entry.id===drawerId)?.group:item()?.root||owner?.root;
  if(target)collisionOutline.box.copy(boundsOf(target));
 }
 if(detected&&(message!==previousMessage||performance.now()-collisionToastAt>3000)){toast(message);collisionToastAt=performance.now();}
 if(!detected&&$('toast').textContent===previousMessage)$('toast').hidden=true;
}
function refreshCollision(pathWarning=null){
 let result=sceneContact(activeIds.map(id=>records.get(id)),{floorY:floorHeight});
 if(!result.detected)for(const d of drawers){const record=storedRecords(d).find(r=>!d.bounds().clone().expandByScalar(.5).containsBox(boundsOf(r.root)));if(record){result={detected:true,kind:'capacity',contact:{a:{ownerName:record.name},b:{ownerName:d.name,ownerId:table()?.id}}};break;}}
 reportCollision(result.detected?result:pathWarning);
}
function obstacleParts(excludedIds=new Set(),excludeMesh=()=>false){
 return activeIds.filter(id=>!excludedIds.has(id)).flatMap(id=>{const r=records.get(id);return colliders(r.root,excludeMesh).map(c=>({...c,ownerId:id,ownerName:r.name}));});
}
function changed(calibrationInvalid=false,{teleport=false,skipCollision=false}={}){
 const r=item();let warning=null;
 if(r){for(const axis of AXES)r.root.scale[axis]=Math.max(.00001,Math.abs(r.root.scale[axis]));if(calibrationInvalid){r.calibrated=false;r.referenceSizeIndex=null;}if(r.activeSizeVariantId)r.referenceSizeIndex=null;}
 surfaceUpdate();
 if(r&&!r.locked&&!skipCollision&&acceptedPoses.has(r.id)){
  const previous=acceptedPoses.get(r.id);warning=assessTransform(r.root,previous.pose,obstacleParts(new Set([r.id])),{floorY:floorHeight,path:!teleport});
  const owner=drawers.find(d=>d.id===r.storage?.drawerId);
  if(owner){const box=boundsOf(r.root),center=box.getCenter(new THREE.Vector3()),inner=owner.bounds().expandByScalar(.5);center.y=box.min.y;if(!inner.containsPoint(center)){r.storage=null;r.grounded=false;}}
 }
 rememberPoses();refreshCollision(warning?.detected?warning:null);inspector();renderSizeVariants(item());renderDrawerControls();emit();return true;
}
function mutate(fn,{invalid=false,teleport=false}={}){if(!item()||busy||planDrag||item().locked)return;try{fn(item());changed(invalid,{teleport});renderList();checkpoint();}catch(e){const previous=acceptedPoses.get(selectedId);if(previous){applyPose(item().root,previous.pose);Object.assign(item(),{grounded:previous.grounded,surfaceY:previous.surfaceY,storage:previous.storage});}toast(e.message);inspector();}}
function storedRecords(target=drawer){return activeIds.map(id=>records.get(id)).filter(record=>target&&record.storage?.drawerId===target.id);}
function renderDrawerControls(){
 $('door-controls').hidden=!door;$('chair-pull').disabled=busy||!activeIds.some(id=>records.get(id).furniture==='chair');
 const chair=activeIds.map(id=>records.get(id)).find(record=>record.furniture==='chair');
 $('chair-position-controls').hidden=!chair;
 if(chair){const offset=chair.root.position.z-(chair.chairHomeZ??chair.root.position.z);$('chair-position-range').value=String(Math.round(offset));$('chair-position-value').textContent=Math.round(offset)+' cm';}
 const panel=$('drawer-controls');panel.hidden=!drawer;if(!drawer)return;
 const chooser=$('drawer-select');if(chooser.options.length!==drawers.length){chooser.replaceChildren(...drawers.map(d=>new Option(d.name,d.id)));}chooser.value=drawer.id;
 const dimensions=drawer.bounds().getSize(new THREE.Vector3()),selected=item(),stored=selected?.storage?.drawerId===drawer.id;
 $('drawer-range').value=String(Math.round(drawer.opening*100));$('drawer-opening').textContent=Math.round(drawer.opening*100)+'%';
 $('drawer-state-note').textContent=drawer.opening>.001?'抽屉未关：关门时会自动收回':'抽屉已关闭';$('drawer-state-note').classList.toggle('is-open',drawer.opening>.001);
 $('drawer-size').textContent=(drawer.estimated?'估算内尺寸：':'内尺寸：')+'宽 '+format(dimensions.x)+' × 深 '+format(dimensions.z)+' × 高 '+format(dimensions.y)+' cm';
 $('drawer-store').disabled=busy||!selected||selected.locked||stored||drawer.opening<.5;
 $('drawer-remove').disabled=busy||!stored;
 $('drawer-close').disabled=busy||drawer.opening===0;$('drawer-open').disabled=busy||drawer.opening===1;$('drawer-range').disabled=busy;
 const list=$('drawer-items');list.replaceChildren();
 for(const record of storedRecords()){const button=document.createElement('button');button.type='button';button.className='drawer-item'+(record.id===selectedId?' active':'');button.textContent=record.name;button.title=record.name;button.onclick=()=>{select(record.id);focus(record.root);};list.append(button);}
 $('drawer-count').textContent=storedRecords().length+' 件';
 if(door){$('door-range').value=String(Math.round(door.opening*100));$('door-opening').textContent=Math.round(door.opening*100)+'%';$('door-state-note').textContent=door.opening>.001?'柜门未关':'柜门已关闭';$('door-state-note').classList.toggle('is-open',door.opening>.001);}
}
function closeOpenDrawers(){
 const open=drawers.filter(entry=>entry.opening>.001);if(!open.length)return false;
 for(const target of open){const previous=target.opening,contents=storedRecords(target);target.setOpening(0);const delta=target.direction.clone().multiplyScalar(-target.travel*previous);for(const record of contents){record.root.position.add(delta);if(record.grounded)record.surfaceY=target.bounds().min.y;}}
 toast('关门前已自动收回 '+open.length+' 个抽屉。');return true;
}
function updateDrawerOpening(value,target=drawer){
 if(!target||busy)return false;
 if(value>.001&&door&&door.opening<.999){door.setOpening(1);toast('柜门已自动打开，避免抽屉与门重叠。');}
 const previous=target.opening,contents=storedRecords(target);target.setOpening(value);
 const acceptedDelta=target.direction.clone().multiplyScalar(target.travel*(target.opening-previous));
 for(const record of contents){record.root.position.add(acceptedDelta);if(record.grounded)record.surfaceY=target.bounds().min.y;}
 changed(false,{skipCollision:true});return true;
}
function animateDrawer(value){
 if(!drawer||busy)return;cancelAnimationFrame(drawerAnimation);const target=drawer,previous=target.opening,start=performance.now();
 const frame=now=>{const progress=Math.min((now-start)/350,1),eased=1-(1-progress)**3;const allowed=updateDrawerOpening(previous+(value-previous)*eased,target);if(progress<1&&allowed)drawerAnimation=requestAnimationFrame(frame);else checkpoint();};
 drawerAnimation=requestAnimationFrame(frame);
}
function storeItem(record,point=null){
 if(!drawer||drawer.opening<.5)throw new Error('请先拉开抽屉至少一半，再放入物品。');
 if(!record||record.locked)throw new Error('请先选中要收纳的物品。');
 const box=boundsOf(record.root),interior=drawer.bounds(),occupied=storedRecords().filter(other=>other.id!==record.id).map(other=>boundsOf(other.root));
 let destination=findStoragePosition(box,interior,occupied);
 if(point)destination=new THREE.Vector3(point.x,interior.min.y,point.z);
 if(!destination)destination=new THREE.Vector3(interior.getCenter(new THREE.Vector3()).x,interior.min.y,interior.getCenter(new THREE.Vector3()).z);
 const center=box.getCenter(new THREE.Vector3());record.root.position.x+=destination.x-center.x;record.root.position.z+=destination.z-center.z;placeOnSurface(record.root,interior.min.y);
 record.surfaceY=interior.min.y;record.grounded=true;record.storage={drawerId:drawer.id};
}
$('drawer-range').oninput=event=>{cancelAnimationFrame(drawerAnimation);updateDrawerOpening(Number(event.target.value)/100);};
$('drawer-range').onchange=()=>checkpoint();
$('drawer-open').onclick=()=>animateDrawer(1);$('drawer-close').onclick=()=>animateDrawer(0);
$('drawer-store').onclick=()=>mutate(record=>{storeItem(record);},{teleport:true});
$('drawer-remove').onclick=()=>mutate(record=>{record.root.position.x=0;record.root.position.z=0;record.storage=null;record.surfaceY=topY();record.grounded=true;placeOnSurface(record.root,topY());},{teleport:true});
$('chair-position-range').oninput=event=>{const value=Number(event.target.value),chair=activeIds.map(id=>records.get(id)).find(record=>record.furniture==='chair');if(!chair)return;select(chair.id);mutate(record=>{record.root.position.z=(record.chairHomeZ??record.root.position.z)+value;});};
$('drawer-focus').onclick=()=>{if(drawer)focus(drawer.group);};
$('drawer-select').onchange=event=>{cancelAnimationFrame(drawerAnimation);drawer=drawers.find(d=>d.id===event.target.value);renderDrawerControls();};
function updateDoorOpening(value){
 if(!door||busy)return false;if(value<.999)closeOpenDrawers();door.setOpening(value);changed(false,{skipCollision:true});return true;
}
function animateDoor(value){if(!door||busy)return;cancelAnimationFrame(doorAnimation);const previous=door.opening,start=performance.now();const frame=now=>{const progress=Math.min((now-start)/450,1),allowed=updateDoorOpening(previous+(value-previous)*(1-(1-progress)**3));if(progress<1&&allowed)doorAnimation=requestAnimationFrame(frame);else checkpoint();};doorAnimation=requestAnimationFrame(frame);}
$('door-range').oninput=event=>{cancelAnimationFrame(doorAnimation);updateDoorOpening(Number(event.target.value)/100);};$('door-range').onchange=()=>checkpoint();
$('door-open').onclick=()=>animateDoor(1);$('door-close').onclick=()=>animateDoor(0);
 $('chair-pull').onclick=()=>{const chair=activeIds.map(id=>records.get(id)).find(r=>r.furniture==='chair');if(!chair)return;select(chair.id);mutate(r=>{r.root.position.z=(r.chairHomeZ??r.root.position.z)+35;});$('chair-position-range').value='35';setMode('drag');focus(chair.root);};
transform.addEventListener('dragging-changed',e=>{controls.enabled=!e.value;if(e.value)gizmoGesture=true;else{renderList();checkpoint();}});
transform.addEventListener('mouseDown',()=>{
 const r=item();
 // Vertical and camera-plane translation explicitly opt out of surface snapping.
 if(r&&mode==='translate'&&transform.axis?.includes('Y')){r.grounded=false;inspector();}
});
transform.addEventListener('objectChange',()=>changed(mode==='scale'));
function point(event){const rect=canvas.getBoundingClientRect();pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);}
function hit(event){point(event);const roots=activeIds.map(id=>records.get(id).root);const hits=raycaster.intersectObjects(roots,true);for(const h of hits){let o=h.object;while(o&&!o.userData.recordId)o=o.parent;if(o?.userData.recordId){const record=records.get(o.userData.recordId);return record.role==='table'?null:record;}}return null;}
function surfacePoint(event){point(event);const t=table();if(t){const hits=raycaster.intersectObject(t.root,true);let fallback=null;for(const hit of hits){if(!hit.face)continue;const normal=hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();const result={point:hit.point.clone(),normal,valid:normal.y>.65,drawerId:hit.object.name.startsWith('Drawer_bottom')||hit.object.userData.storageFloor?hit.object.userData.drawerId:null};if(result.valid)return result;fallback??=result;}return fallback;}const pointOnPlane=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-topY()),new THREE.Vector3());return pointOnPlane?{point:pointOnPlane,normal:new THREE.Vector3(0,1,0),valid:true}:null;}
function hideSurfacePreview(){endpointHit=null;endpointMarker.visible=false;$('surface-readout').hidden=true;$('surface-readout').classList.remove('invalid');}
function updateSurfacePreview(event){const hit=surfacePoint(event);if(!hit){hideSurfacePreview();return;}const p=hit.point.clone();if(snap){p.x=Math.round(p.x);p.z=Math.round(p.z);}endpointHit={...hit,point:p};endpointMarker.material.color.set(hit.valid?themePalette[themeId].accent:'#c88478');endpointMarker.position.copy(p).addScaledVector(hit.normal,.8);endpointMarker.visible=true;const readout=$('surface-readout');readout.hidden=false;readout.classList.toggle('invalid',!hit.valid);$('surface-readout-value').textContent='X '+format(p.x)+' · Y '+format(p.y)+' · Z '+format(p.z)+(hit.valid?'':' · 请指向水平表面');const rect=canvas.getBoundingClientRect();readout.style.left=Math.min(Math.max(event.clientX-rect.left+14,12),rect.width-readout.offsetWidth-12)+'px';readout.style.top=Math.min(Math.max(event.clientY-rect.top+14,52),rect.height-readout.offsetHeight-12)+'px';}
function placeSelected(event){const r=item();if(!r||r.role==='table'){toast('请先选中一个可摆放的物品。');return;}const hit=surfacePoint(event);if(!hit||!hit.valid){toast('请点击桌面或架子的水平表面。');return;}const p=hit.point.clone();if(snap){p.x=Math.round(p.x);p.z=Math.round(p.z);}if(hit.drawerId){drawer=drawers.find(d=>d.id===hit.drawerId);try{storeItem(r,p);}catch(error){toast(error.message);return;}}else{r.storage=null;r.root.position.x=p.x;r.root.position.z=p.z;r.surfaceY=p.y;placeOnSurface(r.root,r.surfaceY);r.grounded=true;}const allowed=changed(false,{teleport:true});renderList();checkpoint();if(allowed)toast('已将 '+r.name+' 放到坐标 X '+format(p.x)+' / Z '+format(p.z)+'。');setMode('translate');}
canvas.addEventListener('pointerdown',event=>{if(busy)return;if(seatViewActive&&event.button===0){event.preventDefault();event.stopImmediatePropagation();seatPan={pointerId:event.pointerId,lastX:event.clientX};controls.enabled=false;canvas.setPointerCapture(event.pointerId);canvas.style.cursor='grabbing';return;}pointerDown={x:event.clientX,y:event.clientY};gizmoGesture=false;if(mode==='place'&&event.button===0){event.preventDefault();event.stopImmediatePropagation();updateSurfacePreview(event);return;}if(event.button!==0||mode!=='drag')return;const r=hit(event);if(!r)return;event.preventDefault();event.stopImmediatePropagation();select(r.id);point(event);const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-r.root.position.y);const p=raycaster.ray.intersectPlane(plane,new THREE.Vector3());if(!p)return;activeDrag={id:r.id,pointerId:event.pointerId,plane,offset:r.root.position.clone().sub(p)};controls.enabled=false;canvas.setPointerCapture(event.pointerId);canvas.style.cursor='grabbing';},true);
canvas.addEventListener('pointermove',event=>{if(!activeDrag||event.pointerId!==activeDrag.pointerId)return;event.preventDefault();event.stopImmediatePropagation();point(event);const p=raycaster.ray.intersectPlane(activeDrag.plane,new THREE.Vector3());if(!p)return;const r=records.get(activeDrag.id);r.root.position.x=p.x+activeDrag.offset.x;r.root.position.z=p.z+activeDrag.offset.z;if(snap){r.root.position.x=Math.round(r.root.position.x);r.root.position.z=Math.round(r.root.position.z);}changed();},true);
canvas.addEventListener('pointermove',event=>{if(!seatPan||event.pointerId!==seatPan.pointerId)return;event.preventDefault();event.stopImmediatePropagation();const deltaX=event.clientX-seatPan.lastX;seatPan.lastX=event.clientX;const distance=camera.position.distanceTo(controls.target);const worldPerPixel=2*distance*Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()/2))/canvas.clientHeight;const shift=-deltaX*worldPerPixel;seatPanOffsetX+=shift;camera.position.x+=shift;controls.target.x+=shift;controls.update();},true);
canvas.addEventListener('pointermove',event=>{if(mode==='place'&&!activeDrag&&!busy)updateSurfacePreview(event);});
canvas.addEventListener('pointerleave',()=>{if(mode==='place')hideSurfacePreview();});
function endDrag(event){if(activeDrag&&event.pointerId===activeDrag.pointerId){event.stopImmediatePropagation();if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);activeDrag=null;controls.enabled=true;canvas.style.cursor='grab';checkpoint();return true;}return false;}
function endSeatPan(event){if(seatPan&&event.pointerId===seatPan.pointerId){event.preventDefault();event.stopImmediatePropagation();if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);seatPan=null;controls.enabled=true;canvas.style.cursor='grab';return true;}return false;}
canvas.addEventListener('pointerup',event=>{if(endSeatPan(event)||endDrag(event))return;if(event.button!==0||!pointerDown||gizmoGesture||busy)return;const distance=Math.hypot(event.clientX-pointerDown.x,event.clientY-pointerDown.y);if(distance>=5)return;if(mode==='place'){event.preventDefault();event.stopImmediatePropagation();placeSelected(event);return;}if(table()){point(event);const first=raycaster.intersectObjects(activeIds.map(id=>records.get(id).root),true)[0];if(first?.object.userData.drawerId){drawer=drawers.find(d=>d.id===first.object.userData.drawerId);renderDrawerControls();animateDrawer(drawer.opening>.5?0:1);return;}if(first?.object.userData.doorId){animateDoor(door.opening>.5?0:1);return;}}const r=hit(event);select(r?.id);},true);
canvas.addEventListener('pointercancel',event=>{if(!endSeatPan(event))endDrag(event);},true);
canvas.addEventListener('dblclick',event=>{const r=hit(event);if(r){select(r.id);focus(r.root);}});
function setBusy(value,text){busy=value;modelLibrary?.setBusy(value);$('loading').hidden=!value;if(text)$('loading-text').textContent=text;for(const id of ['import-layout','upload-zone','import-table','load-real','load-demo','delete-object','confirm-size','center-object','turn-left','turn-right','reset-rotation','export','render-export','view-distance-range','seat-view','seat-distance-range','chair-height-range','person-height','lighting-preset','lighting-intensity','lighting-warmth'])$(id).disabled=value;for(const button of document.querySelectorAll('[data-distance],[data-seat-distance],[data-workspace],[data-projection]'))button.disabled=value;$('size-chart-button').disabled=value||!!item()?.locked;$('add-size-variant').disabled=value||!!item()?.locked;renderReferenceSizes(item());renderDrawerControls();historyButtons();if(!value)inspector();}
// 解析、尺寸归一化和机构准备均在离线对象上完成；失败不会移除当前桌柜。
async function prepareBuffer(buffer,sourceFile,role='item',options={}){
 if(buffer.byteLength>MAX_FILE_SIZE)throw new Error('单个模型不能超过 80 MB，请先简化网格或贴图。');
 inspectGLB(buffer);const gltf=await loader.parseAsync(buffer,'');let hasMesh=false;gltf.scene.traverse(o=>{if(o.isMesh){hasMesh=true;o.castShadow=true;o.receiveShadow=options.icon!=='monitor';const materials=Array.isArray(o.material)?o.material:[o.material];for(const material of materials){if(!material?.isMeshStandardMaterial)continue;const isWood=/wood|pbr|base_basic|transferred/i.test(material.name||'')||role==='table';if(isWood){material.roughness=Math.max(material.roughness??.7,.62);material.metalness=0;material.envMapIntensity=.55;}}}});if(!hasMesh)throw new Error('GLB 中没有网格模型。');
 const reference=role==='item'?prepareReferenceModel(gltf.scene,{category:options.categoryId||'auto',name:options.name||sourceFile,automatic:!!options.photoGenerated}):null;
 if(reference&&options.rotationDeg)reference.orientationRoot.rotation.set(...options.rotationDeg.map(THREE.MathUtils.degToRad));
 const category=reference?.categoryId||inferCategory(options.name||sourceFile),model=reference?.model||(role==='table'&&options.calibrateHeightCm?prepareDeskModel(gltf.scene):gltf.scene);
 const {root,baseSize}=normalizeModel(model,options.targetSize||(role==='table'?140:32)),id=crypto.randomUUID();root.userData.recordId=id;root.userData.isDesk=role==='table';
 const r={id,root,baseSize,name:options.name||sourceFile.replace(/\.glb$/i,''),sourceFile,role,bytes:buffer.byteLength,demo:!!options.demo,calibrated:false,grounded:false,surfaceY:role==='table'?null:topY(),surfaceHeightCm:null,surfaceFootprintCm:null,locked:role==='table'||Boolean(options.locked),icon:options.icon,initialDimensionsCm:null,sizeVariants:[],activeSizeVariantId:null,sizeChartUrl:null,sizeChartName:null,sizeOcrStatus:null,builtinAsset:options.builtinAsset||null};
 const builtin=options.builtinAsset==='desk'?'desk':options.builtinAsset==='monitor'?'monitor':options.demo&&sourceFile==='demo-lamp.glb'?'demo-lamp':options.demo&&sourceFile==='demo-monitor.glb'?'demo-monitor':null;
 r.layoutSource={key:id,sourceFile,role,bytes:buffer.byteLength,builtin,options:{...options},buffer:builtin?null:buffer};
 Object.assign(r,{referenceData:reference?.referenceData,orientationRoot:reference?.orientationRoot,referenceCategoryId:category,referenceSizeIndex:null,photoJobId:options.photoJobId??null});
 if(options.photoGenerated)applyReferenceSize(r,category);
 if(options.dimensions){for(const [index,axis] of AXES.entries())setDimension(r,axis,options.dimensions[index],false);r.calibrated=options.calibrated!==false;}else if(options.calibrateHeightCm){setDimension(r,'y',options.calibrateHeightCm,true);if(options.depthCm)setDimension(r,'z',options.depthCm,false);r.calibrated=options.calibrated!==false;}
 r.surfaceHeightCm=Number.isFinite(options.surfaceHeightCm)?options.surfaceHeightCm:null;r.surfaceFootprintCm=options.surfaceFootprintCm||null;r.initialDimensionsCm=getDimensions(r).toArray();
 if(role==='table')root.position.y=-(r.surfaceHeightCm??getDimensions(r).y);else{root.position.x=options.x??(activeIds.filter(id=>records.get(id).role==='item').length%4-1.5)*18;root.position.z=options.z??0;placeOnSurface(root,topY());}
 if(options.yaw)root.rotation.y=THREE.MathUtils.degToRad(options.yaw);
 const children=[];
 if(role==='table'){
  const dimensions=getDimensions(r);r.surfaceFootprintCm??=[dimensions.x,dimensions.z];
  if(r.surfaceHeightCm===null){const surface=placementReport([],{table:r,surfaceY:0}).surface;r.surfaceHeightCm=surface.max[1]-root.position.y;root.position.y=-r.surfaceHeightCm;r.surfaceFootprintCm=[surface.max[0]-surface.min[0],surface.max[2]-surface.min[2]];}
  r.floorHeightCm=boundsOf(root).min.y;r.drawerSystems=createDrawerSystems(root);r.doorSystem=createDoorSystem(root);
  root.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});
  const chairModel=extractChair(root);
  if(chairModel&&options.includeChair!==false){const box=boundsOf(chairModel),center=box.getCenter(new THREE.Vector3()),geometry=normalizeModel(chairModel,Math.max(...box.getSize(new THREE.Vector3()).toArray())),chairId=crypto.randomUUID();geometry.root.userData.recordId=chairId;geometry.root.position.set(center.x,r.floorHeightCm,center.z);const chairRecord={...r,...geometry,id:chairId,builtinAsset:options.builtinAsset==='desk'?'chair':null,role:'item',furniture:'chair',name:'椅子',locked:false,bytes:0,surfaceHeightCm:null,surfaceFootprintCm:null,surfaceY:r.floorHeightCm,grounded:true,icon:'chair',sizeVariants:[],drawerSystems:undefined,doorSystem:undefined,sourceFile:options.builtinAsset==='desk'?'desk-real.glb#chair':sourceFile+'#chair',calibrated:true,chairHomeZ:center.z};chairRecord.initialDimensionsCm=getDimensions(chairRecord).toArray();children.push(chairRecord);}
 }
 if(role==='item')bindAssetLights(gltf.scene,options.lightEffect);
 return {record:r,children};
}
async function addBuffer(buffer,sourceFile,role='item',options={}){
 const prepared=await prepareBuffer(buffer,sourceFile,role,options),r=prepared.record,old=role==='table'?table():null;
 if(old){cancelAnimationFrame(drawerAnimation);cancelAnimationFrame(doorAnimation);transform.detach();scene.remove(old.root);activeIds=activeIds.filter(id=>id!==old.id);}
 for(const record of [r,...prepared.children]){records.set(record.id,record);activeIds.push(record.id);scene.add(record.root);}
 if(role==='table'){drawers=r.drawerSystems||[];drawer=drawers[0]||null;door=r.doorSystem||null;if(old)for(const id of activeIds){const record=records.get(id);if(record.role==='table')continue;if(record.storage){record.storage=null;record.grounded=true;}if(record.grounded)record.surfaceY=record.furniture==='chair'?r.floorHeightCm:topY();}}
 syncDeskView();surfaceUpdate();rememberPoses();refreshCollision();select(r.id);emit();return r;
}
async function importFiles(files,role='item',options={}){
 if(busy||planDrag)return;const list=[...files];if(!list.length)return;const replacing=role==='table'&&!!table();
 setBusy(true,role==='table'?'正在准备新桌子，原场景保持不变…':'准备导入…');let loaded=0,failed=0,last=null,lastError='';
 for(const [index,file]of list.entries()){try{if(!/\.glb$/i.test(file.name))throw new Error('仅支持 .glb 文件。');if(file.size>MAX_FILE_SIZE)throw new Error('文件超过 80 MB。');$('loading-text').textContent='正在导入 '+(index+1)+'/'+list.length+' · '+file.name;last=await addBuffer(await file.arrayBuffer(),file.name,role,options);loaded++;}catch(e){failed++;lastError=file.name+'：'+e.message;console.warn('GLB import failed',e);}}
 setBusy(false);if(loaded){focus(last.root);checkpoint();toast(role==='table'?(replacing?'已替换当前桌子，其他物品与尺寸保留，可撤销。':'已导入桌子，可撤销。')+(failed?lastError:''):'已导入 '+loaded+' 个模型'+(failed?'，'+failed+' 个失败。'+lastError:'。请在右侧校准真实尺寸。'));}else toast((lastError||'没有导入模型。')+(replacing?' 原桌柜保持不变。':''));
}
async function addLibraryAsset(asset){
 if(busy||planDrag||activeDrag||seatPan||transform.dragging||asset.fixed)return;
 setBusy(true,'正在放入 '+asset.name+'…');
 try{
  const response=await fetch(asset.path);if(!response.ok)throw new Error('模型读取失败，请确认使用项目启动器且 models 目录完整。');
  const r=await addBuffer(await response.arrayBuffer(),asset.path,'item',{...asset.options,name:asset.name});
  checkpoint();focus(r.root);toast('已添加 '+asset.name+'，可继续点击添加另一份。尺寸需核对。');
 }finally{setBusy(false);}
}
async function loadDemo(){if(busy||planDrag)return;if(activeIds.some(id=>records.get(id).demo)){toast('场景中已有示例模型，可直接选择并操作。');return;}setBusy(true,'正在载入示例 GLB…');let loaded=0;try{for(const config of [{file:'demo-lamp.glb',name:'弧光台灯 · 示例',targetSize:38,x:-38,z:-3,icon:'lamp'},{file:'demo-monitor.glb',name:'桌面显示器 · 示例',targetSize:48,x:15,z:-8,icon:'monitor',yaw:-8}]){const response=await fetch('./assets/'+config.file);if(!response.ok)throw new Error('示例文件加载失败');await addBuffer(await response.arrayBuffer(),config.file,'item',{...config,demo:true});loaded++;}select(activeIds.find(id=>records.get(id).demo));home();}catch(e){toast(e.message);}finally{setBusy(false);if(loaded)checkpoint();}}
async function loadRealScene(){if(busy||planDrag)return;const hasDesk=table()?.builtinAsset==='desk',hasMonitor=activeIds.some(id=>records.get(id).builtinAsset==='monitor'),hasChair=activeIds.some(id=>records.get(id).builtinAsset==='chair');if(hasDesk&&hasMonitor){toast('真实桌子和显示器已经在场景中。');return;}setBusy(true,'正在载入你的桌子和显示器…');let loaded=0;try{if(!hasDesk){const response=await fetch('./assets/desk-real.glb');if(!response.ok)throw new Error('桌子 GLB 加载失败');await addBuffer(await response.arrayBuffer(),'agentic_0005_pack_glb_model_material_realwood_upper_bed_200x90.glb','table',{name:'实木床桌柜 · 200 × 90 × 210 cm',builtinAsset:'desk',includeChair:!hasChair,calibrateHeightCm:210,calibrated:true,locked:true,targetSize:210});loaded++;}if(!hasMonitor){const response=await fetch('./assets/monitor-real.glb');if(!response.ok)throw new Error('显示器 GLB 加载失败');const surface=placementReport([],{table:table(),surfaceY:topY()}).surface;await addBuffer(await response.arrayBuffer(),'monitor_demo.glb','item',{name:'我的显示器 · 53.9 × 40.7 × 16.3 cm',builtinAsset:'monitor',dimensions:[53.9,40.7,16.3],calibrated:true,icon:'monitor',x:(surface.min[0]+surface.max[0])/2,z:(surface.min[2]+surface.max[2])/2});loaded++;}select(activeIds.find(id=>records.get(id).builtinAsset==='monitor'));home();setViewDistance(560);toast('已载入你的桌子和显示器，可点击落点或使用缩放工具。');}catch(e){toast(e.message);}finally{setBusy(false);if(loaded)checkpoint();}}
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>{if(button.dataset.mode==='place'&&(!item()||item().role==='table')){toast('请先选中一个可摆放的物品。');return;}setMode(button.dataset.mode);};
$('upload-zone').onclick=()=>$('file-input').click();$('import-table').onclick=()=>$('table-input').click();
$('file-input').onchange=async e=>{await importFiles(e.target.files);e.target.value='';};$('table-input').onchange=async e=>{await importFiles(e.target.files,'table');e.target.value='';};
let dragDepth=0;document.addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();dragDepth++;$('drop-overlay').hidden=false;}});document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}});document.addEventListener('dragleave',e=>{if(e.dataTransfer?.types.includes('Files')){dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('drop-overlay').hidden=true;}});document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop-overlay').hidden=true;if(e.dataTransfer?.files.length)importFiles(e.dataTransfer.files);});
$('load-real').onclick=loadRealScene;$('load-demo').onclick=loadDemo;$('view-home').onclick=home;$('view-focus').onclick=()=>focus(item()?.root);$('seat-view').onclick=()=>{if(seatViewActive){setSeatViewActive(false);return;}seatPanOffsetX=0;setSeatView();};$('seat-distance-range').oninput=e=>setSeatView(Number(e.target.value));for(const button of document.querySelectorAll('[data-seat-distance]'))button.onclick=()=>setSeatView(Number(button.dataset.seatDistance));$('chair-height-range').oninput=e=>{personHeight=THREE.MathUtils.clamp(Number($('person-height').value)||170,120,220);chairHeightRatio=(Number(e.target.value)-2)/personHeight;setSeatView(seatDistance);};$('person-height').onchange=()=>setSeatView(seatDistance);
$('view-top').onclick=()=>setProjection('top');
$('grid-toggle').onclick=()=>{grid.visible=!grid.visible;origin.visible=grid.visible;$('grid-toggle').classList.toggle('active',grid.visible);$('grid-toggle').setAttribute('aria-pressed',String(grid.visible));};
$('lighting-preset').onchange=event=>{lightingPresetId=event.target.value;applyLighting();};$('lighting-intensity').oninput=event=>{lightingIntensity=THREE.MathUtils.clamp(Number(event.target.value)/100,.5,1.5);applyLighting();};$('lighting-warmth').oninput=event=>{lightingWarmth=THREE.MathUtils.clamp(Number(event.target.value),-100,100);applyLighting();};
$('view-distance-range').oninput=e=>setViewDistance(Number(e.target.value));
for(const button of document.querySelectorAll('[data-distance]'))button.onclick=()=>setViewDistance(Number(button.dataset.distance));
$('size-chart-button').onclick=()=>$('size-chart-file').click();
$('size-chart-file').onchange=async e=>{const file=e.target.files?.[0],r=item();e.target.value='';if(!file||!r||r.locked)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>MAX_SIZE_CHART_BYTES){toast('请选择 20 MB 以内的 PNG、JPG 或 WebP 尺寸图。');return;}r.sizeChartUrl=URL.createObjectURL(file);sizeChartUrls.add(r.sizeChartUrl);r.sizeChartName=file.name;r.sizeOcrStatus='正在识别商品尺寸图…';setBusy(true,'正在准备本地 OCR…');if(item()?.id===r.id)renderSizeVariants(r);try{const text=await recognizeSizeChart(file),variants=parseSizeChart(text);if(variants.length){r.sizeVariants=variants.map(variant=>({...variant,id:crypto.randomUUID(),saved:true,recognized:true}));r.activeSizeVariantId=null;r.sizeOcrStatus='识别到 '+variants.length+' 个候选规格，请核对商品本体尺寸。';toast('识别出 '+variants.length+' 个规格候选，核对后可直接选择。');}else{r.sizeOcrStatus='没有识别到尺寸，可手动添加规格。';toast('没有识别到规格尺寸，可手动添加。');}}catch(error){r.sizeOcrStatus='识别失败，可手动添加规格。';console.warn('Size chart OCR failed',error);toast('尺寸图识别失败：'+error.message);}finally{setBusy(false);if(item()?.id===r.id)renderSizeVariants(r);checkpoint();}};
$('remove-size-chart').onclick=()=>{const r=item();if(!r||!r.sizeChartUrl)return;r.sizeChartUrl=null;r.sizeChartName=null;r.sizeOcrStatus=null;renderSizeVariants(r);checkpoint();};
$('add-size-variant').onclick=()=>{const r=item();if(!r||r.locked||busy)return;r.sizeVariants.push({id:crypto.randomUUID(),name:'规格 '+(r.sizeVariants.length+1),dimensions:getDimensions(r).toArray(),saved:false});renderSizeVariants(r);checkpoint();};
window.addEventListener('beforeunload',()=>{deskView.dispose();for(const url of sizeChartUrls)URL.revokeObjectURL(url);if(sizeOcrWorkerPromise)sizeOcrWorkerPromise.then(worker=>worker.terminate()).catch(()=>{});});
$('grounded').onchange=()=>mutate(r=>{r.grounded=$('grounded').checked;if(r.grounded){r.surfaceY=r.furniture==='chair'?floorHeight:drawers.find(d=>d.id===r.storage?.drawerId)?.bounds().min.y??topY();placeOnSurface(r.root,r.surfaceY);}attach();});
$('snap').onchange=()=>{snap=$('snap').checked;transform.setTranslationSnap(snap?1:null);transform.setRotationSnap(snap?THREE.MathUtils.degToRad(15):null);transform.setScaleSnap(snap ? .05 : null);};
for(const axis of AXES){
 $('p'+axis).onchange=e=>mutate(r=>{const v=Number(e.target.value);if(e.target.value.trim()===''||!Number.isFinite(v)||Math.abs(v)>100000)throw new Error('位置请输入 -100000 至 100000 cm 的数字。');r.root.position[axis]=v;if(axis==='y')r.grounded=false;});
 $('r'+axis).onchange=e=>mutate(r=>{const v=Number(e.target.value);if(e.target.value.trim()===''||!Number.isFinite(v)||Math.abs(v)>360000)throw new Error('请输入有效的旋转角度。');r.root.rotation[axis]=THREE.MathUtils.degToRad(v%360);});
 $('d'+axis).onchange=e=>mutate(r=>{setDimension(r,axis,Number(e.target.value),$('uniform').checked);r.activeSizeVariantId=null;},{invalid:true});
}
for(const button of document.querySelectorAll('[data-preset-size]'))button.onclick=()=>mutate(r=>{const dimensions=getDimensions(r).toArray();const largest=dimensions.indexOf(Math.max(...dimensions));setDimension(r,AXES[largest],Number(button.dataset.presetSize),true);r.activeSizeVariantId=null;},{invalid:true});
$('confirm-size').onclick=()=>mutate(r=>{r.calibrated=true;toast('已标记为尺寸已校准。');});
$('turn-left').onclick=()=>mutate(r=>r.root.rotation.y-=Math.PI/4);$('turn-right').onclick=()=>mutate(r=>r.root.rotation.y+=Math.PI/4);$('reset-rotation').onclick=()=>mutate(r=>r.root.rotation.set(0,0,0));
$('center-object').onclick=()=>mutate(r=>{r.root.position.x=0;r.root.position.z=0;});
function removeSelected(){if(!item()||busy||planDrag)return;const r=item();if(r.locked){toast('桌子是固定资产；请在资产页使用“替换当前桌子 GLB”。');return;}transform.detach();scene.remove(r.root);activeIds=activeIds.filter(id=>id!==r.id);surfaceUpdate();refreshCollision();select(activeIds.at(-1));checkpoint();emit();toast('已删除 '+r.name+'，可撤销恢复。');}
$('delete-object').onclick=removeSelected;$('undo').onclick=()=>{if(!busy&&!planDrag)restore(history.undo());};$('redo').onclick=()=>{if(!busy&&!planDrag)restore(history.redo());};
function exportLayout(){
 const state=exportState(),models={};
 for(const object of state.objects){
  const r=records.get(object.id),source=r.layoutSource;object.modelKey=source.key;object.modelPart=r.furniture==='chair'?'chair':'root';
  object.sizeVariants=structuredClone(r.sizeVariants);object.activeSizeVariantId=r.activeSizeVariantId;
  if(!Object.hasOwn(models,source.key))models[source.key]={sourceFile:source.sourceFile,role:source.role,builtin:source.builtin,options:source.options,...(source.buffer?{data:encodeModel(source.buffer)}:{})};
 }
 const blob=new Blob([JSON.stringify({...state,models,note:'使用“导入布局”恢复当前方案；自定义 GLB 已内嵌，内置资源由本机加载。'},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='DeskVerse-layout.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出可恢复的布局 JSON（含自定义模型）。');
}
$('export').onclick=exportLayout;$('render-json').onclick=exportLayout;
// 全部资源离线准备成功后才替换当前方案，旧对象留给撤销及另一方案。
async function importLayout(files){
 if(busy||planDrag||activeDrag||seatPan||transform.dragging)return;
 const list=[...files],jsonFiles=list.filter(file=>/\.json$/i.test(file.name));
 if(!list.length)return;
 if(jsonFiles.length!==1){toast('请选择一个布局 JSON；旧版布局可同时选择所需的原始 GLB。');return;}
 const staged=[],groups=new Map();let committed=false;
 const disposePrepared=()=>{const geometries=new Set(),materials=new Set(),textures=new Set();for(const r of staged)r.root.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of (Array.isArray(node.material)?node.material:[node.material]))if(material){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});for(const value of [...geometries,...materials,...textures])value.dispose();};
 setBusy(true,'正在读取布局，原场景保持不变…');
 try{
  const state=validateLayout(JSON.parse(await jsonFiles[0].text())),items=[],used=new Set();
  if(state.lighting&&!Object.hasOwn(lightingPresets,state.lighting.preset))throw new Error('未知光照预设。');
  for(const object of state.objects){
   const legacy=legacyModel(object),descriptor=object.modelKey!==undefined?state.models[object.modelKey]:legacy,key=object.modelKey??legacy.key;
   if(!descriptor||typeof descriptor.sourceFile!=='string'||!['table','item'].includes(descriptor.role)||descriptor.builtin&&!Object.hasOwn(LAYOUT_ASSETS,descriptor.builtin))throw new Error('模型来源无效：'+object.name);
   const part=object.modelPart??legacy.part;if(!['root','chair'].includes(part))throw new Error('模型部件无效。');
   let prepared=groups.get(key);
   if(!prepared){
    let buffer,options=descriptor.options||{},asset=descriptor.builtin?LAYOUT_ASSETS[descriptor.builtin]:null;
    // 只转交现有导入器使用的字段，禁止 JSON 注入资源 URL 或其他运行时对象。
    options=Object.fromEntries(['name','categoryId','photoGenerated','photoJobId','demo','locked','icon','targetSize','dimensions','rotationDeg','calibrated','calibrateHeightCm','depthCm','surfaceHeightCm','surfaceFootprintCm','x','z','yaw','lightEffect'].filter(key=>Object.hasOwn(options,key)).map(key=>[key,options[key]]));
    if(options.lightEffect!==undefined&&!['floor-lamp','light-strip'].includes(options.lightEffect))throw new Error('未知灯具光效。');
    for(const key of ['targetSize','calibrateHeightCm','depthCm'])if(options[key]!==undefined&&(!Number.isFinite(options[key])||options[key]<=0||options[key]>100000))throw new Error('模型初始尺寸无效。');
    for(const key of ['surfaceHeightCm','x','z','yaw'])if(options[key]!=null&&(!Number.isFinite(options[key])||Math.abs(options[key])>100000))throw new Error('模型初始位置无效。');
    for(const key of ['dimensions','surfaceFootprintCm'])if(options[key]!=null&&(!Array.isArray(options[key])||options[key].length!==(key==='dimensions'?3:2)||options[key].some(n=>!Number.isFinite(n)||n<=0||n>100000)))throw new Error('模型尺寸数据无效。');
    if(options.rotationDeg!=null&&(!Array.isArray(options.rotationDeg)||options.rotationDeg.length!==3||options.rotationDeg.some(n=>!Number.isFinite(n)||Math.abs(n)>360000)))throw new Error('模型初始朝向无效。');
    if(asset){
     if(descriptor.role!==asset.role)throw new Error('内置模型类型不匹配。');
     const response=await fetch('./assets/'+asset.file);if(!response.ok)throw new Error('内置模型加载失败：'+asset.file);buffer=await response.arrayBuffer();options={...asset.options,...options};
    }else if(descriptor.data!==undefined)buffer=decodeModel(descriptor.data);
    else{
     const matching=list.filter(file=>file.name===descriptor.sourceFile);
     if(matching.length>1)throw new Error('存在同名 GLB，请只选择一个：'+descriptor.sourceFile);
     const cached=[...records.values()].find(r=>r.layoutSource?.sourceFile===descriptor.sourceFile)?.layoutSource;
     if(matching[0]){if(matching[0].size>MAX_FILE_SIZE)throw new Error('模型超过 80 MB。');buffer=await matching[0].arrayBuffer();}
     else if(cached?.buffer){buffer=cached.buffer;options=cached.options;}
     else throw new Error('缺少模型 '+descriptor.sourceFile+'。请重新点击“导入布局”，同时选择 JSON 和该原始 GLB。');
    }
    $('loading-text').textContent='正在恢复 '+object.name+'…';
    prepared=await prepareBuffer(buffer,descriptor.sourceFile,descriptor.role,{...options,includeChair:true});
    staged.push(prepared.record,...prepared.children);groups.set(key,prepared);
   }
   const r=part==='chair'?prepared.children.find(r=>r.furniture==='chair'):prepared.record;
   if(!r||used.has(r.id)||r.role!==object.role)throw new Error('布局模型部件缺失或重复：'+object.name);used.add(r.id);
   if(object.modelOrientation)setModelOrientation(r,new THREE.Quaternion().fromArray(object.modelOrientation));
   r.root.scale.fromArray(object.scale);r.name=object.name;r.calibrated=!!object.calibrated;r.grounded=!!object.grounded;r.surfaceY=object.surfaceY??null;
   r.root.position.fromArray(object.position);r.root.rotation.set(...object.rotation.map(THREE.MathUtils.degToRad),'XYZ');
   r.sizeVariants=structuredClone(object.sizeVariants||[]);r.activeSizeVariantId=object.activeSizeVariantId??null;r.storage=object.storage?{drawerId:object.storage.drawerId}:null;
   r.referenceSizeIndex=object.referenceSize?.index??null;r.referenceCategoryId=object.referenceSize?.category??r.referenceCategoryId;
   items.push({id:r.id,name:r.name,position:r.root.position.toArray(),rotation:r.root.rotation.toArray(),scale:r.root.scale.toArray(),orientation:r.orientationRoot?.quaternion.toArray(),grounded:r.grounded,surfaceY:r.surfaceY,storage:r.storage,calibrated:r.calibrated,sizeVariants:r.sizeVariants,activeSizeVariantId:r.activeSizeVariantId,referenceCategoryId:r.referenceCategoryId,referenceSizeIndex:r.referenceSizeIndex});
  }
  const importedTable=staged.find(r=>used.has(r.id)&&r.role==='table');
  for(const entry of state.drawers||[])if(!importedTable?.drawerSystems?.some(d=>d.id===entry.id))throw new Error('布局抽屉与模型不匹配。');
  if(state.doors?.length&&!importedTable?.doorSystem)throw new Error('布局柜门与模型不匹配。');
  checkpoint();for(const r of staged)records.set(r.id,r);committed=true;
  restore({items,selectedId:items.find(r=>!records.get(r.id).locked)?.id,drawerOpenings:Object.fromEntries((state.drawers||[]).map(d=>[d.id,d.opening])),doorOpening:state.doors?.[0]?.opening??1});
  checkpoint();setSeatViewActive(false);
  if(state.appearance?.theme)setTheme(state.appearance.theme);
  if(state.lighting){lightingPresetId=state.lighting.preset;lightingIntensity=state.lighting.intensity;lightingWarmth=state.lighting.warmth;applyLighting();}
  if(state.view){setProjection(state.view.mode);controls.update();const damping=controls.enableDamping;controls.enableDamping=false;controls.update();camera.position.fromArray(state.view.position);controls.target.fromArray(state.view.target);camera.zoom=state.view.zoom;camera.updateProjectionMatrix();controls.update();controls.enableDamping=damping;}
  emit();toast('已恢复 '+items.length+' 个模型到当前方案 '+layouts.id.toUpperCase()+'，可撤销；另一方案未改动。');
 }catch(error){if(!committed)disposePrepared();toast('导入布局失败：'+error.message+(committed?'':' 原场景保持不变。'));}
 finally{setBusy(false);}
}
$('import-layout').onclick=()=>{if(!busy&&!planDrag)$('layout-input').click();};
$('layout-input').onchange=async event=>{const files=[...event.target.files];event.target.value='';await importLayout(files);};
const renderDialog=$('render-dialog'),renderPreview=document.createElement('canvas');let imageExporting=false;
for(const preset of RENDER_PRESETS)$('render-angle').add(new Option(preset.label,preset.id));
for(const size of RENDER_SIZES)$('render-resolution').add(new Option(size.label,size.id));
$('render-angle').value='current';$('render-resolution').value='2k';$('render-preview').append(renderPreview);
// 复用场景和渲染器，灯光、环境、曝光与阴影全部沿用当前设置；只暂时隐藏编辑辅助。
function captureRender(width,height,output){const roots=activeIds.length?activeIds.map(id=>records.get(id).root):[reference],bounds=new THREE.Box3();for(const root of roots)bounds.union(boundsOf(root));const exportCamera=createRenderCamera(camera,bounds,$('render-angle').value,width/height,roots);try{deskView.set(table()?.root,false);return renderSceneCanvas({renderer,scene,camera:exportCamera,width,height,helpers:[transform.getHelper(),outline,collisionOutline,endpointMarker,grid,origin],canvas:output});}finally{syncDeskView();renderer.render(scene,camera);}}
function renderFailure(error){$('render-error').textContent=error.message||'渲染失败，请尝试较低分辨率。';$('render-error').hidden=false;$('render-status').textContent='未生成图片，当前场景保持不变。';}
function updateRenderPreview(){if(!renderDialog.open||imageExporting)return;$('render-error').hidden=true;const size=RENDER_SIZES.find(size=>size.id===$('render-resolution').value);$('render-lighting').textContent=lightingPresets[lightingPresetId].label+' · 亮度 '+Math.round(lightingIntensity*100)+'% · 冷暖 '+(lightingWarmth>0?'+':'')+lightingWarmth+'（'+$('lighting-warmth-value').textContent+'）';try{captureRender(960,540,renderPreview);$('render-status').textContent='方案 '+layouts.id.toUpperCase()+' · PNG '+size.width+' × '+size.height+' · 预览使用相同视角与光照';}catch(error){renderFailure(error);}}
$('render-export').onclick=()=>{if(busy||planDrag||activeDrag||seatPan||transform.dragging){toast('请等待载入或拖动结束后再导出。');return;}$('render-angle').value='current';renderDialog.showModal();updateRenderPreview();};
$('render-close').onclick=()=>{if(!imageExporting)renderDialog.close();};
renderDialog.addEventListener('cancel',event=>{if(imageExporting)event.preventDefault();});
renderDialog.addEventListener('close',()=>{renderPreview.width=renderPreview.height=0;});
$('render-angle').onchange=updateRenderPreview;$('render-resolution').onchange=updateRenderPreview;
$('render-save').onclick=async()=>{if(imageExporting)return;imageExporting=true;renderDialog.setAttribute('aria-busy','true');for(const id of ['render-save','render-close','render-angle','render-resolution','render-json'])$(id).disabled=true;$('render-error').hidden=true;$('render-status').textContent='正在按当前场景光照渲染高清 PNG…';let image;try{await new Promise(resolve=>requestAnimationFrame(resolve));const size=RENDER_SIZES.find(size=>size.id===$('render-resolution').value),filename='DeskVerse-'+layouts.id.toUpperCase()+'-'+$('render-angle').value+'-'+size.width+'x'+size.height+'.png';image=captureRender(size.width,size.height);const blob=await new Promise((resolve,reject)=>image.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG 编码失败，请尝试较低分辨率。')),'image/png'));const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);$('render-status').textContent='已生成 '+size.width+' × '+size.height+' PNG，保留当前灯光与场景效果。';toast('高清效果图已生成：'+filename);}catch(error){renderFailure(error);}finally{if(image)image.width=image.height=0;imageExporting=false;renderDialog.removeAttribute('aria-busy');for(const id of ['render-save','render-close','render-angle','render-resolution','render-json'])$(id).disabled=false;}};
window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||busy||planDrag||renderDialog.open||$('photo-dialog').open)return;const key=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&key==='z'){e.preventDefault();restore(e.shiftKey?history.redo():history.undo());return;}if(e.ctrlKey||e.metaKey||e.altKey)return;if({v:'drag',g:'translate',r:'rotate',s:'scale'}[key]){e.preventDefault();setMode({v:'drag',g:'translate',r:'rotate',s:'scale'}[key]);}if(key==='f')focus(item()?.root);if(key==='h')home();if(key==='t')$('view-top').click();if(key==='escape'){if(seatViewActive)setSeatViewActive(false);else select(null);}if(key==='delete'||key==='backspace'){e.preventDefault();removeSelected();}});
// Public integration API: one source of truth for teammate #4. All numbers use cm/degrees.
window.deskverse={getState:exportState,select,setTransform(id,patch){if(busy||planDrag)throw new Error('请等待模型加载或二维拖动结束');const r=records.get(id);if(!r||!activeIds.includes(id))throw new Error('Unknown object id');if(r.locked)throw new Error('固定资产不能修改');
 const staged={};for(const key of ['position','rotation','scale']){if(patch[key]!==undefined){const v=patch[key];if(!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite))throw new Error(key+' must contain three finite numbers');if(key==='scale'&&v.some(n=>n<=0||n>100000))throw new Error('Invalid scale');if(key!=='scale'&&v.some(n=>Math.abs(n)>100000))throw new Error('Transform out of range');staged[key]=v;}}
 select(id);if(staged.position){if(staged.position[1]!==r.root.position.y&&patch.grounded===undefined)r.grounded=false;r.root.position.fromArray(staged.position);}if(staged.rotation)r.root.rotation.set(...staged.rotation.map(THREE.MathUtils.degToRad));if(staged.scale){r.root.scale.fromArray(staged.scale);r.calibrated=false;r.referenceSizeIndex=null;}if(typeof patch.grounded==='boolean'&&r.role!=='table')r.grounded=patch.grounded;const accepted=changed();attach();renderList();checkpoint();return {accepted,collision:{...collisionStatus}};
},importFiles};
updatePlacement();checkpoint();setMode('translate');
$('model-library-count').textContent=String(MODEL_ASSETS.length);
modelLibrary=initModelLibrary({container:$('model-library'),loader,onAdd:addLibraryAsset,onError:error=>toast(error.message)});
window.addEventListener('beforeunload',()=>modelLibrary.dispose(),{once:true});
renderer.setAnimationLoop(()=>{if(!renderDialog.open)controls.update();renderer.render(scene,camera);});
initPhotoGeneration({toast,isInScene:id=>activeIds.some(idInScene=>records.get(idInScene).sourceFile==='DeskVerse-'+id+'.glb'),importModel:async(file,job)=>{
 if(busy)throw new Error('场景正在载入其他模型，请稍后再放入。');
 await importFiles([file],'item',{name:job.name,categoryId:job.categoryId,photoGenerated:true,photoJobId:job.id});const record=activeIds.map(id=>records.get(id)).find(record=>record.sourceFile===file.name);
 if(!record)return false;record.name=job.name;renderList();inspector();emit();checkpoint();return true;
}}).catch(error=>{console.warn('Photo generation initialization failed',error);toast('照片建模初始化失败，请刷新页面。');});
await loadRealScene();
modelLibrary.startPreviews();
}
