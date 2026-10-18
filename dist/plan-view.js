const SVG_NS='http://www.w3.org/2000/svg';
let nextClipId=0;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const planStates=new WeakMap();
const DRAG_THRESHOLD=4;

function objectId(svg,target){
 const group=target?.closest?.('[data-object-id]');
 return group&&svg.contains(group)?group.getAttribute('data-object-id'):null;
}

function focusObject(svg,id){
 for(const group of svg.querySelectorAll('[data-object-id]'))if(group.getAttribute('data-object-id')===String(id)){group.focus({preventScroll:true});break;}
}

function markDragging(svg,state){
 const gesture=state.gesture,dragging=Boolean(gesture?.started);
 svg.classList.toggle('plan-dragging',dragging);svg.dataset.planDragging=String(dragging);
 if(dragging)svg.dataset.draggingObjectId=String(gesture.id);else delete svg.dataset.draggingObjectId;
 for(const group of svg.querySelectorAll('[data-object-id]')){
  const active=dragging&&group.getAttribute('data-object-id')===String(gesture.id);
  group.classList.toggle('is-dragging',active);group.dataset.dragging=String(active);
 }
}

function planState(svg){
 let state=planStates.get(svg);if(state)return state;
 const document=svg.ownerDocument,keyboardTarget=document.defaultView||document;
 state={report:null,onSelect:null,dragCallbacks:null,projection:null,gesture:null,clickCandidate:null,suppressClick:false,touchAction:svg.style.touchAction};
 planStates.set(svg,state);
 const finish=cancelled=>{
  const gesture=state.gesture;if(!gesture)return;
  // 先清空手势，主动释放捕获产生的 lostpointercapture 才不会重复结束。
  state.gesture=null;keyboardTarget.removeEventListener('keydown',escape,true);
  state.clickCandidate=!cancelled&&!gesture.started?gesture.id:null;
  if(gesture.started||cancelled)state.suppressClick=true;
  markDragging(svg,state);
  try{if(svg.hasPointerCapture(gesture.pointerId))svg.releasePointerCapture(gesture.pointerId);}catch{}
  if(gesture.started)gesture.callbacks.onEnd(gesture.id,cancelled);
  if(gesture.started||document.activeElement===document.body||svg.contains(document.activeElement))focusObject(svg,gesture.id);
 };
 const escape=event=>{
  if(event.key!=='Escape'||!state.gesture)return;
  event.preventDefault();event.stopPropagation();finish(true);
 };
 const move=event=>{
  const gesture=state.gesture;if(!gesture||event.pointerId!==gesture.pointerId)return;
  if(!gesture.started&&Math.hypot(event.clientX-gesture.clientX,event.clientY-gesture.clientY)<DRAG_THRESHOLD)return;
  event.preventDefault();
  if(!gesture.started){
   state.suppressClick=true;
   if(!gesture.callbacks.onStart(gesture.id)){finish(true);return;}
   gesture.started=true;markDragging(svg,state);
  }
  const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
  const local=point.matrixTransform(gesture.inverse),dx=(local.x-gesture.origin.x)/gesture.projection.scale,dz=(local.y-gesture.origin.y)/gesture.projection.scale;
  if(dx===gesture.dx&&dz===gesture.dz)return;
  gesture.dx=dx;gesture.dz=dz;gesture.callbacks.onMove(gesture.id,dx,dz);
 };
 svg.addEventListener('pointerdown',event=>{
  if(state.gesture||event.button!==0||event.isPrimary===false)return;
  state.clickCandidate=null;state.suppressClick=false;
  const id=objectId(svg,event.target),item=state.report?.items.find(item=>String(item.id)===id),callbacks=state.dragCallbacks;
  if(!item||!state.projection||!callbacks)return;
  const ctm=svg.getScreenCTM();if(!ctm)return;
  let inverse;try{inverse=ctm.inverse();}catch{return;}
  if(![inverse.a,inverse.b,inverse.c,inverse.d,inverse.e,inverse.f].every(Number.isFinite))return;
  const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
  // 屏幕到 SVG 的矩阵和世界投影同时冻结，重绘、留白和 CSS 缩放都不会改变拖动基准。
  state.gesture={id:item.id,pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,inverse,origin:point.matrixTransform(inverse),projection:state.projection,callbacks,started:false,dx:0,dz:0};
  try{svg.setPointerCapture(event.pointerId);}catch{state.gesture=null;return;}
  keyboardTarget.addEventListener('keydown',escape,true);event.preventDefault();
 });
 svg.addEventListener('pointermove',move);
 svg.addEventListener('pointerup',event=>{
  if(event.pointerId!==state.gesture?.pointerId)return;
  move(event);finish(false);
 });
 svg.addEventListener('pointercancel',event=>{if(event.pointerId===state.gesture?.pointerId)finish(true);});
 svg.addEventListener('lostpointercapture',event=>{if(event.pointerId===state.gesture?.pointerId)finish(true);});
 svg.addEventListener('click',event=>{
  if(event.button!==0||state.gesture)return;
  if(state.suppressClick){state.suppressClick=false;state.clickCandidate=null;event.preventDefault();return;}
  const id=objectId(svg,event.target)??state.clickCandidate;state.clickCandidate=null;
  const item=state.report?.items.find(item=>String(item.id)===String(id));
  if(!item)return;
  state.onSelect(item.id);focusObject(svg,item.id);
 });
 svg.addEventListener('keydown',event=>{
  if(state.gesture||event.key!=='Enter'&&event.key!==' ')return;
  const id=objectId(svg,event.target),item=state.report?.items.find(item=>String(item.id)===id);
  if(!item)return;
  event.preventDefault();state.suppressClick=false;state.onSelect(item.id);
 });
 return state;
}

export function renderPlan(svg,report,onSelect,dragCallbacks=null){
 const state=planState(svg),document=svg.ownerDocument,focusedId=svg.contains(document.activeElement)?objectId(svg,document.activeElement):null;
 state.report=report;state.onSelect=onSelect;state.dragCallbacks=dragCallbacks;
 svg.dataset.planDraggable=String(Boolean(dragCallbacks));svg.style.touchAction=dragCallbacks?'none':state.touchAction;
 svg.setAttribute('aria-description',dragCallbacks?'点击或按 Enter、空格选中物品；拖动物品沿 XZ 平面移动并保持高度，按 Escape 取消拖动。':'点击或按 Enter、空格选中物品。');
 const element=(tag,attributes={},text=null)=>{const node=document.createElementNS(SVG_NS,tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));if(text!==null)node.textContent=text;return node;};
 svg.replaceChildren();svg.setAttribute('viewBox','0 0 360 240');
 if(!report?.surface){svg.append(element('text',{x:180,y:110,'text-anchor':'middle',class:'plan-empty'},'平面图等待场景数据'));return;}
 const {surface,items,selected}=report,width=Math.max(1,surface.max[0]-surface.min[0]),depth=Math.max(1,surface.max[2]-surface.min[2]);
 const centerX=(surface.min[0]+surface.max[0])/2,centerZ=(surface.min[2]+surface.max[2])/2;
 // 视野最多扩到桌面尺寸的两倍；远处物品只显示边缘提示，不让异常坐标把桌面缩成一点。
 const limit={minX:centerX-width,maxX:centerX+width,minZ:centerZ-depth,maxZ:centerZ+depth};
 let minX=surface.min[0],maxX=surface.max[0],minZ=surface.min[2],maxZ=surface.max[2];
 // 抽屉内腔也会绘制轮廓，必须参与居中，避免左侧被裁切而右侧留白。
 for(const shapes of [items,report.supports||[]]){
  for(const shape of shapes)for(const [x,z] of shape.polygon){minX=Math.min(minX,clamp(x,limit.minX,limit.maxX));maxX=Math.max(maxX,clamp(x,limit.minX,limit.maxX));minZ=Math.min(minZ,clamp(z,limit.minZ,limit.maxZ));maxZ=Math.max(maxZ,clamp(z,limit.minZ,limit.maxZ));}
 }
 const scale=Math.min(308/Math.max(1,maxX-minX),164/Math.max(1,maxZ-minZ));
 const projection=state.gesture?.projection||{scale,offsetX:180-(minX+maxX)*scale/2,offsetZ:106-(minZ+maxZ)*scale/2};state.projection=projection;
 const project=([x,z])=>[x*projection.scale+projection.offsetX,z*projection.scale+projection.offsetZ];
 const points=polygon=>polygon.map(point=>project(point).join(',')).join(' ');
 const clipId='plan-clip-'+(++nextClipId),defs=element('defs'),clip=element('clipPath',{id:clipId});
 clip.append(element('rect',{x:18,y:20,width:324,height:176}));defs.append(clip);svg.append(defs);
 svg.append(element('title',{},`${surface.label}；X 向右，Z 向下；${surface.estimated?'桌面为估算范围':'桌面按实际轮廓'}，物品占地为保守投影凸包`));
 const plot=element('g',{'clip-path':`url(#${clipId})`});svg.append(plot);
 const outline=surface.polygon||[[surface.min[0],surface.min[2]],[surface.max[0],surface.min[2]],[surface.max[0],surface.max[2]],[surface.min[0],surface.max[2]]];
 const rings=surface.rings?.length?surface.rings:[outline],path=rings.filter(ring=>ring.length>=3).map(ring=>'M'+ring.map(point=>project(point).join(',')).join('L')+'Z').join('');
 const desktop=element('path',{d:path,'fill-rule':'evenodd','clip-rule':'evenodd',class:'plan-surface'});desktop.append(element('title',{},surface.label+(surface.estimated?'（估算范围）':'')));plot.append(desktop);
 for(const support of report.supports||[]){
  const polygon=element('polygon',{points:points(support.polygon),class:'plan-support'});polygon.append(element('title',{},support.label+(support.estimated?'（估算内腔）':'')));plot.append(polygon);
 }
 const conflicts=new Set(selected?.conflict.ids||[]);let restoreFocus=null;
 for(const item of items){
  if(!item.polygon.length)continue;
  const group=element('g',{class:'plan-object',role:'button',tabindex:0,'data-object-id':item.id,'aria-label':`${item.name}${item.selected?'，已选中':''}`,'aria-pressed':item.selected?'true':'false','aria-description':dragCallbacks?'按 Enter 或空格选中；拖动可沿 XZ 平面移动，保持高度；Escape 取消拖动。':'按 Enter 或空格选中。'});
  group.append(element('title',{},`${item.name} · ${item.scope==='desktop'?'桌面':item.scope==='drawer'?'抽屉':item.scope==='floor'?'地面':'支撑面未知'}`));
  const classes='plan-item'+(item.selected?' selected':'')+(conflicts.has(item.id)||item.selected&&conflicts.size?' conflict':'');
  group.append(element('polygon',{points:points(item.polygon),class:classes}));
  const projected=item.polygon.map(project),xs=projected.map(p=>p[0]),zs=projected.map(p=>p[1]);
  const offscreen=Math.max(...xs)<18||Math.min(...xs)>342||Math.max(...zs)<20||Math.min(...zs)>196;
  if(offscreen||item.selected){
   const x=clamp((Math.min(...xs)+Math.max(...xs))/2,64,296),z=clamp((Math.min(...zs)+Math.max(...zs))/2,34,184);
   group.append(element('text',{x,y:z,'text-anchor':'middle',class:offscreen?'plan-label plan-offscreen':'plan-label'},item.name+(offscreen?' · 超出视图':'')));
  }
  plot.append(group);if(String(item.id)===focusedId)restoreFocus=group;
 }
 if(!items.length)svg.append(element('text',{x:180,y:106,'text-anchor':'middle',class:'plan-empty'},'尚无物品，导入后显示占地'));
 svg.append(element('line',{x1:26,y1:211,x2:74,y2:211,class:'plan-axis axis-x'}),element('text',{x:80,y:215,class:'plan-axis-label axis-x'},'+X'));
 svg.append(element('line',{x1:26,y1:211,x2:26,y2:232,class:'plan-axis axis-z'}),element('text',{x:34,y:234,class:'plan-axis-label axis-z'},'+Z'));
 svg.append(element('text',{x:336,y:220,'text-anchor':'end',class:'plan-caption'},surface.estimated?'cm · 范围估算':'cm · 占地投影'));
 markDragging(svg,state);
 if(restoreFocus&&!state.gesture)restoreFocus.focus({preventScroll:true});
}
