import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
const assets={};
async function scan(directory,prefix=''){for(const entry of await readdir(directory,{withFileTypes:true})){if(['server','.openai'].includes(entry.name))continue;const rel=prefix+'/'+entry.name,full=directory+'/'+entry.name;if(entry.isDirectory())await scan(full,rel);else{const ext=entry.name.slice(entry.name.lastIndexOf('.'));if(types[ext])assets[rel]={body:await readFile(full,'utf8'),type:types[ext]};}}}
await scan('dist');const images=JSON.parse(await readFile('dist/assets/images.json','utf8'));
const locationIds=['bangalore','chennai','tirupati'];
const locations=locationIds.map((id,i)=>({id,name:['Bangalore','Chennai','Tirupati'][i],enabled:true,version:1}));
const cars=[['dzire','Maruti Suzuki Dzire','Sedan'],['baleno','Maruti Suzuki Baleno','Hatchback'],['i20','Hyundai i20','Hatchback']].map(([id,name,category])=>({id,name,category,seats:5,locationIds,status:'active',selfEnabled:true,driverEnabled:true,selfRate:null,driverRate:null,deposit:null,image:images[id].url,imageCredit:images[id].photographer,imageSource:images[id].source,imageLicense:images[id].license,notes:'',version:1}));
await mkdir('dist/server',{recursive:true});await writeFile('dist/server/assets.mjs','export const assets='+JSON.stringify(assets)+';\nexport const defaults='+JSON.stringify({cars,locations})+';\n');await writeFile('dist/server/index.js',await readFile('server/worker.mjs','utf8'));console.log('GoRide Worker and dashboard built.');

await writeFile('dist/server/customers.mjs',await readFile('server/customers.mjs','utf8'));

await writeFile('dist/server/messaging.mjs',await readFile('server/messaging.mjs','utf8'));
