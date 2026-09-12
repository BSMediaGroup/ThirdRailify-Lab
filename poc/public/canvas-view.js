// View-only geometry. Never writes image pixels or changes thumbnail export dimensions.
export function imageView({width,height,viewportWidth,viewportHeight,mode='width',zoom=1,lock=false}){
  if(![width,height,viewportWidth,viewportHeight,zoom].every(v=>Number.isFinite(v)&&v>0))return null;
  let scale=mode==='height'?viewportHeight/height:mode==='contain'||lock?Math.min(viewportWidth/width,viewportHeight/height):viewportWidth/width;
  scale*=Math.max(.1,Math.min(8,zoom));
  return {scale,width:width*scale,height:height*scale,frameHeight:lock||mode==='height'||mode==='contain'?viewportHeight:height*scale};
}
export class CanvasView{
  constructor(stage,image,shell,toolbar){this.stage=stage;this.image=image;this.shell=shell;this.toolbar=toolbar;this.mode='width';this.zoom=1;this.lock=false;this.pan=false;this.x=0;this.y=0;this.enabled=false;this.frame=0;
    this.ro=new ResizeObserver(()=>this.update());this.ro.observe(stage);image.addEventListener('load',()=>{this.zoom=1;this.x=this.y=0;this.update();});window.addEventListener('resize',()=>this.update());document.addEventListener('fullscreenchange',()=>this.update());
    toolbar.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(!b)return;const a=b.dataset.view;if(a==='in'||a==='out')this.zoom=Math.max(.1,Math.min(8,this.zoom*(a==='in'?1.2:1/1.2)));else if(a==='pan')this.pan=!this.pan;else if(a==='lock')this.lock=!this.lock;else{this.mode=a==='reset'?'width':a;this.zoom=1;this.x=this.y=0;if(a==='reset'){this.lock=false;this.pan=false;}}this.update();});
    stage.addEventListener('pointerdown',e=>{if(!this.enabled||!this.pan||e.button!==0||e.target.closest('button'))return;e.preventDefault();stage.setPointerCapture(e.pointerId);this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,ox:this.x,oy:this.y};});
    stage.addEventListener('pointermove',e=>{if(this.drag?.id!==e.pointerId)return;this.x=this.drag.ox+e.clientX-this.drag.x;this.y=this.drag.oy+e.clientY-this.drag.y;this.update();});
    for(const ev of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(ev,()=>this.drag=null);
    stage.addEventListener('wheel',e=>{if(!this.enabled||!(e.ctrlKey||e.metaKey))return;e.preventDefault();this.zoom=Math.max(.1,Math.min(8,this.zoom*(e.deltaY<0?1.1:1/1.1)));this.update();},{passive:false});
    stage.addEventListener('keydown',e=>{if(!this.enabled||!this.pan||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();this.x+=e.key==='ArrowLeft'?-24:e.key==='ArrowRight'?24:0;this.y+=e.key==='ArrowUp'?-24:e.key==='ArrowDown'?24:0;this.update();});
  }
  update(){if(this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=0;this.paint();});}
  paint(){
    this.enabled=!this.image.hidden&&!!this.image.naturalWidth;
    this.stage.classList.toggle('image-viewport',this.enabled);this.stage.classList.toggle('can-pan',this.enabled&&this.pan);
    this.toolbar.querySelectorAll('[data-view]').forEach(b=>{b.disabled=!this.enabled;const a=b.dataset.view;b.setAttribute('aria-pressed',String(a==='pan'?this.pan:a==='lock'?this.lock:['width','height','contain'].includes(a)&&this.mode===a));});
    if(!this.enabled){this.stage.style.removeProperty('height');this.image.style.cssText='';return;}
    const full=!!document.fullscreenElement,rect=this.stage.getBoundingClientRect(),available=Math.max(220,innerHeight-(full?110:180)),locked=full||this.lock;
    const g=imageView({width:this.image.naturalWidth,height:this.image.naturalHeight,viewportWidth:Math.max(1,this.stage.clientWidth),viewportHeight:available,mode:this.mode,zoom:this.zoom,lock:locked});if(!g)return;
    this.stage.style.height=Math.round(g.frameHeight)+'px';
    Object.assign(this.image.style,{width:g.width+'px',height:g.height+'px',left:'50%',top:'50%',transform:`translate(calc(-50% + ${this.x}px),calc(-50% + ${this.y}px))`});
    this.stage.setAttribute('aria-label',`Image view, ${Math.round(g.scale*100)} percent. ${this.pan?'Drag or use arrow keys to pan.':'Original pixels unchanged.'}`);
    const out=this.toolbar.querySelector('[data-view-scale]');if(out)out.textContent=Math.round(g.scale*100)+'%';
  }
}
