// ==============================================
// NTZIN V8 GOD MODE (Enterprise + Charts + Forensic Time)
// ==============================================

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const tar = require("tar");
const plist = require("plist");
const bplist = require("bplist-parser");

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ dest: "uploads/" });

// ==============================================
// HOME (UI + particles + progress)
// ==============================================

app.get("/", (req, res) => {
res.send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>NTZIN V8</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{
  height:100vh;
  background:#000;
  color:#fff;
  font-family:Arial, Helvetica, sans-serif;
  overflow:hidden;
}
canvas{position:fixed;inset:0;z-index:0}
.wrap{
  position:relative;z-index:1;
  height:100%;display:flex;align-items:center;justify-content:center;
}
.box{
  width:720px; padding:42px; border-radius:18px;
  background:rgba(255,255,255,.06);
  backdrop-filter:blur(18px);
  box-shadow:0 0 50px rgba(255,255,255,.18);
  text-align:center;
}
h1{letter-spacing:3px}
.sub{opacity:.7;margin-top:6px}
input{margin-top:20px}
button{
  margin-top:18px; padding:14px 28px;
  border-radius:10px; border:none; cursor:pointer;
  background:#fff; color:#000; font-weight:bold;
  transition:.25s;
}
button:hover{transform:scale(1.04); box-shadow:0 0 16px #fff}
.progress{
  margin-top:18px;height:10px;background:#111;border-radius:10px;overflow:hidden;display:none;
}
.bar{height:100%;width:0;background:linear-gradient(90deg,#fff,#999)}
#status{margin-top:8px;opacity:.7}
</style>
</head>
<body>
<canvas id="bg"></canvas>

<div class="wrap">
  <div class="box">
    <h1>NTZIN V8</h1>
    <div class="sub">GOD MODE · Forensic Analyzer</div>

    <input type="file" id="file"><br>
    <button onclick="upload()">SCAN</button>

    <div class="progress" id="progress">
      <div class="bar" id="bar"></div>
    </div>
    <div id="status"></div>
  </div>
</div>

<script>
// particles
const c=document.getElementById('bg');
const ctx=c.getContext('2d');
c.width=innerWidth; c.height=innerHeight;
let P=Array.from({length:90},()=>({x:Math.random()*c.width,y:Math.random()*c.height,vx:Math.random()-.5,vy:Math.random()-.5}));
function draw(){
  ctx.clearRect(0,0,c.width,c.height);
  P.forEach(p=>{
    p.x+=p.vx; p.y+=p.vy;
    if(p.x<0||p.x>c.width)p.vx*=-1;
    if(p.y<0||p.y>c.height)p.vy*=-1;
    ctx.fillStyle="#fff"; ctx.fillRect(p.x,p.y,2,2);
  });
  requestAnimationFrame(draw);
}
draw();

// upload
function upload(){
  const file=document.getElementById("file").files[0];
  if(!file){alert("Selecione um arquivo");return;}
  const xhr=new XMLHttpRequest();
  xhr.open("POST","/upload");

  const form=new FormData();
  form.append("arquivo",file);

  document.getElementById("progress").style.display="block";

  xhr.upload.onprogress=e=>{
    if(e.lengthComputable){
      const p=(e.loaded/e.total)*100;
      document.getElementById("bar").style.width=p+"%";
      document.getElementById("status").innerText="Upload "+p.toFixed(0)+"%";
    }
  };

  xhr.onload=()=>{
    document.getElementById("status").innerText="Processando...";
    document.open(); document.write(xhr.responseText); document.close();
  };

  xhr.send(form);
}
</script>
</body>
</html>
`);
});

// ==============================================
// HELPERS
// ==============================================

function parsePlist(file){
  try{
    const buf = fs.readFileSync(file);
    if(buf.slice(0,6).toString()==="bplist"){
      return bplist.parseBuffer(buf)[0];
    }
    return plist.parse(buf.toString());
  }catch{return null;}
}

function tryExtractDate(obj){
  return obj?.Timestamp ||
         obj?.Date ||
         obj?.CreationDate ||
         obj?.EventTime ||
         obj?.LastModified ||
         obj?.Time ||
         null;
}

function toEpoch(d){
  if(!d) return 0;
  if(typeof d === "number") return d*1000; // secs -> ms
  const dt = new Date(d);
  if(isNaN(dt)) return 0;
  return dt.getTime();
}

function formatLocal(epoch){
  if(!epoch) return {text:"UNKNOWN", trust:"LOW", value:0};
  const dt = new Date(epoch);
  return { text: dt.toLocaleString("pt-BR"), trust:"HIGH", value: epoch };
}

function proxyEvidence(text){
  const keys = [
    "httpproxy","httpsproxy","httpenable","httpsenable",
    "socksproxy","socksenable",
    "proxyautoconfig","proxyautoconfigurlstring"
  ];
  return keys.filter(k=>text.includes(k));
}

async function walk(dir, out=[]){
  const items = await fsp.readdir(dir);
  for(const it of items){
    const full = path.join(dir,it);
    try{
      const st = await fsp.stat(full);
      if(st.isDirectory()){
        await walk(full,out);
      }else{
        const low = it.toLowerCase();
        if(low.includes("mcprofile") || low.includes("mcsettings") || low.includes("preferences")){
          out.push(full);
        }
      }
    }catch{}
  }
  return out;
}

// ==============================================
// SCAN
// ==============================================

app.post("/upload", upload.single("arquivo"), async (req,res)=>{

const t0 = Date.now();
const pasta = "scan_"+Date.now();
await fsp.mkdir(pasta);

await tar.x({ file:req.file.path, cwd:pasta });

const files = await walk(pasta);

let eventos = [];
let proxyHits = new Set();

for(const f of files){
  const raw = await fsp.readFile(f);
  const txt = raw.toString().toLowerCase();
  proxyEvidence(txt).forEach(k=>proxyHits.add(k));

  const parsed = parsePlist(f);
  if(!parsed) continue;

  const flat = JSON.stringify(parsed).toLowerCase();
  let tipo=null;
  if(flat.includes("install")) tipo="INSTALL";
  if(flat.includes("remove")) tipo = tipo ? tipo : "REMOVE";

  if(tipo){
    const epoch = toEpoch(tryExtractDate(parsed));
    const d = formatLocal(epoch);

    eventos.push({
      tipo,
      nome: parsed.PayloadDisplayName || parsed.ProfileName || parsed.Name || "Perfil",
      epoch: d.value,
      data: d.text,
      trust: d.trust
    });
  }
}

// ordenar por tempo
eventos.sort((a,b)=>a.epoch-b.epoch);

// inconsistências
let anomalies = 0;
for(let i=1;i<eventos.length;i++){
  if(eventos[i].epoch && eventos[i-1].epoch && eventos[i].epoch < eventos[i-1].epoch){
    eventos[i].trust = "INCONSISTENT";
    anomalies++;
  }
}

// padrões rápidos (install -> remove em curto tempo)
let rapidPairs = 0;
for(let i=1;i<eventos.length;i++){
  if(eventos[i-1].tipo==="INSTALL" && eventos[i].tipo==="REMOVE"){
    const dt = eventos[i].epoch - eventos[i-1].epoch;
    if(dt>0 && dt < 5*60*1000){ // < 5 min
      rapidPairs++;
    }
  }
}

// scores
let timeScore = 100;
timeScore -= anomalies*10;
timeScore -= eventos.filter(e=>e.trust==="LOW").length*5;
if(timeScore<0) timeScore=0;

const proxyScore = Math.min(100, proxyHits.size*10);

const totalScore = Math.max(0, Math.round((timeScore*0.6 + (100-proxyScore)*0.4)));

const t1 = ((Date.now()-t0)/1000).toFixed(2);

// preparar dados do gráfico (bucket por minuto)
const buckets = {};
eventos.forEach(e=>{
  if(!e.epoch) return;
  const m = Math.floor(e.epoch/60000)*60000;
  buckets[m] = (buckets[m]||0) + 1;
});
const chartData = Object.keys(buckets).sort().map(k=>({t: Number(k), v: buckets[k]}));

// limpeza
try{ await fsp.rm(pasta, {recursive:true, force:true}); }catch{}
try{ await fsp.unlink(req.file.path); }catch{}

// ==============================================
// RESULT (Dashboard + Chart)
// ==============================================

res.send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>NTZIN V8 REPORT</title>
<style>
body{background:#000;color:#fff;font-family:Arial;padding:26px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:16px}
.card{
  background:rgba(255,255,255,.06);
  border-radius:14px;padding:16px;
  box-shadow:0 0 20px rgba(255,255,255,.12)
}
.good{color:#00ff99}
.warn{color:#ffaa00}
.bad{color:#ff5555}
.small{opacity:.7;font-size:12px}
.ev{
  background:#0f0f0f;border-radius:10px;padding:10px;margin-top:8px
}
hr{border:none;border-top:1px solid #222;margin:10px 0}
</style>
</head>
<body>

<h1>NTZIN V8 DASHBOARD</h1>

<div class="grid">
  <div class="card">
    <b>Tempo de análise</b><br>${t1}s
  </div>

  <div class="card">
    <b>Time Integrity</b><br>
    <span class="${timeScore>70?"good":timeScore>40?"warn":"bad"}">${timeScore}/100</span>
    <div class="small">anomalias: ${anomalies}</div>
  </div>

  <div class="card">
    <b>Proxy Evidence</b><br>
    <span class="${proxyHits.size? "warn":"good"}">${proxyHits.size}/10</span>
    <div class="small">${[...proxyHits].join(", ") || "nenhuma evidência"}</div>
  </div>
</div>

<div class="card">
  <b>SYSTEM TRUST SCORE</b><br>
  <span class="${totalScore>70?"good":totalScore>40?"warn":"bad"}">${totalScore}/100</span>
  <div class="small">rapid pairs (&lt;5min): ${rapidPairs}</div>
</div>

<div class="card">
  <b>Atividade (eventos por minuto)</b>
  <canvas id="chart" height="120"></canvas>
</div>

<div class="card">
  <b>Timeline</b>
  ${
    eventos.length
    ? eventos.map(e=>`
      <div class="ev">
        <b>${e.tipo}</b> - ${e.nome}<br>
        ${e.data}
        <span class="${
          e.trust==="HIGH"?"good":e.trust==="LOW"?"warn":"bad"
        }">(${e.trust})</span>
      </div>
    `).join("")
    : "Nenhum evento encontrado"
  }
</div>

<script>
// gráfico simples (sem libs externas)
const data = ${JSON.stringify(chartData)};
const c = document.getElementById('chart');
const ctx = c.getContext('2d');
const W = c.width = c.clientWidth;
const H = c.height = c.clientHeight;

ctx.clearRect(0,0,W,H);
ctx.strokeStyle="#fff";
ctx.lineWidth=2;

if(data.length){
  const minT = data[0].t;
  const maxT = data[data.length-1].t;
  const maxV = Math.max(...data.map(d=>d.v));

  const x = t => (t-minT)/(maxT-minT||1)*(W-20)+10;
  const y = v => H - (v/(maxV||1))*(H-20) - 10;

  ctx.beginPath();
  data.forEach((d,i)=>{
    const px = x(d.t);
    const py = y(d.v);
    if(i===0) ctx.moveTo(px,py);
    else ctx.lineTo(px,py);
  });
  ctx.stroke();
}
</script>

</body>
</html>
`);
});

app.listen(PORT, ()=>console.log("NTZIN V8 ONLINE"));
