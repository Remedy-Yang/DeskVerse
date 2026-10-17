const SVG_NS='http://www.w3.org/2000/svg';
let nextClipId=0;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function renderPlan(svg,report,onSelect){
 const document=svg.ownerDocument,focusedId=svg.contains(document.activeElement)?document.activeElement.getAttribute('data-object-id'):null;
 const element=(tag,attributes={},text=null)=>{const node=document.createElementNS(SVG_NS,tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));if(text!==null)node.textContent=text;return node;};
 svg.replaceChildren();svg.setAttribute('viewBox','0 0 360 240');
 if(!report?.surface){svg.append(element('text',{x:180,y:110,'text-anchor':'middle',class:'plan-empty'},'平面图等待场景数据'));return;}
 const {surface,items,selected}=report,width=Math.max(1,surface.max[0]-surface.min[0]),depth=Math.max(1,surface.max[2]-surface.min[2]);
 const centerX=(surface.min[0]+surface.max[0])/2,centerZ=(surface.min[2]+surface.max[2])/2;
 // 视野最多扩到桌面尺寸的两倍；远处物品只显示边缘提示，不让异常坐标把桌面缩成一点。
 const limit={minX:centerX-width,maxX:centerX+width,minZ:centerZ-depth,maxZ:centerZ+depth};
 let minX=surface.min[0],maxX=surface.max[0],minZ=surface.min[2],maxZ=surface.max[2];
 for(const item of items)for(const [x,z] of item.polygon){minX=Math.min(minX,clamp(x,limit.minX,limit.maxX));maxX=Math.max(maxX,clamp(x,limit.minX,limit.maxX));minZ=Math.min(minZ,clamp(z,limit.minZ,limit.maxZ));maxZ=Math.max(maxZ,clamp(z,limit.minZ,limit.maxZ));}
 const scale=Math.min(308/Math.max(1,maxX-minX),164/Math.max(1,maxZ-minZ));
 const offsetX=180-(minX+maxX)*scale/2,offsetZ=106-(minZ+maxZ)*scale/2;
 const project=([x,z])=>[x*scale+offsetX,z*scale+offsetZ];
 const points=polygon=>polygon.map(point=>project(point).join(',')).join(' ');
 const clipId='plan-clip-'+(++nextClipId),defs=element('defs'),clip=element('clipPath',{id:clipId});
 clip.append(element('rect',{x:18,y:20,width:324,height:176}));defs.append(clip);svg.append(defs);
 svg.append(element('title',{},`${surface.label}；X 向右，Z 向下；占地为保守投影凸包`));
 const plot=element('g',{'clip-path':`url(#${clipId})`});svg.append(plot);
 const outline=surface.polygon||[[surface.min[0],surface.min[2]],[surface.max[0],surface.min[2]],[surface.max[0],surface.max[2]],[surface.min[0],surface.max[2]]];
 const desktop=element('polygon',{points:points(outline),class:'plan-surface'});desktop.append(element('title',{},surface.label+(surface.estimated?'（估算范围）':'')));plot.append(desktop);
 for(const support of report.supports||[]){
  const polygon=element('polygon',{points:points(support.polygon),class:'plan-support'});polygon.append(element('title',{},support.label+(support.estimated?'（估算内腔）':'')));plot.append(polygon);
 }
 const conflicts=new Set(selected?.conflict.ids||[]);let restoreFocus=null;
 for(const item of items){
  if(!item.polygon.length)continue;
  const group=element('g',{class:'plan-object',role:'button',tabindex:0,'data-object-id':item.id,'aria-label':`${item.name}${item.selected?'，已选中':''}`,'aria-pressed':item.selected?'true':'false'});
  group.append(element('title',{},`${item.name} · ${item.scope==='desktop'?'桌面':item.scope==='drawer'?'抽屉':item.scope==='floor'?'地面':'支撑面未知'}`));
  const classes='plan-item'+(item.selected?' selected':'')+(conflicts.has(item.id)||item.selected&&conflicts.size?' conflict':'');
  group.append(element('polygon',{points:points(item.polygon),class:classes}));
  const projected=item.polygon.map(project),xs=projected.map(p=>p[0]),zs=projected.map(p=>p[1]);
  const offscreen=Math.max(...xs)<18||Math.min(...xs)>342||Math.max(...zs)<20||Math.min(...zs)>196;
  if(offscreen||item.selected){
   const x=clamp((Math.min(...xs)+Math.max(...xs))/2,64,296),z=clamp((Math.min(...zs)+Math.max(...zs))/2,34,184);
   group.append(element('text',{x,y:z,'text-anchor':'middle',class:offscreen?'plan-label plan-offscreen':'plan-label'},item.name+(offscreen?' · 超出视图':'')));
  }
  group.addEventListener('click',()=>onSelect(item.id));
  group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(item.id);}});
  plot.append(group);if(String(item.id)===focusedId)restoreFocus=group;
 }
 if(!items.length)svg.append(element('text',{x:180,y:106,'text-anchor':'middle',class:'plan-empty'},'尚无物品，导入后显示占地'));
 svg.append(element('line',{x1:26,y1:211,x2:74,y2:211,class:'plan-axis axis-x'}),element('text',{x:80,y:215,class:'plan-axis-label axis-x'},'+X'));
 svg.append(element('line',{x1:26,y1:211,x2:26,y2:232,class:'plan-axis axis-z'}),element('text',{x:34,y:234,class:'plan-axis-label axis-z'},'+Z'));
 svg.append(element('text',{x:336,y:220,'text-anchor':'end',class:'plan-caption'},surface.estimated?'cm · 范围估算':'cm · 占地投影'));
 if(restoreFocus)restoreFocus.focus();
}
