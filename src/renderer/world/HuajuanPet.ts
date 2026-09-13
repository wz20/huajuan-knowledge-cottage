import * as T from 'three';
import { huajuanFrame } from './huajuan-frames';

/** Original Codex Huajuan artwork, living at a world-space position. */
export class HuajuanPet extends T.Group {
  private texture!: T.Texture;
  private sprite!: T.Sprite;
  private shadow!: T.Mesh<T.PlaneGeometry,T.MeshBasicMaterial>;
  private frame = { row: 0, column: 1 };
  private state = '';
  private time = 0;
  private right = true;
  static async load() {
    const pet = new HuajuanPet();
    pet.name = 'Huajuan';
    pet.userData = { action: 'pet', dynamic: true };
    const texture = await new T.TextureLoader().loadAsync('./pets/huajuaner/spritesheet.webp');
    const image = texture.image as HTMLImageElement;
    if (image.width !== 1536 || image.height !== 2288) { texture.dispose(); throw new Error('Invalid Huajuan v2 atlas size'); }
    texture.colorSpace = T.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = texture.magFilter = T.LinearFilter;
    texture.repeat.set(1/8,1/11);
    pet.texture = texture;
    pet.sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, transparent: true, alphaTest: .08, depthWrite: false, toneMapped: false }));
    pet.sprite.name = 'CodexHuajuanSprite';
    pet.sprite.center.set(.5,.025);
    pet.sprite.scale.set(1.12,1.12*208/192,1);
    pet.add(pet.sprite);
    // Raycasting must ignore the transparent rectangle surrounding the cat.
    const canvas = document.createElement('canvas'); canvas.width=image.width; canvas.height=image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image,0,0);
    const pixels = context.getImageData(0,0,image.width,image.height).data;
    const raycast = pet.sprite.raycast.bind(pet.sprite);
    pet.sprite.raycast = (ray, hits) => {
      const candidates: T.Intersection[] = []; raycast(ray,candidates);
      for (const hit of candidates) {
        if (!hit.uv) continue;
        const x = pet.frame.column*192 + Math.min(191,Math.max(0,Math.floor(hit.uv.x*192)));
        const y = pet.frame.row*208 + Math.min(207,Math.max(0,Math.floor((1-hit.uv.y)*208)));
        if (pixels[(y*1536+x)*4+3] > 32) hits.push(hit);
      }
    };
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width=shadowCanvas.height=64;
    const c = shadowCanvas.getContext('2d')!, gradient=c.createRadialGradient(32,32,2,32,32,31);
    gradient.addColorStop(0,'rgba(38,32,22,0.24)'); gradient.addColorStop(1,'rgba(38,32,22,0)');
    c.fillStyle=gradient; c.fillRect(0,0,64,64);
    pet.shadow=new T.Mesh(new T.PlaneGeometry(.9,.65),new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
    pet.shadow.rotation.x=-Math.PI/2; pet.shadow.position.y=.008;
    pet.shadow.raycast=()=>{};
    pet.add(pet.shadow);
    pet.update(0,'sleep',0);
    return pet;
  }
  update(dt:number,state:string,screenVelocity:number) {
    if (state!==this.state) { this.state=state; this.time=0; }
    this.time+=dt;
    if (Math.abs(screenVelocity)>.0001) this.right=screenVelocity>0;
    this.frame=huajuanFrame(state,this.time,this.right);
    this.texture.offset.set(this.frame.column/8,1-(this.frame.row+1)/11);
    const breath=state==='sleep'?1+Math.sin(this.time*1.8)*.004:1;
    this.sprite.scale.y=1.12*208/192*breath;
  }
  diagnostics(){ return { source:'codex-huajuaner-v2', ...this.frame }; }
  dispose(){ this.texture.dispose(); this.sprite.material.dispose(); this.shadow.geometry.dispose();this.shadow.material.map?.dispose();this.shadow.material.dispose(); }
}
