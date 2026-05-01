// ==============================================
// NTZIN V12 - GOD DETECTION ENGINE
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

// =======================
// HELPERS
// =======================

function parsePlist(file){
try{
const buf=fs.readFileSync(file);
if(buf.slice(0,6).toString()==="bplist"){
return bplist.parseBuffer(buf)[0];
}
return plist.parse(buf.toString());
}catch{return null;}
}

function getDate(obj){
return obj.Timestamp||obj.Date||obj.CreationDate||obj.EventTime||null;
}

function epoch(d){
if(!d) return 0;
const dt=new Date(d);
return isNaN(dt)?0:dt.getTime();
}

function detectProxy(text){
const keys=[
"httpproxy","httpsproxy","socksproxy",
"httpenable","httpsenable","socksenable",
"proxyautoconfigurlstring"
];
return keys.filter(k=>text.includes(k));
}

// =======================
// GOD DETECTION ENGINE
// =======================

function godAnalysis(eventos, proxyHits){

let report = {
timeIssues: [],
patterns: [],
proxyTimeline: [],
risk: 0
};

// ---- TIME INCONSISTENCY ----
for(let i=1;i<eventos.length;i++){
if(eventos[i].time < eventos[i-1].time){
report.timeIssues.push("Tempo invertido detectado");
report.risk += 20;
}
}

// ---- GAP DETECTION ----
for(let i=1;i<eventos.length;i++){
let gap = eventos[i].time - eventos[i-1].time;
if(gap > 86400000){ // > 1 dia
report.timeIssues.push("Gap de tempo suspeito (>1 dia)");
report.risk += 10;
}
}

// ---- RAPID INSTALL/REMOVE ----
for(let i=1;i<eventos.length;i++){
if(eventos[i-1].tipo==="INSTALL" && eventos[i].tipo==="REMOVE"){
let diff = eventos[i].time - eventos[i-1].time;
if(diff > 0 && diff < 300000){
report.patterns.push("Install → Remove rápido (<5min)");
report.risk += 25;
}
}
}

// ---- MULTI INSTALL ----
let installs = eventos.filter(e=>e.tipo==="INSTALL").length;
if(installs >= 3){
report.patterns.push("Múltiplos INSTALL suspeitos");
report.risk += 15;
}

// ---- PROXY ANALYSIS ----
if(proxyHits.length){
report.patterns.push("Proxy detectado no sistema");
report.risk += proxyHits.length * 5;

eventos.forEach(e=>{
if(e.tipo==="INSTALL"){
report.proxyTimeline.push({
event:"Possível ativação de proxy",
time:e.time
});
}
if(e.tipo==="REMOVE"){
report.proxyTimeline.push({
event:"Possível remoção de proxy",
time:e.time
});
}
});
}

// ---- MISSING TIMESTAMP ----
eventos.forEach(e=>{
if(!e.time){
report.timeIssues.push("Evento sem timestamp");
report.risk += 10;
}
});

// normalize
if(report.risk > 100) report.risk = 100;

return report;
}

// =======================
// HOME (UI BONITA)
// =======================

app.get("/", (req,res)=>{
res.send(`
<html>
<head>
<style>
body{
margin:0;
background:#000;
color:#fff;
font-family:Arial;
display:flex;
justify-content:center;
align-items:center;
height:100vh;
}

.box{
background:rgba(255,255,255,0.05);
padding:40px;
border-radius:20px;
backdrop-filter:blur(20px);
box-shadow:0 0 40px rgba(255,255,255,0.2);
text-align:center;
}

button{
padding:10px 20px;
border:none;
border-radius:10px;
background:#fff;
color:#000;
cursor:pointer;
}

.bar{
height:10px;
background:#333;
margin-top:20px;
border-radius:10px;
overflow:hidden;
}

.progress{
height:100%;
width:0%;
background:#fff;
transition:0.2s;
}
</style>
</head>

<body>

<div class="box">
<h1>NTZIN V12 GOD</h1>
<input type="file" id="file"><br><br>
<button onclick="scan()">SCAN</button>

<div class="bar">
<div class="progress" id="p"></div>
</div>
</div>

<script>
function scan(){
let f=document.getElementById("file").files[0];
if(!f) return alert("Escolhe arquivo");

let p=document.getElementById("p");
let v=0;

let int=setInterval(()=>{
v+=5;
p.style.width=v+"%";
if(v>=90) clearInterval(int);
},200);

let fd=new FormData();
fd.append("arquivo",f);

fetch("/scan",{method:"POST",body:fd})
.then(r=>r.text())
.then(html=>{
p.style.width="100%";
setTimeout(()=>{
document.open();
document.write(html);
document.close();
},500);
});
}
</script>

</body>
</html>
`);
});

// =======================
// SCAN
// =======================

app.post("/scan", upload.single("arquivo"), async (req,res)=>{

const start=Date.now();

const pasta="scan_"+Date.now();
await fsp.mkdir(pasta);

await tar.x({file:req.file.path,cwd:pasta});

const files=await fsp.readdir(pasta);

let eventos=[];
let proxy=[];

for(const f of files){

const full=path.join(pasta,f);
const raw=await fsp.readFile(full);
const txt=raw.toString().toLowerCase();

proxy.push(...detectProxy(txt));

const parsed=parsePlist(full);

if(parsed){

const str=JSON.stringify(parsed).toLowerCase();

let tipo=null;
if(str.includes("install")) tipo="INSTALL";
if(str.includes("remove")) tipo="REMOVE";

if(tipo){
eventos.push({
tipo,
nome: parsed.PayloadDisplayName || parsed.PayloadIdentifier || "Perfil",
time: epoch(getDate(parsed))
});
}
}
}

eventos.sort((a,b)=>a.time-b.time);

// =======================
// GOD ANALYSIS
// =======================

const god = godAnalysis(eventos, proxy);

const tempo=((Date.now()-start)/1000).toFixed(2);

// =======================
// RESULTADO
// =======================

res.send(`
<html>
<style>
body{background:#000;color:#fff;font-family:Arial;padding:30px;}
.card{background:#111;padding:15px;border-radius:10px;margin-bottom:10px;}
.bad{color:red;}
.warn{color:yellow;}
.good{color:lime;}
</style>

<body>

<h1>NTZIN V12 REPORT</h1>

<div class="card">Tempo: ${tempo}s</div>

<div class="card">
RISK:
<span class="${god.risk>70?"bad":god.risk>40?"warn":"good"}">
${god.risk}/100
</span>
</div>

<div class="card">
<b>Problemas de Tempo:</b><br>
${god.timeIssues.join("<br>") || "Nenhum"}
</div>

<div class="card">
<b>Padrões Suspeitos:</b><br>
${god.patterns.join("<br>") || "Nenhum"}
</div>

<div class="card">
<b>Proxy:</b><br>
${proxy.join("<br>") || "Nenhum"}
</div>

<div class="card">
<b>Eventos:</b><br>
${
eventos.map(e=>`
<div>
${e.tipo} - ${e.nome}<br>
${new Date(e.time).toLocaleString()}
</div>
`).join("")
}
</div>

<br>
<a href="/">Voltar</a>

</body>
</html>
`);
});

app.listen(PORT,()=>console.log("V12 GOD ONLINE"));
