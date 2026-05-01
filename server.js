// ==============================================
// NTZIN V7 INSANO (ENTERPRISE STYLE)
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

app.get("/", (req, res) => {
res.send(`
<html>
<head>
<title>NTZIN V7</title>

<style>
body{
margin:0;
height:100vh;
font-family:Arial;
color:white;
overflow:hidden;
background:#000;
}

canvas{
position:fixed;
top:0;
left:0;
z-index:0;
}

.box{
position:relative;
z-index:1;
width:650px;
margin:auto;
top:50%;
transform:translateY(-50%);
padding:40px;
border-radius:20px;
background:rgba(255,255,255,0.05);
backdrop-filter:blur(20px);
box-shadow:0 0 40px rgba(255,255,255,0.2);
text-align:center;
}

button{
margin-top:20px;
padding:14px 30px;
background:#fff;
color:#000;
border:none;
border-radius:10px;
cursor:pointer;
}

.progress{
margin-top:20px;
height:10px;
background:#111;
border-radius:10px;
overflow:hidden;
display:none;
}

.bar{
height:100%;
width:0%;
background:#fff;
}
</style>
</head>

<body>

<canvas id="bg"></canvas>

<div class="box">
<h1>NTZIN V7</h1>

<input type="file" id="file"><br>
<button onclick="upload()">SCAN</button>

<div class="progress" id="progress">
<div class="bar" id="bar"></div>
</div>

<div id="status"></div>
</div>

<script>
// partículas
const c = document.getElementById("bg");
const ctx = c.getContext("2d");
c.width=innerWidth;
c.height=innerHeight;

let particles = Array.from({length:80},()=>({
x:Math.random()*c.width,
y:Math.random()*c.height,
vx:Math.random()-0.5,
vy:Math.random()-0.5
}));

function draw(){
ctx.clearRect(0,0,c.width,c.height);
particles.forEach(p=>{
p.x+=p.vx;
p.y+=p.vy;
ctx.fillStyle="white";
ctx.fillRect(p.x,p.y,2,2);
});
requestAnimationFrame(draw);
}
draw();

// upload
function upload(){
const file = document.getElementById("file").files[0];
if(!file) return alert("Selecione");

const xhr = new XMLHttpRequest();
xhr.open("POST","/upload");

const form = new FormData();
form.append("arquivo",file);

document.getElementById("progress").style.display="block";

xhr.upload.onprogress = e=>{
if(e.lengthComputable){
let p=(e.loaded/e.total)*100;
document.getElementById("bar").style.width=p+"%";
document.getElementById("status").innerText="Upload "+p.toFixed(0)+"%";
}
};

xhr.onload = ()=>{
document.getElementById("status").innerText="Processando...";
document.open();
document.write(xhr.responseText);
document.close();
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

function extractDate(obj){
return obj.Timestamp || obj.Date || obj.CreationDate || obj.EventTime || null;
}

function formatDate(d){
if(!d) return {text:"UNKNOWN",trust:"LOW",value:0};

let date = new Date(d);
if(isNaN(date)) return {text:"UNKNOWN",trust:"LOW",value:0};

return {
text: date.toLocaleString("pt-BR"),
trust:"HIGH",
value: date.getTime()
};
}

// ==============================================
// SCAN
// ==============================================

app.post("/upload", upload.single("arquivo"), async (req,res)=>{

const start=Date.now();

const pasta="scan_"+Date.now();
await fsp.mkdir(pasta);

await tar.x({file:req.file.path,cwd:pasta});

const files = await fsp.readdir(pasta);

let eventos=[];

for(const f of files){

const parsed=parsePlist(path.join(pasta,f));
if(parsed){

const txt=JSON.stringify(parsed).toLowerCase();

let tipo=null;
if(txt.includes("install")) tipo="INSTALL";
if(txt.includes("remove")) tipo="REMOVE";

if(tipo){

const d=formatDate(extractDate(parsed));

eventos.push({
tipo,
nome: parsed.PayloadDisplayName || "Perfil",
data:d.text,
value:d.value,
trust:d.trust
});
}
}
}

// ordenar timeline
eventos.sort((a,b)=>a.value-b.value);

// detectar inconsistência
let anomalies=0;
for(let i=1;i<eventos.length;i++){
if(eventos[i].value < eventos[i-1].value){
eventos[i].trust="INCONSISTENT";
anomalies++;
}
}

// score
let score=100;
score -= anomalies*10;
score -= eventos.filter(e=>e.trust==="LOW").length*5;
if(score<0) score=0;

const tempo=((Date.now()-start)/1000).toFixed(2);

// ==============================================
// RESULT
// ==============================================

res.send(`
<html>
<style>
body{background:#000;color:#fff;font-family:Arial;padding:30px;}
.card{background:rgba(255,255,255,0.05);padding:20px;margin-bottom:15px;border-radius:12px;}
.good{color:#00ff99;}
.warn{color:#ffaa00;}
.bad{color:#ff4444;}
</style>

<body>

<h1>NTZIN V7 DASHBOARD</h1>

<div class="card">
Tempo: ${tempo}s
</div>

<div class="card">
SYSTEM TRUST SCORE: 
<span class="${score>70?"good":score>40?"warn":"bad"}">
${score}/100
</span>
</div>

<div class="card">
Timeline:
${
eventos.map(e=>`
<div>
<b>${e.tipo}</b> - ${e.nome}<br>
${e.data} 
<span class="${e.trust==="HIGH"?"good":e.trust==="LOW"?"warn":"bad"}">
(${e.trust})
</span>
</div><hr>
`).join("")
}
</div>

<div class="card">
Anomalias detectadas: ${anomalies}
</div>

</body>
</html>
`);

});

app.listen(PORT,()=>console.log("NTZIN V7 ONLINE"));
