SISTEM SCAN KTA OCR KHUSUS

Versi ini dibuat khusus mengikuti layout KTA contoh:
- Nama berada di bagian bawah tengah kartu.
- Blok berada di kiri bawah kartu.
- OCR dipisahkan menjadi dua crop: NAMA dan BLOK.
- Blok dinormalisasi agar variasi OCR seperti I/1/l dan V/Y dapat diperbaiki.
- Data disimpan di localStorage.
- Export ke TXT.

PENGGUNAAN:
1. Buka index.html melalui HTTPS/preview yang memberi secure context.
2. Izinkan kamera.
3. Gunakan kamera belakang.
4. Masukkan seluruh KTA dalam kotak panduan.
5. Pastikan nama dan blok berada tepat pada area kotak hijau/kuning.
6. Tekan Scan KTA.
7. Periksa hasil, lalu tekan Simpan Data.
8. Export TXT dari bagian Data Pendataan.

CATATAN:
- Tesseract.js membutuhkan internet untuk memuat library/data bahasa saat pertama digunakan.
- Karena layout KTA dipakai sebagai patokan, jika desain KTA berubah, posisi crop di app.js perlu disesuaikan.
- OCR tetap dapat salah jika foto buram, terlalu gelap, kartu miring, atau teks tertutup.
