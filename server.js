// ==============================================
// NTZIN ANTI PROXY V5 ABSURDO (BLACK & WHITE)
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
<title>NTZIN V5</title>

<style>
*{margin:0;padding:0;box-sizing:border-box;}

body{
height:100vh;
background:#000;
color:#fff;
font-family:Arial;
display:flex;
justify-content:center;
align-items:center;
overflow:hidden;
}

.box{
width:650px;
padding:50px;
border-radius:20px;
background:rgba(255,255,255,0.05);
backdrop-filter:blur(20px);
box-shadow:0 0 60px rgba(255,255,255,0.15);
text-align:center;
animation:fade 1s ease;
}

h1{
font-size:40px;
letter-spacing:3px;
}

button{
margin-top:20px;
padding:15px 30px;
background:#fff;
color:#000;
border:none;
border-radius:10px;
cursor:pointer;
font-weight:bold;
transition:0.3s;
}

button:hover{
transform:scale(1.05);
box-shadow:0 0 20px #fff;
}

.progress{
width:100%;
height:12px;
background:#111;
border-radius:10px;
margin-top:20px;
overflow:hidden;
display:none;
}

.bar{
height:100%;
width:0%;
background:#fff;
}

#status{
margin-top:10px;
opacity:0.7;
}

@keyframes fade{
from{opacity:0;transform:translateY(20px);}
to{opacity:1;transform:translateY(0);}
}

</style>
</head>

<body>

<div class="box">
<h1>NTZIN</h1>
<p>ANTI PROXY V5</p>

<input type="file" id="file"><br>
<button onclick="upload()">SCAN</button>

<div class="progress" id="progress">
<div class="bar" id="bar"></div>
</div>

<div id="status"></div>
</div>

<script>
function upload(){

const file = document.getElementById("file").files[0];
if(!file){alert("Selecione arquivo");return;}

const xhr = new XMLHttpRequest();
xhr.open("POST","/upload");

const form = new FormData();
form.append("arquivo",file);

document.getElementById("progress").style.display="block";

xhr.upload.onprogress = e=>{
if(e.lengthComputable){
let p = (e.loaded/e.total)*100;
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

async function walk(dir, arr=[]){
const items = await fsp.readdir(dir);
for(const i of items){
const full = path.join(dir,i);
const stat = await fsp.stat(full);

if(stat.isDirectory()){
await walk(full,arr);
}else{
const low=i.toLowerCase();
if(
low.includes("mcprofile")||
low.includes("settings")||
low.includes("preferences")
){
arr.push(full);
}
}
}
return arr;
}

// ==============================================
// ANALISE
// ==============================================

function proxyScan(text){
const keys=[
"httpproxy","httpsproxy","socksproxy",
"proxyautoconfig","proxyenable"
];

return keys.filter(k=>text.includes(k));
}

function extractEvents(obj, list=[]){

if(!obj) return list;

if(Array.isArray(obj)){
obj.forEach(x=>extractEvents(x,list));
return list;
}

if(typeof obj==="object"){

const t=JSON.stringify(obj).toLowerCase();

let tipo=null;
if(t.includes("install")) tipo="INSTALL";
if(t.includes("remove")) tipo="REMOVE";

if(tipo){
list.push({
tipo,
nome: obj.PayloadDisplayName || obj.Name || "Perfil",
data: obj.Timestamp || obj.Date || "-"
});
}

for(const k in obj){
extractEvents(obj[k],list);
}
}

return list;
}

// ==============================================
// SCAN
// ==============================================

app.post("/upload", upload.single("arquivo"), async (req,res)=>{

const start=Date.now();

const pasta="scan_"+Date.now();
await fsp.mkdir(pasta);

await tar.x({file:req.file.path,cwd:pasta});

const files=await walk(pasta);

let proxy=[];
let eventos=[];

for(const f of files){

const raw=await fsp.readFile(f);
const txt=raw.toString().toLowerCase();

proxy.push(...proxyScan(txt));

const parsed=parsePlist(f);
if(parsed){
eventos.push(...extractEvents(parsed));
}
}

proxy=[...new Set(proxy)];

const tempo=((Date.now()-start)/1000).toFixed(2);

// ==============================================
// RESULT
// ==============================================

res.send(`
<html>
<head>
<style>
body{
background:#000;
color:#fff;
font-family:Arial;
padding:40px;
}

.card{
background:rgba(255,255,255,0.05);
padding:20px;
margin-bottom:20px;
border-radius:15px;
box-shadow:0 0 20px rgba(255,255,255,0.1);
}

.ev{
margin-top:10px;
padding:10px;
background:#111;
border-radius:10px;
}

</style>
</head>

<body>

<h1>NTZIN RESULT</h1>

<div class="card">
Tempo: ${tempo}s
</div>

<div class="card">
Proxy Evidence: ${proxy.length}/10<br>
${proxy.join("<br>") || "Nenhum"}
</div>

<div class="card">
Eventos:
${
eventos.map(e=>`
<div class="ev">
${e.tipo} - ${e.nome}<br>
${e.data}
</div>
`).join("")
}
</div>

</body>
</html>
`);
});

app.listen(PORT,()=>console.log("NTZIN V5 ONLINE"));
