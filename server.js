// ==============================================
// NTZIN V9 PRO - FULL FORENSIC SYSTEM
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
// HOME
// ==============================================

app.get("/", (req,res)=>{
res.send(`
<html>
<style>
body{
background:#000;
color:#fff;
font-family:Arial;
display:flex;
justify-content:center;
align-items:center;
height:100vh;
}

.box{
background:rgba(255,255,255,.05);
padding:40px;
border-radius:20px;
backdrop-filter:blur(20px);
box-shadow:0 0 40px rgba(255,255,255,.2);
text-align:center;
}
</style>

<div class="box">
<h1>NTZIN V9 PRO</h1>
<input type="file" id="file"><br><br>
<button onclick="upload()">SCAN</button>
<div id="status"></div>
</div>

<script>
function upload(){
const f=document.getElementById("file").files[0];
if(!f)return alert("Selecione");

const xhr=new XMLHttpRequest();
xhr.open("POST","/upload");

const fd=new FormData();
fd.append("arquivo",f);

xhr.onload=()=>{
document.open();
document.write(xhr.responseText);
document.close();
};

xhr.send(fd);
}
</script>
</html>
`);
});

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

function proxyDetect(text){
const keys=[
"httpproxy","httpsproxy","socksproxy",
"httpenable","httpsenable","socksenable",
"proxyautoconfigurlstring"
];

let found=[];
keys.forEach(k=>{
if(text.includes(k)) found.push(k);
});
return found;
}

// ==============================================
// SCAN
// ==============================================

app.post("/upload", upload.single("arquivo"), async (req,res)=>{

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

proxy.push(...proxyDetect(txt));

const parsed=parsePlist(full);

if(parsed){

const str=JSON.stringify(parsed).toLowerCase();

let tipo=null;
if(str.includes("install")) tipo="INSTALL";
if(str.includes("remove")) tipo="REMOVE";

if(tipo){

const e=epoch(getDate(parsed));

eventos.push({
tipo,
nome: parsed.PayloadDisplayName || parsed.Name || parsed.PayloadIdentifier || "Perfil",
time:e
});
}
}
}

// ordenar
eventos.sort((a,b)=>a.time-b.time);

// inconsistência
let anomalies=0;
for(let i=1;i<eventos.length;i++){
if(eventos[i].time < eventos[i-1].time){
anomalies++;
}
}

// rapid pattern
let rapid=0;
for(let i=1;i<eventos.length;i++){
if(eventos[i-1].tipo==="INSTALL" && eventos[i].tipo==="REMOVE"){
if(eventos[i].time - eventos[i-1].time < 300000){
rapid++;
}
}
}

// scores
let timeScore=100 - anomalies*10;
let proxyScore=Math.min(100, proxy.length*5);
let activityScore=100 - rapid*10;

let overall = Math.max(0, Math.floor(
(timeScore*0.4)+(activityScore*0.3)+((100-proxyScore)*0.3)
));

const tempo=((Date.now()-start)/1000).toFixed(2);

// ==============================================
// RESULT
// ==============================================

res.send(`
<html>
<style>
body{background:#000;color:#fff;font-family:Arial;padding:30px;}
.card{background:#111;padding:15px;border-radius:10px;margin-bottom:10px;}
.good{color:#0f0;}
.warn{color:#ff0;}
.bad{color:#f00;}
</style>

<body>

<h1>NTZIN V9 PRO</h1>

<div class="card">Tempo: ${tempo}s</div>

<div class="card">
Time Score: ${timeScore}<br>
Proxy Score: ${proxyScore}<br>
Activity Score: ${activityScore}<br>
</div>

<div class="card">
OVERALL: 
<span class="${overall>70?"good":overall>40?"warn":"bad"}">
${overall}/100
</span>
</div>

<div class="card">
Proxy Evidence:<br>
${proxy.join("<br>") || "Nenhuma"}
</div>

<div class="card">
Eventos:
${
eventos.map(e=>`
<div>
${e.tipo} - ${e.nome}<br>
${e.time}
</div>
`).join("")
}
</div>

</body>
</html>
`);
});

app.listen(PORT,()=>console.log("V9 PRO ONLINE"));
