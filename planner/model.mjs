// Shared, DOM-free schema and geometry. All distances are millimetres.
export const LIMITS={walls:300,openings:300,rooms:150,furniture:300,coordinate:200000,file:8*1024*1024};
export const clone=x=>JSON.parse(JSON.stringify(x));
export const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export const uid=()=>crypto.randomUUID();
export const emptyPlan=()=>({format:'floorplan-3d',schemaVersion:2,name:'我的户型',calibrated:true,walls:[],openings:[],rooms:[],furniture:[],background:null});
export function validatePlan(raw){
 const fail=s=>{throw Error('方案数据无效：'+s);};
 const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const num=(v,min,max,n)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail(n);return v;};
 const str=(v,n,max=100)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail(n);return v;};
 const point=v=>{if(!Array.isArray(v)||v.length!==2)fail('坐标');return v.map(n=>num(n,-LIMITS.coordinate,LIMITS.coordinate,'坐标'));};
 const list=(v,n)=>{if(!Array.isArray(v)||v.length>LIMITS[n])fail(n);return v;};
 const ids=new Set();const id=v=>{if(typeof v!=='string'||!/^[-\w]{1,80}$/.test(v)||ids.has(v))fail('重复或非法 ID');ids.add(v);return v;};
 if(!obj(raw)||raw.format!=='floorplan-3d'||raw.schemaVersion!==2)fail('请导入通用户型 v2 JSON；旧版方案请在示例编辑器打开');
 if(typeof raw.calibrated!=='boolean')fail('尺寸标定');
 const p={...emptyPlan(),name:str(raw.name,'名称'),calibrated:raw.calibrated};
 p.walls=list(raw.walls,'walls').map(w=>{if(!obj(w))fail('墙体');const a=point(w.a),b=point(w.b);if(distance(a,b)<20)fail('墙长至少 20 mm');return{id:id(w.id),a,b,thickness:num(w.thickness,30,1000,'墙厚'),height:num(w.height,300,10000,'墙高')};});
 const wallMap=new Map(p.walls.map(w=>[w.id,w]));
 p.openings=list(raw.openings,'openings').map(o=>{if(!obj(o)||!['door','window'].includes(o.type)||!wallMap.has(o.wallId))fail('门窗所属墙体');const w=wallMap.get(o.wallId);const q={id:id(o.id),wallId:w.id,type:o.type,offset:num(o.offset,0,distance(w.a,w.b),'门窗偏移'),width:num(o.width,100,10000,'门窗宽度'),height:num(o.height,100,w.height,'门窗高度'),sill:num(o.sill,0,w.height,'窗台高度')};if(q.offset+q.width>distance(w.a,w.b)+.01||q.sill+q.height>w.height+.01||q.type==='door'&&q.sill!==0)fail('门窗超出墙体');return q;});
 for(let i=0;i<p.openings.length;i++)for(let j=0;j<i;j++){const a=p.openings[i],b=p.openings[j];if(a.wallId===b.wallId&&a.offset<b.offset+b.width-.01&&b.offset<a.offset+a.width-.01)fail('门窗重叠');}
 p.rooms=list(raw.rooms,'rooms').map(r=>{if(!obj(r)||!Array.isArray(r.points)||r.points.length<3||r.points.length>100)fail('房间轮廓');const points=r.points.map(point);if(Math.abs(polygonArea(points))<10000||selfIntersects(points))fail('房间轮廓交叉或面积过小');return{id:id(r.id),name:str(r.name,'房间名'),points};});
 p.furniture=list(raw.furniture,'furniture').map(f=>{if(!obj(f))fail('家具');return{id:id(f.id),name:str(f.name,'家具名'),center:point(f.center),width:num(f.width,50,20000,'家具宽'),depth:num(f.depth,50,20000,'家具深'),height:num(f.height,20,10000,'家具高'),rotation:num(f.rotation,-36000,36000,'家具角度')};});
 if(raw.background!==null&&raw.background!==undefined){const b=raw.background;if(!obj(b)||typeof b.data!=='string'||b.data.length>6000000||!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(b.data))fail('底图');p.background={data:b.data,width:num(b.width,1,40000,'底图宽'),height:num(b.height,1,40000,'底图高'),mmPerPixel:num(b.mmPerPixel,.01,1000,'底图比例')};}
 return p;
}
export function parsePlan(text){if(new TextEncoder().encode(text).length>LIMITS.file)throw Error('方案文件超过 8 MB');return validatePlan(JSON.parse(text));}
export function polygonArea(points){return points.reduce((s,a,i)=>{const b=points[(i+1)%points.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;}
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
export function intersection(a,b,c,d){const u=sub(b,a),v=sub(d,c),den=cross(u,v);if(Math.abs(den)<1e-8)return null;const t=cross(sub(c,a),v)/den,s=cross(sub(c,a),u)/den;return t>=-1e-7&&t<=1+1e-7&&s>=-1e-7&&s<=1+1e-7?{t,s,point:[a[0]+t*u[0],a[1]+t*u[1]]}:null;}
function selfIntersects(p){for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){if(j===i+1||i===0&&j===p.length-1)continue;if(intersection(p[i],p[(i+1)%p.length],p[j],p[(j+1)%p.length]))return true;}return false;}
export function project(point,wall){const [dx,dy]=sub(wall.b,wall.a),l2=dx*dx+dy*dy;const t=Math.max(0,Math.min(1,((point[0]-wall.a[0])*dx+(point[1]-wall.a[1])*dy)/l2));const q=[wall.a[0]+t*dx,wall.a[1]+t*dy];return{point:q,t,offset:t*Math.sqrt(l2),distance:distance(point,q)};}
export function bounds(p){let pts=p.walls.flatMap(w=>[w.a,w.b]).concat(p.rooms.flatMap(r=>r.points),p.furniture.flatMap(f=>[[f.center[0]-f.width/2,f.center[1]-f.depth/2],[f.center[0]+f.width/2,f.center[1]+f.depth/2]]));if(p.background)pts.push([0,0],[p.background.width*p.background.mmPerPixel,p.background.height*p.background.mmPerPixel]);if(!pts.length)pts=[[0,0],[10000,8000]];return{minX:Math.min(...pts.map(p=>p[0])),minY:Math.min(...pts.map(p=>p[1])),maxX:Math.max(...pts.map(p=>p[0])),maxY:Math.max(...pts.map(p=>p[1]))};}
export function rescale(plan,factor){if(!Number.isFinite(factor)||factor<=0)throw Error('比例无效');const p=clone(plan);const pt=v=>v.map(n=>n*factor);p.walls.forEach(w=>{w.a=pt(w.a);w.b=pt(w.b);});p.openings.forEach(o=>{o.offset*=factor;o.width*=factor;});p.rooms.forEach(r=>r.points=r.points.map(pt));p.furniture.forEach(f=>{f.center=pt(f.center);f.width*=factor;f.depth*=factor;});if(p.background)p.background.mmPerPixel*=factor;p.calibrated=true;return validatePlan(p);}
// Split at every intersection, build a planar half-edge graph and walk bounded faces.
export function detectRooms(walls){
 const cuts=walls.map(()=>[0,1]);
 for(let i=0;i<walls.length;i++)for(let j=i+1;j<walls.length;j++){const a=walls[i],b=walls[j],hit=intersection(a.a,a.b,b.a,b.b);if(hit){cuts[i].push(hit.t);cuts[j].push(hit.s);}}
 const nodes=new Map(),edges=new Map();
 const key=p=>p.map(x=>Math.round(x/5)).join(',');
 const node=p=>{const k=key(p);if(!nodes.has(k))nodes.set(k,{p,neighbors:new Set()});return k;};
 walls.forEach((w,i)=>{const ts=[...new Set(cuts[i].map(t=>Math.max(0,Math.min(1,t))))].sort((a,b)=>a-b);for(let j=1;j<ts.length;j++){const pt=t=>[w.a[0]+t*(w.b[0]-w.a[0]),w.a[1]+t*(w.b[1]-w.a[1])];const a=node(pt(ts[j-1])),b=node(pt(ts[j]));if(a===b)continue;nodes.get(a).neighbors.add(b);nodes.get(b).neighbors.add(a);edges.set(a+'|'+b,[a,b]);edges.set(b+'|'+a,[b,a]);}});
 for(const n of nodes.values())n.sorted=[...n.neighbors].sort((a,b)=>Math.atan2(nodes.get(a).p[1]-n.p[1],nodes.get(a).p[0]-n.p[0])-Math.atan2(nodes.get(b).p[1]-n.p[1],nodes.get(b).p[0]-n.p[0]));
 const seen=new Set(),faces=[];
 for(const [start,pair] of edges){if(seen.has(start))continue;let [a,b]=pair;const path=[];let closed=false;for(let step=0;step<=edges.size;step++){const k=a+'|'+b;if(seen.has(k)){closed=k===start;break;}seen.add(k);path.push(nodes.get(a).p);const ns=nodes.get(b).sorted;const next=ns[(ns.indexOf(a)-1+ns.length)%ns.length];a=b;b=next;}if(closed&&path.length>=3&&path.length<=100&&polygonArea(path)>10000&&!selfIntersects(path))faces.push(path);}
 return faces.slice(0,LIMITS.rooms).map((points,i)=>({id:'room-'+i,name:'房间 '+(i+1),points}));
}
// Actual rectangular wall solids surrounding door/window holes (including lintels and sills).
export function wallPieces(wall,openings){const length=distance(wall.a,wall.b);const os=openings.filter(o=>o.wallId===wall.id).sort((a,b)=>a.offset-b.offset);let end=0;const pieces=[];const add=(x,width,bottom,height)=>{if(width>.01&&height>.01)pieces.push({x,width,bottom,height});};for(const o of os){add(end,o.offset-end,0,wall.height);add(o.offset,o.width,0,o.sill);add(o.offset,o.width,o.sill+o.height,wall.height-o.sill-o.height);end=o.offset+o.width;}add(end,length-end,0,wall.height);return pieces;}
export function removeWall(p,id){p.walls=p.walls.filter(w=>w.id!==id);p.openings=p.openings.filter(o=>o.wallId!==id);p.rooms=detectRooms(p.walls);return p;}
export function topologyWarnings(p){const ends=p.walls.flatMap(w=>[{p:w.a,id:w.id},{p:w.b,id:w.id}]);const dangling=ends.filter(e=>!p.walls.some(w=>w.id!==e.id&&project(e.p,w).distance<10)).length;const warnings=[];if(!p.calibrated)warnings.push('未标定尺寸，3D 仅表示比例，不能作为真实尺寸');if(dangling)warnings.push(`${dangling} 个墙端未连接；检查缺墙或门洞。添加门窗时应在连续墙上开洞`);if(!p.rooms.length&&p.walls.length)warnings.push('没有闭合房间，暂不生成房间地板');return warnings;}
