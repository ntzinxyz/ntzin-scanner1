// ==============================================
// NTZIN V13 - STABLE (SEM CRASH)
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
// HELPERS SEGUROS
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
// ANALISE LEVE MAS EFICIENTE
// =======================

function analyze(events, proxyHits){

let risk = 0;
let flags = [];

// ordem de tempo
for(let i=1;i<events.length;i++){
if(events[i].time < events[i-1].time){
flags.push("Ordem de tempo inconsistente");
risk += 20;
}
}

// install/remove rapido
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
flags.push("Indícios de proxy no sistema");
risk += proxyHits.length * 5;
}

// eventos sem tempo
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
// UI SIMPLES E ESTÁVEL
// =======================

app.get("/", (req,res)=>{
res.send(`
<html>
<body style="background:black;color:white;font-family:Arial;text-align:center;padding-top:100px">
<h1>NTZIN V13 STABLE</h1>
<form action="/scan" method="post" enctype="multipart/form-data">
<input type="file" name="arquivo"><br><br>
<button>SCAN</button>
</form>
</body>
</html>
`);
});

// =======================
// SCAN (OTIMIZADO)
// =======================

app.post("/scan", upload.single("arquivo"), async (req,res)=>{

try{

const start = Date.now();

const pasta = "scan_"+Date.now();
await fsp.mkdir(pasta);

// extrai
await tar.x({file:req.file.path,cwd:pasta});

// pega só arquivos relevantes
const files = (await fsp.readdir(pasta)).filter(f =>
f.toLowerCase().includes("mcprofile") || f.endsWith(".plist")
);

let events = [];
let proxyHits = [];

for(const f of files){

const full = path.join(pasta,f);

// limita tamanho
const stat = await fsp.stat(full);
if(stat.size > 2_000_000) continue;

let raw;
try{
raw = await fsp.readFile(full);
}catch{
continue;
}

const txt = raw.toString().toLowerCase();

// detect proxy
proxyHits.push(...detectProxy(txt));

// parse plist
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

// ordena
events.sort((a,b)=>a.time-b.time);

// analisa
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
<div>
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

app.listen(PORT,()=>console.log("V13 STABLE ONLINE"));
