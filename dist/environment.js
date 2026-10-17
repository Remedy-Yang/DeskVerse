import * as THREE from 'three';

// 本地生成低对比木地板纹理，不依赖图片网络请求，也不改写用户 GLB。
export function createStudioFloor(renderer) {
  const image=document.createElement('canvas');image.width=1024;image.height=1024;
  const context=image.getContext('2d');
  context.fillStyle='#b8aa92';context.fillRect(0,0,1024,1024);
  for(let row=0;row<8;row++)for(let column=-1;column<3;column++){
    const x=column*512+(row%2)*256,y=row*128,tone=(row*13+column*7+80)%17;
    context.fillStyle=`hsl(34 18% ${70+tone*.35}%)`;context.fillRect(x+1,y+1,510,126);
    context.strokeStyle='#8d785914';context.lineWidth=1;
    for(let line=0;line<18;line++){
      const offset=5+line*6.8;context.beginPath();context.moveTo(x,y+offset);
      context.bezierCurveTo(x+170,y+offset+Math.sin(line+row)*4,x+340,y+offset-3,x+512,y+offset);context.stroke();
    }
  }
  const floorSize=100000,repeat=floorSize/200;
  const map=new THREE.CanvasTexture(image);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(repeat,repeat);map.offset.set(.5,.5);map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(floorSize,floorSize),new THREE.MeshStandardMaterial({map,roughness:.92,metalness:0}));
  floor.name='studio-solid-floor';floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;
  return floor;
}

// 在灯光坐标中包住整柜和近地阴影，避免固定阴影相机裁掉柜顶或落地部分。
export function fitDirectionalShadow(light,bounds) {
  const camera=light.shadow.camera;
  light.target.position.copy(bounds.getCenter(new THREE.Vector3()));light.target.updateMatrixWorld(true);
  camera.position.copy(light.position);camera.lookAt(light.target.position);camera.updateMatrixWorld(true);
  const box=new THREE.Box3(),point=new THREE.Vector3();
  for(const x of [bounds.min.x-45,bounds.max.x+45])for(const y of [bounds.min.y-5,bounds.max.y+5])for(const z of [bounds.min.z-45,bounds.max.z+45])box.expandByPoint(point.set(x,y,z).applyMatrix4(camera.matrixWorldInverse));
  Object.assign(camera,{left:box.min.x-15,right:box.max.x+15,bottom:box.min.y-15,top:box.max.y+15,near:Math.max(.5,-box.max.z-20),far:Math.max(100,-box.min.z+100)});
  camera.updateProjectionMatrix();light.shadow.needsUpdate=true;
}
