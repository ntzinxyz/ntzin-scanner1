// ==========================================
// NTZIN V15 ULTRA STABLE (NO CRASH)
// ==========================================

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const tar = require("tar");

const app = express();
const PORT = process.env.PORT || 3000;

// ============================
// UPLOAD LIMITADO
// ============================

const upload = multer({ 
  dest: "uploads/",
  limits: { fileSize: 25 * 1024 * 1024 } // 🔥 limite menor = mais estável
});

// ============================
// HOME
// ============================

app.get("/", (req,res)=>{
res.send(`
<html>
<body style="background:black;color:white;text-align:center;padding-top:100px">

<h1>NTZIN V15</h1>

<input type="file" id="file"><br><br>
<button onclick="scan()">SCAN</button>

<div style="width:300px;height:10px;background:#222;margin:auto;margin-top:20px;">
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

xhr.onerror = function(){
alert("Erro de conexão");
};

xhr.open("POST","/scan");
xhr.send(fd);
}
</script>

</body>
</html>
`);
});

// ============================
// SCAN SEGURO
// ============================

app.post("/scan", upload.single("arquivo"), async (req,res)=>{

if(!req.file){
return res.send("Arquivo inválido");
}

let proxy = false;
let filesChecked = 0;

try{

// 🔥 extrai só alguns arquivos controlados
await tar.extract({
file: req.file.path,
cwd: "./tmp",
filter: (p)=>{
// só arquivos importantes
return p.includes("plist") || p.includes("profile");
},
onentry: entry => {

if(filesChecked > 30){
entry.resume();
return;
}

let data = "";

entry.on("data", chunk=>{
if(data.length < 20000){ // 🔥 limite leitura
data += chunk.toString();
}
});

entry.on("end", ()=>{
let txt = data.toLowerCase();

if(txt.includes("proxy") || txt.includes("vpn")){
proxy = true;
}

});

filesChecked++;

}
});

}catch(e){
console.log("erro controlado:", e);
return res.send("Arquivo muito pesado ou inválido (protegido)");
}

// ============================
// RESULTADO
// ============================

res.send(`
<html>
<body style="background:black;color:white;padding:20px">

<h1>RESULTADO</h1>

<p>Arquivos analisados: ${filesChecked}</p>

<p>Proxy detectado: ${proxy ? "SIM" : "NÃO"}</p>

<br><br>
<a href="/">Voltar</a>

</body>
</html>
`);

});

// ============================

app.listen(PORT, ()=>{
console.log("V15 ONLINE");
});
