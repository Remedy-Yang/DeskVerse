import { readFile, writeFile, mkdir, copyFile, cp } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('node_modules/three');
const output = path.resolve('dist/vendor/three');
await mkdir(output, { recursive: true });
await copyFile(root + '/build/three.module.js', output + '/three.module.js');
await copyFile(root + '/build/three.core.js', output + '/three.core.js');
await copyFile(root + '/LICENSE', output + '/LICENSE');
const seen = new Set();
async function vendor(relative) {
  if (seen.has(relative)) return;
  seen.add(relative);
  const source = await readFile(root + '/examples/jsm/' + relative, 'utf8');
  const target = output + '/addons/' + relative;
  await mkdir(path.dirname(target), {recursive:true});
  await writeFile(target, source);
  for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+\.js)['"]/g)) {
    await vendor(path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1])));
  }
}
for (const entry of ['controls/OrbitControls.js','controls/TransformControls.js','loaders/GLTFLoader.js','loaders/DRACOLoader.js','loaders/KTX2Loader.js','libs/meshopt_decoder.module.js','utils/SkeletonUtils.js','environments/RoomEnvironment.js','math/OBB.js']) await vendor(entry);
for (const dir of ['draco/gltf','basis']) await cp(root + '/examples/jsm/libs/' + dir, output + '/addons/libs/' + dir, {recursive:true});
console.log('Vendored Three.js r180 and local decoders:', seen.size, 'modules');
