import { describe, expect, it, vi } from 'vitest';
import * as T from 'three';
import { World } from '../src/renderer/world/World';

// Exercise the production navigation methods with a real Three camera/group but no GPU.
// Object.create intentionally skips loading assets, DOM listeners and a renderer.
function world() {
 const w = Object.create(World.prototype) as any;
 Object.assign(w, {
  mode:'work',zone:'overview',globe:false,stargazing:false,reducedMotion:false,
  interactive:true,transition:1,planetPivot:new T.Group(),workFace:new T.Group(),
  leisureFace:new T.Group(),overlay:new T.Group(),lamps:[],highlighted:[],
  camera:new T.PerspectiveCamera(42,1,.1,300),fromPosition:new T.Vector3(),fromTarget:new T.Vector3(),
  controls:{target:new T.Vector3(0,1,0),enabled:true,update:vi.fn()},
  renderer:{domElement:{style:{}}},tooltip:{style:{}},
  props:{setMode:vi.fn(),cancelWater:vi.fn()},onAction:vi.fn(),pointerLeave:vi.fn(),
 });
 w.camera.position.set(10,10,17);
 return w;
}
function advance(w:any, seconds:number) { for(let i=0;i<Math.ceil(seconds/.01);i++)w.updateNavigation(.01); }

describe('dual-face navigation',()=>{
 it('pulls away before rotation, turns exactly half a turn, and ends upright',()=>{
  const w=world();w.setMode('leisure');
  expect(w.controls.enabled).toBe(false);
  advance(w,.4);expect(w.planetPivot.rotation.x).toBe(0);
  expect(w.camera.position.distanceTo(new T.Vector3(0,-10,0))).toBeGreaterThan(40);
  advance(w,.5);expect(w.planetPivot.rotation.x).toBeGreaterThan(1);
  expect(w.workFace.visible&&w.leisureFace.visible).toBe(true);
  advance(w,1);expect(w.flip).toBeUndefined();expect(w.mode).toBe('leisure');
  expect(w.planetPivot.rotation.x).toBe(Math.PI);expect(w.camera.up.toArray()).toEqual([0,1,0]);
  expect(w.workFace.visible).toBe(false);expect(w.leisureFace.visible).toBe(true);
  expect(w.controls.enabled).toBe(true);
 });
 it('keeps only the latest rapid navigation target and never adds rotation animations',()=>{
  const w=world();w.setMode('leisure');const flip=w.flip;
  w.setMode('work');w.setZone('piano');w.setMode('work');w.setZone('library');
  expect(w.flip).toBe(flip);expect(w.queued).toEqual({mode:'work',zone:'library'});
  advance(w,3.8);expect(w.flip).toBeUndefined();expect(w.mode).toBe('work');
  expect(w.zone).toBe('library');expect(w.planetPivot.rotation.x).toBe(0);
 });
 it('moves between local leisure targets without rotating the planet',()=>{
  const w=world();w.mode='leisure';w.planetPivot.rotation.x=Math.PI;
  w.setZone('pond');expect(w.flip).toBeUndefined();expect(w.mode).toBe('leisure');
  advance(w,.8);expect(w.planetPivot.rotation.x).toBe(Math.PI);expect(w.zone).toBe('pond');
 });
 it('switching reduced motion during a turn fades to the target and does not resume an interrupted spin',()=>{
  const w=world();w.setMode('leisure');advance(w,.8);const interruptedAngle=w.planetPivot.rotation.x;
  w.setReducedMotion(true);advance(w,.1);expect(w.planetPivot.rotation.x).toBe(interruptedAngle);
  w.setReducedMotion(false);advance(w,.3);
  expect(w.mode).toBe('leisure');expect(w.flip).toBeUndefined();expect(w.planetPivot.rotation.x).toBe(Math.PI);
  expect(w.renderer.domElement.style.opacity).toBe('1');
 });
 it('queues globe requests and prevents picking throughout a transition',()=>{
  const w=world();w.setMode('leisure');w.showGlobe();
  expect(w.pick({clientX:0,clientY:0})).toBeUndefined();
  advance(w,1.9);expect(w.globe).toBe(true);expect(w.workFace.visible&&w.leisureFace.visible).toBe(true);
  w.setZone('overview');expect(w.globe).toBe(false);expect(w.mode).toBe('leisure');
 });
});

describe('face-safe geometry batching',()=>{
 it('groups incompatible vertex layouts separately and preserves opposite faces and animated children',()=>{
  const w=world(), root=new T.Group(), material=new T.MeshStandardMaterial();
  const face=new T.Group();face.userData.dynamic=true;root.add(face);
  for(let i=0;i<2;i++){const mesh=new T.Mesh(new T.BoxGeometry(),material);mesh.position.x=i;face.add(mesh);}
  const moving=new T.Mesh(new T.BoxGeometry(),material);moving.userData.dynamic=true;root.add(moving);
  for(let i=0;i<4;i++){const geometry=new T.BoxGeometry();if(i<2)geometry.deleteAttribute('uv');const mesh=new T.Mesh(geometry,material);mesh.position.x=i*2;root.add(mesh);}
  const error=vi.spyOn(console,'error').mockImplementation(()=>{});
  w.batchMeshes(root);
  expect(error).not.toHaveBeenCalled();error.mockRestore();
  expect(root.children).toHaveLength(4); // Two material/layout batches, a moving object and an untouched opposite face.
  expect(face.children).toHaveLength(2);expect(moving.parent).toBe(root);
  w.batchMeshes(face);expect(face.children).toHaveLength(1);
 });
});
