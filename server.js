// ==========================================
// NTZIN V8 GOD FINAL (EVENTOS + PROXY NOMES)
// ==========================================

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
const buf = fs.readFileSync(file);
if(buf.slice(0,6).toString()==="bplist"){
return bplist.parseBuffer(buf)[0];
}
return plist.parse(buf.toString());
}catch{
return null;
}
}

// 🔥 pega qualquer tipo de data possível
function getTime(obj){
return obj?.Timestamp 
|| obj?.Date 
|| obj?.CreationDate 
|| obj?.InstallDate
|| obj?.RemovalDate
|| obj?.EventTime
|| null;
}

function toEpoch(d){
if(!d) return 0;
const dt = new Date(d);
return isNaN(dt) ? 0 : dt.getTime();
}

// =======================
// HOME
// =======================

app.get("/", (req,res)=>{
res.send(`
<html>
<body style="background:black;color:white;font-family:Arial;text-align:center;padding-top:100px">

<h1>NTZIN V8 GOD</h1>

<input type="file" id="file"><br><br>
<button onclick="scan()">SCAN</button>

<script>
function scan(){
let f=document.getElementById("file").files[0];
if(!f) return alert("Escolhe arquivo");

let fd=new FormData();
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

</body>
</html>
`);
});

// =======================
// SCAN
// =======================

app.post("/scan", upload.single("arquivo"), async (req,res)=>{

try{

const pasta = "scan_"+Date.now();
await fsp.mkdir(pasta);

// extrai tudo
await tar.x({
file:req.file.path,
cwd:pasta
});

let events = [];
let proxyProfiles = [];

// função recursiva
async function scanDir(dir){

const files = await fsp.readdir(dir);

for(const f of files){

const full = path.join(dir,f);
const stat = await fsp.stat(full);

if(stat.isDirectory()){
await scanDir(full);
continue;
}

// limita arquivos grandes
if(stat.size > 5_000_000) continue;

let raw;
try{
raw = await fsp.readFile(full);
}catch{
continue;
}

const txt = raw.toString().toLowerCase();

// tenta parse
let parsed = parsePlist(full);

// =======================
// DETECÇÃO HTTPS PROXY COM NOME
// =======================

if(txt.includes("httpsproxy")){

let nomePerfil = "Desconhecido";

if(parsed){
nomePerfil = parsed.PayloadDisplayName 
|| parsed.PayloadIdentifier 
|| "Perfil";
}

proxyProfiles.push({
nome: nomePerfil,
arquivo: f
});
}

// =======================
// EVENTOS INSTALL / REMOVE
// =======================

if(parsed){

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

}
}

await scanDir(pasta);

// ordenar por tempo
events.sort((a,b)=>a.time-b.time);

// =======================
// RESULTADO
// =======================

res.send(`
<html>
<body style="background:black;color:white;font-family:Arial;padding:20px">

<h1>NTZIN V8 RESULT</h1>

<h2>Perfis com HTTPS Proxy:</h2>
${
proxyProfiles.length 
? proxyProfiles.map(p=>`
<div>
${p.nome} (${p.arquivo})
</div>
`).join("")
: "Nenhum"
}

<h2>Eventos:</h2>
${
events.map(e=>`
<div style="margin-bottom:10px;">
${e.tipo} - ${e.nome}<br>
${e.time ? new Date(e.time).toLocaleString() : "Sem data"}
</div>
`).join("")
}

<br><br>
<a href="/">Voltar</a>

</body>
</html>
`);

}catch(e){
console.log("ERRO:", e);
res.send("Erro ao processar sysdiagnose");
}

});

// =======================

app.listen(PORT,()=>{
console.log("V8 GOD ONLINE");
});
