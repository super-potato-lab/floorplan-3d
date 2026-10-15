// Deterministic local recognition for axis-aligned, filled dark wall strokes.
// It intentionally produces a draft, not semantic/structural engineering claims.
export function detectWalls(data,width,height,{threshold=110,minLength=40,minThickness=3}={}){
 if(width>2000||height>2000||data.length!==width*height*4)throw Error('识别图片尺寸无效');
 const dark=new Uint8Array(width*height);
 for(let i=0;i<dark.length;i++){const a=data[i*4+3]/255;dark[i]=(a*(data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114)+(1-a)*255)<threshold?1:0;}
 const boxes=[];
 for(const vertical of [false,true]){
  const major=vertical?height:width,minor=vertical?width:height;let active=[];
  const finish=g=>{if(g.n>=minThickness&&g.n<=60)boxes.push({vertical,start:g.start,end:g.end,center:(g.first+g.last)/2,thickness:g.n});};
  for(let row=0;row<=minor;row++){
   const runs=[];let start=-1,last=-1;
   if(row<minor)for(let col=0;col<=major;col++){const on=col<major&&dark[vertical?col*width+row:row*width+col];if(on){if(start<0)start=col;last=col;}if(start>=0&&(!on&&(col-last>2||col===major))){if(last-start+1>=minLength)runs.push([start,last]);start=-1;}}
   const next=[];const used=new Set();
   for(const [start,end] of runs){let match=-1,best=.72;active.forEach((g,i)=>{const overlap=Math.max(0,Math.min(end,g.end)-Math.max(start,g.start))/Math.max(end-start,g.end-g.start);if(!used.has(i)&&overlap>best){best=overlap;match=i;}});if(match>=0){const g=active[match];used.add(match);next.push({...g,start:Math.min(g.start,start),end:Math.max(g.end,end),last:row,n:g.n+1});}else next.push({start,end,first:row,last:row,n:1});}
   active.forEach((g,i)=>{if(!used.has(i))finish(g);});active=next;
  }
 }
 const walls=boxes.filter(g=>g.end-g.start>=Math.max(minLength,g.thickness*3)).map((g,i)=>({id:'scan-'+i,a:g.vertical?[g.center,g.start]:[g.start,g.center],b:g.vertical?[g.center,g.end]:[g.end,g.center],thickness:g.thickness}));
 // Extend ends to the centreline of a nearby perpendicular wall at a junction.
 for(const w of walls)for(const key of ['a','b']){let best=null,bestD=Infinity;for(const v of walls){if(w===v)continue;const wH=w.a[1]===w.b[1],vH=v.a[1]===v.b[1];if(wH===vH)continue;const p=wH?[v.a[0],w.a[1]]:[w.a[0],v.a[1]];const d=Math.hypot(p[0]-w[key][0],p[1]-w[key][1]);const within=wH?p[1]>=v.a[1]-w.thickness&&p[1]<=v.b[1]+w.thickness:p[0]>=v.a[0]-w.thickness&&p[0]<=v.b[0]+w.thickness;if(within&&d<=Math.max(w.thickness,v.thickness)*1.6+3&&d<bestD){best=p;bestD=d;}}if(best)w[key]=best;}
 return walls.slice(0,300);
}
