import * as THREE from 'three';

// 材质可能与独立椅子共用；只替换桌柜 mesh 的引用，不修改原材质。
export class DeskWireframe {
  constructor(){this.bindings=new WeakMap();this.variants=new WeakMap();this.created=new Set();}
  material(source){
    let result=this.variants.get(source);
    if(!result){result=source.clone();result.wireframe=true;result.transparent=true;result.opacity=Math.min(source.opacity,.6);result.depthWrite=false;result.side=THREE.DoubleSide;this.variants.set(source,result);this.created.add(result);}
    return result;
  }
  set(root,enabled){
    root?.traverse(mesh=>{
      if(!mesh.isMesh)return;
      let binding=this.bindings.get(mesh);
      if(!binding){if(!enabled)return;binding={material:mesh.material,castShadow:mesh.castShadow,receiveShadow:mesh.receiveShadow};this.bindings.set(mesh,binding);}
      if(enabled){mesh.material=Array.isArray(binding.material)?binding.material.map(material=>this.material(material)):this.material(binding.material);mesh.castShadow=false;mesh.receiveShadow=false;}
      else{mesh.material=binding.material;mesh.castShadow=binding.castShadow;mesh.receiveShadow=binding.receiveShadow;}
    });
  }
  dispose(){for(const material of this.created)material.dispose();this.created.clear();}
}
