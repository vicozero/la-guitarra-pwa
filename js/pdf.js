/* Pdf: escritor mínimo que incrusta cada página como una imagen JPEG
   (puerto de Pdf.java, usando /DCTDecode en lugar de Flate+RGB). */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});
  var B = LG.bytes;
  var P = (LG.pdf = {});

  function Bytes() { this.parts = []; this.length = 0; }
  Bytes.prototype.str = function (s) { var u = B.latin1(s); this.parts.push(u); this.length += u.length; };
  Bytes.prototype.raw = function (u) { this.parts.push(u); this.length += u.length; };
  Bytes.prototype.result = function () { return B.concat(this.parts); };

  function pad(v) { var s = String(v | 0); while (s.length < 10) s = '0' + s; return s; }
  function fmt(v) { return v === Math.round(v) ? String(Math.round(v)) : v.toFixed(4); }

  /* pages: [{ jpeg:Uint8Array, imgW, imgH, pageW, pageH }] */
  P.write = function (pages) {
    var out = new Bytes();
    var offsets = {};
    var n = pages.length;
    var firstPage = 3;
    var nextObject = firstPage + n * 3;
    var annotations = pages.map(function (page) {
      return (page.links || []).filter(function (link) { return /^https:\/\//.test(link.url); }).map(function (link) { return { number: nextObject++, link: link }; });
    });
    out.str('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');

    var kids = [];
    for (var i = 0; i < n; i++) kids.push((firstPage + i * 3) + ' 0 R');
    offsets[1] = out.length;
    out.str('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    offsets[2] = out.length;
    out.str('2 0 obj\n<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>\nendobj\n');

    for (var j = 0; j < n; j++) {
      var pageNum = firstPage + j * 3, contentNum = pageNum + 1, imageNum = pageNum + 2;
      var img = pages[j], jpeg = img.jpeg;
      offsets[imageNum] = out.length;
      out.str(imageNum + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + img.imgW + ' /Height ' + img.imgH +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>\nstream\n');
      out.raw(jpeg);
      out.str('\nendstream\nendobj\n');

      var content = 'q\n' + fmt(img.pageW) + ' 0 0 ' + fmt(img.pageH) + ' 0 0 cm\n/Im0 Do\nQ\n';
      var cb = B.latin1(content);
      offsets[contentNum] = out.length;
      out.str(contentNum + ' 0 obj\n<< /Length ' + cb.length + ' >>\nstream\n');
      out.raw(cb);
      out.str('endstream\nendobj\n');

      offsets[pageNum] = out.length;
      out.str(pageNum + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + fmt(img.pageW) + ' ' + fmt(img.pageH) +
        '] /Resources << /XObject << /Im0 ' + imageNum + ' 0 R >> >> /Contents ' + contentNum + ' 0 R' +
        (annotations[j].length ? ' /Annots [' + annotations[j].map(function (a) { return a.number + ' 0 R'; }).join(' ') + ']' : '') + ' >>\nendobj\n');
    }

    annotations.forEach(function (list, pageIndex) { list.forEach(function (a) {
      var link = a.link, h = pages[pageIndex].pageH;
      var uri = String(link.url).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[\r\n]/g, '');
      offsets[a.number] = out.length;
      out.str(a.number + ' 0 obj\n<< /Type /Annot /Subtype /Link /Rect [' + [link.x, h-link.y-link.height, link.x+link.width, h-link.y].map(fmt).join(' ') + '] /Border [0 0 0] /A << /S /URI /URI (' + uri + ') >> >>\nendobj\n');
    }); });
    var totalObjects = nextObject - 1;
    var xref = out.length;
    var size = totalObjects + 1;
    var x = 'xref\n0 ' + size + '\n0000000000 65535 f \n';
    for (var k = 1; k < size; k++) x += pad(offsets[k] || 0) + ' 00000 n \n';
    out.str(x);
    out.str('trailer\n<< /Size ' + size + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return out.result();
  };
})();
