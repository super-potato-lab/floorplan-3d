import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {wallPieces,bounds,distance} from './model.mjs';
export async function createView(container,onLost){
 let renderer,fallback=false;try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}catch{const {SVGRenderer}=await import('three/addons/renderers/SVGRenderer.js');renderer=new SVGRenderer();renderer.setQuality('high');fallback=true;}renderer.setPixelRatio?.(Math.min(devicePixelRatio,2));renderer.setClearColor(new THREE.Color('#e9ede6'));container.append(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.05,1500),controls=new OrbitControls(camera,renderer.domElement);controls.maxPolarAngle=Math.PI*.49;controls.minDistance=.5;controls.maxDistance=500;
 scene.add(new THREE.HemisphereLight(0xffffff,0x657463,2.4));if(fallback)scene.add(new THREE.AmbientLight(0xffffff,.75));const sun=new THREE.DirectionalLight(0xfff7e5,fallback?1.1:2.3);sun.position.set(-10,20,12);scene.add(sun);
 let group=null,disposed=false,lastBounds=null;
 const render=()=>{if(!disposed&&!container.hidden)renderer.render(scene,camera);};controls.addEventListener('change',render);
 const lose=e=>{e.preventDefault();onLost();};renderer.domElement.addEventListener('webglcontextlost',lose);
 function clear(){if(!group)return;scene.remove(group);const mats=new Set(group.userData.materials||[]);group.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);}});mats.forEach(m=>m.dispose());group=null;}
 function resize(){if(disposed)return;const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();render();}
 function update(plan){clear();group=new THREE.Group();scene.add(group);const wallMat=new THREE.MeshLambertMaterial({color:0xf9f5ec});const sideMat=new THREE.MeshLambertMaterial({color:0xcbb68e});const glassMat=new THREE.MeshLambertMaterial({color:0x91bed1,transparent:true,opacity:.35,side:THREE.DoubleSide});const furnMat=new THREE.MeshLambertMaterial({color:0x95ad9a});
 const box=(x,y,z,w,h,d,angle,mat)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.rotation.y=angle;group.add(m);};
 for(const w of plan.walls){const len=distance(w.a,w.b),dx=(w.b[0]-w.a[0])/len,dy=(w.b[1]-w.a[1])/len,angle=-Math.atan2(dy,dx);for(const p of wallPieces(w,plan.openings)){const t=p.x+p.width/2;box((w.a[0]+dx*t)/1000,(p.bottom+p.height/2)/1000,(w.a[1]+dy*t)/1000,p.width/1000,p.height/1000,w.thickness/1000,angle,wallMat);}for(const o of plan.openings.filter(o=>o.wallId===w.id)){const t=o.offset+o.width/2;if(o.type==='window')box((w.a[0]+dx*t)/1000,(o.sill+o.height/2)/1000,(w.a[1]+dy*t)/1000,o.width/1000,o.height/1000,.025,angle,glassMat);else box((w.a[0]+dx*t)/1000,.015,(w.a[1]+dy*t)/1000,o.width/1000,.03,w.thickness/1000,angle,sideMat);}}
 for(const r of plan.rooms){const shape=new THREE.Shape(r.points.map(p=>new THREE.Vector2(p[0]/1000,-p[1]/1000)));const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),sideMat);mesh.rotation.x=-Math.PI/2;mesh.position.y=.005;group.add(mesh);}
 for(const f of plan.furniture)box(f.center[0]/1000,f.height/2000,f.center[1]/1000,f.width/1000,f.height/1000,f.depth/1000,-f.rotation*Math.PI/180,furnMat);
 // Dispose unused materials as well as those referenced by meshes on the next update.
 group.userData.materials=[wallMat,sideMat,glassMat,furnMat];
 const b=bounds({...plan,background:null}),cx=(b.minX+b.maxX)/2000,cz=(b.minY+b.maxY)/2000,span=Math.max(4,(b.maxX-b.minX)/1000,(b.maxY-b.minY)/1000);const signature=JSON.stringify(b);if(signature!==lastBounds){controls.target.set(cx,1,cz);camera.position.set(cx+span*1.3,span*1.2,cz+span*1.3);lastBounds=signature;controls.update();}resize();render();}
 return{fallback,update,resize,dispose(){if(disposed)return;disposed=true;controls.removeEventListener('change',render);controls.dispose();renderer.domElement.removeEventListener('webglcontextlost',lose);clear();renderer.dispose?.();renderer.domElement.remove();}};
}
