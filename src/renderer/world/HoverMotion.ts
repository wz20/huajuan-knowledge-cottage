import * as T from 'three';

type Entry={object:T.Object3D;position:T.Vector3;scale:T.Vector3;anchor:T.Vector3;factor:number;applied:boolean};
/** Visual enlargement around the object's base. Picking always sees neutral geometry. */
export class HoverMotion {
 private entries=new Map<T.Object3D,Entry>();private target?:T.Object3D;
 setTarget(object?:T.Object3D){
  this.target=object;
  if(!object||this.entries.has(object))return;
  object.updateWorldMatrix(true,true);
  const box=new T.Box3().setFromObject(object),anchor=box.getCenter(new T.Vector3());anchor.y=box.min.y;
  object.worldToLocal(anchor);
  this.entries.set(object,{object,position:object.position.clone(),scale:object.scale.clone(),anchor,factor:1,applied:false});
 }
 restore(){for(const e of this.entries.values())if(e.applied){e.object.position.copy(e.position);e.object.scale.copy(e.scale);e.applied=false;}}
 private apply(e:Entry){
  e.object.scale.copy(e.scale).multiplyScalar(e.factor);
  const offset=e.anchor.clone().multiply(e.scale).multiplyScalar(1-e.factor).applyQuaternion(e.object.quaternion);
  e.object.position.copy(e.position).add(offset);e.applied=true;
 }
 update(dt:number,reduced:boolean){
  for(const [object,e] of this.entries){
   e.position.copy(object.position);e.scale.copy(object.scale);
   const action=String(object.userData.action??'');
   const amount=action==='library'?.018:action==='todos'?.025:action.startsWith('piano:')?.035:.065;
   e.factor=reduced?1:T.MathUtils.damp(e.factor,object===this.target?1+amount:1,15,dt);
   if(object!==this.target&&Math.abs(e.factor-1)<.0001){this.entries.delete(object);continue;}
   this.apply(e);
  }
 }
 withNeutralPose<R>(root:T.Object3D,fn:()=>R):R{
  const applied=[...this.entries.values()].filter(e=>e.applied);this.restore();root.updateWorldMatrix(true,true);
  try{return fn()}finally{for(const e of applied)this.apply(e);root.updateWorldMatrix(true,true);}
 }
 diagnostics(){return{target:this.target?.name??null,objects:[...this.entries.values()].map(e=>({name:e.object.name,factor:e.factor}))}}
 clear(){this.restore();this.entries.clear();this.target=undefined;}
 dispose(){this.clear();}
}
