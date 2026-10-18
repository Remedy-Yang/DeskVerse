import * as THREE from 'three';

const profiles={
 'light-strip':{color:'#087dff',materials:{'Blue LED emitters':4},emitter:'Blue LED emitters',lights:3,intensity:360,distance:65,glowSize:.065},
 'floor-lamp':{color:'#ffe2ad',materials:{'Recessed light channel':3.2,'Opal diffuser':1.1},emitter:'Recessed light channel',lights:3,intensity:650,distance:100,glowSize:.055}
};

// 光晕四角只在 GPU 展开；CPU 顶点留在发光面内，不改变 Box3 尺寸与贴面。
function glowResources(color){
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(12),3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));geometry.setIndex([0,1,2,0,2,3]);
 const material=new THREE.ShaderMaterial({
  uniforms:{color:{value:new THREE.Color(color)}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
  vertexShader:`varying vec2 vUv;
   void main(){
    vUv=uv;vec4 center=modelViewMatrix*vec4(position,1.);
    center.xy+=(uv-.5)*vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz));
    gl_Position=projectionMatrix*center;
   }`,
  fragmentShader:`uniform vec3 color;varying vec2 vUv;
   void main(){
    float glow=pow(max(0.,1.-length(vUv-.5)*2.),3.);
    gl_FragColor=vec4(color,glow*.65);
    #include <colorspace_fragment>
   }`
 });
 return {geometry,material};
}

export function bindAssetLights(model,profileId){
 const profile=profiles[profileId];if(!profile)return;
 const emitters=[];
 model.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  for(const material of materials){
   const intensity=profile.materials[material.name];if(intensity===undefined)continue;
   material.emissive.set(profile.color);material.emissiveIntensity=intensity;
   if(material.name===profile.emitter)emitters.push(mesh);
  }
 });
 if(!emitters.length)return;
 const glowResourcesForModel=glowResources(profile.color);
 // 所有坐标均在原始发光网格内；父模型负责移动、扶正、旋转和缩放。
 for(const [index,mesh] of emitters.entries()){
  if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
  const box=mesh.geometry.boundingBox,size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const count=emitters.length===1?profile.lights:1;
  for(let i=0;i<count;i++){
   const position=center.clone();position.z=box.max.z;
   if(count>1)position.y=box.min.y+size.y*(i+.5)/count;
   const glow=new THREE.Mesh(glowResourcesForModel.geometry,glowResourcesForModel.material);glow.name='灯具光晕';glow.position.copy(position);glow.scale.setScalar(profile.glowSize);
   glow.userData.noCollision=true;glow.frustumCulled=false;glow.raycast=()=>{};mesh.add(glow);
   if(emitters.length===1||index%Math.ceil(emitters.length/profile.lights)===1){
    // 场景使用厘米；平方衰减强度按厘米调校，灯光不额外生成阴影贴图。
    const light=new THREE.PointLight(profile.color,profile.intensity,profile.distance,2);light.name='灯具局部照明';light.position.copy(position);light.position.z+=.002;mesh.add(light);
   }
  }
 }
}
