// NTZIN ANTI PROXY V2 PRO MAX
// server.js

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const tar = require("tar");
const plist = require("plist");
const bplist = require("bplist-parser");

const app = express();

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 1024 * 1024 * 1024 }
});

const PORT = process.env.PORT || 3000;

// ======================================
// HOME
// ======================================

app.get("/", (req, res) => {
  res.send(`
  <html>
  <head>
  <title>NTZIN ANTI PROXY</title>
  <style>
  body{
    margin:0;
    font-family:Arial;
    background:linear-gradient(135deg,#07000d,#150021,#2a0040);
    color:white;
    display:flex;
    justify-content:center;
    align-items:center;
    height:100vh;
  }

  .box{
    width:600px;
    padding:40px;
    border-radius:24px;
    background:rgba(255,255,255,.05);
    box-shadow:0 0 40px rgba(170,0,255,.25);
    text-align:center;
  }

  h1{
    margin:0;
    font-size:42px;
    color:#d68cff;
  }

  p{
    color:#cab3e5;
    margin-top:10px;
  }

  input{
    margin-top:20px;
  }

  button{
    margin-top:20px;
    padding:14px 28px;
    border:none;
    border-radius:12px;
    background:#9c00ff;
    color:white;
    font-weight:bold;
    cursor:pointer;
    font-size:16px;
  }

  button:hover{
    opacity:.9;
  }
  </style>
  </head>

  <body>

  <div class="box">
    <h1>NTZIN ANTI PROXY</h1>
    <p>Scanner profissional de Sysdiagnose</p>

    <form action="/upload" method="POST" enctype="multipart/form-data">
      <input type="file" name="arquivo" required><br>
      <button type="submit">ESCANEAR</button>
    </form>
  </div>

  </body>
  </html>
  `);
});

// ======================================
// FUNÇÕES
// ======================================

function formatDate(v) {
  try {
    if (!v) return "-";

    if (typeof v === "number") {
      return new Date(v * 1000).toLocaleString("pt-BR");
    }

    const d = new Date(v);

    if (!isNaN(d)) {
      return d.toLocaleString("pt-BR");
    }

    return String(v);
  } catch {
    return "-";
  }
}

function readPlistSafe(file) {
  try {
    const buf = fs.readFileSync(file);

    if (buf.slice(0,6).toString() === "bplist") {
      return bplist.parseBuffer(buf)[0];
    }

    return plist.parse(buf.toString());
  } catch {
    return null;
  }
}

async function walk(dir, found = []) {
  const items = await fsp.readdir(dir);

  for (const item of items) {
    const full = path.join(dir, item);

    try {
      const stat = await fsp.stat(full);

      if (stat.isDirectory()) {
        await walk(full, found);
      } else {

        const low = item.toLowerCase();

        if (
          low.includes("mcprofileevents") ||
          low.includes("mcsettingsevents") ||
          low.includes("preferences.plist")
        ) {
          found.push(full);
        }

      }
    } catch {}
  }

  return found;
}

function extractEvents(obj, list = []) {
  if (!obj) return list;

  if (Array.isArray(obj)) {
    for (const x of obj) extractEvents(x, list);
    return list;
  }

  if (typeof obj === "object") {

    const txt = JSON.stringify(obj).toLowerCase();

    let tipo = null;

    if (txt.includes("install")) tipo = "INSTALL";
    if (txt.includes("remove")) tipo = "REMOVE";

    if (tipo) {
      const nome =
        obj.PayloadDisplayName ||
        obj.ProfileName ||
        obj.DisplayName ||
        obj.Name ||
        obj.PayloadIdentifier ||
        obj.Identifier ||
        "Perfil_" + Math.random().toString(36).slice(2,8).toUpperCase();

      const data =
        obj.Timestamp ||
        obj.Date ||
        obj.CreationDate ||
        obj.EventTime ||
        obj.LastModified ||
        obj.Time ||
        "-";

      list.push({
        tipo,
        nome,
        data: formatDate(data)
      });
    }

    for (const k in obj) {
      extractEvents(obj[k], list);
    }
  }

  return list;
}

function proxyDetect(text) {
  const found = [];

  const keys = [
    "HTTPEnable",
    "HTTPProxy",
    "HTTPPort",
    "HTTPSEnable",
    "HTTPSProxy",
    "HTTPSPort",
    "SOCKSEnable",
    "SOCKSProxy",
    "SOCKSPort",
    "ProxyAutoConfigEnable",
    "ProxyAutoConfigURLString"
  ];

  for (const k of keys) {
    if (text.includes(k.toLowerCase())) {
      found.push(k);
    }
  }

  return found;
}

// ======================================
// SCAN
// ======================================

app.post("/upload", upload.single("arquivo"), async (req,res)=>{

const start = Date.now();

try{

const pasta = "scan_" + Date.now();

await fsp.mkdir(pasta);

await tar.x({
  file:req.file.path,
  cwd:pasta
});

const files = await walk(pasta);

let eventos = [];
let proxy = [];

for (const file of files) {

  const raw = await fsp.readFile(file);
  const txt = raw.toString().toLowerCase();

  proxy.push(...proxyDetect(txt));

  const parsed = readPlistSafe(file);

  if (parsed) {
    eventos.push(...extractEvents(parsed));
  }
}

proxy = [...new Set(proxy)];

eventos = eventos.filter((v,i,a)=>
i === a.findIndex(t =>
t.tipo===v.tipo &&
t.nome===v.nome &&
t.data===v.data
));

const installs = eventos.filter(x=>x.tipo==="INSTALL").length;
const removes = eventos.filter(x=>x.tipo==="REMOVE").length;

const tempo = ((Date.now()-start)/1000).toFixed(2);

res.send(`
<html>
<head>
<title>NTZIN ANTI PROXY</title>
<style>

body{
margin:0;
padding:40px;
font-family:Arial;
background:linear-gradient(135deg,#07000d,#150021,#2a0040);
color:white;
}

h1{
color:#d68cff;
}

.card{
background:rgba(255,255,255,.05);
padding:22px;
border-radius:18px;
margin-bottom:16px;
box-shadow:0 0 20px rgba(170,0,255,.15);
}

.ok{color:#00ff99;}
.bad{color:#ff6688;}
.roxo{color:#d68cff;}

.ev{
padding:14px;
margin-top:10px;
border-radius:14px;
background:rgba(255,255,255,.03);
}

small{
color:#bbb;
}

a{
color:#d68cff;
text-decoration:none;
font-weight:bold;
}

</style>
</head>

<body>

<h1>NTZIN ANTI PROXY</h1>

<div class="card">
<b>Arquivo:</b> ${req.file.originalname}
</div>

<div class="card">
<b>Tempo de Scan:</b> ${tempo}s
</div>

<div class="card">
<b>Proxy:</b>
${proxy.length ? `<span class="bad">DETECTADO</span>` : `<span class="ok">LIMPO</span>`}
<br><br>
${proxy.join("<br>")}
</div>

<div class="card">
<b>Profiles Installed:</b> <span class="ok">${installs}</span><br><br>
<b>Profiles Removed:</b> <span class="bad">${removes}</span>
</div>

<div class="card">
<b>EVENTOS:</b>

${
eventos.length
? eventos.map(ev=>`
<div class="ev">
<span class="${ev.tipo==="INSTALL"?"ok":"bad"}">${ev.tipo}</span>
 → ${ev.nome}<br>
<small>${ev.data}</small>
</div>
`).join("")
: "Nenhum evento encontrado"
}

</div>

<div class="card">
<b>Arquivos analisados:</b> ${files.length}
</div>

<a href="/">Voltar</a>

</body>
</html>
`);

}catch(e){

res.send("Erro ao analisar arquivo.");

}

});

app.listen(PORT, ()=>{
console.log("NTZIN ANTI PROXY ONLINE");
});