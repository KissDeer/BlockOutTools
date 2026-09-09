// 从 sunken-sanctum-spine.blockout.json 生成顶视平面图 + 垂直 Z 剖面图 SVG。
// 用装配求解后的世界坐标绘制（而非原始 assemblyTransform）。
// 供在没有 app / UE 环境时“看到”关卡布局与垂直落差。
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = resolve(ROOT, process.argv[2] ?? "layouts/sunken-sanctum-spine.blockout.json");
const OUTPUT = resolve(ROOT, process.argv[3] ?? "layouts/sunken-sanctum-plan.svg");

const project = JSON.parse(readFileSync(INPUT, "utf8"));

// ---- 装配求解（移植自 app 内 assembly-resolver.ts）----
const RULES = { door:{f:0,v:0},"one-way-door":{f:0,v:0},stairs:{f:400,v:300},"spiral-stairs":{f:0,v:300},elevator:{f:0,v:300},"one-way-elevator":{f:0,v:300},road:{f:500,v:0},drop:{f:250,v:-300} };
const norm = (r) => ((r % 360) + 360) % 360;
const rot = (x,y,d) => { const rad = d*Math.PI/180; return [x*Math.cos(rad)-y*Math.sin(rad), x*Math.sin(rad)+y*Math.cos(rad)]; };
const offFor = (t,sr) => { const r=RULES[t]; const [x,y]=rot(r.f,0,sr); return [x,y,r.v]; };
const wpp = (t,port) => { const [x,y]=rot(port.transform.position[0],port.transform.position[1],t.rotation); return {position:[t.position[0]+x,t.position[1]+y,t.position[2]+port.transform.position[2]],rotation:norm(t.rotation+port.transform.rotation)}; };
const fromPose = (port,pose) => { const rotation=norm(pose.rotation-port.transform.rotation); const [x,y]=rot(port.transform.position[0],port.transform.position[1],rotation); return {position:[pose.position[0]-x,pose.position[1]-y,pose.position[2]-port.transform.position[2]],rotation}; };
const solveT = (type,st,sp,tp) => { const sp2=wpp(st,sp); const o=offFor(type,sp2.rotation); return fromPose(tp,{position:[sp2.position[0]+o[0],sp2.position[1]+o[1],sp2.position[2]+o[2]],rotation:norm(sp2.rotation+180)}); };
const solveS = (type,tt,sp,tp) => { const tp2=wpp(tt,tp); const sr=norm(tp2.rotation-180); const o=offFor(type,sr); return fromPose(sp,{position:[tp2.position[0]-o[0],tp2.position[1]-o[1],tp2.position[2]-o[2]],rotation:sr}); };

const defs = new Map(project.modules.map(m=>[m.id,m]));
const refs = new Map();
for (const inst of project.instances) { const d=defs.get(inst.definitionId); if(!d)continue; for(const b of d.blocks) if(b.type==="port") refs.set(`${inst.id}:${b.id}`,{instance:inst,port:b}); }
const crefs = (c)=>{ const s=refs.get(`${c.sourceInstanceId}:${c.sourcePortId}`); const t=refs.get(`${c.targetInstanceId}:${c.targetPortId}`); return s&&t?[s,t]:null; };
const byInst = new Map();
for (const c of project.connections) for (const id of [c.sourceInstanceId,c.targetInstanceId]) { const a=byInst.get(id)??[]; a.push(c); byInst.set(id,a); }
const T = new Map();
const iby = new Map(project.instances.map(i=>[i.id,i]));
const rootOrder = [...new Set([...project.connections.map(c=>c.sourceInstanceId), ...project.instances.map(i=>i.id)])];
for (const rootId of rootOrder) { const root=iby.get(rootId); if(!root||T.has(root.id))continue; T.set(root.id,structuredClone(root.assemblyTransform)); const q=[root.id]; for(let i=0;i<q.length;i++){ const curId=q[i]; const cur=T.get(curId); if(!cur)continue; for(const c of byInst.get(curId)??[]){ const pair=crefs(c); if(!pair)continue; const [s,t]=pair; const curIsSrc=c.sourceInstanceId===curId; const other=curIsSrc?t:s; if(T.has(other.instance.id))continue; T.set(other.instance.id, curIsSrc? solveT(c.type,cur,s.port,t.port): solveS(c.type,cur,s.port,t.port)); q.push(other.instance.id); } } }

const esc = (s)=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// ---- 每模块几何 ----
const footprint = (type,p) => {
  if(type==="box") return [p.BoxSize[0],p.BoxSize[1]];
  if(type==="doorway") return [p.DoorwaySize[0], p.DoorwaySize[1]+p.SideThickness*2];
  if(type==="stairs-linear") return [p.StairsSize[0],p.StairsSize[1]];
  return [p.depth,p.width];
};
const boxAabb = (cx,cy,rotDeg,w,d) => {
  const [rx,ry]=rot(w/2,d/2,rotDeg); const [sx,sy]=rot(w/2,-d/2,rotDeg);
  const xs=[rx,sx,-rx,-sx].map(v=>cx+v); const ys=[ry,sy,-ry,-sy].map(v=>cy+v);
  return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
};

const rooms = [];
for (const inst of project.instances) {
  const mod = defs.get(inst.definitionId); if(!mod) continue;
  const tr = T.get(inst.id) ?? inst.assemblyTransform;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity; let zBase=tr.position[2]; let zTop=-Infinity;
  for(const b of mod.blocks){
    const [ox,oy]=rot(b.transform.position[0],b.transform.position[1],tr.rotation);
    const cx=tr.position[0]+ox, cy=tr.position[1]+oy;
    const [w,d]=footprint(b.type,b.parameters);
    const [x0,y0,x1,y1]=boxAabb(cx,cy,tr.rotation+b.transform.rotation,w,d);
    minX=Math.min(minX,x0);minY=Math.min(minY,y0);maxX=Math.max(maxX,x1);maxY=Math.max(maxY,y1);
    const bTop=tr.position[2]+b.transform.position[2]+(b.type==="box"?b.parameters.BoxSize[2]:b.type==="doorway"?b.parameters.DoorwaySize[2]:b.type==="stairs-linear"?b.parameters.StairsSize[2]:0);
    zTop=Math.max(zTop,bTop);
  }
  const ports = mod.blocks.filter(b=>b.type==="port").map(p=>{ const [ox,oy]=rot(p.transform.position[0],p.transform.position[1],tr.rotation); return { id:p.id, name:p.name, px:tr.position[0]+ox, py:tr.position[1]+oy, pz:tr.position[2]+p.transform.position[2], rotation:norm(tr.rotation+p.transform.rotation) }; });
  rooms.push({ inst, name:inst.name, x0:minX,y0:minY,x1:maxX,y1:maxY, W:maxX-minX, D:maxY-minY, cx:(minX+maxX)/2, cy:(minY+maxY)/2, zBase, zTop, ports, graph:inst.graphPosition });
}

// ---- 顶视包围盒 ----
let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
for(const r of rooms){ minX=Math.min(minX,r.x0);minY=Math.min(minY,r.y0);maxX=Math.max(maxX,r.x1);maxY=Math.max(maxY,r.y1); }
const PAD=500; minX-=PAD;minY-=PAD;maxX+=PAD;maxY+=PAD;
const vw=maxX-minX, vh=maxY-minY, scale=0.2;

const portIndex=new Map();
for(const r of rooms) for(const p of r.ports) portIndex.set(`${r.inst.id}:${p.id}`,p);
const connColor = { door:"#E8A33D","one-way-door":"#E8A33D",stairs:"#5FA8D3",elevator:"#6FBF73",drop:"#C77DD9",road:"#9aa8a0" };

const parts=[];
parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(vw*scale)}" height="${Math.round(vh*scale)+520}" viewBox="${minX} ${minY-300} ${vw} ${vh+300+Math.round(1000*0.72)}" font-family="Arial, 'Microsoft YaHei', sans-serif">`);
parts.push(`<rect x="${minX}" y="${minY-300}" width="${vw}" height="${vh+300+Math.round(1000*0.72)}" fill="#14171a"/>`);
parts.push(`<text x="${minX+40}" y="${minY-210}" fill="#eef2ee" font-size="150">${esc(project.name)} · 顶视平面 + 垂直剖面</text>`);
// grid
for(let gx=Math.floor(minX/1000)*1000; gx<=maxX; gx+=1000) parts.push(`<line x1="${gx}" y1="${minY}" x2="${gx}" y2="${maxY}" stroke="#20262b" stroke-width="6"/>`);
for(let gy=Math.floor(minY/1000)*1000; gy<=maxY; gy+=1000) parts.push(`<line x1="${minX}" y1="${gy}" x2="${maxX}" y2="${gy}" stroke="#20262b" stroke-width="6"/>`);
// connections (顶视)
for(const c of project.connections){
  const a=portIndex.get(`${c.sourceInstanceId}:${c.sourcePortId}`); const b=portIndex.get(`${c.targetInstanceId}:${c.targetPortId}`); if(!a||!b)continue;
  const col=connColor[c.type]??"#888";
  parts.push(`<line x1="${a.px}" y1="${a.py}" x2="${b.px}" y2="${b.py}" stroke="${col}" stroke-width="34" stroke-dasharray="${c.type==="stairs"?"70 55":"none"}"/>`);
  parts.push(`<text x="${(a.px+b.px)/2}" y="${(a.py+b.py)/2-70}" fill="${col}" font-size="95" text-anchor="middle">${esc(c.type)}</text>`);
}
// rooms (顶视)
for(const r of rooms){
  parts.push(`<rect x="${r.x0}" y="${r.y0}" width="${r.W}" height="${r.D}" rx="40" fill="#20262b" stroke="#4b8f7a" stroke-width="24"/>`);
  parts.push(`<text x="${r.x0}" y="${r.y0-70}" fill="#eef2ee" font-size="120">${esc(r.name)}</text>`);
  parts.push(`<text x="${r.x0}" y="${r.y1+150}" fill="#9da69f" font-size="95">Z ${Math.round(r.zBase)} cm · ${Math.round(r.W)}×${Math.round(r.D)}</text>`);
  for(const p of r.ports){ parts.push(`<circle cx="${p.px}" cy="${p.py}" r="40" fill="#E59A42" stroke="#14171a" stroke-width="8"/>`); parts.push(`<text x="${p.px}" y="${p.py-80}" fill="#E8C48A" font-size="88" text-anchor="middle">${esc(p.name)}</text>`); }
}
// ---- 垂直 Z 剖面（画在下方）----
const zSecY = maxY + 360; // 剖面区域顶
const zMin = Math.min(...rooms.map(r=>r.zBase)) - 200;
const zMax = Math.max(...rooms.map(r=>r.zTop)) + 200;
const zSpan = Math.max(1, zMax - zMin);
const zScale = 800 / zSpan; // px per cm
const mapY = (z) => zSecY + (zMax - z) * zScale; // 高处在上
parts.push(`<text x="${minX+40}" y="${zSecY-120}" fill="#eef2ee" font-size="120">垂直剖面（Z 高度, cm）</text>`);
for(let gz=Math.ceil(zMin/300)*300; gz<=zMax; gz+=300){ parts.push(`<line x1="${minX}" y1="${mapY(gz)}" x2="${maxX}" y2="${mapY(gz)}" stroke="#232a2e" stroke-width="4"/>`); parts.push(`<text x="${minX+10}" y="${mapY(gz)-18}" fill="#5c6760" font-size="80">${gz}</text>`); }
for(const r of rooms){ parts.push(`<rect x="${r.x0}" y="${mapY(r.zTop)}" width="${r.W}" height="${mapY(r.zBase)-mapY(r.zTop)}" fill="#274b40" stroke="#4b8f7a" stroke-width="16"/>`); parts.push(`<text x="${r.cx}" y="${((mapY(r.zBase)+mapY(r.zTop))/2)}" fill="#eef2ee" font-size="95" text-anchor="middle">${esc(r.name)}</text>`); }
for(const c of project.connections){ const a=portIndex.get(`${c.sourceInstanceId}:${c.sourcePortId}`); const b=portIndex.get(`${c.targetInstanceId}:${c.targetPortId}`); if(!a||!b)continue; const col=connColor[c.type]??"#888"; parts.push(`<line x1="${(a.px+b.px)/2}" y1="${mapY(a.pz)}" x2="${(a.px+b.px)/2}" y2="${mapY(b.pz)}" stroke="${col}" stroke-width="20" stroke-dasharray="30 22"/>`); parts.push(`<circle cx="${(a.px+b.px)/2}" cy="${mapY(a.pz)}" r="20" fill="${col}"/>`); parts.push(`<circle cx="${(a.px+b.px)/2}" cy="${mapY(b.pz)}" r="20" fill="${col}"/>`); }
parts.push(`</svg>`);

const svg = parts.join("\n");
await writeFile(OUTPUT, svg, "utf8");
console.log(`Wrote ${OUTPUT} (${svg.length} bytes); modules=${rooms.length}; connections=${project.connections.length}`);
