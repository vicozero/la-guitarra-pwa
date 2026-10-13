/* Utilidades binarias: base64, UTF-8, CRC-32 y DEFLATE (inflate puro en JS). */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});
  var B = (LG.bytes = {});

  var textEncoder = new TextEncoder();
  var textDecoder = new TextDecoder('utf-8');

  B.utf8 = function (s) { return textEncoder.encode(s); };
  B.fromUtf8 = function (u8) { return textDecoder.decode(u8); };

  B.fromBase64 = function (b64) {
    var bin = atob(String(b64 || '').replace(/\s+/g, ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  B.toBase64 = function (u8) {
    var chunk = 0x8000, s = '';
    for (var i = 0; i < u8.length; i += chunk) s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    return btoa(s);
  };

  B.concat = function (parts) {
    var total = 0, i;
    for (i = 0; i < parts.length; i++) total += parts[i].length;
    var out = new Uint8Array(total), off = 0;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], off); off += parts[i].length; }
    return out;
  };

  B.latin1 = function (s) {
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
    return out;
  };

  /* CRC-32 (polinomio 0xEDB88320). */
  var CRC_TABLE = (function () {
    var t = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();

  B.crc32 = function (u8) {
    var c = -1;
    for (var i = 0; i < u8.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ u8[i]) & 0xFF];
    return (c ^ -1) >>> 0;
  };

  /* ---- Inflate (RFC 1951, datos sin cabecera zlib) ---- */
  var LENS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DISTS = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  var DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  function buildTree(lengths) {
    var maxBits = 0, i;
    for (i = 0; i < lengths.length; i++) if (lengths[i] > maxBits) maxBits = lengths[i];
    var counts = new Array(maxBits + 1).fill(0);
    for (i = 0; i < lengths.length; i++) counts[lengths[i]]++;
    counts[0] = 0;
    var offs = new Array(maxBits + 2).fill(0);
    for (i = 1; i <= maxBits; i++) offs[i + 1] = offs[i] + counts[i];
    var symbols = new Array(lengths.length);
    for (i = 0; i < lengths.length; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
    return { counts: counts, symbols: symbols, maxBits: maxBits };
  }

  B.inflateRaw = function (data) {
    var pos = 0, bitbuf = 0, bitcnt = 0;
    var buf = [];

    function bit() {
      if (bitcnt === 0) { bitbuf = data[pos++]; bitcnt = 8; }
      var b = bitbuf & 1; bitbuf >>>= 1; bitcnt--; return b;
    }
    function bits(n) { var v = 0; for (var i = 0; i < n; i++) v |= bit() << i; return v; }
    function decode(tree) {
      var code = 0, first = 0, index = 0;
      for (var len = 1; len <= tree.maxBits; len++) {
        code |= bit();
        var count = tree.counts[len];
        if (code - first < count) return tree.symbols[index + (code - first)];
        index += count; first += count; first <<= 1; code <<= 1;
      }
      return -1;
    }
    function u16() { var v = data[pos] | (data[pos + 1] << 8); pos += 2; return v; }

    var last = 0;
    do {
      last = bits(1);
      var type = bits(2);
      if (type === 0) {
        bitbuf = 0; bitcnt = 0;
        var len = u16(); u16();
        for (var i = 0; i < len; i++) buf.push(data[pos++]);
      } else if (type === 1 || type === 2) {
        var lt, dt;
        if (type === 1) {
          var lit = new Array(288), j;
          for (j = 0; j < 144; j++) lit[j] = 8;
          for (; j < 256; j++) lit[j] = 9;
          for (; j < 280; j++) lit[j] = 7;
          for (; j < 288; j++) lit[j] = 8;
          lt = buildTree(lit);
          dt = buildTree(new Array(30).fill(5));
        } else {
          var hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
          var clens = new Array(19).fill(0);
          for (var c = 0; c < hclen; c++) clens[ORDER[c]] = bits(3);
          var ct = buildTree(clens);
          var lengths = [];
          while (lengths.length < hlit + hdist) {
            var sym = decode(ct);
            if (sym < 0) throw new Error('inflate: datos corruptos');
            if (sym < 16) lengths.push(sym);
            else if (sym === 16) { var rp = 3 + bits(2), pv = lengths[lengths.length - 1]; for (var a = 0; a < rp; a++) lengths.push(pv); }
            else if (sym === 17) { var r17 = 3 + bits(3); for (var a17 = 0; a17 < r17; a17++) lengths.push(0); }
            else { var r18 = 11 + bits(7); for (var a18 = 0; a18 < r18; a18++) lengths.push(0); }
          }
          lt = buildTree(lengths.slice(0, hlit));
          dt = buildTree(lengths.slice(hlit));
        }
        while (true) {
          var s = decode(lt);
          if (s < 0) throw new Error('inflate: datos corruptos');
          if (s < 256) buf.push(s);
          else if (s === 256) break;
          else {
            s -= 257;
            var length = LENS[s] + bits(LEXT[s]);
            var ds = decode(dt);
            if (ds < 0) throw new Error('inflate: datos corruptos');
            var dist = DISTS[ds] + bits(DEXT[ds]);
            var start = buf.length - dist;
            if (start < 0) throw new Error('inflate: distancia inválida');
            for (var k = 0; k < length; k++) buf.push(buf[start + k]);
          }
        }
      } else {
        throw new Error('inflate: tipo de bloque inválido');
      }
    } while (!last);

    return Uint8Array.from(buf);
  };
})();
