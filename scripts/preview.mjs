import {createServer} from 'node:http';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
await mkdir('.sites-runtime',{recursive:true});
const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-01-01',d1Databases:['DB'],r2Buckets:['BUCKET'],d1Persist:'.sites-runtime/d1',r2Persist:'.sites-runtime/r2'});
const db=await mf.getD1Database('DB');await db.prepare('CREATE TABLE IF NOT EXISTS _preview_migrations (name TEXT PRIMARY KEY)').run();for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort()){if(await db.prepare('SELECT name FROM _preview_migrations WHERE name = ?').bind(name).first())continue;for(const sql of (await readFile('drizzle/'+name,'utf8')).split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql.trim()).run();await db.prepare('INSERT INTO _preview_migrations (name) VALUES (?)').bind(name).run();}
const server=createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const response=await mf.dispatchFetch('http://127.0.0.1:4173'+req.url,{method:req.method,headers:{...req.headers,'oai-authenticated-user-email':'nagendra@headrun.com'},body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(e){console.error(e.message);res.writeHead(500);res.end('Preview unavailable');}});
server.listen(4173,'127.0.0.1',()=>console.log('Local GoRide preview: http://127.0.0.1:4173/admin (local test identity only)'));
process.on('SIGINT',async()=>{server.close();await mf.dispose();process.exit(0);});
