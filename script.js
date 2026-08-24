const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const startBtn = document.getElementById('startBtn');
const scanBtn = document.getElementById('scanBtn');
const exportBtn = document.getElementById('exportBtn');
const statusText = document.getElementById('status');
const namaResult = document.getElementById('namaResult');
const blokResult = document.getElementById('blokResult');

let stream;

// Fungsi untuk memulai kamera
startBtn.addEventListener('click', async () => {
    try {
        // Minta akses kamera (kamera belakang jika di HP)
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
        });
        video.srcObject = stream;
        scanBtn.disabled = false;
        startBtn.textContent = 'Kamera Aktif';
        startBtn.style.background = '#27ae60';
        statusText.textContent = 'Status: Kamera siap. Arahkan KTA dan tekan Ambil.';
    } catch (err) {
        alert('Tidak dapat mengakses kamera. Pastikan browser memberikan izin.\\nError: ' + err.message);
    }
});

// Proses Pemindaian (Capture & OCR)
scanBtn.addEventListener('click', async () => {
    if (!stream) return;
    
    statusText.textContent = 'Status: Mengambil gambar...';
    
    // Atur ukuran canvas sesuai dengan dimensi video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    // Gambar frame video ke canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    statusText.textContent = 'Status: Membaca teks (Mohon tunggu beberapa detik)...';
    scanBtn.disabled = true;
    exportBtn.disabled = true;

    try {
        // Konversi canvas ke URL Gambar untuk Tesseract
        const imageData = canvas.toDataURL('image/jpeg');
        
        // Memanggil API Tesseract.js (Bahasa Indonesia & Inggris)
        const result = await Tesseract.recognize(
            imageData,
            'ind+eng', 
            { logger: m => console.log(m) } // Lihat progres di Console
        );

        const text = result.data.text;
        ekstrakData(text);
        
    } catch (err) {
        statusText.textContent = 'Status: Gagal membaca teks.';
        console.error(err);
        alert('Terjadi kesalahan saat memproses gambar.');
    } finally {
        scanBtn.disabled = false;
    }
});

// Fungsi mengekstrak Nama dan Blok
function ekstrakData(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    let nama = "Tidak terbaca";
    let blok = "Tidak terbaca";
    let blokIndex = -1;
    
    // 1. Cari BLOK
    for (let i = 0; i < lines.length; i++) {
        // Toleransi jika 'O' terbaca '0'
        if (lines[i].toUpperCase().match(/BL[O0]K/i)) {
            blokIndex = i;
            const match = lines[i].match(/BL[O0]K\s*(.*)/i);
            if (match && match[1]) {
                blok = match[1].replace(/[:=;]/g, '').trim();
            } else {
                blok = lines[i];
            }
            break;
        }
    }

    // 2. Cari Nama (biasanya di baris atas BLOK)
    if (blokIndex > 0) {
        for (let i = blokIndex - 1; i >= 0; i--) {
            if (lines[i].length > 3) {
                // Bersihkan karakter aneh di awal/akhir nama
                nama = lines[i].replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').trim();
                break;
            }
        }
    } else {
        // Tebakan nama jika BLOK tidak ketemu (huruf kapital semua)
        const possibleName = lines.find(l => l.length > 5 && l === l.toUpperCase() && !l.includes('PEMERINTAH') && !l.includes('KARTU'));
        if(possibleName) nama = possibleName;
    }

    // Tampilkan ke UI
    namaResult.textContent = nama;
    blokResult.textContent = blok;
    statusText.textContent = 'Status: Berhasil dipindai!';
    
    if (nama !== "Tidak terbaca" || blok !== "Tidak terbaca") {
        exportBtn.disabled = false;
    }
}

// Fungsi Ekspor ke File TXT
exportBtn.addEventListener('click', () => {
    const nama = namaResult.textContent;
    const blok = blokResult.textContent;
    
    if(nama === '-' || blok === '-') return;

    const dataString = `DATA JURU PARKIR\n======================\nNama : ${nama}\nBlok : ${blok}\nWaktu: ${new Date().toLocaleString('id-ID')}\n`;
    
    const blob = new Blob([dataString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    
    // Buat nama file dinamis
    const safeFileName = nama.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    a.download = `KTA_${safeFileName}.txt`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});
