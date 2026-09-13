import type {BufferGeometry} from 'three';
/** Access attributes through getters: glTF may interleave positions with normals and UVs. */
export function captureWaterPositions(geometry:BufferGeometry){
 const position=geometry.getAttribute('position'),base=new Float32Array(position.count*3);
 for(let i=0;i<position.count;i++){base[i*3]=position.getX(i);base[i*3+1]=position.getY(i);base[i*3+2]=position.getZ(i)}return base;
}
export function animateWater(geometry:BufferGeometry,base:Float32Array,time:number){
 const position=geometry.getAttribute('position');
 for(let i=0;i<position.count;i++){const x=base[i*3],z=base[i*3+2];position.setY(i,base[i*3+1]+Math.sin(x*9+time*.8)*.007+Math.cos(z*11-time*.65)*.005)}
 position.needsUpdate=true;geometry.computeVertexNormals();
}
