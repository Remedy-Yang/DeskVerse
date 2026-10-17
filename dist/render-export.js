import * as THREE from 'three';

// 导出尺寸与视角是稳定的公共契约；界面可以直接用 id 保存与恢复。
export const RENDER_PRESETS = [
  {id: 'current', label: '当前视角'},
  {id: 'front', label: '正面'},
  {id: 'left', label: '左前方'},
  {id: 'right', label: '右前方'},
  {id: 'top', label: '正交俯视'},
];

export const RENDER_SIZES = [
  {id: '1080', label: '1080p · 1920 × 1080', width: 1920, height: 1080},
  {id: '2k', label: '2K · 2560 × 1440', width: 2560, height: 1440},
  {id: '4k', label: '4K · 3840 × 2160', width: 3840, height: 2160},
];

const FIT_MARGIN = 1.08;
const MIN_ASPECT = 1e-8;
const MIN_DEPTH = 1e-3;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const TOP_UP = new THREE.Vector3(0, 0, -1);

function fail(message) {
  throw new Error(`无法导出：${message}`);
}

function finiteVector(vector) {
  return vector && Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

function readBounds(bounds) {
  if (!bounds?.min || !bounds?.max || !finiteVector(bounds.min) || !finiteVector(bounds.max)) fail('场景范围无效。');
  const box = new THREE.Box3(bounds.min, bounds.max);
  if (box.isEmpty()) fail('场景没有可导出的内容。');
  return box;
}

function cornersOf(box) {
  const {min, max} = box;
  return [
    new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z), new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z), new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z), new THREE.Vector3(max.x, max.y, max.z),
  ];
}

function validAspect(aspect) {
  if (!Number.isFinite(aspect) || aspect <= MIN_ASPECT) fail('导出画布比例无效。');
  return aspect;
}

function cameraKind(camera) {
  if (camera?.isPerspectiveCamera) return 'perspective';
  if (camera?.isOrthographicCamera) return 'orthographic';
  fail('当前相机类型不受支持。');
}

function setOrthographicPlanes(camera, depths) {
  const minDepth = Math.min(...depths);
  const maxDepth = Math.max(...depths);
  if (!Number.isFinite(minDepth) || !Number.isFinite(maxDepth)) fail('相机与场景范围不相容。');
  camera.near = minDepth >= 0 ? Math.max(MIN_DEPTH, minDepth * .8) : minDepth * 1.2;
  camera.far = Math.max(camera.near + MIN_DEPTH, maxDepth * 1.2, 1);
  camera.updateProjectionMatrix();
}

function setPerspectivePlanes(camera, points) {
  camera.updateMatrixWorld(true);
  const depths = points.map(point => -point.clone().applyMatrix4(camera.matrixWorldInverse).z);
  if (depths.some(depth => !Number.isFinite(depth) || depth <= MIN_DEPTH)) fail('场景位于相机后方，无法取景。');
  // 取景仅按家具计算，但裁剪保留实时相机范围，避免把近地面和远处阴影截成色块。
  camera.near = Math.max(MIN_DEPTH, Math.min(camera.near, Math.min(...depths) * .8));
  camera.far = Math.max(camera.far, camera.near + MIN_DEPTH, Math.max(...depths) * 1.2);
  camera.updateProjectionMatrix();
  return camera;
}

function closestPerspectiveDistance(camera, center, points, aspect) {
  const direction = camera.position.clone().sub(center).normalize();
  const forward = center.clone().sub(camera.position).normalize();
  const right = forward.clone().cross(camera.up).normalize();
  const up = right.clone().cross(forward).normalize();
  const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const tanHorizontal = tanVertical * aspect;
  if (!Number.isFinite(tanVertical) || tanVertical <= 0 || tanHorizontal <= 0) fail('相机视场角无效。');
  let distance = MIN_DEPTH;
  for (const point of points) {
    const offset = point.clone().sub(center);
    const towardCamera = offset.dot(direction);
    distance = Math.max(distance,
      towardCamera + FIT_MARGIN * Math.abs(offset.dot(right)) / tanHorizontal,
      towardCamera + FIT_MARGIN * Math.abs(offset.dot(up)) / tanVertical);
  }
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  return camera;
}

function adaptCurrentPerspective(camera, sourceAspect, aspect) {
  camera.aspect = aspect;
  // 窄画布降低 zoom，扩展垂直视野以保留原来的横向现场。
  camera.zoom = aspect < sourceAspect ? camera.zoom * aspect / sourceAspect : camera.zoom;
  camera.updateProjectionMatrix();
  return camera;
}

function adaptCurrentOrthographic(camera, aspect) {
  const centerX = (camera.left + camera.right) / 2;
  const centerY = (camera.bottom + camera.top) / 2;
  let width = camera.right - camera.left;
  let height = camera.top - camera.bottom;
  const currentAspect = width / height;
  if (aspect < currentAspect) height = width / aspect;
  else if (aspect > currentAspect) width = height * aspect;
  camera.left = centerX - width / 2;
  camera.right = centerX + width / 2;
  camera.bottom = centerY - height / 2;
  camera.top = centerY + height / 2;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  return camera;
}


function createFixedPerspective(sourceCamera, box, preset, aspect) {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() * .5, 1);
  const fov = sourceCamera?.isPerspectiveCamera && Number.isFinite(sourceCamera.fov) ? sourceCamera.fov : 36;
  const camera = new THREE.PerspectiveCamera(fov, aspect, sourceCamera.near, sourceCamera.far);
  const direction = preset === 'front'
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(preset === 'left' ? -1 : 1, .45, 1).normalize();
  camera.position.copy(center).addScaledVector(direction, radius);
  camera.up.copy(WORLD_UP);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  closestPerspectiveDistance(camera, center, cornersOf(box), aspect);
  return setPerspectivePlanes(camera, cornersOf(box));
}

function createTopCamera(box, aspect) {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const halfHeight = Math.max(size.z / 2, size.x / (2 * aspect), MIN_DEPTH) * FIT_MARGIN;
  const halfWidth = halfHeight * aspect;
  const span = Math.max(size.length(), 1);
  const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, MIN_DEPTH, span * 8);
  camera.position.set(center.x, center.y + span * 2 + 1, center.z);
  camera.up.copy(TOP_UP);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  const points = cornersOf(box);
  const depths = points.map(point => -point.clone().applyMatrix4(camera.matrixWorldInverse).z);
  setOrthographicPlanes(camera, depths);
  return camera;
}

function cloneCurrentCamera(sourceCamera, aspect) {
  const camera = sourceCamera.clone();
  // 克隆保留实时位置、朝向、类型和投影；仅按输出比例扩展视野。
  if (camera.isPerspectiveCamera) {
    const sourceAspect = Number.isFinite(sourceCamera.aspect) && sourceCamera.aspect > MIN_ASPECT ? sourceCamera.aspect : aspect;
    return adaptCurrentPerspective(camera, sourceAspect, aspect);
  }
  return adaptCurrentOrthographic(camera, aspect);
}

export function createRenderCamera(sourceCamera, bounds, preset = 'current', aspect = 16 / 9) {
  const box = readBounds(bounds);
  validAspect(aspect);
  if (!RENDER_PRESETS.some(entry => entry.id === preset)) fail(`不支持的视角“${preset}”。`);
  cameraKind(sourceCamera);
  if (preset === 'current') return cloneCurrentCamera(sourceCamera, aspect);
  if (preset === 'top') return createTopCamera(box, aspect);
  return createFixedPerspective(sourceCamera, box, preset, aspect);
}

function rendererLimit(context, width, height) {
  const limits = [];
  for (const constant of [context.MAX_RENDERBUFFER_SIZE, context.MAX_VIEWPORT_DIMS]) {
    if (!constant) continue;
    const value = context.getParameter(constant);
    if (constant === context.MAX_VIEWPORT_DIMS && value?.length >= 2) {
      if (Number.isFinite(value[0])) limits.push(value[0]);
      if (Number.isFinite(value[1])) limits.push(value[1]);
    } else if (Number.isFinite(value)) limits.push(value);
  }
  const limit = limits.length ? Math.min(...limits) : Infinity;
  if (width > limit || height > limit) fail(`导出尺寸 ${width} × ${height} 超出当前设备上限，请选择较低分辨率（上限 ${limit} 像素）。`);
}

function getOutputCanvas(canvas, width, height) {
  const output = canvas || globalThis.document?.createElement?.('canvas');
  if (!output?.getContext) fail('当前环境不支持 2D 导出画布。');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d');
  if (!context) fail('无法创建 2D 导出画布。');
  return {output, context};
}

export function renderSceneCanvas({renderer, scene, camera, width, height, helpers = [], canvas} = {}) {
  if (!renderer?.render || !renderer?.setSize || !renderer?.setPixelRatio || !renderer?.getSize || !renderer?.getPixelRatio) fail('渲染器不可用。');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) fail('导出尺寸必须是正整数。');
  const context = renderer.getContext?.();
  if (!context?.getParameter) fail('无法读取当前设备的绘图能力，请选择较低分辨率。');
  const {output, context: outputContext} = getOutputCanvas(canvas, width, height);
  const size = renderer.getSize(new THREE.Vector2());
  const pixelRatio = renderer.getPixelRatio();
  const helperStates = Array.from(helpers || [], helper => ({helper, visible: helper?.visible}));
  try {
    if (context.isContextLost?.()) fail('图形上下文已丢失，请刷新页面后选择较低分辨率。');
    rendererLimit(context, width, height);
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    if (context.isContextLost?.()) fail('设备无法创建请求尺寸的绘图缓冲区，请选择较低分辨率。');
    if (context.drawingBufferWidth !== width || context.drawingBufferHeight !== height) {
      fail(`设备实际绘图缓冲区为 ${context.drawingBufferWidth} × ${context.drawingBufferHeight}，请选择较低分辨率。`);
    }
    const drawingCanvas = renderer.domElement;
    helperStates.forEach(({helper}) => { if (helper) helper.visible = false; });
    try {
      renderer.render(scene, camera);
    } catch (error) {
      if (context.isContextLost?.()) fail('渲染时图形上下文丢失，请刷新页面后选择较低分辨率。');
      throw error;
    }
    if (context.isContextLost?.()) fail('渲染时图形上下文丢失，请刷新页面后选择较低分辨率。');
    outputContext.drawImage(drawingCanvas, 0, 0, width, height);
    return output;
  } finally {
    helperStates.forEach(({helper, visible}) => { if (helper) helper.visible = visible; });
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(size.x, size.y, false);
  }
}
