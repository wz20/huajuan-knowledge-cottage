import * as T from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const ease=(t:number)=>{t=T.MathUtils.clamp(t,0,1);return t*t*(3-2*t)};
type Rest={position:T.Vector3;quaternion:T.Quaternion};
const rest=(o:T.Object3D):Rest=>({position:o.position.clone(),quaternion:o.quaternion.clone()});
const center=(o:T.Object3D)=>new T.Box3().setFromObject(o).getCenter(v());

/** Visible object gestures, sharing the same state boundaries as persistence/UI. */
export class InteractiveProps {
 private can:T.Object3D; private canRest:Rest;private nozzle:T.Object3D;
 private waterPhase='idle';private waterTime=0;private canFrom=v();private canTo=v();private target=v();
 private waterResolve?: (completed:boolean)=>void;private waterCompleted=false;
 private streams=new T.Group();private streamGeometry=new T.BufferGeometry();
 private waterRibbon:Line2;private stream:T.LineSegments;private dropPositions=new Float32Array(18*6);
 private cup=new T.Group();private cupRest:Rest;private drinkTime=-1;
 private cupHalo:T.Mesh<T.RingGeometry,T.MeshBasicMaterial>;private chairHalo:T.Mesh<T.RingGeometry,T.MeshBasicMaterial>;
 private drinkDue=false;private moveDue=false;
 private rod:T.Object3D;private rodRest:Rest;private tip:T.Object3D;
 private line:Line2;private lineBorder:Line2;
 private bobber=new T.Group();private catchFish=new T.Group();
 private fishingState='ready';private previousFishingState='ready';private fishingTime=0;private success=false;
 private pondPoint=v(8.7,-.07,-1.7);private castStart=v();
 private rings:T.Mesh<T.TorusGeometry,T.MeshBasicMaterial>[]=[];
 private mode='work';private transitioning=false;
 constructor(private root:T.Group,private overlay:T.Group=root){
  this.root.updateWorldMatrix(true,true);
  const required=(name:string)=>{const o=root.getObjectByName(name);if(!o)throw Error('Missing interactive prop: '+name);o.userData.dynamic=true;return o};
  this.can=required('WateringCan');this.canRest=rest(this.can);this.nozzle=required('CanSpoutTip');
  this.rod=required('FishingRod');this.rodRest=rest(this.rod);this.tip=required('RodTip');
  const glass=required('WaterGlass');
  const cupParts=glass.children.filter(o=>o.userData.drinkVessel===true);
  if(!cupParts.length)throw Error('Missing authored drink vessel');
  const cupCenter=new T.Box3();glass.updateWorldMatrix(true,true);const inverseGlass=glass.matrixWorld.clone().invert();cupParts.forEach(o=>o.traverse(child=>{if(child instanceof T.Mesh){child.geometry.computeBoundingBox();cupCenter.union(child.geometry.boundingBox!.clone().applyMatrix4(inverseGlass.clone().multiply(child.matrixWorld)))}}));const pivot=cupCenter.getCenter(v());pivot.y=cupCenter.min.y;
  this.cup.name='DrinkingCupMotion';this.cup.userData.dynamic=true;glass.add(this.cup);this.cup.position.copy(pivot);this.cup.updateWorldMatrix(true,false);cupParts.forEach(o=>this.cup.attach(o));this.cupRest=rest(this.cup);
  this.cupHalo=this.halo(center(this.cup),.29);this.cupHalo.position.y=cupCenter.min.y+.005;
  const chair=required('Chair');const chairBox=new T.Box3().setFromObject(chair);this.chairHalo=this.halo(chairBox.getCenter(v()),.70);this.chairHalo.position.y=chairBox.min.y+.035;
  this.streamGeometry.setAttribute('position',new T.BufferAttribute(this.dropPositions,3));
  this.stream=new T.LineSegments(this.streamGeometry,new T.LineBasicMaterial({color:'#d7f5f3',transparent:true,opacity:.85}));this.stream.frustumCulled=false;this.stream.raycast=()=>{};this.streams.add(this.stream);this.streams.userData.dynamic=true;this.overlay.add(this.streams);this.streams.visible=false;
  const lineMaterial=(color:string,width:number)=>new LineMaterial({color,linewidth:width,worldUnits:false,transparent:true,opacity:.95,depthTest:true,depthWrite:false});
  this.waterRibbon=new Line2(new LineGeometry(),lineMaterial('#c8eff5',2.5));this.waterRibbon.userData.dynamic=true;this.waterRibbon.frustumCulled=false;this.waterRibbon.raycast=()=>{};this.streams.add(this.waterRibbon);
  this.lineBorder=new Line2(new LineGeometry(),lineMaterial('#294b4f',3.5));this.line=new Line2(new LineGeometry(),lineMaterial('#f4efd8',1.6));
  for(const line of [this.lineBorder,this.line]){line.userData.dynamic=true;line.frustumCulled=false;line.raycast=()=>{};this.overlay.add(line)}
  this.line.renderOrder=2;this.lineBorder.renderOrder=1;
  this.bobber.name='FishingFloat';this.bobber.userData={dynamic:true,action:'fishing'};
  const part=(geometry:T.BufferGeometry,color:string,y:number)=>{const o=new T.Mesh(geometry,new T.MeshStandardMaterial({color,roughness:.42}));o.position.y=y;this.bobber.add(o);return o};
  part(new T.SphereGeometry(.09,20,12),'#f0ead2',.035).scale.set(.7,1.55,.7);
  part(new T.CylinderGeometry(.036,.036,.16,16),'#bf4e3d',.19);part(new T.CylinderGeometry(.021,.021,.12,12),'#f6eccc',.32);
  this.overlay.add(this.bobber);this.bobber.position.copy(this.pondPoint);
  const body=new T.Mesh(new T.SphereGeometry(1,24,16),new T.MeshStandardMaterial({color:'#c5bb8a',metalness:.15,roughness:.44}));body.scale.set(.21,.09,.07);this.catchFish.add(body);
  const tail=new T.Mesh(new T.ConeGeometry(.09,.13,3),new T.MeshStandardMaterial({color:'#987650',roughness:.65}));tail.rotation.z=Math.PI/2;tail.position.x=-.23;this.catchFish.add(tail);
  for(const z of [-.059,.059]){const eye=new T.Mesh(new T.SphereGeometry(.012,10,8),new T.MeshBasicMaterial({color:'#273f39'}));eye.position.set(.14,.025,z);this.catchFish.add(eye)}
  this.catchFish.userData.dynamic=true;this.catchFish.visible=false;this.overlay.add(this.catchFish);
  for(let i=0;i<3;i++){const ring=new T.Mesh(new T.TorusGeometry(.18,.009,6,48),new T.MeshBasicMaterial({color:'#e1eee1',transparent:true,opacity:.4,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.userData.dynamic=true;ring.raycast=()=>{};this.overlay.add(ring);this.rings.push(ring)}
  this.setFishing('ready');
 }
 private halo(point:T.Vector3,radius:number){const mesh=new T.Mesh(new T.RingGeometry(radius,radius+.035,64),new T.MeshBasicMaterial({color:'#e2c17d',transparent:true,opacity:0,side:T.DoubleSide,depthWrite:false}));mesh.position.copy(point);mesh.rotation.x=-Math.PI/2;mesh.userData.dynamic=true;mesh.raycast=()=>{};this.overlay.add(mesh);return mesh}
 setMode(mode:string,transitioning=false){this.mode=mode;this.transitioning=transitioning;if(transitioning)this.cancelWater();this.overlay.visible=!transitioning;this.cupHalo.visible=this.chairHalo.visible=mode==='work';if(mode!=='leisure'){this.line.visible=this.lineBorder.visible=this.bobber.visible=this.catchFish.visible=false;this.rings.forEach(r=>r.visible=false)}}
 cancelWater(){this.can.position.copy(this.canRest.position);this.can.quaternion.copy(this.canRest.quaternion);this.waterPhase='idle';this.waterCompleted=false;this.streams.visible=false;const resolve=this.waterResolve;this.waterResolve=undefined;resolve?.(false)}
 private beginWater(phase:string,to?:T.Vector3){this.waterPhase=phase;this.waterTime=0;this.canFrom.copy(this.can.position);if(to)this.canTo.copy(to)}
 setWateringMode(enabled:boolean){
  if(enabled&&this.mode==='leisure'&&!this.transitioning&&this.waterPhase==='idle'){this.waterCompleted=false;this.beginWater('lifting',this.canRest.position.clone().add(v(0,.42,.18)))}
  if(!enabled&&this.waterResolve)this.waterCompleted=false;
  if(!enabled&&!['idle','returning'].includes(this.waterPhase)){this.waterCompleted=false;this.beginWater('returning',this.canRest.position)}
 }
 water(soil:T.Object3D):Promise<boolean>{
  if(this.transitioning||this.mode!=='leisure'||this.waterResolve||!['held','lifting'].includes(this.waterPhase))return Promise.resolve(false);
  const bounds=new T.Box3().setFromObject(soil);bounds.getCenter(this.target);this.target.y=bounds.max.y+.015;
  const destination=this.target.clone().add(v(-.67,.72,.02));this.can.parent!.worldToLocal(destination);
  this.beginWater('approaching',destination);
  return new Promise(resolve=>{this.waterResolve=resolve});
 }
 drink(){if(this.drinkTime<0)this.drinkTime=0}
 reminders(items:{kind:string;phase:string}[]){this.drinkDue=items.some(r=>r.kind==='drink'&&r.phase==='due');this.moveDue=items.some(r=>r.kind==='move'&&r.phase==='due')}
 setFishing(state:string,success=false){
  if(state==='paused'){this.previousFishingState=this.fishingState;this.fishingState=state;return}
  if(this.fishingState==='paused'&&state===this.previousFishingState){this.fishingState=state;return}
  if(state===this.fishingState)return;
  this.fishingState=state;this.fishingTime=0;this.success=success;
  if(state==='casting'){this.tip.getWorldPosition(this.castStart);this.castStart.y-=.15}
  if(state==='ready'){this.rod.position.copy(this.rodRest.position);this.rod.quaternion.copy(this.rodRest.quaternion);this.catchFish.visible=false}
 }
 resize(width:number,height:number){this.waterRibbon.material.resolution.set(width,height);this.line.material.resolution.set(width,height);this.lineBorder.material.resolution.set(width,height)}
 update(dt:number,elapsed:number){
  if(this.mode==='work'){const cupBounds=new T.Box3().setFromObject(this.cup);cupBounds.getCenter(this.cupHalo.position);this.cupHalo.position.y=cupBounds.min.y+.005;const chair=this.root.getObjectByName('Chair');if(chair){const bounds=new T.Box3().setFromObject(chair);bounds.getCenter(this.chairHalo.position);this.chairHalo.position.y=bounds.min.y+.035;}}
  this.waterTime+=dt;
  const duration=this.waterPhase==='pouring'?1.7:this.waterPhase==='approaching'?1:this.waterPhase==='returning'?1:.5;
  const progress=ease(this.waterTime/duration);
  if(['lifting','approaching','returning'].includes(this.waterPhase)){
   this.can.position.lerpVectors(this.canFrom,this.canTo,progress);
   if(this.waterPhase==='approaching')this.can.position.y+=Math.sin(progress*Math.PI)*.25;
   if(this.waterPhase==='returning')this.can.quaternion.slerp(this.canRest.quaternion,Math.min(1,dt*7));
   if(progress===1){if(this.waterPhase==='lifting')this.beginWater('held');else if(this.waterPhase==='approaching')this.beginWater('pouring');else{this.can.position.copy(this.canRest.position);this.can.quaternion.copy(this.canRest.quaternion);this.waterPhase='idle';const resolve=this.waterResolve;this.waterResolve=undefined;resolve?.(this.waterCompleted)}}
  }
  if(this.waterPhase==='pouring'){
   const tilt=Math.sin(Math.min(1,this.waterTime/.4)*Math.PI/2)*-.82;
   this.can.quaternion.copy(this.canRest.quaternion).premultiply(new T.Quaternion().setFromAxisAngle(v(0,0,1),tilt));
   if(this.waterTime>=1.7){this.waterCompleted=true;this.beginWater('returning',this.canRest.position)}
  }
  this.streams.visible=this.waterPhase==='pouring'&&this.waterTime>.18;
  if(this.streams.visible){const source=this.nozzle.getWorldPosition(v());const middle=source.clone().lerp(this.target,.5);middle.y+=.03;this.waterRibbon.geometry.setPositions(new T.QuadraticBezierCurve3(source,middle,this.target).getPoints(12).flatMap(p=>p.toArray()));for(let i=0;i<18;i++){const t=(this.waterTime*1.9+i/18)%1,t2=Math.min(1,t+.055);for(const [j,u] of [t,t2].entries()){const p=source.clone().lerp(this.target,u);p.y+=Math.sin(u*Math.PI)*.035;p.x+=Math.sin(i*5.1)*.018*u;p.z+=Math.cos(i*3.7)*.018*u;p.toArray(this.dropPositions,i*6+j*3)}}this.streamGeometry.attributes.position.needsUpdate=true}
  if(this.drinkTime>=0){this.drinkTime+=dt;const t=this.drinkTime,raise=t<.5?ease(t/.5):t<1.1?1:1-ease((t-1.1)/.6);this.cup.position.copy(this.cupRest.position).add(v(0,raise*.19,raise*.09));this.cup.quaternion.copy(this.cupRest.quaternion).premultiply(new T.Quaternion().setFromAxisAngle(v(0,0,1),-raise*.18));if(t>=1.7){this.cup.position.copy(this.cupRest.position);this.cup.quaternion.copy(this.cupRest.quaternion);this.drinkTime=-1}}
  this.cupHalo.material.opacity=this.drinkDue?.3+Math.sin(elapsed*1.6)*.13:this.drinkTime>=0?.4:0;this.chairHalo.material.opacity=this.moveDue?.25+Math.sin(elapsed*1.3)*.10:0;
  if(this.mode==='leisure'&&!this.transitioning)this.updateFishing(dt);
 }
 private updateFishing(dt:number){
  const pond=this.root.getObjectByName('PondWater');if(pond){const bounds=new T.Box3().setFromObject(pond);bounds.getCenter(this.pondPoint);this.pondPoint.y=bounds.max.y+.035;}
  const state=this.fishingState;if(state==='paused')return;this.fishingTime+=dt;const t=this.fishingTime;
  this.rod.quaternion.copy(this.rodRest.quaternion);
  const active=!['ready','result'].includes(state);this.line.visible=this.lineBorder.visible=this.bobber.visible=active;this.catchFish.visible=state==='reeling'&&this.success;
  this.bobber.position.copy(this.pondPoint);this.bobber.rotation.z=0;
  if(state==='casting'){
   const p=T.MathUtils.clamp(t/.9,0,1);this.rod.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(v(0,0,1),Math.sin(p*Math.PI)*.24));this.bobber.position.lerpVectors(this.castStart,this.pondPoint,p);this.bobber.position.y+=Math.sin(p*Math.PI)*1.2;
  }else if(state==='reeling'){
   const p=ease(t/1.2);this.rod.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(v(0,0,1),p*.35));const destination=this.tip.getWorldPosition(v()).add(v(0,-.5,0));this.bobber.position.lerp(destination,p);this.bobber.position.y+=Math.sin(p*Math.PI)*.45;this.catchFish.position.copy(this.bobber.position).add(v(0,-.25,0));this.catchFish.rotation.z=Math.sin(t*15)*.25;
  }else if(state==='bite'){this.bobber.position.y-=.14+Math.sin(t*12)*.04;this.bobber.rotation.z=Math.sin(t*11)*.24}else this.bobber.position.y+=Math.sin(t*2.1)*.014;
  if(active){const start=this.tip.getWorldPosition(v()),end=this.bobber.position.clone().add(v(0,.37,0)),mid=start.clone().lerp(end,.5);mid.y-=state==='waiting'?.22:.04;const curve=new T.QuadraticBezierCurve3(start,mid,end),positions=curve.getPoints(24).flatMap(p=>p.toArray());this.line.geometry.setPositions(positions);this.lineBorder.geometry.setPositions(positions)}
  this.rings.forEach((ring,i)=>{ring.visible=['waiting','bite','casting'].includes(state);const phase=(t*(state==='bite'?1.1:.38)+i/3)%1;ring.position.copy(this.pondPoint);ring.position.y+=.018;ring.scale.setScalar(1+phase*3);ring.material.opacity=(1-phase)*(state==='bite'?.65:.28)});
 }
 diagnostics(){return {watering:this.waterPhase,canPosition:this.can.getWorldPosition(v()).toArray(),canRest:this.canRest.position.toArray(),streamVisible:this.streams.visible,streamStart:this.nozzle.getWorldPosition(v()).toArray(),streamTarget:this.target.toArray(),drinking:this.drinkTime>=0,fishing:this.fishingState,lineVisible:this.line.visible,lineStart:this.tip.getWorldPosition(v()).toArray(),floatPosition:this.bobber.position.toArray(),catchVisible:this.catchFish.visible}}
 dispose(){this.waterResolve?.(false);this.waterResolve=undefined;this.streamGeometry.dispose();(this.stream.material as T.Material).dispose();for(const line of [this.line,this.lineBorder,this.waterRibbon]){line.geometry.dispose();line.material.dispose()}}
}
