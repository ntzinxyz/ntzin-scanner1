// ==============================================
// NTZIN V13 FINAL - STABLE + PROGRESS + NO CRASH
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

// 🔥 evita timeout (502)
app.use((req,res,next)=>{
res.setTimeout(120000);
next();
});

// 🔥 upload até 50MB
const upload = multer({ 
dest: "uploads/",
limits: { fileSize: 50 * 1024 * 1024 }
});

// =======================
// HELPERS
// =======================

function safeParse(file){
try{
const buf = fs.readFileSync(file);
if(buf.slice(0,6).toString()==="bplist"){
return bplist.parseBuffer(buf)[0];
}
return plist.parse(buf.toString());
}catch{
return null;
}
}

function getTime(obj){
return obj?.Timestamp || obj?.Date || obj?.CreationDate || obj?.EventTime || null;
}

function toEpoch(d){
if(!d) return 0;
const dt = new Date(d);
return isNaN(dt) ? 0 : dt.getTime();
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
// ANALISE
// =======================

function analyze(events, proxyHits){

let risk = 0;
let flags = [];

// ordem errada
for(let i=1;i<events.length;i++){
if(events[i].time < events[i-1].time){
flags.push("Ordem de tempo inconsistente");
risk += 20;
}
}

// install/remove rápido
for(let i=1;i<events.length;i++){
if(events[i-1].tipo==="INSTALL" && events[i].tipo==="REMOVE"){
let diff = events[i].time - events[i-1].time;
if(diff > 0 && diff < 300000){
flags.push("Instalação removida rapidamente");
risk += 25;
}
}
}

// proxy
if(proxyHits.length){
flags.push("Indícios de proxy");
risk += proxyHits.length * 5;
}

// sem tempo
events.forEach(e=>{
if(!e.time){
flags.push("Evento sem timestamp");
risk += 10;
}
});

if(risk>100) risk=100;

return {risk, flags};
}

// =======================
// UI COM PROGRESSO REAL
// =======================

app.get("/", (req,res)=>{
res.send(`
<html>
<body style="background:black;color:white;font-family:Arial;text-align:center;padding-top:100px">

<h1>NTZIN V13</h1>

<input type="file" id="file"><br><br>
<button onclick="scan()">SCAN</button>

<br><br>

<div style="width:300px;height:10px;background:#333;margin:auto;border-radius:10px;">
<div id="bar" style="height:10px;width:0%;background:white;border-radius:10px;"></div>
</div>

<script>
function scan(){

let f = document.getElementById("file").files[0];
if(!f) return alert("Escolhe arquivo");

let bar = document.getElementById("bar");

let fd = new FormData();
fd.append("arquivo", f);

let xhr = new XMLHttpRequest();

xhr.upload.onprogress = function(e){
if(e.lengthComputable){
let percent = (e.loaded / e.total) * 100;
bar.style.width = percent + "%";
}
};

xhr.onload = function(){
document.open();
document.write(xhr.responseText);
document.close();
};

xhr.onerror = function(){
alert("Erro no upload");
};

xhr.open("POST","/scan");
xhr.send(fd);
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

try{

const start = Date.now();

const pasta = "scan_"+Date.now();
await fsp.mkdir(pasta);

// extrair
await tar.x({file:req.file.path,cwd:pasta});

// pegar arquivos relevantes
const files = (await fsp.readdir(pasta)).filter(f =>
f.toLowerCase().includes("mcprofile") || f.endsWith(".plist")
);

let events = [];
let proxyHits = [];

for(const f of files){

const full = path.join(pasta,f);

// 🔥 ignora arquivos grandes (evita crash)
const stat = await fsp.stat(full);
if(stat.size > 800_000) continue;

let raw;
try{
raw = await fsp.readFile(full);
}catch{
continue;
}

const txt = raw.toString().toLowerCase();

// proxy
proxyHits.push(...detectProxy(txt));

// parse
const parsed = safeParse(full);
if(!parsed) continue;

const str = JSON.stringify(parsed).toLowerCase();

let tipo = null;
if(str.includes("install")) tipo="INSTALL";
if(str.includes("remove")) tipo="REMOVE";

if(tipo){
events.push({
tipo,
nome: parsed.PayloadDisplayName || parsed.PayloadIdentifier || "Perfil",
time: toEpoch(getTime(parsed))
});
}

}

// ordenar
events.sort((a,b)=>a.time-b.time);

// analisar
const result = analyze(events, proxyHits);

const tempo = ((Date.now()-start)/1000).toFixed(2);

// =======================
// RESULTADO
// =======================

res.send(`
<html>
<body style="background:black;color:white;font-family:Arial;padding:20px">

<h1>NTZIN V13 RESULT</h1>

<p>Tempo: ${tempo}s</p>
<p>Risk: <b>${result.risk}/100</b></p>

<h3>Flags:</h3>
${result.flags.map(f=>`<div>${f}</div>`).join("") || "Nenhuma"}

<h3>Proxy:</h3>
${proxyHits.join("<br>") || "Nenhum"}

<h3>Eventos:</h3>
${events.map(e=>`
<div style="margin-bottom:10px;">
${e.tipo} - ${e.nome}<br>
${e.time ? new Date(e.time).toLocaleString() : "Sem data"}
</div>
`).join("")}

<br><br>
<a href="/">Voltar</a>

</body>
</html>
`);

}catch(e){
console.log("ERRO REAL:", e);
res.send("Erro ao processar (arquivo muito pesado ou inválido)");
}

});

// =======================

app.listen(PORT,()=>console.log("NTZIN V13 STABLE ONLINE"));
