import * as T from 'three';

const vertex = /* glsl */`
 varying vec3 vPosition;
 varying vec3 vNormal;
 varying vec3 vWorld;
 void main(){
  vPosition=position;vNormal=normalize(mat3(modelMatrix)*normal);
  vWorld=(modelMatrix*vec4(position,1.0)).xyz;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
 }`;
const noise = /* glsl */`
 float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
 float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 float fbm(vec3 p){return .56*noise3(p)+.27*noise3(p*2.03)+.12*noise3(p*4.07);}
`;

/** Distant, fictional celestial scenery. All coordinates are world-space. */
export class Cosmos {
 readonly root = new T.Group();
 private sky: T.ShaderMaterial;
 private movers: {mesh:T.Mesh;center:T.Vector3;a:number;b:number;tilt:T.Quaternion;phase:number;speed:number}[]=[];
 private time=0;private daylight=.5;
 private lastElapsed:number|undefined;
 private reduced=false;
 private disposed=false;
 constructor(scene:T.Scene){
  this.root.name='Fairytale cosmos';this.root.userData.dynamic=true;scene.add(this.root);
  this.sky=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,toneMapped:false,
   uniforms:{warmth:{value:.5},daylight:{value:.5}},vertexShader:vertex,fragmentShader:/* glsl */`
    varying vec3 vPosition;uniform float warmth;uniform float daylight;${noise}
    void main(){vec3 d=normalize(vPosition);float n=fbm(d*4.8+vec3(3.2,1.7,9.1));
     float cloud=smoothstep(.35,.73,n)*smoothstep(.05,.75,1.0-abs(d.y*.9+d.x*.38));
     vec3 base=mix(vec3(.012,.019,.055),vec3(.035,.046,.105),clamp(d.y*.5+.5,0.,1.));
     vec3 haze=mix(vec3(.065,.09,.16),vec3(.15,.065,.14),warmth);
     vec3 color=base+haze*cloud*.52+vec3(.018,.045,.046)*pow(max(0.,1.-abs(d.x+d.z*.55)),4.);
     color=mix(color,vec3(.12,.16,.23)+color*.75,daylight*.6);gl_FragColor=vec4(color,1.);#include <colorspace_fragment>
    }`.replace(';#include',';\n#include')});
  const sky=new T.Mesh(new T.SphereGeometry(185,48,24),this.sky);sky.name='Deep velvet sky';sky.renderOrder=-10;this.root.add(sky);
  this.addStars();
  const giant=this.planet(9.2,'#9dc5b8','#507d89');giant.position.set(20,-3,-26);giant.scale.setScalar(.5);giant.rotation.z=-.25;giant.name='Mint ringed planet';this.root.add(giant);
  const ring=new T.Mesh(new T.RingGeometry(11.8,17.8,192,4),new T.ShaderMaterial({vertexShader:vertex,side:T.DoubleSide,transparent:true,depthWrite:false,toneMapped:false,fragmentShader:/* glsl */`
   varying vec3 vPosition;void main(){float r=length(vPosition.xy);float t=(r-11.8)/6.;
    float grooves=.5+.5*sin(r*21.)*.45+.12*sin(r*61.);
    float gap=1.-.8*exp(-pow((t-.62)*47.,2.));float edge=smoothstep(0.,.035,t)*(1.-smoothstep(.96,1.,t));
    vec3 c=mix(vec3(.60,.49,.34),vec3(.88,.79,.59),grooves);
    gl_FragColor=vec4(c,edge*gap*(.38+grooves*.42));
    #include <colorspace_fragment>
   }`}));
  ring.name='Layered champagne rings';ring.rotation.x=-1.0;ring.rotation.y=.22;giant.add(ring);
  const lilac=this.planet(3.4,'#c6afd5','#716d9a');lilac.position.set(-28,-5,-26);lilac.name='Lilac moon';this.root.add(lilac);
  this.orbit(new T.Vector3(0,8,-63),44,23,new T.Euler(.32,.08,-.16),'#afc9bd',.85,1.22,.012);
  this.orbit(new T.Vector3(0,9,-69),51,27,new T.Euler(-.28,.10,.31),'#c6a7c9',1.12,3.75,-.007);
  this.root.traverse(o=>{o.userData.dynamic=true;o.frustumCulled=false});
 }
 private planet(radius:number,light:string,dark:string){
  const group=new T.Group();
  const sphere=new T.Mesh(new T.SphereGeometry(radius,64,40),new T.ShaderMaterial({vertexShader:vertex,toneMapped:false,uniforms:{lightColor:{value:new T.Color(light)},darkColor:{value:new T.Color(dark)}},fragmentShader:/* glsl */`
   varying vec3 vPosition;varying vec3 vNormal;varying vec3 vWorld;uniform vec3 lightColor;uniform vec3 darkColor;${noise}
   void main(){vec3 p=normalize(vPosition);float cloud=fbm(p*7.);float bands=.5+.5*sin(p.y*28.+cloud*4.);
    vec3 color=mix(darkColor,lightColor,.45+.43*bands);float diffuse=max(dot(normalize(vNormal),normalize(vec3(-.65,.85,.6))),0.);
    color*=.32+.78*diffuse;float rim=pow(1.-max(0.,dot(normalize(vNormal),normalize(cameraPosition-vWorld))),3.);
    color+=lightColor*rim*.16;gl_FragColor=vec4(color,1.);
    #include <colorspace_fragment>
   }`}));group.add(sphere);
  const atmosphere=new T.Mesh(new T.SphereGeometry(radius*1.035,48,32),new T.ShaderMaterial({vertexShader:vertex,transparent:true,depthWrite:false,side:T.BackSide,blending:T.AdditiveBlending,toneMapped:false,uniforms:{tint:{value:new T.Color(light)}},fragmentShader:/* glsl */`
   varying vec3 vNormal;varying vec3 vWorld;uniform vec3 tint;
   void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(cameraPosition-vWorld))),4.);gl_FragColor=vec4(tint,rim*.20);
    #include <colorspace_fragment>
   }`}));group.add(atmosphere);return group;
 }
 private addStars(){
  let seed=82743;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  const positions:number[]=[],colors:number[]=[],sizes:number[]=[];
  for(let i=0;i<760;i++){const y=random()*2-1,theta=random()*Math.PI*2,r=153+random()*13,h=Math.sqrt(1-y*y);positions.push(r*h*Math.cos(theta),r*y,r*h*Math.sin(theta));const c=new T.Color().setRGB(.58+random()*.3,.66+random()*.25,.72+random()*.25);colors.push(c.r,c.g,c.b);sizes.push(random()<.075?3.4:1.1+random()*1.3)}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setAttribute('size',new T.Float32BufferAttribute(sizes,1));
  const m=new T.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,vertexShader:/* glsl */`
   attribute vec3 color;attribute float size;varying vec3 vColor;void main(){vColor=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size;}`,fragmentShader:/* glsl */`
   varying vec3 vColor;void main(){float d=length(gl_PointCoord-.5)*2.;float a=1.-smoothstep(.12,1.,d);gl_FragColor=vec4(vColor,a*.78);
    #include <colorspace_fragment>
   }`});const stars=new T.Points(g,m);stars.name='Quiet starfield';this.root.add(stars);
 }
 private orbit(center:T.Vector3,a:number,b:number,rotation:T.Euler,color:string,radius:number,phase:number,speed:number){
  const tilt=new T.Quaternion().setFromEuler(rotation);const points:T.Vector3[]=[];
  for(let i=0;i<256;i++){const t=i/256*Math.PI*2;points.push(new T.Vector3(Math.cos(t)*a,Math.sin(t)*b,0).applyQuaternion(tilt).add(center))}
  const line=new T.LineLoop(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color,transparent:true,opacity:.23,toneMapped:false,depthWrite:false}));line.name='Distant orbital path';this.root.add(line);
  const mesh=new T.Mesh(new T.SphereGeometry(radius,32,24),new T.MeshBasicMaterial({color,toneMapped:false}));mesh.name='Orbiting little moon';this.root.add(mesh);this.movers.push({mesh,center,a,b,tilt,phase,speed});
  this.placeMoon(this.movers[this.movers.length-1]);
 }
 private placeMoon(m:typeof this.movers[number]){const angle=m.phase+this.time*m.speed;m.mesh.position.set(Math.cos(angle)*m.a,Math.sin(angle)*m.b,0).applyQuaternion(m.tilt).add(m.center)}
 setDaylight(value:number){this.daylight=T.MathUtils.clamp(value,0,1);this.sky.uniforms.daylight.value=this.daylight;}
 update(elapsed:number,date:Date,reducedMotion:boolean){
  if(this.disposed)return;
  const dt=this.lastElapsed===undefined?0:Math.max(0,Math.min(elapsed-this.lastElapsed,.1));this.lastElapsed=elapsed;this.reduced=reducedMotion;
  if(!reducedMotion)this.time+=dt;
  const h=date.getHours()+date.getMinutes()/60;this.sky.uniforms.warmth.value=.5+.5*Math.sin((h-12)/24*Math.PI*2);
  this.movers.forEach(m=>this.placeMoon(m));
 }
 diagnostics(){return {theme:'fairytale-cosmos',stars:760,orbitCount:this.movers.length,motionSeconds:Number(this.time.toFixed(3)),reducedMotion:this.reduced,moonPositions:this.movers.map(m=>m.mesh.position.toArray().map(n=>Number(n.toFixed(3))))}}
 dispose(){if(this.disposed)return;this.disposed=true;this.root.removeFromParent();const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();this.root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line||o instanceof T.Points){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m))}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.movers=[]}
}
