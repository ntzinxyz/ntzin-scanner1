const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const tar = require("tar");
const plist = require("plist");
const bplist = require("bplist-parser");

const app = express();

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 1024 * 1024 * 1024 }
});

// ======================================
// LOCALIZAR SOMENTE MCPROFILEEVENTS
// ======================================

function walk(dir, files = []) {
  const itens = fs.readdirSync(dir);

  for (const item of itens) {
    const full = path.join(dir, item);

    try {
      const stat = fs.statSync(full);

      if (stat.isDirectory()) {
        walk(full, files);
      } else {
        if (item.toLowerCase().includes("mcprofileevents")) {
          files.push(full);
        }
      }
    } catch {}
  }

  return files;
}

// ======================================
// LER PLIST XML / BINÁRIO
// ======================================

function readPlist(file) {
  const buf = fs.readFileSync(file);

  try {
    if (buf.slice(0, 6).toString() === "bplist") {
      const parsed = bplist.parseBuffer(buf);
      return parsed[0];
    } else {
      return plist.parse(buf.toString());
    }
  } catch {
    return null;
  }
}

// ======================================
// FORMATAR DATA
// ======================================

function formatDate(v) {
  if (!v || v === "-") return "-";

  try {
    if (typeof v === "number") {
      return new Date(v * 1000).toLocaleString("pt-BR");
    }

    const d = new Date(v);

    if (!isNaN(d)) {
      return d.toLocaleString("pt-BR");
    }

    return String(v);
  } catch {
    return String(v);
  }
}

// ======================================
// GERAR NOME QUANDO FALTAR
// ======================================

function fakeName() {
  return "Perfil_" + Math.random().toString(36).substring(2,8).toUpperCase();
}

// ======================================
// EXTRAIR EVENTOS REAIS
// ======================================

function extrair(obj, lista = []) {
  if (!obj) return lista;

  if (Array.isArray(obj)) {
    for (const item of obj) extrair(item, lista);
    return lista;
  }

  if (typeof obj === "object") {

    const texto = JSON.stringify(obj).toLowerCase();

    let tipo = null;

    if (texto.includes("install")) tipo = "INSTALL";
    if (texto.includes("remove")) tipo = "REMOVE";

    if (tipo) {

      let nome =
        obj.PayloadDisplayName ||
        obj.ProfileName ||
        obj.DisplayName ||
        obj.Name ||
        obj.PayloadIdentifier ||
        obj.ProfileIdentifier ||
        obj.Identifier ||
        obj.Organization ||
        obj.Signer ||
        fakeName();

      let data =
        obj.Timestamp ||
        obj.Date ||
        obj.CreationDate ||
        obj.EventTime ||
        obj.Time ||
        obj.LastModified ||
        obj.time ||
        "-";

      lista.push({
        tipo,
        nome,
        data: formatDate(data)
      });
    }

    for (const k in obj) {
      extrair(obj[k], lista);
    }
  }

  return lista;
}

// ======================================
// HOME
// ======================================

app.get("/", (req,res)=>{

res.send(`
<html>
<head>
<title>NTZIN PROFILE VIEWER V2</title>

<style>
body{
margin:0;
background:linear-gradient(135deg,#090012,#160022,#2a0042);
font-family:Arial;
color:white;
display:flex;
justify-content:center;
align-items:center;
height:100vh;
}

.box{
width:580px;
background:rgba(255,255,255,.05);
padding:40px;
border-radius:24px;
text-align:center;
box-shadow:0 0 40px rgba(180,0,255,.25);
}

h1{
margin:0;
font-size:40px;
color:#d98cff;
}

p{
color:#c8b0e5;
}

button{
margin-top:20px;
padding:13px 28px;
border:none;
border-radius:12px;
background:#9d00ff;
color:white;
font-weight:bold;
cursor:pointer;
font-size:16px;
}
</style>
</head>

<body>

<div class="box">

<h1>NTZIN PROFILE VIEWER V2</h1>
<p>MCProfileEvents Premium</p>

<form action="/upload" method="POST" enctype="multipart/form-data">
<input type="file" name="arquivo"><br>
<button type="submit">ANALISAR</button>
</form>

</div>

</body>
</html>
`);

});

// ======================================
// UPLOAD
// ======================================

app.post("/upload", upload.single("arquivo"), async (req,res)=>{

try{

const pasta = "scan_" + Date.now();
fs.mkdirSync(pasta);

await tar.x({
file:req.file.path,
cwd:pasta
});

const files = walk(pasta);

let eventos = [];

for (const arq of files) {

const obj = readPlist(arq);

if (obj) {
eventos.push(...extrair(obj));
}

}

// remover duplicados
eventos = eventos.filter((v,i,a)=>
i === a.findIndex(t =>
t.tipo === v.tipo &&
t.nome === v.nome &&
t.data === v.data
)
);

// ordenar por data conhecida primeiro
eventos.sort((a,b)=>{
if(a.data === "-") return 1;
if(b.data === "-") return -1;
return new Date(a.data) - new Date(b.data);
});

const installs = eventos.filter(x=>x.tipo==="INSTALL").length;
const removes = eventos.filter(x=>x.tipo==="REMOVE").length;

res.send(`
<html>
<head>
<style>

body{
margin:0;
background:linear-gradient(135deg,#090012,#160022,#2a0042);
font-family:Arial;
color:white;
padding:40px;
}

.card{
background:rgba(255,255,255,.05);
padding:22px;
border-radius:18px;
margin-bottom:15px;
box-shadow:0 0 18px rgba(180,0,255,.15);
}

.roxo{color:#d98cff;}
.ok{color:#00ff99;}
.bad{color:#ff6688;}

.ev{
padding:14px;
margin-top:10px;
border-radius:14px;
background:rgba(255,255,255,.03);
line-height:1.7;
}

a{
color:#d98cff;
text-decoration:none;
font-weight:bold;
font-size:18px;
}

small{
color:#bbb;
}

</style>
</head>

<body>

<h1 class="roxo">NTZIN FINAL REPORT</h1>

<div class="card">
<b>Arquivo:</b> ${req.file.originalname}
</div>

<div class="card">
<b>Profiles Installed:</b>
<span class="ok">${installs}</span><br><br>

<b>Profiles Removed:</b>
<span class="bad">${removes}</span>
</div>

<div class="card">
<b>EVENTOS / PERFIS:</b>

${
eventos.length
? eventos.map(ev => `
<div class="ev">
<span class="${ev.tipo === "INSTALL" ? "ok" : "bad"}">
${ev.tipo}
</span>
 → ${ev.nome}<br>
<small>${ev.data}</small>
</div>
`).join("")
: "Nenhum evento encontrado"
}

</div>

<div class="card">
<b>Arquivos MCProfileEvents encontrados:</b> ${files.length}
</div>

<a href="/">Voltar</a>

</body>
</html>
`);

}catch(e){

res.send("Erro ao analisar.");

}

});

app.listen(3000, ()=>{
console.log("Site rodando");
});