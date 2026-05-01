// ==============================================
// NTZIN V14 HARD STABLE (ANTI CRASH REAL)
// ==============================================

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const tar = require("tar");

const app = express();
const PORT = process.env.PORT || 3000;

// evita timeout
app.use((req,res,next)=>{
res.setTimeout(120000);
next();
});

// upload limitado
const upload = multer({ 
dest: "uploads/",
limits: { fileSize: 30 * 1024 * 1024 }
});

// =======================
// UI
// =======================

app.get("/", (req,res)=>{
res.send(`
<html>
<body style="background:black;color:white;text-align:center;padding-top:100px">

<h1>NTZIN V14 STABLE</h1>

<input type="file" id="file"><br><br>
<button onclick="scan()">SCAN</button>

<br><br>
<div style="width:300px;height:10px;background:#333;margin:auto;">
<div id="bar" style="height:10px;width:0%;background:white;"></div>
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
bar.style.width = (e.loaded/e.total*100)+"%";
}
};

xhr.onload = function(){
document.open();
document.write(xhr.responseText);
document.close();
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
// SCAN SUPER CONTROLADO
// =======================

app.post("/scan", upload.single("arquivo"), async (req,res)=>{

try{

let proxyHits = [];
let filesChecked = 0;
let MAX_FILES = 50; // 🔥 limite crítico

// 🔥 lê TAR sem extrair tudo
await tar.t({
file: req.file.path,
onentry: entry => {

if(filesChecked > MAX_FILES) return;

// só arquivos relevantes
if(
entry.path.toLowerCase().includes("mcprofile") ||
entry.path.endsWith(".plist")
){

let chunks = [];

entry.on("data", chunk => {
if(chunks.length < 5) chunks.push(chunk); // 🔥 limite leitura
});

entry.on("end", () => {

let txt = Buffer.concat(chunks).toString().toLowerCase();

if(txt.includes("proxy") || txt.includes("vpn")){
proxyHits.push(entry.path);
}

});

filesChecked++;

}

}
});

// =======================
// RESULTADO
// =======================

res.send(`
<html>
<body style="background:black;color:white;padding:20px">

<h1>NTZIN V14 RESULT</h1>

<p>Arquivos analisados: ${filesChecked}</p>

<h3>Proxy encontrado:</h3>
${proxyHits.length ? proxyHits.map(p=>`<div>${p}</div>`).join("") : "Nenhum"}

<br><br>
<a href="/">Voltar</a>

</body>
</html>
`);

}catch(e){
console.log("ERRO:", e);
res.send("Arquivo pesado demais ou inválido (proteção ativada)");
}

});

// =======================

app.listen(PORT,()=>console.log("V14 HARD ONLINE"));
