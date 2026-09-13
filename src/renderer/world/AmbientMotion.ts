import * as T from 'three';

export type AmbientState = {
  mode: 'work' | 'leisure';
  transitioning: boolean;
  reducedMotion: boolean;
  drinking: boolean;
};

type MovingPart = {
  object: T.Object3D;
  role: string;
  axis: T.Vector3;
  neutral: T.Quaternion;
  face: 'work' | 'leisure';
  time: number;
};

const vertexShader = /* glsl */`
  uniform float uTime;
  uniform float uPhase;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float drift = sin(uv.y * 6.0 - uTime * .7 + uPhase) * .027;
    p.x += drift * uv.y * uv.y;
    p.z += sin(uv.y * 4.0 + uTime * .45 + uPhase) * .018 * uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const fragmentShader = /* glsl */`
  uniform float uTime;
  uniform float uPhase;
  uniform float uOpacity;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
               mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
  }
  void main() {
    float h = vUv.y;
    float flow = noise(vec2(vUv.x * 3.0 + uPhase, h * 5.0 - uTime * .48));
    float center = .50 + sin(h * 7.0 - uTime * .75 + uPhase) * .12 * h;
    float width = .10 + h * .11;
    float strand = exp(-pow((vUv.x-center)/width, 2.0) * 2.0);
    float edges = smoothstep(0.0,.09,h) * (1.0-smoothstep(.55,1.0,h));
    float alpha = strand * edges * (.40 + .60 * flow) * uOpacity;
    if (alpha < .003) discard;
    gl_FragColor = vec4(.91,.96,1.0,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Ambient details operate independently of persistence and interactive gestures.
 * Construct before batching; update after InteractiveProps moves the actual cup.
 */
export class AmbientMotion {
  private elapsed = 0;
  private disposed = false;
  private cup?: T.Object3D;
  private workFace?: T.Object3D;
  private rim = new T.Vector3();
  private originWorld = new T.Vector3();
  private readonly steam = new T.Group();
  private readonly geometry = new T.PlaneGeometry(1, 1, 8, 20).translate(0, .5, 0);
  private readonly materials: T.ShaderMaterial[] = [];
  private readonly ribbons: T.Mesh<T.PlaneGeometry,T.ShaderMaterial>[] = [];
  private readonly parts: MovingPart[] = [];
  private readonly quaternion = new T.Quaternion();
  private readonly parentQuaternion = new T.Quaternion();
  private readonly cameraPosition = new T.Vector3();
  private steamHeight = 0;
  private state?: AmbientState;

  constructor(private readonly root: T.Object3D) {
    this.steam.name = 'CupSteamV13';
    this.steam.userData.dynamic = true;
    this.steam.visible = false;
    for (let i=0; i<2; i++) {
      const material = new T.ShaderMaterial({
        vertexShader, fragmentShader,
        uniforms: {uTime:{value:0},uPhase:{value:i*2.7},uOpacity:{value:i ? .22 : .38}},
        transparent:true, depthWrite:false, depthTest:true, side:T.DoubleSide,
      });
      const ribbon = new T.Mesh(this.geometry,material);
      ribbon.name = `CupSteamWisp${i}`;
      ribbon.raycast = () => {};
      ribbon.userData.dynamic = true;
      ribbon.frustumCulled = false;
      this.materials.push(material); this.ribbons.push(ribbon); this.steam.add(ribbon);
    }
    root.add(this.steam);
    this.discoverParts();
    this.bindCup();
  }

  private discoverParts() {
    this.root.traverse(object => {
      const role = object.userData.motionRole as string | undefined;
      if (!role || !/chair|fan/i.test(role)) return;
      object.userData.dynamic = true;
      // A dynamic parent must not have its geometry merged into a static batch.
      object.traverse(child => {child.userData.dynamic = true;});
      const name = String(object.userData.motionAxis ?? 'y').toLowerCase();
      const axis = name==='x' ? new T.Vector3(1,0,0) : name==='z' ? new T.Vector3(0,0,1) : new T.Vector3(0,1,0);
      let face:'work'|'leisure'='work';
      for(let p:T.Object3D|null=object;p;p=p.parent) if(p.name==='LeisureFace') face='leisure';
      this.parts.push({object,role,axis,neutral:object.quaternion.clone(),face,time:0});
    });
  }

  private bindCup() {
    const cup=this.root.getObjectByName('DrinkingCupMotion');
    const work=this.root.getObjectByName('WorkFace');
    if (!cup || !work) return;
    cup.updateWorldMatrix(true,true);
    const inverse=cup.matrixWorld.clone().invert(), box=new T.Box3();
    cup.traverse(object=>{
      if (!(object instanceof T.Mesh) || !object.geometry) return;
      object.geometry.computeBoundingBox();
      if (object.geometry.boundingBox) box.union(object.geometry.boundingBox.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,object.matrixWorld)));
    });
    if (box.isEmpty()) return;
    this.cup=cup;this.workFace=work;
    box.getCenter(this.rim);this.rim.y=box.max.y+.008;
    const anchor=cup.getObjectByName('CupSteamAnchor');
    if(anchor)this.rim.copy(cup.worldToLocal(anchor.getWorldPosition(new T.Vector3())));
    const diameter=Math.min(box.max.x-box.min.x,box.max.z-box.min.z);
    this.steamHeight=T.MathUtils.clamp(diameter*2.4,.48,.74);
    for(let i=0;i<this.ribbons.length;i++) this.ribbons[i].scale.set(diameter*.85,this.steamHeight*(i ? .90 : 1),1);
  }

  update(dt:number,camera:T.Camera,state:AmbientState) {
    if(this.disposed)return;
    this.state=state;
    if(!this.cup)this.bindCup();
    const active=!state.transitioning&&!state.reducedMotion;
    if(active&&state.mode==='work')this.elapsed+=T.MathUtils.clamp(dt,0,.05);
    for(const part of this.parts) {
      const animate=active&&state.mode===part.face;
      if(animate)part.time+=T.MathUtils.clamp(dt,0,.05);
      if(!animate&&!state.reducedMotion)continue;
      const angle=state.reducedMotion ? 0 : /fan/i.test(part.role) ? part.time*2.4 : Math.sin(part.time*.5)*.18;
      part.object.quaternion.copy(part.neutral).multiply(this.quaternion.setFromAxisAngle(part.axis,angle));
    }
    this.steam.visible=active&&state.mode==='work'&&!!this.cup&&!!this.workFace;
    if(!this.steam.visible||!this.cup||!this.workFace)return;
    this.cup.updateWorldMatrix(true,false);
    this.originWorld.copy(this.rim).applyMatrix4(this.cup.matrixWorld);
    this.root.updateWorldMatrix(true,false);
    this.steam.position.copy(this.root.worldToLocal(this.originWorld.clone()));
    this.workFace.getWorldQuaternion(this.quaternion);
    this.root.getWorldQuaternion(this.parentQuaternion).invert();
    this.steam.quaternion.copy(this.parentQuaternion.multiply(this.quaternion));
    this.steam.updateWorldMatrix(true,false);
    camera.getWorldPosition(this.cameraPosition);this.steam.worldToLocal(this.cameraPosition);
    const azimuth=Math.atan2(this.cameraPosition.x,this.cameraPosition.z);
    this.ribbons.forEach((ribbon,i)=>{
      ribbon.rotation.y=azimuth+(i ? .24 : 0);
      ribbon.material.uniforms.uTime.value=this.elapsed;
      ribbon.material.uniforms.uOpacity.value=(i ? .22 : .38)*(state.drinking ? .62 : 1);
    });
  }

  /** Stable ray queries observe the unanimated object while rendering keeps motion. */
  withNeutralPose<R>(fn:()=>R):R {
    const current=this.parts.map(part=>part.object.quaternion.clone());
    try {
      this.parts.forEach(part=>{part.object.quaternion.copy(part.neutral);part.object.updateWorldMatrix(true,true);});
      return fn();
    } finally {
      this.parts.forEach((part,i)=>{part.object.quaternion.copy(current[i]);part.object.updateWorldMatrix(true,true);});
    }
  }

  diagnostics() {
    return {steamVisible:this.steam.visible,cupBound:!!this.cup,steamOrigin:this.originWorld.toArray(),steamHeight:this.steamHeight,
      elapsed:this.elapsed,mode:this.state?.mode,movingParts:this.parts.map(p=>({name:p.object.name,role:p.role,axis:p.axis.toArray()})),disposed:this.disposed};
  }

  dispose() {
    if(this.disposed)return;
    this.disposed=true;this.steam.removeFromParent();this.geometry.dispose();
    this.materials.forEach(material=>material.dispose());
    this.parts.forEach(part=>{part.object.quaternion.copy(part.neutral);part.object.updateWorldMatrix(true,true);});
  }
}
