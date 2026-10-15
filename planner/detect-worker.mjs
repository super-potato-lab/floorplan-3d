import {detectWalls} from './detect.mjs';
self.onmessage=({data})=>{try{self.postMessage({walls:detectWalls(data.pixels,data.width,data.height,data.options)});}catch(e){self.postMessage({error:e.message});}};
