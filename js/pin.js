/* LocalPin: PBKDF2-HMAC-SHA256 (puerto exacto: 16 bytes de sal, 120000 iteraciones, 256 bits). */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});

  function b64encode(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function b64decode(b64) {
    var bin = atob(String(b64 || ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function salt() {
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return b64encode(b);
  }

  function hash(pin, saltB64) {
    var enc = new TextEncoder();
    return crypto.subtle
      .importKey('raw', enc.encode(String(pin)), { name: 'PBKDF2' }, false, ['deriveBits'])
      .then(function (key) {
        return crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: b64decode(saltB64), iterations: 120000, hash: 'SHA-256' },
          key, 256);
      })
      .then(function (bits) { return b64encode(new Uint8Array(bits)); });
  }

  function verify(pin, saltB64, expected) {
    return hash(pin, saltB64).then(function (actual) {
      var a = b64decode(actual), b = b64decode(expected);
      if (a.length !== b.length) return false;
      var diff = 0;
      for (var i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
      return diff === 0;
    });
  }

  LG.pin = { salt: salt, hash: hash, verify: verify, b64encode: b64encode, b64decode: b64decode };
})();
