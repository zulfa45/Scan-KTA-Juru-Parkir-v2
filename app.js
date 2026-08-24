const KEY="kta_ocr_khusus_v2";
let records=JSON.parse(localStorage.getItem(KEY)||"[]");
let stream=null, lastScan=0;

const $=id=>document.getElementById(id);
const video=$("video"), canvas=$("canvas"), nameCanvas=$("nameCanvas"), blockCanvas=$("blockCanvas");

function toast(s){let t=$("toast");t.textContent=s;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200)}
function save(){localStorage.setItem(KEY,JSON.stringify(records));render()}
function timeNow(){return new Date().toLocaleString("id-ID",{dateStyle:"short",timeStyle:"short"})}
function dateKey(){return new Date().toISOString().slice(0,10)}
function cleanText(s){return s.toUpperCase().replace(/[^A-ZÀ-ÿ0-9 .'-]/g," ").replace(/\s+/g," ").trim()}
function romanNormalize(s){
  s=cleanText(s).replace(/[|]/g,"I").replace(/0/g,"O");
  // OCR sering membaca I sebagai 1/l dan V sebagai Y.
  s=s.replace(/\bBLOK\b/g," BLOK ");
  s=s.replace(/\b[Il1|]+([VYv])\b/g,"I$1");
  const m=s.match(/\b(?:BLOK\s*)?([IVXLCDM]+)\b/);
  if(m)return m[1].replace(/Y/g,"V").replace(/1/g,"I");
  return "";
}
function validName(s){
  s=cleanText(s);
  const bad=["BLOK","PEMUDA","TOKO","SHIFT","DP","JALAN","JL","PEMERINTAH","KOTA","MAGELANG","KARTU","TANDA","ANGGOTA","PETUGAS","PARKIR","PENGGANTI"];
  if(!s || s.length<5 || s.length>40)return false;
  if(bad.some(x=>s.includes(x)))return false;
  const words=s.split(" ").filter(Boolean);
  return words.length>=2 && words.every(w=>/[A-ZÀ-ÿ]{2,}/.test(w));
}

async function ocrImage(cv, mode){
  const result=await Tesseract.recognize(cv, "eng", {
    logger:m=>{if(m.status==="recognizing text")$("ocrStatus").textContent=`Membaca ${mode}... ${Math.round((m.progress||0)*100)}%`}
  });
  return result.data.text;
}

function enhanceCrop(source, sx,sy,sw,sh, target){
  const w=Math.max(600,Math.round(sw*2.5)), h=Math.max(120,Math.round(sh*2.5));
  target.width=w;target.height=h;
  const c=target.getContext("2d",{willReadFrequently:true});
  c.drawImage(source,sx,sy,sw,sh,0,0,w,h);
  const img=c.getImageData(0,0,w,h), d=img.data;
  for(let i=0;i<d.length;i+=4){
    const gray=.299*d[i]+.587*d[i+1]+.114*d[i+2];
    const v=gray>150?255:0;
    d[i]=d[i+1]=d[i+2]=v;
  }
  c.putImageData(img,0,0);
}

async function scanCard(){
  if(!stream){toast("Mulai kamera terlebih dahulu.");return}
  if(Date.now()-lastScan<2500)return;
  lastScan=Date.now();
  $("captureBtn").disabled=true;$("ocrStatus").textContent="Mengambil gambar KTA...";
  const w=video.videoWidth,h=video.videoHeight;
  if(!w||!h){toast("Kamera belum siap.");$("captureBtn").disabled=false;return}
  canvas.width=w;canvas.height=h;
  canvas.getContext("2d").drawImage(video,0,0,w,h);

  // Area disesuaikan dengan layout KTA contoh:
  // nama sekitar 64-72%, blok sekitar 73-82% dari tinggi kartu.
  // Lebar nama lebih sempit agar teks lain tidak ikut terbaca.
  const nameX=w*.16,nameY=h*.62,nameW=w*.68,nameH=h*.11;
  const blockX=w*.07,blockY=h*.72,blockW=w*.43,blockH=h*.11;

  enhanceCrop(canvas,nameX,nameY,nameW,nameH,nameCanvas);
  enhanceCrop(canvas,blockX,blockY,blockW,blockH,blockCanvas);

  try{
    const [nameRaw,blockRaw]=await Promise.all([
      ocrImage(nameCanvas,"nama"),
      ocrImage(blockCanvas,"blok")
    ]);
    let name=cleanText(nameRaw).replace(/\bBLOK\b.*$/,"").trim();
    // Pilih baris yang paling menyerupai nama.
    const candidates=nameRaw.split(/\n+/).map(cleanText).filter(validName);
    if(candidates.length)name=candidates.sort((a,b)=>b.length-a.length)[0];

    let block=romanNormalize(blockRaw);
    $("name").value=name;
    $("block").value=block;
    $("saveBtn").disabled=!(validName(name)&&block);
    $("ocrStatus").textContent=`Hasil OCR: ${name||"(nama belum terbaca)"} | Blok ${block||"(belum terbaca)"}`;

    if(validName(name)&&block){
      toast("Nama & blok berhasil dibaca.");
    }else{
      toast("Hasil belum yakin. Atur posisi KTA lalu scan lagi.");
    }
  }catch(e){
    console.error(e);toast("OCR gagal. Pastikan internet aktif dan gambar jelas.");
    $("ocrStatus").textContent="OCR gagal.";
  }finally{$("captureBtn").disabled=false}
}

$("startCamera").onclick=async()=>{
  try{
    stream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:1920}},
      audio:false
    });
    video.srcObject=stream;
    $("startCamera").disabled=true;$("captureBtn").disabled=false;$("stopCamera").disabled=false;
    $("cameraMessage").style.display="none";
    toast("Kamera aktif.");
  }catch(e){
    toast("Kamera ditolak. Izinkan kamera di Chrome/Acode dan gunakan HTTPS.");
  }
};
$("stopCamera").onclick=()=>{
  if(stream)stream.getTracks().forEach(t=>t.stop());
  stream=null;video.srcObject=null;
  $("startCamera").disabled=false;$("captureBtn").disabled=true;$("stopCamera").disabled=true;
  $("cameraMessage").style.display="block";
};
$("captureBtn").onclick=scanCard;

$("saveBtn").onclick=()=>{
  const name=cleanText($("name").value),block=romanNormalize($("block").value);
  if(!validName(name)||!block){toast("Periksa nama dan blok.");return}
  if(records.some(x=>x.name===name&&x.block===block)){toast("Data dengan nama & blok tersebut sudah tercatat.");return}
  records.unshift({name,block,time:timeNow(),date:dateKey(),stamp:Date.now()});
  save();$("name").value="";$("block").value="";$("saveBtn").disabled=true;
  $("ocrStatus").textContent="Data berhasil disimpan.";
};

window.delRecord=stamp=>{if(confirm("Hapus data ini?")){records=records.filter(x=>x.stamp!==stamp);save()}};
$("search").oninput=render;

$("exportBtn").onclick=()=>{
  if(!records.length){toast("Belum ada data.");return}
  let txt="DATA PENDATAAN KTA PETUGAS PARKIR\n====================================\n";
  txt+=`Tanggal export: ${timeNow()}\nTotal data: ${records.length}\n\n`;
  records.slice().reverse().forEach((x,i)=>txt+=`${i+1}. Nama: ${x.name}\n   Blok: ${x.block}\n   Waktu: ${x.time}\n\n`);
  const count={};records.forEach(x=>count[x.block]=(count[x.block]||0)+1);
  txt+="REKAP BLOK\n===========\n";
  Object.entries(count).sort().forEach(([b,n])=>txt+=`Blok ${b}: ${n} orang\n`);
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([txt],{type:"text/plain;charset=utf-8"}));
  a.download=`data-kta-${dateKey()}.txt`;a.click();URL.revokeObjectURL(a.href);
};

$("resetBtn").onclick=()=>{if(confirm("Hapus semua data pendataan?")){records=[];save();toast("Semua data dihapus.")}};
function render(){
  const q=$("search").value.toLowerCase();
  const rows=records.filter(x=>(x.name+" "+x.block+" "+x.time).toLowerCase().includes(q));
  $("tbody").innerHTML=rows.map((x,i)=>`<tr><td>${i+1}</td><td>${x.name}</td><td>${x.block}</td><td>${x.time}</td><td><button class="del" onclick="delRecord(${x.stamp})">Hapus</button></td></tr>`).join("");
  $("empty").style.display=rows.length?"none":"block";
  $("total").textContent=records.length;
  $("today").textContent=records.filter(x=>x.date===dateKey()).length;
  $("blocks").textContent=new Set(records.map(x=>x.block)).size;
}
render();
