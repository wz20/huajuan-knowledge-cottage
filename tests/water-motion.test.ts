import {describe,it,expect} from 'vitest';
import {BufferGeometry,InterleavedBuffer,InterleavedBufferAttribute} from 'three';
import {captureWaterPositions,animateWater} from '../src/renderer/world/water-motion';
describe('animated glTF water',()=>{
 it('reads interleaved coordinates without interpreting normals as vertices',()=>{
  const geometry=new BufferGeometry(),data=new InterleavedBuffer(new Float32Array([-1,0,-1,0,1,0, 1,0,-1,0,1,0, 0,0,1,0,1,0]),6);
  geometry.setAttribute('position',new InterleavedBufferAttribute(data,3,0));geometry.setAttribute('normal',new InterleavedBufferAttribute(data,3,3));
  const base=captureWaterPositions(geometry);expect([...base]).toEqual([-1,0,-1,1,0,-1,0,0,1]);
  animateWater(geometry,base,2);const p=geometry.getAttribute('position');
  for(let i=0;i<3;i++){expect(p.getX(i)).toBe(base[i*3]);expect(p.getZ(i)).toBe(base[i*3+2]);expect(Math.abs(p.getY(i))).toBeLessThan(.013)}
  for(let t=3;t<30;t++)animateWater(geometry,base,t);for(let i=0;i<3;i++)expect(Math.abs(p.getY(i))).toBeLessThan(.013);
 });
});
