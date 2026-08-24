VERSI OCR KTA - AKURASI LEBIH TINGGI

Perbaikan:
1. Scan 3 frame, bukan satu frame.
2. Setiap frame diproses dengan 3 variasi preprocessing.
3. Upscale 4x sebelum OCR.
4. Grayscale, contrast, brightness, dan sharpening.
5. OCR nama dan blok dipisahkan.
6. OCR blok memakai whitelist huruf/angka yang relevan.
7. Hasil nama dipilih berdasarkan konsistensi antar frame.
8. Hasil blok dipilih berdasarkan voting mayoritas.
9. Ada kalibrasi posisi crop Nama Y dan Blok Y.
10. Data hanya disimpan setelah hasil lolos validasi.

PENTING:
- Tidak ada algoritma yang bisa mengembalikan detail yang benar-benar hilang karena blur berat.
- Untuk blur ringan/sedang, multi-frame + preprocessing membantu cukup banyak.
- KTA harus tetap terlihat hampir penuh, fokus, dan pencahayaan cukup.
- Gunakan kamera belakang.
- Untuk kamera browser gunakan HTTPS atau localhost.
- Tesseract.js memerlukan internet saat pertama memuat engine/bahasa.
- Jika desain KTA berubah, posisi crop perlu dikalibrasi.

FORMAT TARGET KTA CONTOH:
Nama: WAHYU SUDJATMIKO
Blok: IV
