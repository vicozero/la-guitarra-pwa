/* Media: carga de imágenes y conversión de canvas a Blob (equivalente web de
   BitmapFactory / Bitmap.compress del APK). */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});

  function image(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Imagen no disponible')); };
      img.src = url;
    });
  }

  function loadBlob(blob) {
    var url = URL.createObjectURL(blob);
    return image(url).then(function (img) {
      // Conservar la URL viva mientras la imagen se use (se revoca al descargar).
      img._objectUrl = url;
      return img;
    }, function (e) { URL.revokeObjectURL(url); throw e; });
  }

  function canvasBlob(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      if (canvas.toBlob) {
        canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen')); }, mime || 'image/png', quality);
        return;
      }
      try {
        var url = canvas.toDataURL(mime || 'image/png', quality);
        var bin = atob(url.split(',')[1]);
        var u8 = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        resolve(new Blob([u8], { type: mime || 'image/png' }));
      } catch (e) { reject(e); }
    });
  }

  function blobDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { reject(r.error || new Error('No se pudo leer')); };
      r.readAsDataURL(blob);
    });
  }

  LG.media = { image: image, loadBlob: loadBlob, canvasBlob: canvasBlob, blobDataUrl: blobDataUrl };
})();
