import * as T from 'three';
import { Cosmos } from './Cosmos';
import { InteractiveProps } from './InteractiveProps';
import { HoverMotion } from './HoverMotion';
import { AmbientMotion } from './AmbientMotion';
import { captureWaterPositions, animateWater } from './water-motion';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Zone, Todo, Entry, Root, SceneMode, PresentationTheme } from '../../shared/contracts';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const smooth=(t:number)=>{t=T.MathUtils.clamp(t,0,1);return t*t*(3-2*t)};
type Pose={position:T.Vector3;target:T.Vector3};
const localPoses:Record<Exclude<Zone,'overview'>,Pose>={
 desk:{position:V(3.1,5.75,1.45),target:V(-3.9,1.55,-.55)},
 library:{position:V(4.95,4.5,7.0),target:V(2.05,1.7,-1.8)},
 balcony:{position:V(7.5,5.9,8.8),target:V(2.9,.9,1.1)},
 lounge:{position:V(5.1,4.4,6.5),target:V(.9,1.4,-1.6)},
 piano:{position:V(-1.15,3.6,5.3),target:V(-1.70,1.35,-2.4)},
 pond:{position:V(10.6,5.2,7.4),target:V(5.1,.5,.5)},
};
const roomPoses:Record<SceneMode,Pose>={work:{position:V(9.04,6.58,12.82),target:V(-.2,1.75,-.2)},leisure:{position:V(10.47,7.03,14.78),target:V(.7,1.35,0)}};
const globePose:Pose={position:V(26,-5,58),target:V(0,-10,0)};
const zoneMode=(zone:Zone):SceneMode|null=>zone==='overview'?null:zone==='desk'||zone==='library'?'work':'leisure';
const actionNames:Record<string,string>={'profile:about':'关于花卷AI实验室','profile:github':'打开 GitHub · wz20','profile:douyin':'在抖音搜索花卷AI实验室',stargaze:'用望远镜看星空',todos:'编辑今日待办',recent:'打开最近文档',clock:'查看实时时钟',water:'拿起水壶浇水',pet:'和卡比打个招呼',play:'和卡比玩耍',breakout:'玩打砖块',fishing:'开始钓鱼',library:'浏览知识库',drink:'喝水与今日记录',move:'起来活动一下',piano:'弹一首小曲',music:'播放或暂停音乐','history:all':'查看生活记录','history:catch':'查看鱼类与捕获记录'};
type Flip={from:SceneMode;to:SceneMode;zone:Zone;time:number;startPosition:T.Vector3;startTarget:T.Vector3;angle:number;swapped:boolean;reduced:boolean};

/** One authored globe, two opposite local-gravity faces, and stable screen-space controls. */
export class World {
 private scene=new T.Scene();private camera=new T.PerspectiveCamera(42,1,.1,300);
 private renderer:T.WebGLRenderer;private composer:EffectComposer;private controls:OrbitControls;private cosmos:Cosmos;
 private planetPivot=new T.Group();private overlay=new T.Group();private root=new T.Group();private workFace?:T.Object3D;private leisureFace?:T.Object3D;private homeRing?:T.Object3D;
 private interactionPose?:Pose;
 private mode:SceneMode='work';private zone:Zone='overview';private globe=false;private stargazing=false;private flip?:Flip;private queued?:{mode:SceneMode;zone:Zone;globe?:boolean};private transition=1;private fromPosition=V();private fromTarget=V();
 private interactive=true;private theme:PresentationTheme='auto';private daylight=.7;private themeTarget=.7;
 private sun=new T.DirectionalLight('#fff0d1',3);private hemi=new T.HemisphereLight('#e2f0fa','#988c75',2);
 private bloom?:UnrealBloomPass;private lamps:{light:T.PointLight|T.SpotLight;mode:SceneMode;night:number;day:number}[]=[];private deviceLight?:T.PointLight;private glowMaterials=new Map<T.MeshStandardMaterial,number>();private environmentTarget:T.WebGLRenderTarget;
 private resizeObserver:ResizeObserver;private visible=true;private disposed=false;private frame=0;private last=0;private elapsed=0;private fps=0;private sampleTime=0;private frames=0;private assetStatus='loading';
 private ray=new T.Raycaster();private pointer=new T.Vector2();private pickables:T.Object3D[]=[];private tooltip:HTMLDivElement;private down={x:0,y:0};private dragMoved=false;private hover?:T.Object3D;
 private highlighted:{mesh:T.Mesh;original:T.Material|T.Material[];clones:T.Material[]}[]=[];
 private board:T.CanvasTexture;private papers:T.CanvasTexture;private digitalDisplay?:T.CanvasTexture;private displaySecond=-1;private displayTime='';private arcadeTexture:T.CanvasTexture;
 private materials=new Map<string,T.MeshStandardMaterial>();private geometries=new Map<string,T.BufferGeometry>();
 private todoData:Todo[]=[];private todoPage=0;private rootData:Root[]=[];private rootPage=0;private rootsKey='';private rootBooks=new T.Group();
 private bookGesture?:{book:T.Group;cover:T.Group;position:T.Vector3;time:number};
 private hoverMotion=new HoverMotion();private ambientMotion?:AmbientMotion;
 private props?:InteractiveProps;private reminderState:{kind:string;phase:string}[]=[];private plantById=new Map<string,T.Group>();private lastPlantState:Record<string,number>={};
 private waterMesh?:T.Mesh;private waterBase?:Float32Array;
 private kirby?:T.Object3D;private kirbyBody?:T.Object3D;private kirbyLimbs:T.Object3D[]=[];private kirbyEyes:T.Object3D[]=[];private kirbyLids:T.Object3D[]=[];private kirbyRest=V();private kirbyState='rest';private kirbyTime=0;private kirbyTimer=9;private kirbyPath=0;private kirbyWaypoints=[V(-.65,.21,2.95),V(-.15,.21,3.0),V(-.45,.21,2.55)];
 private musicPlaying=false;private speakerLights:T.Mesh[]=[];private pianoNotes=new Set<string>();private pianoKeys=new Map<string,{object:T.Object3D;y:number}>();
 private reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 constructor(private container:HTMLElement,private onAction:(action:string)=>void){
  this.renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1;
  this.renderer.domElement.setAttribute('aria-label','双面星球知识小屋：工作与休闲，点击物件使用');container.appendChild(this.renderer.domElement);
  this.tooltip=document.createElement('div');Object.assign(this.tooltip.style,{position:'absolute',pointerEvents:'none',padding:'8px 13px',background:'#fffaf0',color:'#354b3c',borderRadius:'10px',fontSize:'13px',boxShadow:'0 3px 20px #40392622',display:'none',zIndex:'4'});container.appendChild(this.tooltip);
  this.camera.position.copy(roomPoses.work.position);this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.copy(roomPoses.work.target);this.controls.enableDamping=true;this.controls.enablePan=false;this.controls.rotateSpeed=.45;this.controls.zoomSpeed=.6;this.controls.dampingFactor=.09;
  this.controls.addEventListener('start',()=>{if(!this.flip)this.transition=1});this.configureControls();
  this.planetPivot.name='PlanetRotationPivot';this.planetPivot.position.y=-10;this.overlay.name='ActiveFaceInteractionOverlay';this.scene.add(this.planetPivot,this.overlay,this.hemi,this.sun);this.cosmos=new Cosmos(this.scene);
  this.sun.position.set(-8,10,9);this.sun.castShadow=true;Object.assign(this.sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18,near:.1,far:75});this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.radius=3;this.sun.shadow.bias=-.00025;this.sun.shadow.normalBias=.015;
  this.board=this.canvasTexture(()=>{});this.papers=this.canvasTexture(()=>{},768,512);this.setTodos([]);this.setRecent([]);
  this.arcadeTexture=this.canvasTexture(c=>{c.fillStyle='#203933';c.fillRect(0,0,480,320);for(let r=0;r<3;r++)for(let x=0;x<6;x++){c.fillStyle=['#e8c587','#b6cf9c','#85c4b5'][r];c.fillRect(30+x*72,35+r*32,64,21)}c.fillStyle='#fff1c9';c.fillRect(190,278,100,9)},480,320);
  const pmrem=new T.PMREMGenerator(this.renderer),environment=new RoomEnvironment();this.environmentTarget=pmrem.fromScene(environment,.04);this.scene.environment=this.environmentTarget.texture;this.scene.environmentIntensity=.32;environment.dispose();pmrem.dispose();
  this.renderer.info.autoReset=false;this.composer=new EffectComposer(this.renderer,new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:2}));this.composer.addPass(new RenderPass(this.scene,this.camera));this.bloom=new UnrealBloomPass(new T.Vector2(640,480),.10,.28,2.0);this.composer.addPass(this.bloom);this.composer.addPass(new OutputPass());
  this.loadPlanet();this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
  const canvas=this.renderer.domElement;canvas.addEventListener('pointerdown',this.pointerDown);canvas.addEventListener('pointerup',this.pointerUp);canvas.addEventListener('pointermove',this.pointerMove);canvas.addEventListener('pointerleave',this.pointerLeave);canvas.addEventListener('pointercancel',this.pointerLeave);
  window.__world=this;this.frame=requestAnimationFrame(this.tick);
 }
 private batchMeshes(parent:T.Object3D){
  parent.updateWorldMatrix(true,true);const inverse=parent.matrixWorld.clone().invert();
  // A material alone is insufficient: imported UV/tangent/color layouts differ.
  const batches=new Map<T.Material,Map<string,T.Mesh[]>>();
  parent.traverse(o=>{
   if(!(o instanceof T.Mesh)||Array.isArray(o.material)||o instanceof T.SkinnedMesh)return;
   let node:T.Object3D|null=o;while(node&&node!==parent){if(node.userData.action||node.userData.dynamic)return;node=node.parent}
   if(Object.keys(o.geometry.morphAttributes).length)return;
   const signature=Object.keys(o.geometry.attributes).sort().map(name=>{const attribute=o.geometry.getAttribute(name);return `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`}).join('|');
   const layouts=batches.get(o.material)??new Map<string,T.Mesh[]>(),list=layouts.get(signature)??[];list.push(o);layouts.set(signature,list);batches.set(o.material,layouts);
  });
  for(const [material,layouts] of batches)for(const meshes of layouts.values()){
   if(meshes.length<2)continue;
   const transformed=meshes.map(mesh=>{const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();return geometry.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld))});
   const geometry=mergeGeometries(transformed);transformed.forEach(g=>g.dispose());if(!geometry)continue;
   meshes.forEach(mesh=>mesh.removeFromParent());const merged=new T.Mesh(geometry,material);merged.name='Static material batch';merged.castShadow=true;merged.receiveShadow=true;parent.add(merged);
  }
 }
 private mat(color:string){let material=this.materials.get(color);if(!material){material=new T.MeshStandardMaterial({color,roughness:.78});this.materials.set(color,material)}return material}
 private box(w:number,h:number,d:number,color:string,parent:T.Object3D,x=0,y=0,z=0,r=.04){const key=`${w},${h},${d},${r}`;let geometry=this.geometries.get(key);if(!geometry){geometry=new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3));this.geometries.set(key,geometry)}const mesh=new T.Mesh(geometry,this.mat(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh}
 private group(x:number,y:number,z:number,parent:T.Object3D=this.root){const group=new T.Group();group.position.set(x,y,z);parent.add(group);return group}
 private action(object:T.Object3D,action:string){object.userData.action=action;this.pickables.push(object);return object}
 private canvasTexture(draw:(c:CanvasRenderingContext2D)=>void,w=1024,h=512){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;draw(canvas.getContext('2d')!);const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;return texture}
 private panel(w:number,h:number,texture:T.Texture,parent:T.Object3D,x:number,y:number,z:number){const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshStandardMaterial({map:texture,roughness:.9}));mesh.position.set(x,y,z);parent.add(mesh);return mesh}
 private loadPlanet(){
  const loading=document.createElement('div');loading.className='world-loading';loading.textContent='正在点亮双面星球…';this.container.appendChild(loading);
  new GLTFLoader().loadAsync('./models/reference-room-v24.glb').then(gltf=>{
   if(this.disposed){this.disposeObject(gltf.scene);return}
   const model=gltf.scene,required=['WorkFace','LeisureFace','BoardSurface','RecentSurface','DigitalClockSurface','Kirby','KirbyBody','CanSpoutTip','RodTip','ArcadeSurface','balcony-1','balcony-2','balcony-3','PondWater'];
   const missing=required.filter(name=>!model.getObjectByName(name));if(missing.length)throw Error('Missing dual planet nodes: '+missing.join(', '));
   this.root=model;this.workFace=model.getObjectByName('WorkFace')!;this.leisureFace=model.getObjectByName('LeisureFace')!;this.workFace.userData.dynamic=true;this.leisureFace.userData.dynamic=true;this.planetPivot.add(model);
   this.homeRing=model.getObjectByName('HomePlanetRing')??model.getObjectByName('PlanetRing');if(this.homeRing)this.homeRing.userData.dynamic=true;
   model.traverse(o=>{
    if(o.userData.action)this.action(o,o.userData.action);
    if(o.userData.dynamic||o.name.startsWith('PianoKey_'))o.userData.dynamic=true;
    if(o.name.startsWith('PianoKey_')){const raw=o.name.slice(9).replace('s','#');this.pianoKeys.set(raw,{object:o,y:o.position.y});}
    if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof T.MeshStandardMaterial){for(const texture of [m.map,m.normalMap,m.roughnessMap,m.metalnessMap,m.aoMap])if(texture)texture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());if(m.name==='Device clear side-panel glass'){m.depthWrite=false;o.castShadow=false;}if(m.emissiveIntensity>0&&m.emissive.getHex()!==0)this.glowMaterials.set(m,Math.max(.5,m.emissiveIntensity));}if(/Speaker.*(LED|Light)|SpeakerIndicator/i.test(o.name)){o.userData.dynamic=true;o.material=(o.material as T.Material).clone();this.speakerLights.push(o);}}
   });
   const bind=(name:string,texture:T.Texture,emissive=false)=>{const object=model.getObjectByName(name);if(!(object instanceof T.Mesh))return;texture.flipY=false;texture.needsUpdate=true;object.material=emissive?new T.MeshBasicMaterial({map:texture,toneMapped:false}):new T.MeshStandardMaterial({map:texture,roughness:.88});object.userData.dynamic=true;};
   for(const [prefix,label] of [['ProfileAboutSurface','关于小屋'],['ProfileGitHubSurface','GitHub'],['ProfileDouyinSurface','抖音']] as const){
    const texture=this.canvasTexture(c=>{c.clearRect(0,0,768,256);c.fillStyle='#fff0cf';c.font='600 108px "PingFang SC", sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(label,384,132);},768,256);
    texture.flipY=false;model.traverse(object=>{if(object instanceof T.Mesh&&object.name.startsWith(prefix.replace('Surface',''))&&object.name.endsWith('Surface')){object.material=new T.MeshStandardMaterial({map:texture,transparent:true,roughness:.8,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});object.castShadow=false;object.userData.dynamic=true;}});
   }
   bind('BoardSurface',this.board);bind('RecentSurface',this.papers);bind('ArcadeSurface',this.arcadeTexture,true);
   this.digitalDisplay=this.canvasTexture(()=>{},768,288);bind('DigitalClockSurface',this.digitalDisplay,true);
   // Keep the authored wallpaper from the GLB; screen clicks retain the Computer action.
   for(const name of ['ComputerScreen','MonitorScreen','MonitorSurface','ComputerSurface']){
    const screen=model.getObjectByName(name);
    if(screen instanceof T.Mesh){const original=Array.isArray(screen.material)?screen.material[0]:screen.material;
     if(original instanceof T.MeshStandardMaterial&&original.map){screen.material=new T.MeshBasicMaterial({map:original.map,toneMapped:false});screen.userData.dynamic=true;}
    }
   }
   for(const id of ['balcony-1','balcony-2','balcony-3']){const plant=model.getObjectByName(id) as T.Group;const soil=model.getObjectByName('Soil_'+id) as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>|undefined;if(soil){soil.userData.dynamic=true;soil.material=soil.material.clone();plant.userData.soil=soil;}this.plantById.set(id,plant)}
   this.kirby=model.getObjectByName('Kirby')!;this.kirby.userData.dynamic=true;this.kirbyRest.copy(this.kirby.position);this.kirbyBody=model.getObjectByName('KirbyBody');this.kirbyLimbs=['KirbyArmL','KirbyArmR','KirbyFootL','KirbyFootR'].map(n=>model.getObjectByName(n)).filter((o):o is T.Object3D=>!!o);this.kirbyEyes=['KirbyEyeL','KirbyEyeR'].map(n=>model.getObjectByName(n)).filter((o):o is T.Object3D=>!!o);this.kirbyLids=['KirbyLidL','KirbyLidR'].map(n=>model.getObjectByName(n)).filter((o):o is T.Object3D=>!!o);this.kirbyLids.forEach(o=>o.visible=false);
   for(const part of [this.kirbyBody,...this.kirbyEyes,...this.kirbyLimbs])if(part){part.userData.dynamic=true;part.userData.neutralScale=part.scale.clone();part.userData.neutralRotation=part.rotation.clone();}
   // Runtime effects live in the world overlay because local gravity flips with each face.
   this.planetPivot.rotation.x=this.mode==='work'?0:Math.PI;this.root.updateWorldMatrix(true,true);
   this.props=new InteractiveProps(model,this.overlay);this.props.reminders(this.reminderState);this.props.resize(this.container.clientWidth,this.container.clientHeight);
   const pond=model.getObjectByName('PondWater') as T.Mesh;pond.userData.dynamic=true;pond.material=new T.MeshPhysicalMaterial({color:'#73aaa4',roughness:.24,metalness:.05,transparent:true,opacity:.90,clearcoat:1,envMapIntensity:1.1});pond.castShadow=false;pond.geometry=pond.geometry.clone();this.waterMesh=pond;this.waterBase=captureWaterPositions(pond.geometry);
   const bookAnchor=model.getObjectByName('DirectoryBooksAnchor');this.rootBooks.userData.dynamic=true;if(bookAnchor)bookAnchor.add(this.rootBooks);else{this.rootBooks.position.set(2.6,.2,-4.0);this.workFace.add(this.rootBooks)}
   // Position pools of light at the actual fixtures, not arbitrary room fill points.
   const fixture=(name:string,mode:SceneMode,color:string,night:number,range:number,offset=V(),down=false)=>{
    const object=model.getObjectByName(name)??model.getObjectByName(T.PropertyBinding.sanitizeNodeName(name));if(!object)return;
    const face=mode==='work'?this.workFace!:this.leisureFace!;
    model.updateWorldMatrix(true,true);const bounds=new T.Box3().setFromObject(object),center=bounds.getCenter(V());
    const position=face.worldToLocal(center).add(offset);
    const light=down?new T.SpotLight(color,0,range,Math.PI*.37,.8,2):new T.PointLight(color,0,range,2);
    light.position.copy(position);face.add(light);
    if(light instanceof T.SpotLight){light.target.position.copy(position).add(V(0,-2.5,.15));face.add(light.target);light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.bias=-.0003;light.shadow.normalBias=.025;}
    this.lamps.push({light,mode,night,day:down?.10:0});
   };
   for(let i=0;i<9;i++)fixture('DeskStringBulb'+i,'work','#ffd5ad',.24,1.8,V(.04,-.02,0));
   fixture('Ref Reading lamp Lamp','work','#ffe6d0',3.2,4,V(-.15,.15,.18));
   fixture('MonitorScreen','work','#efa5ff',2.7,4.2,V(0,.03,.30));
   for(let i=0;i<11;i++){const name='Ref Warm festoon lights Lights'+(i===0?'':'.'+String(i+1).padStart(3,'0'));fixture(name,'leisure','#ffdeb5',.36,2.0,V(0,-.04,.08));}
   fixture('ArcadeSurface','leisure','#a6caff',1.6,3.0,V(0,0,.25));
   fixture('SpeakerIndicator','leisure','#c6b9ff',.3,1.6,V(0,0,.15));
   this.ambientMotion=new AmbientMotion(model);
   // Never merge geometry across the opposite face transforms.
   for(const action of this.pickables)this.batchMeshes(action);this.batchMeshes(this.workFace);this.batchMeshes(this.leisureFace);this.batchMeshes(model);
   const pcLight=model.getObjectByName('PCInteriorLight');if(pcLight){this.deviceLight=new T.PointLight('#e6a9ff',.1,2.5,2);pcLight.add(this.deviceLight);}
   this.assetStatus='ready';this.setPlants(this.lastPlantState);this.applyFaceVisibility();this.props.setMode(this.mode,!!this.flip);loading.remove();
  }).catch(error=>{this.assetStatus='failed';loading.textContent='星球模型未能载入，请重新打开程序。';console.error(error)});
 }
 setRoots(roots:Root[]){this.rootData=roots;this.rootPage=Math.min(this.rootPage,Math.max(0,Math.ceil(roots.length/3)-1));const key=JSON.stringify([roots,this.rootPage]);if(key===this.rootsKey)return;this.rootsKey=key;this.closeBook();this.clearHighlight();this.hover=undefined;
  const obsolete=new Set(this.rootBooks.children);this.pickables=this.pickables.filter(o=>!obsolete.has(o));
  for(const child of [...this.rootBooks.children]){child.traverse(o=>{if(o instanceof T.Mesh&&o.material instanceof T.MeshStandardMaterial&&o.material.map){o.material.map.dispose();o.material.dispose();o.geometry.dispose()}});this.rootBooks.remove(child)}
  roots.slice(this.rootPage*3,this.rootPage*3+3).forEach((root,i)=>{const book=this.group(-1.45+i*1.45,2.55,.62,this.rootBooks);this.action(book,'library:'+((root as Root & {rootId?:string}).rootId||root.id)+((root as Root & {parentId?:string}).parentId?':'+root.id:''));this.box(1.16,.83,.13,['#758f7d','#bf9872','#8c9c9e'][i],book);const texture=this.canvasTexture(c=>{c.fillStyle=['#758f7d','#bf9872','#8c9c9e'][i];c.fillRect(0,0,768,512);c.fillStyle='#fcf4db';c.font='600 52px "PingFang SC",sans-serif';c.textAlign='center';c.fillText(root.name.slice(0,9),384,218);c.font='30px "PingFang SC",sans-serif';c.font='600 76px "PingFang SC",sans-serif';c.fillText(String((root as Root & {noteCount?:number}).noteCount??'—')+' 篇',384,328);c.font='28px "PingFang SC",sans-serif';c.fillText('含所有下级目录',384,404)},768,512);const cover=this.group(-.57,0,.081,book);cover.userData.dynamic=true;book.userData.cover=cover;book.name='DirectoryBook-'+root.id;this.box(1.14,.83,.024,['#758f7d','#bf9872','#8c9c9e'][i],cover,.57,0,0,.009);this.panel(1.09,.76,texture,cover,.57,0,.016);this.box(1.10,.78,.018,'#f2e8d0',book,0,0,.071,.008)})
 }
 setTodoPage(page:number){this.todoPage=Math.max(0,Math.min(page,Math.ceil(this.todoData.length/5)-1));this.setTodos(this.todoData)}
 setRootPage(page:number){this.rootPage=Math.max(0,Math.min(page,Math.ceil(this.rootData.length/3)-1));this.setRoots(this.rootData)}
 openBook(id:string){this.closeBook();const book=this.rootBooks.getObjectByName('DirectoryBook-'+id) as T.Group|undefined;if(book)this.bookGesture={book,cover:book.userData.cover,position:book.position.clone(),time:0}}
 closeBook(){if(this.bookGesture){this.bookGesture.book.position.copy(this.bookGesture.position);this.bookGesture.cover.rotation.y=0;this.bookGesture=undefined}}
 setTodos(todos:Todo[]){this.todoData=todos;this.todoPage=Math.min(this.todoPage,Math.max(0,Math.ceil(todos.length/5)-1));if(!this.board)return;const c=(this.board.image as HTMLCanvasElement).getContext('2d')!;c.fillStyle='#354c41';c.fillRect(0,0,1024,512);c.fillStyle='#f0edd9';c.font='500 55px "PingFang SC", sans-serif';c.fillText('今日待办',60,87);c.strokeStyle='#9cae91';c.beginPath();c.moveTo(60,112);c.lineTo(960,112);c.stroke();c.font='33px "PingFang SC", sans-serif';if(!todos.length){c.fillStyle='#c8d0b8';c.fillText('今天想完成什么？',65,212);c.font='26px sans-serif';c.fillText('点击黑板，记下一件小事',65,273)}todos.slice(this.todoPage*5,this.todoPage*5+5).forEach((todo,i)=>{c.fillStyle=todo.completed?'#9fae96':'#f0edd9';c.fillText(`${todo.completed?'☑':'□'}  ${todo.title.slice(0,22)}`,65,178+i*66)});c.font='23px sans-serif';c.fillStyle='#b8c6ae';c.fillText(`${this.todoPage+1} / ${Math.max(1,Math.ceil(todos.length/5))}`,880,490);this.board.needsUpdate=true}
 setRecent(entries:Entry[]){if(!this.papers)return;const c=(this.papers.image as HTMLCanvasElement).getContext('2d')!;c.fillStyle='#fff9e9';c.fillRect(0,0,768,512);c.fillStyle='#687965';c.font='bold 43px "PingFang SC", sans-serif';c.fillText('最近文档',45,74);c.font='29px "PingFang SC", sans-serif';if(!entries.length)c.fillText('到藏书阁，打开第一篇笔记',45,156);entries.slice(0,5).forEach((e,i)=>c.fillText(e.name.slice(0,18),45,145+i*70));this.papers.needsUpdate=true}
 private viewPose():Pose{if(this.interactionPose)return this.interactionPose;return this.stargazing?{position:V(5,4,10),target:V(20,-3,-26)}:this.globe?globePose:this.zone==='overview'?roomPoses[this.mode]:localPoses[this.zone]}
 private configureControls(){
  this.controls.minPolarAngle=this.globe?.30:.35;this.controls.maxPolarAngle=this.globe?1.5:this.zone==='overview'?1.32:1.22;this.controls.minDistance=this.interactionPose?3.4:this.globe?35:this.zone==='overview'?15:3.4;this.controls.maxDistance=this.interactionPose?9:this.globe?75:this.zone==='overview'?34:18;
  const pose=this.viewPose(),offset=pose.position.clone().sub(pose.target),angle=Math.atan2(offset.x,offset.z);
  this.controls.minAzimuthAngle=this.globe?-Math.PI:angle-.38;this.controls.maxAzimuthAngle=this.globe?Math.PI:angle+.38;this.controls.enabled=this.interactive&&!this.flip;
 }
 private applyFaceVisibility(){
  const both=!!this.flip||this.globe;
  if(this.workFace)this.workFace.visible=both||this.mode==='work';if(this.leisureFace)this.leisureFace.visible=both||this.mode==='leisure';
  if(this.homeRing)this.homeRing.visible=both;
  this.lamps.forEach(({light,mode})=>light.visible=both||mode===this.mode);
  this.overlay.visible=!this.flip&&!this.globe;this.props?.setMode(this.mode,!!this.flip||this.globe);
 }
 private moveCamera(){this.fromPosition.copy(this.camera.position);this.fromTarget.copy(this.controls.target);this.transition=0;this.configureControls();if(this.reducedMotion){this.camera.position.copy(this.viewPose().position);this.controls.target.copy(this.viewPose().target);this.transition=1;}}
 setMode(mode:SceneMode){this.requestNavigation(mode,'overview')}
 private requestNavigation(mode:SceneMode,zone:Zone){
  this.closeBook();this.pointerLeave();if(this.interactionPose){this.interactionPose=undefined;this.props?.cancelWater();}this.setPianoNotes([]);this.stargazing=false;
  if(this.flip){this.queued={mode,zone};return}
  this.globe=false;
  if(mode===this.mode){this.zone=zone;this.applyFaceVisibility();this.moveCamera();return}
  this.props?.cancelWater();
  this.flip={from:this.mode,to:mode,zone,time:0,startPosition:this.camera.position.clone(),startTarget:this.controls.target.clone(),angle:this.planetPivot.rotation.x,swapped:false,reduced:this.reducedMotion};this.transition=0;this.controls.enabled=false;this.applyFaceVisibility();
 }
 setZone(zone:Zone){if(zone!=='overview'&&!localPoses[zone])return;this.requestNavigation(zoneMode(zone)??this.queued?.mode??this.flip?.to??this.mode,zone)}
 showGlobe(){if(this.flip){this.queued={mode:this.flip.to,zone:'overview',globe:true};return}this.closeBook();this.pointerLeave();if(this.interactionPose){this.interactionPose=undefined;this.props?.cancelWater();}this.globe=true;this.stargazing=false;this.setPianoNotes([]);this.applyFaceVisibility();this.moveCamera()}
 setStargazing(enabled:boolean){if(enabled){if(this.mode!=='leisure'||this.flip){this.setZone('balcony');return}this.globe=false;this.stargazing=true;this.moveCamera();this.controls.minAzimuthAngle=-Infinity;this.controls.maxAzimuthAngle=Infinity;this.controls.maxPolarAngle=2.1;}else{this.stargazing=false;this.moveCamera()}}
 setRoofClosed(_closed:boolean){/* v8 deliberately retains open timber structures. */}
 setTheme(theme:PresentationTheme){this.theme=theme}
 setMusicPlaying(playing:boolean){this.musicPlaying=playing}
 setPianoNotes(notes:string[]){this.pianoNotes=new Set(notes)}
 setReducedMotion(enabled:boolean){this.reducedMotion=enabled;if(enabled&&this.flip&&!this.flip.reduced){this.flip.reduced=true;this.flip.time=0;this.flip.swapped=false;}if(enabled&&!this.flip){this.camera.position.copy(this.viewPose().position);this.controls.target.copy(this.viewPose().target);this.transition=1}}
 setVisible(visible:boolean){this.visible=visible;if(!visible){cancelAnimationFrame(this.frame);this.last=0;this.releasePointerNote();this.setPianoNotes([]);this.props?.cancelWater();}else if(!this.disposed){cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(this.tick)}}
 setInteractive(enabled:boolean){this.interactive=enabled;this.controls.enabled=enabled&&!this.flip;this.pointerLeave()}
 setWateringMode(enabled:boolean){this.props?.setWateringMode(enabled);if(!enabled&&this.interactionPose){this.interactionPose=undefined;this.moveCamera();}}
 water(plantId='balcony'):Promise<boolean>{
  const plant=this.plantById.get(plantId==='balcony'?'balcony-3':plantId),soil=plant?.userData.soil as T.Object3D|undefined;
  if(this.mode!=='leisure'||this.flip||!soil||!this.props)return Promise.resolve(false);
  this.root.updateWorldMatrix(true,true);
  const target=new T.Box3().setFromObject(soil).getCenter(V()).add(V(0,.4,0));
  // Approach from the open front/right of both walls; the can's existing one-second
  // approach finishes after the 0.65-second camera move, before any water is shown.
  this.interactionPose={target,position:target.clone().add(V(2.6,2.1,4.2))};
  this.pointerLeave();this.moveCamera();
  return this.props.water(soil);
 }

 drink(){if(this.mode==='work'&&!this.flip)this.props?.drink()}
 setReminders(items:{kind:string;phase:string}[]){this.reminderState=items;this.props?.reminders(items)}
 getAnchor(action:'drink'|'move'){const object=this.root.getObjectByName(action==='drink'?'WaterGlass':'Chair');if(!object||this.mode!=='work'||this.globe||this.flip)return{x:0,y:0,visible:false};const point=new T.Box3().setFromObject(object).getCenter(V()).project(this.camera);return{x:(point.x+1)*this.container.clientWidth/2,y:(1-point.y)*this.container.clientHeight/2,visible:point.z<1&&point.z>-1&&Math.abs(point.x)<1&&Math.abs(point.y)<1}}
 setPlants(state:Record<string,number>){this.lastPlantState=state;for(const [id,plant]of this.plantById){const time=state[id]??(id==='balcony-3'?state.balcony:0);const soil=plant.userData.soil as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>|undefined;if(soil)soil.material.color.set(time&&Date.now()-time<24*3600000?'#443b2b':'#765c43')}}
 pet(){if(this.mode==='leisure'){this.kirbyState='greet';this.kirbyTimer=2.3;this.kirbyTime=0}}
 play(){if(this.mode==='leisure'){this.kirbyState='walk';this.kirbyTimer=5;this.kirbyTime=0;this.kirbyPath=(this.kirbyPath+1)%this.kirbyWaypoints.length}}
 fish(state:string,success=false){this.props?.setFishing(state,success)}
 setArcadeCanvas(canvas:HTMLCanvasElement){this.arcadeTexture.image=canvas;this.arcadeTexture.needsUpdate=true}
 zoom(direction:number){if(this.flip)return;const delta=this.camera.position.clone().sub(this.controls.target);const length=T.MathUtils.clamp(delta.length()*(direction>0?.87:1.15),this.controls.minDistance,this.controls.maxDistance);this.camera.position.copy(this.controls.target).add(delta.setLength(length));this.transition=1}
 getDiagnostics(){return{modelFile:'reference-room-v24.glb',renderQuality:{pixelRatio:this.renderer.getPixelRatio(),buffer:this.renderer.getDrawingBufferSize(new T.Vector2()).toArray(),samples:this.composer.renderTarget1.samples,screenSpaceAO:false},motion:this.ambientMotion?.diagnostics(),hoverMotion:this.hoverMotion.diagnostics(),fixtureLights:this.lamps.length,deviceLightIntensity:this.deviceLight?.intensity,asset:this.assetStatus,deskAsset:this.assetStatus,model:this.assetStatus==='ready'?'blender-reference-room-v9':'loading',mode:this.mode,requestedMode:this.queued?.mode??this.flip?.to??this.mode,zone:this.zone,globe:this.globe,flipping:!!this.flip,flipProgress:this.flip?Math.min(1,this.flip.time/(this.flip.reduced?.3:1.8)):1,planetRotation:this.planetPivot.rotation.x,activeFace:this.mode==='work'?'WorkFace':'LeisureFace',workVisible:this.workFace?.visible,leisureVisible:this.leisureFace?.visible,cameraPosition:this.camera.position.toArray(),cameraTarget:this.controls.target.toArray(),cameraTransition:this.transition,stargazing:this.stargazing,cosmos:this.cosmos.diagnostics(),theme:this.theme,daylight:this.daylight,displayTime:this.displayTime,todoPage:this.todoPage,rootPage:this.rootPage,totalTodoPages:Math.max(1,Math.ceil(this.todoData.length/5)),totalRootPages:Math.max(1,Math.ceil(this.rootData.length/3)),reducedMotion:this.reducedMotion,fps:this.fps,triangles:this.renderer.info.render.triangles,drawCalls:this.renderer.info.render.calls,props:this.props?.diagnostics(),pet:{source:'kirby-3d',state:this.kirbyState,position:this.kirby?.position.toArray()},cat:{source:'kirby-3d',state:this.kirbyState,position:this.kirby?.position.toArray(),remainingWaypoints:0},wateringCloseup:!!this.interactionPose,musicPlaying:this.musicPlaying,pianoNotes:[...this.pianoNotes],pianoKeys:this.pianoKeys.size,rootBooks:this.rootBooks.children.length,visible:this.visible}}
 private resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.composer?.setSize(w,h);this.props?.resize(w,h);this.camera.aspect=w/h;this.camera.clearViewOffset();this.camera.updateProjectionMatrix()}
 private pick(event:Pick<PointerEvent,'clientX'|'clientY'>){
  if(!this.interactive||this.flip||this.globe||this.interactionPose||this.assetStatus!=='ready')return;
  const rect=this.renderer.domElement.getBoundingClientRect();this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);
  const face=this.mode==='work'?this.workFace:this.leisureFace;if(!face)return;
  const query=()=>this.ray.intersectObjects([face,this.overlay],true);
  const intersections=this.hoverMotion.withNeutralPose(this.scene,()=>this.ambientMotion?this.ambientMotion.withNeutralPose(query):query());
  const hits=intersections.filter(hit=>{let p:T.Object3D|null=hit.object;while(p){if(!p.visible)return false;p=p.parent}return true});let object:T.Object3D|undefined=hits[0]?.object;while(object&&!object.userData.action)object=object.parent??undefined;return object;
 }
 private pointerNote?:string;
 private releasePointerNote(){if(this.pointerNote){const note=this.pointerNote;this.pointerNote=undefined;this.onAction('piano-up:'+note)}}
 private pointerDown=(event:PointerEvent)=>{this.dragMoved=false;this.down={x:event.clientX,y:event.clientY};if(event.button===0){const object=this.pick(event);if(object?.userData.action?.startsWith('piano:')){this.pointerNote=object.userData.action.slice(6).replace('s','#');this.onAction('piano-down:'+this.pointerNote);this.renderer.domElement.setPointerCapture(event.pointerId);}}};
 private pointerUp=(event:PointerEvent)=>{if(this.pointerNote){this.releasePointerNote();if(this.renderer.domElement.hasPointerCapture(event.pointerId))this.renderer.domElement.releasePointerCapture(event.pointerId);return}if(event.button!==0||this.dragMoved||Math.hypot(event.clientX-this.down.x,event.clientY-this.down.y)>6)return;const object=this.pick(event);if(object){this.hoverMotion.clear();this.onAction(object.userData.action);this.pointerLeave()}};
 private pointerMove=(event:PointerEvent)=>{if(event.buttons&&Math.hypot(event.clientX-this.down.x,event.clientY-this.down.y)>6)this.dragMoved=true;const picked=event.buttons?undefined:this.pick(event);if(picked!==this.hover){this.clearHighlight();this.hover=picked;this.hoverMotion.setTarget(picked);if(picked)picked.traverse(o=>{if(o instanceof T.Mesh){const original=o.material,clones=(Array.isArray(original)?original:[original]).map(m=>{const clone=m.clone();if(clone instanceof T.MeshStandardMaterial){clone.emissive.set('#a99469');clone.emissiveIntensity=.16}return clone});this.highlighted.push({mesh:o,original,clones});o.material=Array.isArray(original)?clones:clones[0]}})}this.renderer.domElement.style.cursor=this.hover?'pointer':this.flip?'default':'grab';if(this.hover){const action=this.hover.userData.action as string;this.tooltip.textContent=actionNames[action]??(action.startsWith('plant:')?'给这盆绿植浇水':action.startsWith('library:')?'浏览这个文件夹':action.startsWith('piano:')?'弹奏 '+action.slice(6).replace('s','#'):'查看记录');this.tooltip.style.display='block';const rect=this.container.getBoundingClientRect();this.tooltip.style.left=Math.min(event.clientX-rect.left+14,rect.width-180)+'px';this.tooltip.style.top=event.clientY-rect.top-40+'px'}else this.tooltip.style.display='none'};
 private clearHighlight(){this.hoverMotion.setTarget(undefined);this.highlighted.forEach(({mesh,original,clones})=>{mesh.material=original;clones.forEach(m=>m.dispose())});this.highlighted=[]}
 private pointerLeave=()=>{this.releasePointerNote();this.tooltip.style.display='none';this.clearHighlight();this.hover=undefined};
 private updateNavigation(dt:number){
  if(this.flip){const flip=this.flip;flip.time+=dt;const t=Math.min(1,flip.time/(flip.reduced?.30:1.8));
   if(flip.reduced){this.renderer.domElement.style.opacity=String(Math.abs(t*2-1));if(t>=.5&&!flip.swapped){flip.swapped=true;this.mode=flip.to;this.zone=flip.zone;this.planetPivot.rotation.x=this.mode==='work'?0:Math.PI;const pose=this.viewPose();this.camera.position.copy(pose.position);this.controls.target.copy(pose.target);}}
   else{const far=globePose;const targetPose=flip.zone==='overview'?roomPoses[flip.to]:localPoses[flip.zone];
    if(t<.24){const a=smooth(t/.24);this.camera.position.lerpVectors(flip.startPosition,far.position,a);this.controls.target.lerpVectors(flip.startTarget,far.target,a);}
    else if(t<.76){this.camera.position.copy(far.position);this.controls.target.copy(far.target);this.planetPivot.rotation.x=flip.angle+Math.PI*smooth((t-.24)/.52);}
    else{this.planetPivot.rotation.x=flip.angle+Math.PI;const a=smooth((t-.76)/.24);this.camera.position.lerpVectors(far.position,targetPose.position,a);this.controls.target.lerpVectors(far.target,targetPose.target,a);}
   }
   this.camera.lookAt(this.controls.target);this.transition=t;
   if(t>=1){this.mode=flip.to;this.zone=flip.zone;this.planetPivot.rotation.x=this.mode==='work'?0:Math.PI;this.flip=undefined;this.transition=1;this.renderer.domElement.style.opacity='1';this.configureControls();this.applyFaceVisibility();const queued=this.queued;this.queued=undefined;if(queued){this.requestNavigation(queued.mode,queued.zone);if(queued.globe&&!this.flip)this.showGlobe();}this.onAction('mode:'+this.mode);}
   return;
  }
  if(this.transition<1){this.transition=Math.min(1,this.transition+dt/.65);const t=smooth(this.transition);this.camera.position.lerpVectors(this.fromPosition,this.viewPose().position,t);this.controls.target.lerpVectors(this.fromTarget,this.viewPose().target,t);this.camera.lookAt(this.controls.target);}else this.controls.update();
 }
 private updateKirby(dt:number){
  if(!this.kirby||!this.kirbyBody||this.mode!=='leisure'||this.flip)return;
  this.kirbyTime+=dt;this.kirbyTimer-=dt;
  if(this.kirbyState==='walk'&&!this.reducedMotion){const destination=this.kirbyWaypoints[this.kirbyPath],delta=destination.clone().sub(this.kirby.position),distance=delta.length();if(distance<.04){this.kirbyState='rest';this.kirbyTimer=8+Math.random()*10;}else{this.kirby.position.addScaledVector(delta.normalize(),Math.min(distance,dt*.55));const desired=Math.atan2(delta.x,delta.z);this.kirby.rotation.y+=Math.atan2(Math.sin(desired-this.kirby.rotation.y),Math.cos(desired-this.kirby.rotation.y))*Math.min(1,dt*6);}}
  else if(this.kirbyTimer<=0){if(this.kirbyState==='greet'||this.reducedMotion){this.kirbyState='rest';this.kirbyTimer=9}else{this.kirbyPath=(this.kirbyPath+1)%this.kirbyWaypoints.length;this.kirbyState='walk';}}
  const base=this.kirbyBody.userData.neutralScale as T.Vector3;this.kirbyBody.scale.copy(base);if(!this.reducedMotion)this.kirbyBody.scale.y*=1+Math.sin(this.kirbyTime*2)*.018;
  if(this.kirbyState==='greet'&&!this.reducedMotion)this.kirby.position.y=this.kirbyRest.y+Math.max(0,Math.sin(this.kirbyTime*6))*.23;else if(this.kirbyState!=='walk')this.kirby.position.y=this.kirbyRest.y;
  const blink=this.kirbyTime%4.3<.13;this.kirbyEyes.forEach(o=>o.visible=!blink);this.kirbyLids.forEach(o=>o.visible=blink);
  this.kirbyLimbs.forEach((o,i)=>{const neutral=o.userData.neutralRotation as T.Euler;o.rotation.copy(neutral);if(!this.reducedMotion)o.rotation.z+=(this.kirbyState==='greet'&&i<2?Math.sin(this.kirbyTime*8)*.25:this.kirbyState==='walk'?Math.sin(this.kirbyTime*10+i*Math.PI)*.13:0)});
 }
 private updateTheme(dt:number,date:Date){
  const hour=date.getHours()+date.getMinutes()/60;this.themeTarget=this.theme==='day'?1:this.theme==='night'?0:Math.max(0,Math.sin((hour-6)/12*Math.PI));this.daylight=T.MathUtils.damp(this.daylight,this.themeTarget,this.reducedMotion?30:4,dt);
  const day=this.daylight;this.scene.background=new T.Color('#0a1027');this.hemi.intensity=.26+day*.46;this.hemi.color.copy(new T.Color('#aaa4e4').lerp(new T.Color('#edf3ff'),day));this.hemi.groundColor.set('#77768b');this.sun.intensity=.18+day*2.1;this.sun.color.copy(new T.Color('#a4a8ec').lerp(new T.Color('#fff4ed'),day));this.scene.environmentIntensity=.12+day*.12;this.renderer.toneMappingExposure=1.04;
  if(this.deviceLight)this.deviceLight.intensity=.05+(1-day)*.9;
  this.lamps.forEach(({light,night,day:dayStrength})=>light.intensity=dayStrength*day+night*(1-day));for(const [material,strength]of this.glowMaterials)material.emissiveIntensity=strength*(.22+(1-day)*1.5);
  this.cosmos.update(this.elapsed,date,this.reducedMotion);this.cosmos.setDaylight(day);
 }
 private tick=(now:number)=>{if(this.disposed||!this.visible)return;const interval=1000/(document.hasFocus()?60:15);if(this.last&&now-this.last<interval-.8){this.frame=requestAnimationFrame(this.tick);return}const dt=this.last?Math.min((now-this.last)/1000,.1):0;this.last=now;this.elapsed+=dt;
  this.hoverMotion.restore();this.updateNavigation(dt);this.planetPivot.updateWorldMatrix(true,true);const date=new Date();this.updateTheme(dt,date);
  if(this.digitalDisplay&&this.displaySecond!==Math.floor(date.getTime()/1000)){this.displaySecond=Math.floor(date.getTime()/1000);const c=(this.digitalDisplay.image as HTMLCanvasElement).getContext('2d')!;this.displayTime=date.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});c.fillStyle='#172c25';c.fillRect(0,0,768,288);c.textAlign='center';c.fillStyle='#d6efd7';c.font='500 143px "Menlo",monospace';c.fillText(this.displayTime,384,174);c.fillStyle='#89af98';c.font='26px "PingFang SC",sans-serif';c.fillText(date.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'short'}),384,242);this.digitalDisplay.needsUpdate=true;}

  this.updateKirby(dt);if(!this.flip&&!this.globe)this.props?.update(dt,this.elapsed);
  for(const [note,{object,y}]of this.pianoKeys)object.position.y=T.MathUtils.damp(object.position.y,y-(this.pianoNotes.has(note)?.035:0),22,dt);
  for(const mesh of this.speakerLights){const material=mesh.material as T.MeshStandardMaterial;if(material.emissive){material.emissive.set(this.musicPlaying?'#b6edab':'#574b32');material.emissiveIntensity=this.musicPlaying?.65+(this.reducedMotion?0:Math.sin(this.elapsed*2)*.15):.08;}}
  if(this.bookGesture){const g=this.bookGesture;g.time=Math.min(1,g.time+dt/.8);const t=this.reducedMotion?1:smooth(g.time);g.book.position.copy(g.position).add(V(0,.12*t,.55*t));g.cover.rotation.y=-Math.PI*.72*t;}
  if(this.waterMesh&&this.waterBase&&this.mode==='leisure'&&!this.flip&&!this.reducedMotion)animateWater(this.waterMesh.geometry,this.waterBase,this.elapsed);this.arcadeTexture.needsUpdate=true;
  this.hoverMotion.update(dt,this.reducedMotion);this.ambientMotion?.update(dt,this.camera,{mode:this.mode,transitioning:!!this.flip||this.globe,reducedMotion:this.reducedMotion,drinking:!!this.props?.diagnostics().drinking});
  this.renderer.info.reset();this.composer.render();this.frames++;if(now-this.sampleTime>1000){this.fps=Math.round(this.frames*1000/(now-this.sampleTime));this.frames=0;this.sampleTime=now}this.frame=requestAnimationFrame(this.tick);
 };
 private disposeObject(root:T.Object3D){const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();root.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m)}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}
 dispose(){this.disposed=true;this.hoverMotion.dispose();this.ambientMotion?.dispose();this.cosmos.dispose();this.props?.dispose();this.clearHighlight();cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();this.controls.dispose();const c=this.renderer.domElement;c.removeEventListener('pointerdown',this.pointerDown);c.removeEventListener('pointerup',this.pointerUp);c.removeEventListener('pointermove',this.pointerMove);c.removeEventListener('pointerleave',this.pointerLeave);c.removeEventListener('pointercancel',this.pointerLeave);const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value instanceof T.Texture)textures.add(value)}}});this.geometries.forEach(g=>geometries.add(g));geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());this.environmentTarget.dispose();this.bloom?.dispose();this.lamps.forEach(({light})=>light.dispose());this.composer.dispose();this.renderer.dispose();this.renderer.forceContextLoss();c.remove();this.tooltip.remove();if(window.__world===this)delete window.__world}
}
