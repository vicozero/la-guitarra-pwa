/* ZIP: escritor (sin compresión) y lector (store + deflate) sin dependencias. */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});
  var B = LG.bytes;
  var Z = (LG.zip = {});

  function u16(v) { return Uint8Array.from([v & 0xFF, (v >>> 8) & 0xFF]); }
  function u32(v) { return Uint8Array.from([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]); }
  function r16(u8, p) { return u8[p] | (u8[p + 1] << 8); }
  function r32(u8, p) { return (u8[p] | (u8[p + 1] << 8) | (u8[p + 2] << 16) | (u8[p + 3] << 24)) >>> 0; }

  function dosTime(d) {
    var time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((d.getSeconds() / 2) & 0x1F);
    var date = (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0x0F) << 5) | (d.getDate() & 0x1F);
    return { time: time & 0xFFFF, date: date & 0xFFFF };
  }

  /* files: [{name, data:Uint8Array}] → Uint8Array */
  Z.write = function (files) {
    var stamp = dosTime(new Date());
    var locals = [], centrals = [], offset = 0;
    for (var i = 0; i < files.length; i++) {
      var nameBytes = B.utf8(files[i].name);
      var data = files[i].data;
      var crc = B.crc32(data);
      var localHeader = B.concat([
        u32(0x04034b50), u16(20), u16(0x0800), u16(0),
        u16(stamp.time), u16(stamp.date),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0)
      ]);
      var local = B.concat([localHeader, nameBytes, data]);
      locals.push(local);
      var central = B.concat([
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
        u16(stamp.time), u16(stamp.date),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset),
        nameBytes
      ]);
      centrals.push(central);
      offset += local.length;
    }
    var cd = B.concat(centrals);
    var eocd = B.concat([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cd.length), u32(offset), u16(0)
    ]);
    return B.concat([B.concat(locals), cd, eocd]);
  };

  /* Uint8Array → [{name, data:Uint8Array}] */
  Z.read = function (u8) {
    var eocd = -1;
    var min = Math.max(0, u8.length - 22 - 0xFFFF);
    for (var i = u8.length - 22; i >= min; i--) {
      if (r32(u8, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Respaldo inválido (sin fin de ZIP)');
    var cdOffset = r32(u8, eocd + 16);
    var out = [];
    var idx = cdOffset;
    var guard = 0;
    while (idx + 46 <= u8.length && guard++ < 200000) {
      if (r32(u8, idx) !== 0x02014b50) break;
      var method = r16(u8, idx + 10);
      var compSize = r32(u8, idx + 20);
      var nameLen = r16(u8, idx + 28);
      var extraLen = r16(u8, idx + 30);
      var commentLen = r16(u8, idx + 32);
      var localOff = r32(u8, idx + 42);
      var name = B.fromUtf8(u8.subarray(idx + 46, idx + 46 + nameLen));
      var localNameLen = r16(u8, localOff + 26);
      var localExtraLen = r16(u8, localOff + 28);
      var dataStart = localOff + 30 + localNameLen + localExtraLen;
      var comp = u8.subarray(dataStart, dataStart + compSize);
      var data;
      if (method === 0) data = comp.slice();
      else if (method === 8) data = B.inflateRaw(comp);
      else throw new Error('Compresión ZIP no soportada');
      out.push({ name: name, data: data });
      idx += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  };
})();
