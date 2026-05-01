// ==============================================
// NTZIN V10 - ENTERPRISE STRUCTURE (SIMPLIFIED)
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
// STORAGE (memória)
// ==============================================

let history = [];

// ==============================================
// HELPERS
// ==============================================

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
if(typeof d==="number") return d*1000;
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

// ==============================================
// ANALYZER (motor)
// ==============================================

async function analyze(filePath){

const pasta="scan_"+Date.now();
await fsp.mkdir(pasta);

await tar.x({file:filePath,cwd:pasta});

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

// ordenar timeline
eventos.sort((a,b)=>a.time-b.time);

// detectar anomalias
let anomalies=0;
for(let i=1;i<eventos.length;i++){
if(eventos[i].time < eventos[i-1].time) anomalies++;
}

// detectar padrão rápido
let rapid=0;
for(let i=1;i<eventos.length;i++){
if(eventos[i-1].tipo==="INSTALL" && eventos[i].tipo==="REMOVE"){
if(eventos[i].time - eventos[i-1].time < 300000) rapid++;
}
}

// ==============================================
// SCORING
// ==============================================

let timeScore=100 - anomalies*10;
let proxyScore=Math.min(100, proxy.length*5);
let activityScore=100 - rapid*10;

let overall = Math.max(0, Math.floor(
(timeScore*0.4)+(activityScore*0.3)+((100-proxyScore)*0.3)
));

return {
eventos,
proxy,
scores:{
timeScore,
proxyScore,
activityScore,
overall
}
};
}

// ==============================================
// ROUTES
// ==============================================

app.get("/", (req,res)=>{
res.send(`
<h1>NTZIN V10</h1>
<input type="file" id="file">
<button onclick="upload()">SCAN</button>

<script>
function upload(){
const f=document.getElementById("file").files[0];
const fd=new FormData();
fd.append("arquivo",f);

fetch("/scan",{method:"POST",body:fd})
.then(r=>r.text())
.then(html=>{
document.open();
document.write(html);
document.close();
});
}
</script>
`);
});

// SCAN

app.post("/scan", upload.single("arquivo"), async (req,res)=>{

const result = await analyze(req.file.path);

// salvar histórico
history.push({
date: new Date(),
result
});

// render

res.send(`
<h1>NTZIN V10 REPORT</h1>

<p>OVERALL: ${result.scores.overall}</p>

<h2>Proxy</h2>
${result.proxy.join("<br>") || "Nenhum"}

<h2>Eventos</h2>
${result.eventos.map(e=>`
<div>
${e.tipo} - ${e.nome} - ${e.time}
</div>
`).join("")}

<br><br>
<a href="/history">Ver histórico</a>
`);
});

// HISTÓRICO

app.get("/history",(req,res)=>{
res.send(`
<h1>Histórico</h1>
${
history.map(h=>`
<div>
${h.date} - Score: ${h.result.scores.overall}
</div>
`).join("")
}
`);
});

// EXPORT JSON

app.get("/export",(req,res)=>{
res.json(history);
});

// ==============================================

app.listen(PORT,()=>console.log("V10 ONLINE"));
