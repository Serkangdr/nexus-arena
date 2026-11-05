// Nexus Arena · açılış bayrağı
// Asıl uygulamada <head> içinde satır içi çalışır; sitenin CSP'si satır içi betiğe izin vermediği
// için ayrı dosyadadır ve <head>'de beklemeden (defer olmadan) yüklenir.
// JS çalışıyorsa animasyonlu başlangıç durumlarını aç; açılış 4 sn içinde tamamlanmazsa
// (ör. bir betik yüklenemezse) içeriği animasyonsuz göster.
document.documentElement.classList.add('js');
setTimeout(function () {
  if (!window.__nexusReady) document.documentElement.classList.remove('js');
}, 4000);
