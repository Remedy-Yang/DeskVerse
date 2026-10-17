import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createRenderCamera} from '../dist/render-export.js';

const box = new T.Box3(new T.Vector3(-70, -20, -45), new T.Vector3(85, 180, 65));
const corners = () => {
  const {min, max} = box;
  return [
    [min.x, min.y, min.z], [min.x, min.y, max.z], [min.x, max.y, min.z], [min.x, max.y, max.z],
    [max.x, min.y, min.z], [max.x, min.y, max.z], [max.x, max.y, min.z], [max.x, max.y, max.z],
  ].map(([x, y, z]) => new T.Vector3(x, y, z));
};

function sourcePerspective() {
  const camera = new T.PerspectiveCamera(36, 16 / 9, .1, 5000);
  camera.position.set(370, 240, 410);
  camera.lookAt(box.getCenter(new T.Vector3()));
  camera.updateMatrixWorld(true);
  return camera;
}

function assertFits(camera) {
  camera.updateMatrixWorld(true);
  for (const point of corners()) {
    const projected = point.clone().project(camera);
    assert.ok(projected.x >= -1 && projected.x <= 1, `x crop: ${projected.x}`);
    assert.ok(projected.y >= -1 && projected.y <= 1, `y crop: ${projected.y}`);
    assert.ok(projected.z >= -1 && projected.z <= 1, `depth crop: ${projected.z}`);
  }
}


test('Fixed cameras fit every bounds corner at supported aspect ratios and use the frame', () => {
  const source = sourcePerspective();
  for (const preset of ['front', 'left', 'right', 'top']) {
    for (const aspect of [16 / 9, 1, 9 / 16]) {
      const camera = createRenderCamera(source, box, preset, aspect);
      assertFits(camera);
      const edge = Math.max(...corners().map(point => {
        const projected = point.clone().project(camera);
        return Math.max(Math.abs(projected.x), Math.abs(projected.y));
      }));
      assert.ok(edge > .5, `${preset} is too loose: ${edge}`);
    }
  }
});

test('Fixed camera directions and top projection are genuine', () => {
  const center = box.getCenter(new T.Vector3());
  const source = sourcePerspective();
  const front = createRenderCamera(source, box, 'front', 16 / 9);
  const left = createRenderCamera(source, box, 'left', 16 / 9);
  const right = createRenderCamera(source, box, 'right', 16 / 9);
  const top = createRenderCamera(source, box, 'top', 16 / 9);
  assert.ok(front.position.z > center.z && Math.abs(front.position.x - center.x) < 1e-8);
  assert.ok(left.position.x < center.x && left.position.z > center.z && left.position.y > center.y);
  assert.ok(right.position.x > center.x && right.position.z > center.z && right.position.y > center.y);
  assert.equal(top.isOrthographicCamera, true);
  assert.deepEqual(top.up.toArray(), [0, 0, -1]);
});

test('Fixed compositions retain visible floor beyond the furniture bounds', () => {
  const source = sourcePerspective();
  for (const preset of ['front', 'left', 'right']) {
    const camera = createRenderCamera(source, box, preset, 16 / 9);
    const ground = new T.Vector3(preset === 'front' ? 7.5 : preset === 'left' ? 600 : -600, box.min.y, -600);
    const projected = ground.project(camera);
    assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1, 'floor sample must lie inside composition');
    assert.ok(projected.z >= -1 && projected.z <= 1, `${preset} clips visible floor at depth ${projected.z}`);
  }
});

test('Current perspective clone preserves live framing and accepts bounds behind camera', () => {
  const source = new T.PerspectiveCamera(36, 16 / 9, .1, 5000);
  source.position.set(0, 0, 100);
  source.lookAt(0, 0, 0);
  source.zoom = 1.2;
  source.updateMatrixWorld(true);
  const behind = new T.Box3(new T.Vector3(-2, -2, 50), new T.Vector3(2, 2, 150));
  const position = source.position.clone();
  const quaternion = source.quaternion.clone();
  const clone = createRenderCamera(source, behind, 'current', 9 / 16);
  assert.equal(clone.isPerspectiveCamera, true);
  assert.ok(clone.position.equals(position));
  assert.ok(clone.quaternion.equals(quaternion));
  assert.equal(clone.fov, source.fov);
  assert.equal(clone.near, source.near);
  assert.equal(clone.far, source.far);
  assert.equal(clone.zoom, source.zoom * (9 / 16) / (16 / 9));
  assert.equal(source.zoom, 1.2);
});

test('Current orthographic clone preserves center and expands aspect without fitting bounds', () => {
  const source = new T.OrthographicCamera(-180, 180, 120, -120, .1, 5000);
  source.position.set(350, 300, 410);
  source.lookAt(box.getCenter(new T.Vector3()));
  source.updateMatrixWorld(true);
  const position = source.position.clone();
  const quaternion = source.quaternion.clone();
  const center = (source.left + source.right) / 2;
  const verticalCenter = (source.top + source.bottom) / 2;
  const sourceWidth = source.right - source.left;
  const clone = createRenderCamera(source, box, 'current', 9 / 16);
  assert.equal(clone.isOrthographicCamera, true);
  assert.ok(clone.position.equals(position));
  assert.ok(clone.quaternion.equals(quaternion));
  assert.equal((clone.left + clone.right) / 2, center);
  assert.equal((clone.top + clone.bottom) / 2, verticalCenter);
  assert.equal(clone.right - clone.left, sourceWidth);
  assert.equal(clone.near, source.near);
  assert.equal(clone.far, source.far);
});

