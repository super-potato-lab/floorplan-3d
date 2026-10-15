import {readdir,readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const files=(await readdir('planner')).sort();
const sources=await Promise.all(files.map(async name=>[name,await readFile('planner/'+name,'utf8')]));
const version=createHash('sha256').update(sources.map(([n,s])=>n+'\0'+s).join('\0')).digest('hex').slice(0,12);
// Pages caches static files. Version the entire module graph together, including workers.
const versioned=s=>s.replace(/(['"])(\.\.?\/[^'"?]+\.(?:mjs|css|json))\1/g,(_,q,p)=>`${q}${p}?v=${version}${q}`);
await rm('_site',{recursive:true,force:true});await mkdir('_site/planner',{recursive:true});
await writeFile('_site/index.html',await readFile('index.html'));await writeFile('_site/.nojekyll','');
for(const [name,source] of sources)await writeFile('_site/planner/'+name,/\.(html|mjs)$/.test(name)?versioned(source):source);
console.log(`Packaged universal workspace ${version}`);
