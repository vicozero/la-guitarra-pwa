/* Xlsx: libro .xlsx mínimo (puerto de Xlsx.java) empaquetado con LG.zip. */
(function () {
  'use strict';
  var LG = (window.LG = window.LG || {});
  var B = LG.bytes;
  var U = LG.util;
  var X = (LG.xlsx = {});

  X.S_DEFAULT = 0; X.S_TITLE = 1; X.S_HEADER = 2; X.S_LABEL = 3;
  X.S_NUMBER = 4; X.S_PERCENT = 5; X.S_CELL = 6;

  function cText(v, style) { return { numeric: false, text: v == null ? '' : String(v), style: style || 0 }; }
  function cNum(v) { return U.finite(v) ? { numeric: true, value: v, style: X.S_NUMBER } : cText('\u2014'); }
  function cPct(f) { return U.finite(f) ? { numeric: true, value: f, style: X.S_PERCENT } : cText('\u2014'); }
  X.text = cText; X.num = cNum; X.pct = cPct;

  function Sheet(name) {
    this.name = String(name).slice(0, 31);
    this.widths = {};
    this.rows = [];
  }
  Sheet.prototype.cols = function (widths) {
    for (var i = 0; i < widths.length; i++) if (widths[i]) this.widths[i] = widths[i];
    return this;
  };
  Sheet.prototype.row = function (cells) { this.rows.push(cells || []); return this; };
  X.Sheet = Sheet;

  function escXml(value) {
    var s = value == null ? '' : String(value), b = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '&') b += '&amp;';
      else if (ch === '<') b += '&lt;';
      else if (ch === '>') b += '&gt;';
      else if (ch === '"') b += '&quot;';
      else if (ch === "'") b += '&apos;';
      else if (ch === '\t' || ch === '\n' || ch === '\r' || ch >= ' ') b += ch;
    }
    return b;
  }

  function colName(index) {
    var s = '', i = index;
    while (i >= 0) { s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26) - 1; }
    return s;
  }

  function numPlain(value) {
    if (!U.finite(value)) return '0';
    var s = value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    return (s === '' || s === '-' || s === '-0') ? '0' : s;
  }

  function sheetXml(sheet) {
    var b = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    b += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    b += '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    b += '<sheetFormatPr defaultRowHeight="15"/>';
    var keys = Object.keys(sheet.widths);
    if (keys.length) {
      b += '<cols>';
      for (var w = 0; w < keys.length; w++) {
        b += '<col min="' + (+keys[w] + 1) + '" max="' + (+keys[w] + 1) + '" width="' + sheet.widths[keys[w]] + '" customWidth="1"/>';
      }
      b += '</cols>';
    }
    b += '<sheetData>';
    for (var r = 0; r < sheet.rows.length; r++) {
      var row = sheet.rows[r];
      b += '<row r="' + (r + 1) + '">';
      for (var c = 0; c < row.length; c++) {
        var cell = row[c];
        if (!cell) continue;
        var ref = colName(c) + (r + 1);
        if (cell.numeric) b += '<c r="' + ref + '" s="' + cell.style + '"><v>' + numPlain(cell.value) + '</v></c>';
        else b += '<c r="' + ref + '" s="' + cell.style + '" t="inlineStr"><is><t xml:space="preserve">' + escXml(cell.text) + '</t></is></c>';
      }
      b += '</row>';
    }
    b += '</sheetData></worksheet>';
    return b;
  }

  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="4">' +
    '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="15"/><color rgb="FF0D2A52"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FF0D2A52"/><name val="Calibri"/><family val="2"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF0D2A52"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FFD8DFE8"/></left><right style="thin"><color rgb="FFD8DFE8"/></right>' +
    '<top style="thin"><color rgb="FFD8DFE8"/></top><bottom style="thin"><color rgb="FFD8DFE8"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="7">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  /* sheets: [Sheet] → Uint8Array (.xlsx) */
  X.write = function (sheets) {
    var content = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>';
    for (var i = 1; i <= sheets.length; i++) content += '<Override PartName="/xl/worksheets/sheet' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    content += '</Types>';

    var rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>';

    var core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>La Guitarra · Control de flota</dc:title>' +
      '<dc:creator>La Guitarra</dc:creator><cp:lastModifiedBy>La Guitarra</cp:lastModifiedBy></cp:coreProperties>';

    var app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
      'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      '<Application>La Guitarra</Application></Properties>';

    var workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
    var workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    for (var s = 0; s < sheets.length; s++) {
      workbook += '<sheet name="' + escXml(sheets[s].name) + '" sheetId="' + (s + 1) + '" r:id="rId' + (s + 1) + '"/>';
      workbookRels += '<Relationship Id="rId' + (s + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (s + 1) + '.xml"/>';
    }
    workbook += '</sheets></workbook>';
    workbookRels += '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
    workbookRels += '</Relationships>';

    var files = [
      { name: '[Content_Types].xml', data: B.utf8(content) },
      { name: '_rels/.rels', data: B.utf8(rootRels) },
      { name: 'docProps/core.xml', data: B.utf8(core) },
      { name: 'docProps/app.xml', data: B.utf8(app) },
      { name: 'xl/workbook.xml', data: B.utf8(workbook) },
      { name: 'xl/_rels/workbook.xml.rels', data: B.utf8(workbookRels) },
      { name: 'xl/styles.xml', data: B.utf8(STYLES) }
    ];
    for (var k = 0; k < sheets.length; k++) files.push({ name: 'xl/worksheets/sheet' + (k + 1) + '.xml', data: B.utf8(sheetXml(sheets[k])) });
    return LG.zip.write(files);
  };
})();
