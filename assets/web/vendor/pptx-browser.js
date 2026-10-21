var PptxBrowser = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // node_modules/pptx-browser/src/utils.js
  var utils_exports = {};
  __export(utils_exports, {
    EMU_PER_INCH: () => EMU_PER_INCH,
    EMU_PER_PT: () => EMU_PER_PT,
    attr: () => attr,
    attrFloat: () => attrFloat,
    attrInt: () => attrInt,
    clamp: () => clamp,
    g1: () => g1,
    gtn: () => gtn,
    parseXml: () => parseXml
  });
  function parseXml(str) {
    return new DOMParser().parseFromString(str, "application/xml");
  }
  function gtn(node, localName) {
    if (!node) return [];
    const results = [];
    const all = node.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) {
      if (all[i].localName === localName) results.push(all[i]);
    }
    return results;
  }
  function g1(node, localName) {
    return gtn(node, localName)[0] ?? null;
  }
  function attr(el, name, def = null) {
    if (!el) return def;
    const v = el.getAttribute(name);
    return v !== null ? v : def;
  }
  function attrInt(el, name, def = 0) {
    const v = attr(el, name);
    return v !== null ? parseInt(v, 10) : def;
  }
  function attrFloat(el, name, def = 0) {
    const v = attr(el, name);
    return v !== null ? parseFloat(v) : def;
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  var EMU_PER_INCH, EMU_PER_PT;
  var init_utils = __esm({
    "node_modules/pptx-browser/src/utils.js"() {
      EMU_PER_INCH = 914400;
      EMU_PER_PT = 12700;
    }
  });

  // node_modules/pptx-browser/src/fonts.js
  function getProbeCtx() {
    if (!_probeCtx) {
      _probeCanvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(300, 10) : Object.assign(document.createElement("canvas"), { width: 300, height: 10 });
      _probeCtx = _probeCanvas.getContext("2d");
    }
    return _probeCtx;
  }
  function isFontAvailable(family) {
    if (_systemFonts.has(family)) return true;
    if (typeof document !== "undefined" && document.fonts) {
      if (document.fonts.check(`16px "${family}"`)) {
        _systemFonts.add(family);
        return true;
      }
    }
    try {
      const ctx = getProbeCtx();
      const baselines = ["monospace", "serif"];
      for (const size of PROBE_SIZES) {
        for (const baseline of baselines) {
          ctx.font = `${size}px ${baseline}`;
          const baseW = ctx.measureText(PROBE_TEXT).width;
          ctx.font = `${size}px "${family}", ${baseline}`;
          const testW = ctx.measureText(PROBE_TEXT).width;
          if (Math.abs(testW - baseW) > 0.5) {
            _systemFonts.add(family);
            return true;
          }
        }
      }
    } catch (_) {
    }
    return false;
  }
  async function registerFont(family, source, descriptors = {}) {
    let fontSource;
    if (typeof source === "string" || source instanceof URL) {
      fontSource = source.toString();
    } else if (source instanceof File || source instanceof Blob) {
      const buf = await source.arrayBuffer();
      fontSource = buf;
    } else if (source instanceof Uint8Array) {
      fontSource = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    } else if (source instanceof ArrayBuffer) {
      fontSource = source;
    } else {
      throw new TypeError(`registerFont: unsupported source type. Expected string, URL, File, Blob, ArrayBuffer, or Uint8Array.`);
    }
    const desc = { weight: "normal", style: "normal", ...descriptors };
    const face = new FontFace(family, typeof fontSource === "string" ? `url(${fontSource})` : fontSource, desc);
    await face.load();
    document.fonts.add(face);
    const variants = _customFonts.get(family) ?? [];
    variants.push(face);
    _customFonts.set(family, variants);
    _loadedFonts.add(family);
    _systemFonts.add(family);
    const lower = family.toLowerCase().trim();
    if (!MS_FONT_MAP[lower]) {
      MS_FONT_MAP[lower] = { google: null, weights: [], generic: "sans-serif", _custom: true };
    } else {
      MS_FONT_MAP[lower]._custom = true;
    }
    console.log(`[pptx-canvas-renderer] Custom font registered: "${family}" (${desc.weight} ${desc.style})`);
    return face;
  }
  async function registerFonts(fontMap) {
    const promises = [];
    for (const [family, spec] of Object.entries(fontMap)) {
      if (typeof spec === "string") {
        promises.push(registerFont(family, spec));
      } else if (Array.isArray(spec)) {
        for (const variant of spec) {
          const { url, ...desc } = variant;
          promises.push(registerFont(family, url, desc));
        }
      }
    }
    await Promise.all(promises);
  }
  function detectEmbeddedFonts(presDoc, presRels) {
    if (!presDoc) return [];
    const embeddedFontLst = g1(presDoc, "embeddedFontLst");
    if (!embeddedFontLst) return [];
    const result = [];
    for (const embeddedFont of embeddedFontLst.children) {
      if (embeddedFont.localName !== "embeddedFont") continue;
      const fontEl = g1(embeddedFont, "font");
      const family = fontEl ? fontEl.getAttribute("typeface") : null;
      if (!family) continue;
      const variants = { regular: false, bold: false, italic: false, boldItalic: false };
      const paths = [];
      for (const variant of ["regular", "bold", "italic", "boldItalic"]) {
        const el = g1(embeddedFont, variant);
        if (!el) continue;
        const rId = el.getAttribute("r:id") || el.getAttribute("id");
        const rel = presRels?.[rId];
        if (rel) {
          paths.push(rel.fullPath);
          variants[variant] = true;
        }
      }
      result.push({
        family,
        hasRegular: variants.regular,
        hasBold: variants.bold,
        hasItalic: variants.italic,
        hasBoldItalic: variants.boldItalic,
        paths,
        note: ".fntdata files are a proprietary Microsoft format and cannot be used as web fonts directly. Use registerFont() with a compatible woff2/ttf version instead."
      });
    }
    return result;
  }
  function resolveFontFamily(name) {
    if (!name) return "sans-serif";
    if (name === "+mj-lt" || name === "+mj") return "serif";
    if (name === "+mn-lt" || name === "+mn") return "sans-serif";
    if (_customFonts.has(name)) return name;
    const lower = name.toLowerCase().trim();
    const mapped = MS_FONT_MAP[lower];
    if (mapped) {
      if (mapped._custom) return name;
      if (mapped.google === null) return name;
      if (mapped.google && isFontAvailable(mapped.google)) return mapped.google;
      return mapped.google || name;
    }
    return name;
  }
  function getGenericFamily(name) {
    if (!name) return "sans-serif";
    const lower = name.toLowerCase().trim();
    return MS_FONT_MAP[lower]?.generic ?? "sans-serif";
  }
  async function loadGoogleFontsFor(fontNames, themeData) {
    const candidates = [...fontNames];
    if (themeData?.majorFont) candidates.push(themeData.majorFont);
    if (themeData?.minorFont) candidates.push(themeData.minorFont);
    const toLoad = /* @__PURE__ */ new Map();
    for (const name of candidates) {
      if (!name || name.startsWith("+")) continue;
      if (name === "+mj-lt" || name === "+mn-lt" || name === "+mj" || name === "+mn") continue;
      if (_customFonts.has(name)) continue;
      const lower = name.toLowerCase().trim();
      const mapped = MS_FONT_MAP[lower];
      let googleName = null;
      let weights = [400, 700];
      if (mapped) {
        if (mapped._custom) continue;
        if (mapped.google === null) continue;
        googleName = mapped.google;
        weights = mapped.weights.length ? mapped.weights : [400, 700];
      } else {
        googleName = name;
      }
      if (!googleName) continue;
      if (_loadedFonts.has(googleName)) continue;
      if (isFontAvailable(googleName)) {
        _loadedFonts.add(googleName);
        continue;
      }
      const ws = toLoad.get(googleName) ?? /* @__PURE__ */ new Set();
      weights.forEach((w) => ws.add(w));
      toLoad.set(googleName, ws);
    }
    if (toLoad.size === 0) return;
    for (const name of toLoad.keys()) _loadedFonts.add(name);
    const params = [...toLoad.entries()].map(([family, weightSet]) => {
      const wArr = [...weightSet].sort((a, b) => a - b);
      const specs = [
        ...wArr.map((w) => `0,${w}`),
        ...wArr.map((w) => `1,${w}`)
      ].join(";");
      return `family=${encodeURIComponent(`${family}:ital,wght@${specs}`)}`;
    });
    const url = `https://fonts.googleapis.com/css2?${params.join("&")}&display=swap`;
    try {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      document.head.appendChild(link);
      await new Promise((resolve) => {
        link.onload = resolve;
        link.onerror = () => {
          console.warn("[pptx-canvas-renderer] Google Fonts failed to load:", url);
          resolve();
        };
        setTimeout(resolve, 5e3);
      });
      if (document.fonts?.ready) {
        await Promise.race([
          document.fonts.ready,
          new Promise((r) => setTimeout(r, 2e3))
        ]);
      }
    } catch (err) {
      console.warn("[pptx-canvas-renderer] Font loading error:", err);
    }
  }
  function collectUsedFonts(xmlDocs) {
    const names = /* @__PURE__ */ new Set();
    for (const doc of xmlDocs) {
      if (!doc) continue;
      const els = doc.getElementsByTagName("*");
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        const ln = el.localName;
        if (ln === "latin" || ln === "ea" || ln === "cs") {
          const tf = el.getAttribute("typeface");
          if (tf && !tf.startsWith("+")) names.add(tf);
        }
      }
    }
    return names;
  }
  function buildFontInherited(rPr, paraDefRPr, scaledPxPerEmu, themeData, defSz = 1800, lstDefRPr = null) {
    let sz = defSz;
    if (lstDefRPr) {
      const v = lstDefRPr.getAttribute("sz");
      if (v) sz = parseInt(v, 10);
    }
    if (paraDefRPr) {
      const v = paraDefRPr.getAttribute("sz");
      if (v) sz = parseInt(v, 10);
    }
    if (rPr) {
      const v = rPr.getAttribute("sz");
      if (v) sz = parseInt(v, 10);
    }
    let bold = false, italic = false;
    if (lstDefRPr) {
      if (lstDefRPr.getAttribute("b") === "1") bold = true;
      if (lstDefRPr.getAttribute("i") === "1") italic = true;
    }
    if (paraDefRPr) {
      const b = paraDefRPr.getAttribute("b");
      const i = paraDefRPr.getAttribute("i");
      if (b === "1") bold = true;
      else if (b === "0") bold = false;
      if (i === "1") italic = true;
      else if (i === "0") italic = false;
    }
    if (rPr) {
      const b = rPr.getAttribute("b");
      const i = rPr.getAttribute("i");
      if (b === "1") bold = true;
      else if (b === "0") bold = false;
      if (i === "1") italic = true;
      else if (i === "0") italic = false;
    }
    let rawFamily = themeData?.minorFont ?? "Calibri";
    function applyFamilyFromEl(el) {
      if (!el) return;
      const latin = g1(el, "latin");
      const tf = latin ? latin.getAttribute("typeface") : el.getAttribute("typeface");
      if (!tf) return;
      if (tf === "+mj-lt" || tf === "+mj") {
        rawFamily = themeData?.majorFont ?? rawFamily;
        return;
      }
      if (tf === "+mn-lt" || tf === "+mn") {
        rawFamily = themeData?.minorFont ?? rawFamily;
        return;
      }
      rawFamily = tf;
    }
    applyFamilyFromEl(lstDefRPr);
    applyFamilyFromEl(paraDefRPr);
    applyFamilyFromEl(rPr);
    const family = resolveFontFamily(rawFamily);
    const generic = getGenericFamily(rawFamily);
    const szPx = sz * 127 * scaledPxPerEmu;
    const weight = bold ? "bold" : "normal";
    const style = italic ? "italic " : "";
    const fontStr = `${style}${weight} ${szPx}px "${family}", ${generic}`;
    return { fontStr, sz, szPx, bold, italic, family, generic, rawFamily };
  }
  function listRegisteredFonts() {
    const result = [];
    for (const [family, faces] of _customFonts) {
      for (const face of faces) {
        result.push({ family, weight: face.weight, style: face.style, status: face.status });
      }
    }
    return result;
  }
  function clearRegisteredFonts() {
    for (const [, faces] of _customFonts) {
      for (const face of faces) {
        try {
          document.fonts.delete(face);
        } catch (_) {
        }
      }
    }
    _customFonts.clear();
    for (const [key, val] of Object.entries(MS_FONT_MAP)) {
      if (val._custom) delete MS_FONT_MAP[key];
    }
  }
  var MS_FONT_MAP, _loadedFonts, _customFonts, _systemFonts, _probeCanvas, _probeCtx, PROBE_TEXT, PROBE_SIZES;
  var init_fonts = __esm({
    "node_modules/pptx-browser/src/fonts.js"() {
      init_utils();
      MS_FONT_MAP = {
        // ── Calibri family (metric-compatible substitutes exist) ──────────────────
        "calibri": { google: "Carlito", weights: [400, 700], generic: "sans-serif" },
        "calibri light": { google: "Carlito", weights: [300], generic: "sans-serif" },
        "calibri (body)": { google: "Carlito", weights: [400, 700], generic: "sans-serif" },
        // ── Cambria (metric-compatible) ───────────────────────────────────────────
        "cambria": { google: "Caladea", weights: [400, 700], generic: "serif" },
        "cambria math": { google: "Caladea", weights: [400], generic: "serif" },
        // ── Aptos — Microsoft 365 default since 2023 ─────────────────────────────
        "aptos": { google: "Inter", weights: [300, 400, 600, 700], generic: "sans-serif" },
        "aptos display": { google: "Inter", weights: [700, 800], generic: "sans-serif" },
        "aptos narrow": { google: "Inter", weights: [400, 700], generic: "sans-serif" },
        "aptos serif": { google: "Lora", weights: [400, 700], generic: "serif" },
        "aptos mono": { google: "Roboto Mono", weights: [400, 700], generic: "monospace" },
        // ── Web-safe fonts — available in all browsers, no loading needed ─────────
        "arial": { google: null, weights: [], generic: "sans-serif" },
        "arial black": { google: null, weights: [], generic: "sans-serif" },
        "times new roman": { google: null, weights: [], generic: "serif" },
        "times": { google: null, weights: [], generic: "serif" },
        "helvetica": { google: null, weights: [], generic: "sans-serif" },
        "verdana": { google: null, weights: [], generic: "sans-serif" },
        "tahoma": { google: null, weights: [], generic: "sans-serif" },
        "trebuchet ms": { google: null, weights: [], generic: "sans-serif" },
        "georgia": { google: null, weights: [], generic: "serif" },
        "courier new": { google: null, weights: [], generic: "monospace" },
        "courier": { google: null, weights: [], generic: "monospace" },
        "impact": { google: null, weights: [], generic: "sans-serif" },
        "comic sans ms": { google: null, weights: [], generic: "cursive" },
        "palatino": { google: null, weights: [], generic: "serif" },
        "lucida console": { google: null, weights: [], generic: "monospace" },
        "lucida sans unicode": { google: null, weights: [], generic: "sans-serif" },
        // ── Common Office fonts ───────────────────────────────────────────────────
        "arial narrow": { google: "Arimo", weights: [400, 700], generic: "sans-serif" },
        "candara": { google: "Nunito", weights: [300, 400, 700], generic: "sans-serif" },
        "consolas": { google: "Roboto Mono", weights: [400, 700], generic: "monospace" },
        "constantia": { google: "Libre Baskerville", weights: [400, 700], generic: "serif" },
        "corbel": { google: "Lato", weights: [300, 400, 700], generic: "sans-serif" },
        "franklin gothic medium": { google: "Libre Franklin", weights: [500], generic: "sans-serif" },
        "franklin gothic book": { google: "Libre Franklin", weights: [400], generic: "sans-serif" },
        "franklin gothic heavy": { google: "Libre Franklin", weights: [800], generic: "sans-serif" },
        "gill sans mt": { google: "Quattrocento Sans", weights: [400, 700], generic: "sans-serif" },
        "gill sans": { google: "Quattrocento Sans", weights: [400, 700], generic: "sans-serif" },
        "century gothic": { google: "Josefin Sans", weights: [300, 400, 700], generic: "sans-serif" },
        "century schoolbook": { google: "EB Garamond", weights: [400, 700], generic: "serif" },
        "garamond": { google: "EB Garamond", weights: [400, 700], generic: "serif" },
        "palatino linotype": { google: "EB Garamond", weights: [400, 700], generic: "serif" },
        "book antiqua": { google: "EB Garamond", weights: [400, 700], generic: "serif" },
        "rockwell": { google: "Roboto Slab", weights: [400, 700], generic: "serif" },
        "rockwell extra bold": { google: "Roboto Slab", weights: [800], generic: "serif" },
        "segoe ui": { google: "Inter", weights: [300, 400, 600, 700], generic: "sans-serif" },
        "segoe ui light": { google: "Inter", weights: [300], generic: "sans-serif" },
        "segoe ui semibold": { google: "Inter", weights: [600], generic: "sans-serif" },
        "segoe ui semilight": { google: "Inter", weights: [350], generic: "sans-serif" },
        "helvetica neue": { google: "Nunito Sans", weights: [300, 400, 700], generic: "sans-serif" },
        "myriad pro": { google: "Source Sans 3", weights: [300, 400, 600, 700], generic: "sans-serif" },
        "futura": { google: "Josefin Sans", weights: [300, 400, 700], generic: "sans-serif" },
        "tw cen mt": { google: "Pathway Gothic One", weights: [400], generic: "sans-serif" },
        "bookman old style": { google: "Libre Baskerville", weights: [400, 700], generic: "serif" },
        "frutiger": { google: "Raleway", weights: [300, 400, 700], generic: "sans-serif" },
        "optima": { google: "Questrial", weights: [400], generic: "sans-serif" },
        "univers": { google: "Nunito Sans", weights: [300, 400, 700], generic: "sans-serif" },
        // ── Google Fonts already at their canonical names ─────────────────────────
        "open sans": { google: "Open Sans", weights: [300, 400, 600, 700], generic: "sans-serif" },
        "lato": { google: "Lato", weights: [300, 400, 700], generic: "sans-serif" },
        "montserrat": { google: "Montserrat", weights: [300, 400, 600, 700], generic: "sans-serif" },
        "raleway": { google: "Raleway", weights: [300, 400, 700], generic: "sans-serif" },
        "roboto": { google: "Roboto", weights: [300, 400, 700], generic: "sans-serif" },
        "roboto mono": { google: "Roboto Mono", weights: [400, 700], generic: "monospace" },
        "roboto slab": { google: "Roboto Slab", weights: [300, 400, 700], generic: "serif" },
        "oswald": { google: "Oswald", weights: [400, 700], generic: "sans-serif" },
        "playfair display": { google: "Playfair Display", weights: [400, 700], generic: "serif" },
        "merriweather": { google: "Merriweather", weights: [300, 400, 700], generic: "serif" },
        "nunito": { google: "Nunito", weights: [300, 400, 700], generic: "sans-serif" },
        "nunito sans": { google: "Nunito Sans", weights: [300, 400, 700], generic: "sans-serif" },
        "poppins": { google: "Poppins", weights: [300, 400, 600, 700], generic: "sans-serif" },
        "inter": { google: "Inter", weights: [300, 400, 600, 700], generic: "sans-serif" },
        "work sans": { google: "Work Sans", weights: [300, 400, 600, 700], generic: "sans-serif" },
        "dm sans": { google: "DM Sans", weights: [300, 400, 500, 700], generic: "sans-serif" },
        "dm serif display": { google: "DM Serif Display", weights: [400], generic: "serif" },
        "ubuntu": { google: "Ubuntu", weights: [300, 400, 700], generic: "sans-serif" },
        "ubuntu mono": { google: "Ubuntu Mono", weights: [400, 700], generic: "monospace" },
        "source sans pro": { google: "Source Sans 3", weights: [300, 400, 600, 700], generic: "sans-serif" },
        "source serif pro": { google: "Source Serif 4", weights: [300, 400, 700], generic: "serif" },
        "source code pro": { google: "Source Code Pro", weights: [400, 700], generic: "monospace" },
        "exo 2": { google: "Exo 2", weights: [300, 400, 700], generic: "sans-serif" },
        "titillium web": { google: "Titillium Web", weights: [300, 400, 600, 700], generic: "sans-serif" },
        "fira sans": { google: "Fira Sans", weights: [300, 400, 600, 700], generic: "sans-serif" },
        "fira mono": { google: "Fira Mono", weights: [400, 700], generic: "monospace" },
        "josefin sans": { google: "Josefin Sans", weights: [300, 400, 700], generic: "sans-serif" },
        "josefin slab": { google: "Josefin Slab", weights: [300, 400, 700], generic: "serif" },
        "barlow": { google: "Barlow", weights: [300, 400, 600, 700], generic: "sans-serif" },
        "barlow condensed": { google: "Barlow Condensed", weights: [300, 400, 600, 700], generic: "sans-serif" },
        "cabin": { google: "Cabin", weights: [400, 700], generic: "sans-serif" },
        "crimson text": { google: "Crimson Text", weights: [400, 700], generic: "serif" },
        "libre baskerville": { google: "Libre Baskerville", weights: [400, 700], generic: "serif" },
        "libre franklin": { google: "Libre Franklin", weights: [400, 700], generic: "sans-serif" },
        "eb garamond": { google: "EB Garamond", weights: [400, 700], generic: "serif" },
        "spectral": { google: "Spectral", weights: [300, 400, 700], generic: "serif" },
        "arvo": { google: "Arvo", weights: [400, 700], generic: "serif" },
        "pt sans": { google: "PT Sans", weights: [400, 700], generic: "sans-serif" },
        "pt serif": { google: "PT Serif", weights: [400, 700], generic: "serif" },
        "pt mono": { google: "PT Mono", weights: [400], generic: "monospace" },
        "karla": { google: "Karla", weights: [300, 400, 700], generic: "sans-serif" },
        "mukta": { google: "Mukta", weights: [300, 400, 700], generic: "sans-serif" },
        "hind": { google: "Hind", weights: [300, 400, 700], generic: "sans-serif" },
        "noto sans": { google: "Noto Sans", weights: [300, 400, 700], generic: "sans-serif" },
        "noto serif": { google: "Noto Serif", weights: [300, 400, 700], generic: "serif" }
      };
      _loadedFonts = /* @__PURE__ */ new Set();
      _customFonts = /* @__PURE__ */ new Map();
      _systemFonts = /* @__PURE__ */ new Set();
      _probeCanvas = null;
      _probeCtx = null;
      PROBE_TEXT = "mmmmmmmmmmlllllllllliiiiiiiiiixxxxxxxxxx";
      PROBE_SIZES = [20, 40];
    }
  });

  // node_modules/pptx-browser/src/colors.js
  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }
  function rgbToHls(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }
    return { h, l, s };
  }
  function hlsToRgb(h, l, s) {
    if (s === 0) {
      const v = Math.round(l * 255);
      return { r: v, g: v, b: v };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (p2, q2, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p2 + (q2 - p2) * 6 * t;
      if (t < 1 / 2) return q2;
      if (t < 2 / 3) return p2 + (q2 - p2) * (2 / 3 - t) * 6;
      return p2;
    };
    return {
      r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      g: Math.round(hue2rgb(p, q, h) * 255),
      b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
    };
  }
  function applyColorTransforms(c, transformEl) {
    if (!transformEl) return c;
    let { r, g, b, a = 1 } = c;
    for (const child of transformEl.children) {
      const ln = child.localName;
      const val = parseInt(child.getAttribute("val") ?? "0", 10);
      switch (ln) {
        case "lumMod": {
          const f = val / 1e5;
          const hls = rgbToHls(r, g, b);
          const rgb = hlsToRgb(hls.h, clamp(hls.l * f, 0, 1), hls.s);
          r = rgb.r;
          g = rgb.g;
          b = rgb.b;
          break;
        }
        case "lumOff": {
          const f = val / 1e5;
          const hls = rgbToHls(r, g, b);
          const rgb = hlsToRgb(hls.h, clamp(hls.l + f, 0, 1), hls.s);
          r = rgb.r;
          g = rgb.g;
          b = rgb.b;
          break;
        }
        case "tint": {
          const f = val / 1e5;
          r = Math.round(r + (255 - r) * (1 - f));
          g = Math.round(g + (255 - g) * (1 - f));
          b = Math.round(b + (255 - b) * (1 - f));
          break;
        }
        case "shade": {
          const f = val / 1e5;
          r = Math.round(r * f);
          g = Math.round(g * f);
          b = Math.round(b * f);
          break;
        }
        case "satMod": {
          const f = val / 1e5;
          const hls = rgbToHls(r, g, b);
          const rgb = hlsToRgb(hls.h, hls.l, clamp(hls.s * f, 0, 1));
          r = rgb.r;
          g = rgb.g;
          b = rgb.b;
          break;
        }
        case "satOff": {
          const f = val / 1e5;
          const hls = rgbToHls(r, g, b);
          const rgb = hlsToRgb(hls.h, hls.l, clamp(hls.s + f, 0, 1));
          r = rgb.r;
          g = rgb.g;
          b = rgb.b;
          break;
        }
        case "hueMod": {
          const f = val / 1e5;
          const hls = rgbToHls(r, g, b);
          const rgb = hlsToRgb(hls.h * f % 1, hls.l, hls.s);
          r = rgb.r;
          g = rgb.g;
          b = rgb.b;
          break;
        }
        case "hueOff": {
          const f = val / 216e5;
          const hls = rgbToHls(r, g, b);
          const rgb = hlsToRgb(((hls.h + f) % 1 + 1) % 1, hls.l, hls.s);
          r = rgb.r;
          g = rgb.g;
          b = rgb.b;
          break;
        }
        case "alpha": {
          a = val / 1e5;
          break;
        }
        case "alphaOff": {
          a = clamp(a + val / 1e5, 0, 1);
          break;
        }
        case "alphaMod": {
          a = clamp(a * val / 1e5, 0, 1);
          break;
        }
        case "inv": {
          r = 255 - r;
          g = 255 - g;
          b = 255 - b;
          break;
        }
        case "gray": {
          const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
          r = g = b = lum;
          break;
        }
        case "comp": {
          const hls = rgbToHls(r, g, b);
          const rgb = hlsToRgb((hls.h + 0.5) % 1, hls.l, hls.s);
          r = rgb.r;
          g = rgb.g;
          b = rgb.b;
          break;
        }
      }
    }
    return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a };
  }
  function resolveColorElement(colorEl, themeColors) {
    if (!colorEl) return null;
    const ln = colorEl.localName;
    let rgb = null;
    let a = 1;
    if (ln === "srgbClr") {
      const val = colorEl.getAttribute("val") || "";
      if (val.length >= 6) rgb = hexToRgb(val);
    } else if (ln === "schemeClr") {
      const schemeVal = colorEl.getAttribute("val") || "";
      const key = schemeVal;
      const hex = themeColors?.[key];
      if (hex) rgb = hexToRgb(hex);
      else rgb = { r: 0, g: 0, b: 0 };
    } else if (ln === "prstClr") {
      const prstVal = (colorEl.getAttribute("val") || "").toLowerCase();
      const hex = PRESET_COLORS[prstVal];
      if (hex) rgb = hexToRgb(hex);
    } else if (ln === "sysClr") {
      const lastClr = colorEl.getAttribute("lastClr");
      if (lastClr?.length >= 6) rgb = hexToRgb(lastClr);
      else rgb = { r: 0, g: 0, b: 0 };
    } else if (ln === "hslClr") {
      const h = attrInt(colorEl, "hue", 0) / 216e5;
      const s = attrInt(colorEl, "sat", 0) / 1e5;
      const l = attrInt(colorEl, "lum", 0) / 1e5;
      rgb = hlsToRgb(h, l, s);
    } else if (ln === "scRgbClr") {
      const r2 = attrInt(colorEl, "r", 0) / 1e5;
      const g2 = attrInt(colorEl, "g", 0) / 1e5;
      const b2 = attrInt(colorEl, "b", 0) / 1e5;
      rgb = {
        r: Math.round(Math.pow(r2, 1 / 2.2) * 255),
        g: Math.round(Math.pow(g2, 1 / 2.2) * 255),
        b: Math.round(Math.pow(b2, 1 / 2.2) * 255)
      };
    }
    if (!rgb) return null;
    return applyColorTransforms({ ...rgb, a }, colorEl);
  }
  function colorToCss(c, alphaOverride) {
    if (!c) return "transparent";
    const a = alphaOverride !== void 0 ? alphaOverride : c.a ?? 1;
    return a < 1 ? `rgba(${c.r},${c.g},${c.b},${a.toFixed(3)})` : `rgb(${c.r},${c.g},${c.b})`;
  }
  function findFirstColorChild(el) {
    if (!el) return null;
    const tags = ["srgbClr", "schemeClr", "prstClr", "sysClr", "hslClr", "scRgbClr"];
    for (const tag of tags) {
      const child = g1(el, tag);
      if (child) return child;
    }
    return null;
  }
  function getRunColor(rPr, themeColors) {
    if (!rPr) return null;
    const solidFill = g1(rPr, "solidFill");
    if (!solidFill) return null;
    const colorChild = findFirstColorChild(solidFill);
    const c = resolveColorElement(colorChild, themeColors);
    return c ? colorToCss(c) : null;
  }
  function getRunColorInherited(rPr, paraDefRPr, themeColors) {
    const c1 = getRunColor(rPr, themeColors);
    if (c1) return c1;
    return getRunColor(paraDefRPr, themeColors);
  }
  var PRESET_COLORS;
  var init_colors = __esm({
    "node_modules/pptx-browser/src/colors.js"() {
      init_utils();
      PRESET_COLORS = {
        black: "000000",
        white: "FFFFFF",
        red: "FF0000",
        green: "008000",
        blue: "0000FF",
        yellow: "FFFF00",
        cyan: "00FFFF",
        magenta: "FF00FF",
        orange: "FFA500",
        purple: "800080",
        pink: "FFC0CB",
        brown: "A52A2A",
        gray: "808080",
        grey: "808080",
        navy: "000080",
        teal: "008080",
        maroon: "800000",
        olive: "808000",
        lime: "00FF00",
        aqua: "00FFFF",
        fuchsia: "FF00FF",
        silver: "C0C0C0",
        coral: "FF7F50",
        salmon: "FA8072",
        gold: "FFD700",
        khaki: "F0E68C",
        lavender: "E6E6FA",
        beige: "F5F5DC",
        ivory: "FFFFF0",
        mintcream: "F5FFFA",
        azure: "F0FFFF",
        aliceblue: "F0F8FF",
        ghostwhite: "F8F8FF",
        darkred: "8B0000",
        darkgreen: "006400",
        darkblue: "00008B",
        darkcyan: "008B8B",
        darkmagenta: "8B008B",
        darkorange: "FF8C00",
        darkgray: "A9A9A9",
        darkgrey: "A9A9A9",
        lightgray: "D3D3D3",
        lightgrey: "D3D3D3",
        lightblue: "ADD8E6",
        lightgreen: "90EE90",
        lightpink: "FFB6C1",
        lightyellow: "FFFFE0",
        lightcyan: "E0FFFF",
        deepskyblue: "00BFFF",
        royalblue: "4169E1",
        steelblue: "4682B4",
        skyblue: "87CEEB",
        dodgerblue: "1E90FF",
        cornflowerblue: "6495ED",
        mediumblue: "0000CD",
        midnightblue: "191970",
        indigo: "4B0082",
        slateblue: "6A5ACD",
        blueviolet: "8A2BE2",
        mediumpurple: "9370DB",
        orchid: "DA70D6",
        violet: "EE82EE",
        plum: "DDA0DD",
        thistle: "D8BFD8",
        hotpink: "FF69B4",
        deeppink: "FF1493",
        crimson: "DC143C",
        firebrick: "B22222",
        tomato: "FF6347",
        orangered: "FF4500",
        darkorange2: "FF8C00",
        chocolate: "D2691E",
        saddlebrown: "8B4513",
        sienna: "A0522D",
        tan: "D2B48C",
        burlywood: "DEB887",
        wheat: "F5DEB3",
        moccasin: "FFE4B5",
        peachpuff: "FFDAB9",
        papayawhip: "FFEFD5",
        mistyrose: "FFE4E1",
        linen: "FAF0E6",
        oldlace: "FDF5E6",
        floralwhite: "FFFAF0",
        antiquewhite: "FAEBD7",
        bisque: "FFE4C4",
        blanchedalmond: "FFEBCD",
        cornsilk: "FFF8DC",
        lemonchiffon: "FFFACD",
        honeydew: "F0FFF0",
        palegreen: "98FB98",
        lightseagreen: "20B2AA",
        mediumseagreen: "3CB371",
        seagreen: "2E8B57",
        forestgreen: "228B22",
        yellowgreen: "9ACD32",
        olivedrab: "6B8E23",
        greenyellow: "ADFF2F",
        chartreuse: "7FFF00",
        springgreen: "00FF7F",
        mediumspringgreen: "00FA9A",
        aquamarine: "7FFFD4",
        turquoise: "40E0D0",
        mediumturquoise: "48D1CC",
        paleturquoise: "AFEEEE",
        cadetblue: "5F9EA0",
        powderblue: "B0E0E6",
        lightsteelblue: "B0C4DE",
        slategray: "708090",
        slategrey: "708090",
        dimgray: "696969",
        dimgrey: "696969",
        snow: "FFFAFA",
        seashell: "FFF5EE",
        whitesmoke: "F5F5F5",
        gainsboro: "DCDCDC"
      };
    }
  });

  // node_modules/pptx-browser/src/shapes.js
  function drawPresetGeom(ctx, prst, x, y, w, h, adjValues) {
    const deg = (d) => d * Math.PI / 180;
    const adj = (idx, def = 5e4) => {
      const v = adjValues && adjValues[idx] !== void 0 ? adjValues[idx] : def;
      return v / 1e5;
    };
    const cx = x + w / 2, cy = y + h / 2;
    const ss = Math.min(w, h);
    ctx.beginPath();
    switch (prst) {
      case "rect":
      case "snip1Rect":
        ctx.rect(x, y, w, h);
        break;
      case "roundRect": {
        const r = adj(0, 16667) * ss * 0.5;
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
        break;
      }
      case "ellipse":
      case "oval":
        ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
        break;
      case "triangle":
      case "isoscelesTriangle":
        ctx.moveTo(cx, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        break;
      case "rightTriangle":
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        break;
      case "parallelogram": {
        const a1 = adj(0, 25e3);
        const off = w * a1;
        ctx.moveTo(x + off, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - off, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        break;
      }
      case "trapezoid": {
        const a1 = adj(0, 25e3);
        const off = w * a1;
        ctx.moveTo(x + off, y);
        ctx.lineTo(x + w - off, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        break;
      }
      case "diamond":
        ctx.moveTo(cx, y);
        ctx.lineTo(x + w, cy);
        ctx.lineTo(cx, y + h);
        ctx.lineTo(x, cy);
        ctx.closePath();
        break;
      case "pentagon":
        drawRegularPolygon(ctx, cx, cy, w / 2, h / 2, 5, -Math.PI / 2);
        break;
      case "hexagon":
        drawRegularPolygon(ctx, cx, cy, w / 2, h / 2, 6, 0);
        break;
      case "heptagon":
        drawRegularPolygon(ctx, cx, cy, w / 2, h / 2, 7, -Math.PI / 2);
        break;
      case "octagon":
        drawRegularPolygon(ctx, cx, cy, w / 2, h / 2, 8, Math.PI / 8);
        break;
      case "decagon":
        drawRegularPolygon(ctx, cx, cy, w / 2, h / 2, 10, -Math.PI / 2);
        break;
      case "dodecagon":
        drawRegularPolygon(ctx, cx, cy, w / 2, h / 2, 12, 0);
        break;
      case "plus":
      case "cross": {
        const a1 = adj(0, 25e3);
        const t = ss * a1;
        const bx = cx - t / 2, tx = cx + t / 2;
        const by = cy - t / 2, ty = cy + t / 2;
        ctx.moveTo(bx, y);
        ctx.lineTo(tx, y);
        ctx.lineTo(tx, by);
        ctx.lineTo(x + w, by);
        ctx.lineTo(x + w, ty);
        ctx.lineTo(tx, ty);
        ctx.lineTo(tx, y + h);
        ctx.lineTo(bx, y + h);
        ctx.lineTo(bx, ty);
        ctx.lineTo(x, ty);
        ctx.lineTo(x, by);
        ctx.lineTo(bx, by);
        ctx.closePath();
        break;
      }
      case "star4":
        drawStar(ctx, cx, cy, w / 2, h / 2, 4, adj(0, 37500));
        break;
      case "star5":
        drawStar(ctx, cx, cy, w / 2, h / 2, 5, adj(0, 19098), -Math.PI / 2);
        break;
      case "star6":
        drawStar(ctx, cx, cy, w / 2, h / 2, 6, adj(0, 28868), 0);
        break;
      case "star7":
        drawStar(ctx, cx, cy, w / 2, h / 2, 7, adj(0, 34601), -Math.PI / 2);
        break;
      case "star8":
        drawStar(ctx, cx, cy, w / 2, h / 2, 8, adj(0, 29289), Math.PI / 8);
        break;
      case "star10":
        drawStar(ctx, cx, cy, w / 2, h / 2, 10, adj(0, 30902), -Math.PI / 2);
        break;
      case "star12":
        drawStar(ctx, cx, cy, w / 2, h / 2, 12, adj(0, 37720), 0);
        break;
      case "star16":
        drawStar(ctx, cx, cy, w / 2, h / 2, 16, adj(0, 37500), 0);
        break;
      case "star24":
        drawStar(ctx, cx, cy, w / 2, h / 2, 24, adj(0, 37500), 0);
        break;
      case "star32":
        drawStar(ctx, cx, cy, w / 2, h / 2, 32, adj(0, 37500), 0);
        break;
      case "rightArrow": {
        const ah = adj(0, 5e4);
        const aw = adj(1, 5e4);
        const bh = (h - h * aw) / 2;
        const nb = (h * aw - h) / 2;
        const ax = x + w * (1 - ah);
        ctx.moveTo(x, y + bh);
        ctx.lineTo(ax, y + bh);
        ctx.lineTo(ax, y);
        ctx.lineTo(x + w, cy);
        ctx.lineTo(ax, y + h);
        ctx.lineTo(ax, y + h - bh);
        ctx.lineTo(x, y + h - bh);
        ctx.closePath();
        break;
      }
      case "leftArrow": {
        const ah = adj(0, 5e4);
        const aw = adj(1, 5e4);
        const bh = (h - h * aw) / 2;
        const ax = x + w * ah;
        ctx.moveTo(x + w, y + bh);
        ctx.lineTo(ax, y + bh);
        ctx.lineTo(ax, y);
        ctx.lineTo(x, cy);
        ctx.lineTo(ax, y + h);
        ctx.lineTo(ax, y + h - bh);
        ctx.lineTo(x + w, y + h - bh);
        ctx.closePath();
        break;
      }
      case "upArrow": {
        const ah = adj(0, 5e4);
        const aw = adj(1, 5e4);
        const bw = (w - w * aw) / 2;
        const ay = y + h * ah;
        ctx.moveTo(x + bw, y + h);
        ctx.lineTo(x + bw, ay);
        ctx.lineTo(x, ay);
        ctx.lineTo(cx, y);
        ctx.lineTo(x + w, ay);
        ctx.lineTo(x + w - bw, ay);
        ctx.lineTo(x + w - bw, y + h);
        ctx.closePath();
        break;
      }
      case "downArrow": {
        const ah = adj(0, 5e4);
        const aw = adj(1, 5e4);
        const bw = (w - w * aw) / 2;
        const ay = y + h * (1 - ah);
        ctx.moveTo(x + bw, y);
        ctx.lineTo(x + bw, ay);
        ctx.lineTo(x, ay);
        ctx.lineTo(cx, y + h);
        ctx.lineTo(x + w, ay);
        ctx.lineTo(x + w - bw, ay);
        ctx.lineTo(x + w - bw, y);
        ctx.closePath();
        break;
      }
      case "leftRightArrow": {
        const ah = adj(0, 25e3);
        const aw = adj(1, 5e4);
        const bh = (h - h * aw) / 2;
        const lax = x + w * ah;
        const rax = x + w * (1 - ah);
        ctx.moveTo(x, cy);
        ctx.lineTo(lax, y);
        ctx.lineTo(lax, y + bh);
        ctx.lineTo(rax, y + bh);
        ctx.lineTo(rax, y);
        ctx.lineTo(x + w, cy);
        ctx.lineTo(rax, y + h);
        ctx.lineTo(rax, y + h - bh);
        ctx.lineTo(lax, y + h - bh);
        ctx.lineTo(lax, y + h);
        ctx.closePath();
        break;
      }
      case "upDownArrow": {
        const ah = adj(0, 25e3);
        const aw = adj(1, 5e4);
        const bw = (w - w * aw) / 2;
        const tay = y + h * ah;
        const bay = y + h * (1 - ah);
        ctx.moveTo(cx, y);
        ctx.lineTo(x + w, tay);
        ctx.lineTo(x + w - bw, tay);
        ctx.lineTo(x + w - bw, bay);
        ctx.lineTo(x + w, bay);
        ctx.lineTo(cx, y + h);
        ctx.lineTo(x, bay);
        ctx.lineTo(x + bw, bay);
        ctx.lineTo(x + bw, tay);
        ctx.lineTo(x, tay);
        ctx.closePath();
        break;
      }
      case "chevron": {
        const a = adj(0, 5e4);
        const off = w * a;
        ctx.moveTo(x, y);
        ctx.lineTo(x + w - off, y);
        ctx.lineTo(x + w, cy);
        ctx.lineTo(x + w - off, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x + off, cy);
        ctx.closePath();
        break;
      }
      case "pentagon5":
      // not standard but some files use it
      case "homePlate": {
        const a = adj(0, 5e4);
        ctx.moveTo(x, y);
        ctx.lineTo(x + w * (1 - a), y);
        ctx.lineTo(x + w, cy);
        ctx.lineTo(x + w * (1 - a), y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        break;
      }
      case "arc": {
        const stAng = adj(0, 162e5 / 6e4) * Math.PI / 180;
        const swAng = adj(1, 288e5 / 6e4) * Math.PI / 180;
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, Math.min(w, h) / 2, stAng, stAng + swAng);
        ctx.closePath();
        break;
      }
      case "blockArc": {
        const stAng = (adj(0, 0) * 360 - 90) * Math.PI / 180;
        const swAng = adj(1, 25e3) * 360 * Math.PI / 180;
        const tck = adj(2, 25e3) * Math.min(w, h) / 2;
        const outerR = Math.min(w, h) / 2;
        const innerR = outerR - tck;
        ctx.moveTo(cx + outerR * Math.cos(stAng), cy + outerR * Math.sin(stAng));
        ctx.arc(cx, cy, outerR, stAng, stAng + swAng);
        ctx.arc(cx, cy, Math.max(1, innerR), stAng + swAng, stAng, true);
        ctx.closePath();
        break;
      }
      case "line":
      case "straightConnector1":
        ctx.moveTo(x, cy);
        ctx.lineTo(x + w, cy);
        break;
      case "bentConnector3":
      case "bentConnector4":
      case "bentConnector5":
      case "elbowConnector":
        ctx.moveTo(x, y);
        ctx.lineTo(x, cy);
        ctx.lineTo(x + w, cy);
        ctx.lineTo(x + w, y + h);
        break;
      case "curvedConnector3":
      case "curvedConnector4":
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x, y + h / 2, x + w, y + h / 2, x + w, y + h);
        break;
      case "heart": {
        drawHeart(ctx, x, y, w, h);
        break;
      }
      case "lightningBolt": {
        ctx.moveTo(x + w * 0.6, y);
        ctx.lineTo(x + w * 0.2, y + h * 0.45);
        ctx.lineTo(x + w * 0.5, y + h * 0.45);
        ctx.lineTo(x + w * 0.4, y + h);
        ctx.lineTo(x + w * 0.8, y + h * 0.55);
        ctx.lineTo(x + w * 0.5, y + h * 0.55);
        ctx.closePath();
        break;
      }
      case "moon": {
        ctx.arc(cx + w * 0.1, cy, h * 0.5, deg(-120), deg(120));
        ctx.arc(cx + w * 0.4, cy, h * 0.45, deg(120), deg(-120), true);
        ctx.closePath();
        break;
      }
      case "noSmoking": {
        const r = Math.min(w, h) / 2;
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.moveTo(cx - r * 0.7, cy + r * 0.7);
        ctx.lineTo(cx + r * 0.7, cy - r * 0.7);
        break;
      }
      case "flowChartProcess":
        ctx.rect(x, y, w, h);
        break;
      case "flowChartDecision":
        ctx.moveTo(cx, y);
        ctx.lineTo(x + w, cy);
        ctx.lineTo(cx, y + h);
        ctx.lineTo(x, cy);
        ctx.closePath();
        break;
      case "flowChartTerminator": {
        const r2 = h / 2;
        ctx.moveTo(x + r2, y);
        ctx.lineTo(x + w - r2, y);
        ctx.arc(x + w - r2, cy, r2, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(x + r2, y + h);
        ctx.arc(x + r2, cy, r2, Math.PI / 2, -Math.PI / 2);
        ctx.closePath();
        break;
      }
      case "flowChartDocument": {
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + h * 0.8);
        ctx.bezierCurveTo(x + w * 0.75, y + h * 0.8, x + w * 0.75, y + h, x + w * 0.5, y + h);
        ctx.bezierCurveTo(x + w * 0.25, y + h, x + w * 0.25, y + h * 0.8, x, y + h * 0.8);
        ctx.closePath();
        break;
      }
      case "flowChartDatabase":
      case "cylinder": {
        const ry = h * 0.1;
        ctx.moveTo(x, y + ry);
        ctx.ellipse(cx, y + ry, w / 2, ry, 0, Math.PI, 0);
        ctx.lineTo(x + w, y + h - ry);
        ctx.ellipse(cx, y + h - ry, w / 2, ry, 0, 0, Math.PI);
        ctx.closePath();
        break;
      }
      case "cube": {
        const d = w * 0.15;
        ctx.moveTo(x + d, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + h - d);
        ctx.lineTo(x + w - d, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + d);
        ctx.closePath();
        ctx.moveTo(x + d, y);
        ctx.lineTo(x + d, y + d);
        ctx.lineTo(x, y + d);
        ctx.moveTo(x + d, y + d);
        ctx.lineTo(x + w, y + d);
        break;
      }
      case "callout1":
      case "borderCallout1":
      case "wedgeRectCallout": {
        ctx.rect(x, y, w, h * 0.8);
        ctx.moveTo(cx - w * 0.1, y + h * 0.8);
        ctx.lineTo(cx, y + h);
        ctx.lineTo(cx + w * 0.1, y + h * 0.8);
        ctx.closePath();
        break;
      }
      case "wedgeRoundRectCallout": {
        const r3 = h * 0.05;
        ctx.moveTo(x + r3, y);
        ctx.lineTo(x + w - r3, y);
        ctx.arcTo(x + w, y, x + w, y + r3, r3);
        ctx.lineTo(x + w, y + h * 0.75 - r3);
        ctx.arcTo(x + w, y + h * 0.75, x + w - r3, y + h * 0.75, r3);
        ctx.lineTo(cx + w * 0.1, y + h * 0.75);
        ctx.lineTo(cx, y + h);
        ctx.lineTo(cx - w * 0.1, y + h * 0.75);
        ctx.lineTo(x + r3, y + h * 0.75);
        ctx.arcTo(x, y + h * 0.75, x, y + h * 0.75 - r3, r3);
        ctx.lineTo(x, y + r3);
        ctx.arcTo(x, y, x + r3, y, r3);
        ctx.closePath();
        break;
      }
      case "wedgeEllipseCallout": {
        ctx.ellipse(cx, cy - h * 0.05, w / 2, h * 0.45, 0, 0, Math.PI * 2);
        ctx.moveTo(cx - w * 0.1, cy + h * 0.4);
        ctx.lineTo(cx, y + h);
        ctx.lineTo(cx + w * 0.1, cy + h * 0.4);
        ctx.closePath();
        break;
      }
      case "cloudCallout":
      case "cloud": {
        ctx.beginPath();
        const cBumps = [
          { cx: cx - w * 0.22, cy: cy - h * 0.12, r: w * 0.16 },
          { cx: cx - w * 0.07, cy: cy - h * 0.22, r: w * 0.18 },
          { cx: cx + w * 0.1, cy: cy - h * 0.22, r: w * 0.17 },
          { cx: cx + w * 0.25, cy: cy - h * 0.12, r: w * 0.15 },
          { cx: cx + w * 0.35, cy: cy + h * 0.05, r: w * 0.13 },
          { cx: cx - w * 0.3, cy: cy + h * 0.05, r: w * 0.13 }
        ];
        for (const b of cBumps) ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2);
        ctx.rect(cx - w * 0.35, cy, w * 0.7, h * 0.25);
        break;
      }
      case "smileyFace": {
        ctx.arc(cx, cy, Math.min(w, h) / 2, 0, Math.PI * 2);
        break;
      }
      case "donut": {
        const r4 = Math.min(w, h) / 2;
        const ir = r4 * adj(0, 25e3);
        ctx.arc(cx, cy, r4, 0, Math.PI * 2);
        ctx.arc(cx, cy, ir, Math.PI * 2, 0, true);
        break;
      }
      case "bracketPair": {
        const r5 = w * 0.2;
        ctx.moveTo(x + r5, y);
        ctx.arcTo(x, y, x, y + r5, r5);
        ctx.lineTo(x, y + h - r5);
        ctx.arcTo(x, y + h, x + r5, y + h, r5);
        ctx.moveTo(x + w - r5, y);
        ctx.arcTo(x + w, y, x + w, y + r5, r5);
        ctx.lineTo(x + w, y + h - r5);
        ctx.arcTo(x + w, y + h, x + w - r5, y + h, r5);
        break;
      }
      case "bracePair": {
        const r6 = h * 0.15;
        ctx.moveTo(cx - w * 0.35, y);
        ctx.bezierCurveTo(cx - w * 0.45, y, cx - w * 0.45, y, cx - w * 0.45, y + r6);
        ctx.lineTo(cx - w * 0.45, cy - r6);
        ctx.bezierCurveTo(cx - w * 0.45, cy, cx - w * 0.5, cy, cx - w * 0.5, cy);
        ctx.bezierCurveTo(cx - w * 0.5, cy, cx - w * 0.45, cy, cx - w * 0.45, cy + r6);
        ctx.lineTo(cx - w * 0.45, y + h - r6);
        ctx.bezierCurveTo(cx - w * 0.45, y + h, cx - w * 0.35, y + h, cx - w * 0.35, y + h);
        break;
      }
      case "irregularSeal1":
      case "irregularSeal2": {
        drawStar(ctx, cx, cy, w / 2, h / 2, 12, adj(0, 42533), 0);
        break;
      }
      case "accentCallout1":
      case "accentCallout2":
      case "calloutWedgeRect":
        ctx.rect(x, y, w, h);
        break;
      case "flowChartAlternateProcess": {
        const r7 = h * 0.15;
        ctx.moveTo(x + r7, y);
        ctx.lineTo(x + w - r7, y);
        ctx.arcTo(x + w, y, x + w, y + r7, r7);
        ctx.lineTo(x + w, y + h - r7);
        ctx.arcTo(x + w, y + h, x + w - r7, y + h, r7);
        ctx.lineTo(x + r7, y + h);
        ctx.arcTo(x, y + h, x, y + h - r7, r7);
        ctx.lineTo(x, y + r7);
        ctx.arcTo(x, y, x + r7, y, r7);
        ctx.closePath();
        break;
      }
      case "flowChartConnector":
        ctx.arc(cx, cy, Math.min(w, h) / 2, 0, Math.PI * 2);
        break;
      case "flowChartInputOutput": {
        const off2 = w * 0.2;
        ctx.moveTo(x + off2, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - off2, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        break;
      }
      case "flowChartPredefinedProcess": {
        ctx.rect(x, y, w, h);
        ctx.moveTo(x + w * 0.1, y);
        ctx.lineTo(x + w * 0.1, y + h);
        ctx.moveTo(x + w * 0.9, y);
        ctx.lineTo(x + w * 0.9, y + h);
        break;
      }
      case "flowChartManualInput": {
        ctx.moveTo(x, y + h * 0.2);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        break;
      }
      case "flowChartPreparation": {
        const off3 = w * 0.2;
        ctx.moveTo(x + off3, y);
        ctx.lineTo(x + w - off3, y);
        ctx.lineTo(x + w, cy);
        ctx.lineTo(x + w - off3, y + h);
        ctx.lineTo(x + off3, y + h);
        ctx.lineTo(x, cy);
        ctx.closePath();
        break;
      }
      case "ribbon":
      case "ribbon2": {
        const notchH = h * 0.3;
        ctx.moveTo(x, y + notchH / 2);
        ctx.lineTo(x + w * 0.1, y);
        ctx.lineTo(x + w * 0.1, y + h - notchH);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x + w * 0.5, y + h - notchH);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + w - w * 0.1, y + h - notchH);
        ctx.lineTo(x + w - w * 0.1, y);
        ctx.lineTo(x + w, y + notchH / 2);
        ctx.lineTo(x + w * 0.5, y + notchH);
        ctx.closePath();
        break;
      }
      case "ellipseRibbon":
      case "ellipseRibbon2": {
        ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
        break;
      }
      case "teardrop": {
        const tr = Math.min(w, h) * 0.45;
        ctx.arc(cx, cy + tr, tr, -Math.PI, 0);
        ctx.bezierCurveTo(cx + tr, cy + tr - tr * 0.55, cx + tr * 0.1, cy - h * 0.4, cx, y);
        ctx.bezierCurveTo(cx - tr * 0.1, cy - h * 0.4, cx - tr, cy + tr - tr * 0.55, cx - tr, cy + tr);
        ctx.closePath();
        break;
      }
      default:
        ctx.rect(x, y, w, h);
        return false;
    }
    return true;
  }
  function drawRegularPolygon(ctx, cx, cy, rx, ry, n, startAngle = 0) {
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i / n * Math.PI * 2;
      const px2 = cx + rx * Math.cos(angle);
      const py = cy + ry * Math.sin(angle);
      if (i === 0) ctx.moveTo(px2, py);
      else ctx.lineTo(px2, py);
    }
    ctx.closePath();
  }
  function drawStar(ctx, cx, cy, rx, ry, points, innerRatio = 0.5, startAngle = -Math.PI / 2) {
    for (let i = 0; i < points * 2; i++) {
      const angle = startAngle + i / (points * 2) * Math.PI * 2;
      const isInner = i % 2 === 1;
      const r_x = isInner ? rx * innerRatio : rx;
      const r_y = isInner ? ry * innerRatio : ry;
      const px2 = cx + r_x * Math.cos(angle);
      const py = cy + r_y * Math.sin(angle);
      if (i === 0) ctx.moveTo(px2, py);
      else ctx.lineTo(px2, py);
    }
    ctx.closePath();
  }
  function drawHeart(ctx, x, y, w, h) {
    ctx.beginPath();
    const tx = x + w / 2;
    const topY = y + h * 0.25;
    ctx.moveTo(tx, y + h * 0.9);
    ctx.bezierCurveTo(
      x - w * 0.1,
      y + h * 0.6,
      x - w * 0.1,
      topY - h * 0.05,
      tx - w * 0.25,
      topY - h * 0.1
    );
    ctx.bezierCurveTo(
      tx - w * 0.5 + w * 0.05,
      y + h * 0.05,
      tx - w * 0.03,
      y + h * 0.05,
      tx,
      topY - h * 0.15
    );
    ctx.bezierCurveTo(
      tx + w * 0.03,
      y + h * 0.05,
      tx + w * 0.5 - w * 0.05,
      y + h * 0.05,
      tx + w * 0.25,
      topY - h * 0.1
    );
    ctx.bezierCurveTo(
      x + w * 1.1,
      topY - h * 0.05,
      x + w * 1.1,
      y + h * 0.6,
      tx,
      y + h * 0.9
    );
    ctx.closePath();
  }
  var init_shapes = __esm({
    "node_modules/pptx-browser/src/shapes.js"() {
    }
  });

  // node_modules/pptx-browser/src/charts.js
  function cv(el) {
    const t = el?.textContent?.trim();
    if (t === void 0 || t === null || t === "") return null;
    const n = parseFloat(t);
    return isNaN(n) ? t : n;
  }
  function readCache(cacheEl) {
    if (!cacheEl) return [];
    const count = attrInt(g1(cacheEl, "ptCount"), "val", 0);
    const result = new Array(count).fill(null);
    for (const pt of gtn(cacheEl, "pt")) {
      const idx = attrInt(pt, "idx", 0);
      result[idx] = cv(g1(pt, "v"));
    }
    return result;
  }
  function seriesName(ser) {
    const tx = g1(ser, "tx");
    if (!tx) return null;
    const v = g1(tx, "v");
    if (v) return v.textContent.trim();
    const strCache = g1(tx, "strCache");
    if (strCache) {
      const pt = g1(strCache, "pt");
      const vEl = pt ? g1(pt, "v") : null;
      return vEl ? vEl.textContent.trim() : null;
    }
    return null;
  }
  function readCategories(ser) {
    const catEl = g1(ser, "cat") || g1(ser, "xVal");
    if (!catEl) return [];
    return readCache(g1(catEl, "strCache") || g1(catEl, "numCache"));
  }
  function readValues(ser) {
    const valEl = g1(ser, "val") || g1(ser, "yVal");
    if (!valEl) return [];
    return readCache(g1(valEl, "numCache"));
  }
  function seriesColor(ser, idx, themeColors) {
    const spPr = g1(ser, "spPr");
    if (spPr) {
      const solidFill = g1(spPr, "solidFill");
      if (solidFill) {
        const colorChild = findFirstColorChild(solidFill);
        const c = resolveColorElement(colorChild, themeColors);
        if (c) return colorToCss(c);
      }
    }
    const accentKey = `accent${idx % 6 + 1}`;
    if (themeColors[accentKey]) {
      const rgb = themeColors[accentKey];
      return `#${rgb}`;
    }
    return DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
  }
  function dataPointColors(ser, themeColors) {
    const map = {};
    for (const dPt of gtn(ser, "dPt")) {
      const idx = attrInt(g1(dPt, "idx"), "val", -1);
      if (idx < 0) continue;
      const spPr = g1(dPt, "spPr");
      if (!spPr) continue;
      const solidFill = g1(spPr, "solidFill");
      if (!solidFill) continue;
      const colorChild = findFirstColorChild(solidFill);
      const c = resolveColorElement(colorChild, themeColors);
      if (c) map[idx] = colorToCss(c);
    }
    return map;
  }
  function chartBounds(cx, cy, cw, ch, opts = {}) {
    const {
      padL = 0.12,
      padR = 0.06,
      padT = 0.08,
      padB = 0.1,
      legendH = 0.1,
      hasLegend = true,
      hasTitle = false
    } = opts;
    const tOffset = hasTitle ? ch * 0.08 : 0;
    const lOffset = hasLegend ? ch * legendH : 0;
    return {
      x: cx + cw * padL,
      y: cy + ch * padT + tOffset,
      w: cw * (1 - padL - padR),
      h: ch * (1 - padT - padB) - lOffset - tOffset,
      legendY: cy + ch * (1 - legendH * 0.7)
    };
  }
  function roundRect(ctx, x, y, w, h, r = 3) {
    if (w < 0) {
      x += w;
      w = -w;
    }
    if (h < 0) {
      y += h;
      h = -h;
    }
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawAxisLine(ctx, x1, y1, x2, y2, color = "#999", width = 0.7) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }
  function drawGridLine(ctx, x1, y1, x2, y2) {
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  function niceStep(range, targetTicks = 5) {
    const rough = range / targetTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    let step;
    if (norm < 1.5) step = 1;
    else if (norm < 3.5) step = 2;
    else if (norm < 7.5) step = 5;
    else step = 10;
    return step * mag;
  }
  function calcAxisRange(values, forceZero = true) {
    const flat = values.filter((v) => typeof v === "number" && isFinite(v));
    if (!flat.length) return { min: 0, max: 100, step: 20 };
    let min = forceZero ? Math.min(0, ...flat) : Math.min(...flat);
    let max = Math.max(...flat);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const step = niceStep(max - min);
    max = Math.ceil(max / step) * step;
    min = Math.floor(min / step) * step;
    return { min, max, step };
  }
  function fmtLabel(n) {
    if (typeof n !== "number") return String(n ?? "");
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(1);
  }
  function drawLegend(ctx, cx, cy, cw, legendY, series, scale) {
    if (!series.length) return;
    const sz = Math.max(8, Math.min(14, cw * 0.025)) * scale;
    const itemW = cw / Math.max(series.length, 1);
    ctx.save();
    ctx.font = `${sz}px sans-serif`;
    ctx.textBaseline = "middle";
    for (let i = 0; i < series.length; i++) {
      if (!series[i].name) continue;
      const lx = cx + itemW * i + sz * 0.5;
      ctx.fillStyle = series[i].color;
      roundRect(ctx, lx, legendY - sz / 2, sz * 1.2, sz);
      ctx.fill();
      ctx.fillStyle = "#444";
      ctx.fillText(series[i].name, lx + sz * 1.5, legendY);
    }
    ctx.restore();
  }
  function renderBarChart(ctx, chartEl, cx, cy, cw, ch, themeColors, scale) {
    const barChart = g1(chartEl, "barChart") || g1(chartEl, "bar3DChart");
    const isColumn = !barChart || attr(barChart, "barDir", "col") !== "bar";
    const grouping = attr(barChart, "grouping", "clustered");
    const isStacked = grouping === "stacked" || grouping === "percentStacked";
    const isPct = grouping === "percentStacked";
    const serEls = gtn(barChart, "ser");
    const seriesData = serEls.map((s, i) => ({
      name: seriesName(s),
      values: readValues(s),
      color: seriesColor(s, i, themeColors),
      dptColors: dataPointColors(s, themeColors)
    }));
    if (!seriesData.length) return;
    const cats = readCategories(serEls[0]) || [];
    const numCats = Math.max(cats.length, seriesData[0]?.values.length || 0, 1);
    const b = chartBounds(cx, cy, cw, ch, { hasLegend: seriesData.length > 1 });
    let axisVals;
    if (isStacked) {
      axisVals = Array.from({ length: numCats }, (_, ci) => seriesData.reduce((s, ser) => s + (ser.values[ci] || 0), 0));
      if (isPct) axisVals = axisVals.map(() => 100);
    } else {
      axisVals = seriesData.flatMap((s) => s.values);
    }
    const range = calcAxisRange(axisVals);
    const fontSize = Math.max(7, Math.min(11, b.w * 0.018)) * scale;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = "middle";
    const valueSteps = Math.round((range.max - range.min) / range.step);
    const axisLabelPad = isColumn ? b.x * 0.35 : b.h * 0.15;
    if (isColumn) {
      ctx.save();
      ctx.textAlign = "right";
      ctx.fillStyle = "#666";
      for (let t = 0; t <= valueSteps; t++) {
        const val = range.min + t * range.step;
        const pct = (val - range.min) / (range.max - range.min);
        const gy = b.y + b.h - pct * b.h;
        drawGridLine(ctx, b.x, gy, b.x + b.w, gy);
        ctx.fillText(isPct ? val + "%" : fmtLabel(val), b.x - 4 * scale, gy);
      }
      ctx.restore();
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = "#666";
      const barGroupW = b.w / numCats;
      for (let ci = 0; ci < numCats; ci++) {
        const lx = b.x + barGroupW * ci + barGroupW / 2;
        const label = String(cats[ci] ?? ci + 1);
        ctx.fillText(label, lx, b.y + b.h + fontSize * 1.5);
      }
      ctx.restore();
      drawAxisLine(ctx, b.x, b.y, b.x, b.y + b.h);
      drawAxisLine(ctx, b.x, b.y + b.h, b.x + b.w, b.y + b.h);
      const barGroupW2 = b.w / numCats;
      const gap = barGroupW2 * 0.15;
      const groupInner = barGroupW2 - gap * 2;
      const barW = isStacked ? groupInner : groupInner / seriesData.length;
      for (let ci = 0; ci < numCats; ci++) {
        const gx = b.x + barGroupW2 * ci + gap;
        let stackBase = 0;
        for (let si = 0; si < seriesData.length; si++) {
          const ser = seriesData[si];
          let val = ser.values[ci] ?? 0;
          if (isPct) {
            const total = seriesData.reduce((s, ss) => s + (ss.values[ci] || 0), 0);
            val = total ? val / total * 100 : 0;
          }
          const color = ser.dptColors[ci] || ser.color;
          const barH = Math.abs(val) / (range.max - range.min) * b.h;
          const bx = isStacked ? gx : gx + si * barW;
          const basePct = isStacked ? (stackBase - range.min) / (range.max - range.min) : Math.max(0, -range.min) / (range.max - range.min);
          const baseY = b.y + b.h - basePct * b.h;
          const barY = val >= 0 ? baseY - barH : baseY;
          ctx.save();
          ctx.fillStyle = color;
          roundRect(ctx, bx, barY, isStacked ? groupInner : barW - 1 * scale, barH, 2 * scale);
          ctx.fill();
          const shine = ctx.createLinearGradient(bx, barY, bx, barY + barH * 0.3);
          shine.addColorStop(0, "rgba(255,255,255,0.18)");
          shine.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = shine;
          ctx.fill();
          ctx.restore();
          if (isStacked) stackBase += Math.abs(val);
        }
      }
    } else {
      ctx.save();
      ctx.textAlign = "right";
      ctx.fillStyle = "#666";
      const barGroupH = b.h / numCats;
      for (let ci = 0; ci < numCats; ci++) {
        const ly = b.y + barGroupH * ci + barGroupH / 2;
        const label = String(cats[ci] ?? ci + 1);
        ctx.fillText(label, b.x - 4 * scale, ly);
      }
      ctx.restore();
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = "#666";
      for (let t = 0; t <= valueSteps; t++) {
        const val = range.min + t * range.step;
        const pct = (val - range.min) / (range.max - range.min);
        const gx = b.x + pct * b.w;
        drawGridLine(ctx, gx, b.y, gx, b.y + b.h);
        ctx.fillText(isPct ? val + "%" : fmtLabel(val), gx, b.y + b.h + fontSize * 1.5);
      }
      ctx.restore();
      drawAxisLine(ctx, b.x, b.y + b.h, b.x + b.w, b.y + b.h);
      drawAxisLine(ctx, b.x, b.y, b.x, b.y + b.h);
      const gap = barGroupH * 0.15;
      const groupInner = barGroupH - gap * 2;
      const barH = isStacked ? groupInner : groupInner / seriesData.length;
      const zeroX = b.x + -range.min / (range.max - range.min) * b.w;
      for (let ci = 0; ci < numCats; ci++) {
        const gy = b.y + barGroupH * ci + gap;
        let stackBase = 0;
        for (let si = 0; si < seriesData.length; si++) {
          const ser = seriesData[si];
          let val = ser.values[ci] ?? 0;
          if (isPct) {
            const total = seriesData.reduce((s, ss) => s + (ss.values[ci] || 0), 0);
            val = total ? val / total * 100 : 0;
          }
          const color = ser.dptColors[ci] || ser.color;
          const barW = Math.abs(val) / (range.max - range.min) * b.w;
          const by = isStacked ? gy : gy + si * barH;
          const baseX = isStacked ? zeroX + stackBase / (range.max - range.min) * b.w : zeroX;
          const bx = val >= 0 ? baseX : baseX - barW;
          ctx.save();
          ctx.fillStyle = color;
          roundRect(ctx, bx, by, barW, isStacked ? groupInner : barH - 1 * scale, 2 * scale);
          ctx.fill();
          ctx.restore();
          if (isStacked) stackBase += Math.abs(val);
        }
      }
    }
    if (seriesData.length > 1) {
      drawLegend(ctx, cx, cy, cw, b.legendY, seriesData, scale);
    }
  }
  function renderLineChart(ctx, chartEl, cx, cy, cw, ch, themeColors, scale) {
    const lineChart = g1(chartEl, "lineChart") || g1(chartEl, "line3DChart");
    const serEls = gtn(lineChart, "ser");
    const seriesData = serEls.map((s, i) => ({
      name: seriesName(s),
      values: readValues(s),
      color: seriesColor(s, i, themeColors),
      marker: attr(g1(s, "marker"), "symbol", "none") !== "none",
      smooth: attr(g1(s, "smooth"), "val", "0") === "1"
    }));
    if (!seriesData.length) return;
    const cats = readCategories(serEls[0]) || [];
    const numCats = Math.max(cats.length, seriesData[0]?.values.length || 0, 1);
    const b = chartBounds(cx, cy, cw, ch, { hasLegend: true });
    const range = calcAxisRange(seriesData.flatMap((s) => s.values));
    const fontSize = Math.max(7, Math.min(11, b.w * 0.018)) * scale;
    const valueSteps = Math.round((range.max - range.min) / range.step);
    ctx.save();
    ctx.textAlign = "right";
    ctx.fillStyle = "#666";
    ctx.font = `${fontSize}px sans-serif`;
    for (let t = 0; t <= valueSteps; t++) {
      const val = range.min + t * range.step;
      const pct = (val - range.min) / (range.max - range.min);
      const gy = b.y + b.h - pct * b.h;
      drawGridLine(ctx, b.x, gy, b.x + b.w, gy);
      ctx.fillText(fmtLabel(val), b.x - 4 * scale, gy);
    }
    ctx.restore();
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#666";
    ctx.font = `${fontSize}px sans-serif`;
    for (let ci = 0; ci < numCats; ci++) {
      const gx = b.x + ci / (numCats - 1 || 1) * b.w;
      drawGridLine(ctx, gx, b.y, gx, b.y + b.h);
      const label = String(cats[ci] ?? ci + 1);
      ctx.fillText(label, gx, b.y + b.h + fontSize * 1.5);
    }
    ctx.restore();
    drawAxisLine(ctx, b.x, b.y, b.x, b.y + b.h);
    drawAxisLine(ctx, b.x, b.y + b.h, b.x + b.w, b.y + b.h);
    for (const ser of seriesData) {
      const pts = ser.values.map((v, i) => {
        const pct = numCats > 1 ? i / (numCats - 1) : 0.5;
        const vpct = (v - range.min) / (range.max - range.min);
        return { x: b.x + pct * b.w, y: b.y + b.h - vpct * b.h, v };
      }).filter((p) => typeof p.v === "number");
      if (pts.length < 2) continue;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, b.y + b.h);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.lineTo(pts[pts.length - 1].x, b.y + b.h);
      ctx.closePath();
      ctx.fillStyle = ser.color + "22";
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = ser.color;
      ctx.lineWidth = 2 * scale;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      if (ser.smooth && pts.length > 2) {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const cpx = (pts[i].x + pts[i + 1].x) / 2;
          const cpy = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, cpx, cpy);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      } else {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
      const markerR = 3.5 * scale;
      for (const p of pts) {
        ctx.save();
        ctx.fillStyle = ser.color;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5 * scale;
        ctx.beginPath();
        ctx.arc(p.x, p.y, markerR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
    drawLegend(ctx, cx, cy, cw, b.legendY, seriesData, scale);
  }
  function renderAreaChart(ctx, chartEl, cx, cy, cw, ch, themeColors, scale) {
    const areaChart = g1(chartEl, "areaChart") || g1(chartEl, "area3DChart");
    const grouping = attr(areaChart, "grouping", "standard");
    const isPct = grouping === "percentStacked";
    const isStacked = grouping === "stacked" || isPct;
    const serEls = gtn(areaChart, "ser");
    const seriesData = serEls.map((s, i) => ({
      name: seriesName(s),
      values: readValues(s),
      color: seriesColor(s, i, themeColors)
    })).reverse();
    if (!seriesData.length) return;
    const numCats = Math.max(...seriesData.map((s) => s.values.length), 1);
    const b = chartBounds(cx, cy, cw, ch, { hasLegend: true });
    let maxVal = 0;
    if (isPct) {
      maxVal = 100;
    } else {
      for (let ci = 0; ci < numCats; ci++) {
        const sum = seriesData.reduce((s, ser) => s + (ser.values[ci] || 0), 0);
        maxVal = Math.max(maxVal, sum);
      }
    }
    const range = { min: 0, max: maxVal || 100, step: niceStep(maxVal || 100) };
    const valueSteps = Math.round((range.max - range.min) / range.step);
    const fontSize = Math.max(7, Math.min(11, b.w * 0.018)) * scale;
    ctx.save();
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillStyle = "#666";
    for (let t = 0; t <= valueSteps; t++) {
      const val = range.min + t * range.step;
      const pct = (val - range.min) / (range.max - range.min);
      const gy = b.y + b.h - pct * b.h;
      drawGridLine(ctx, b.x, gy, b.x + b.w, gy);
      ctx.fillText(isPct ? val + "%" : fmtLabel(val), b.x - 4 * scale, gy);
    }
    ctx.restore();
    drawAxisLine(ctx, b.x, b.y, b.x, b.y + b.h);
    drawAxisLine(ctx, b.x, b.y + b.h, b.x + b.w, b.y + b.h);
    const stacks = new Array(numCats).fill(0);
    for (const ser of seriesData) {
      ctx.save();
      ctx.beginPath();
      const topPts = [];
      for (let ci = 0; ci < numCats; ci++) {
        let val = ser.values[ci] ?? 0;
        if (isPct) {
          const total = seriesData.reduce((s, ss) => s + (ss.values[ci] || 0), 0);
          val = total ? val / total * 100 : 0;
        }
        const base = isStacked ? stacks[ci] : 0;
        const top = base + Math.abs(val);
        const bpct = (base - range.min) / (range.max - range.min);
        const tpct = (top - range.min) / (range.max - range.min);
        const xpos = b.x + ci / (numCats - 1 || 1) * b.w;
        topPts.push({ x: xpos, y: b.y + b.h - tpct * b.h, baseY: b.y + b.h - bpct * b.h });
        if (isStacked) stacks[ci] += Math.abs(val);
      }
      ctx.moveTo(topPts[0].x, topPts[0].baseY);
      for (const p of topPts) ctx.lineTo(p.x, p.baseY);
      for (let i = topPts.length - 1; i >= 0; i--) ctx.lineTo(topPts[i].x, topPts[i].y);
      ctx.closePath();
      ctx.fillStyle = ser.color + "cc";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(topPts[0].x, topPts[0].y);
      for (const p of topPts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = ser.color;
      ctx.lineWidth = 1.5 * scale;
      ctx.stroke();
      ctx.restore();
    }
    drawLegend(ctx, cx, cy, cw, b.legendY, [...seriesData].reverse(), scale);
  }
  function renderPieChart(ctx, chartEl, cx, cy, cw, ch, themeColors, scale) {
    const pieChart = g1(chartEl, "pieChart") || g1(chartEl, "pie3DChart");
    const doughnut = g1(chartEl, "doughnutChart");
    const chartNode = pieChart || doughnut;
    const isDoughnut = !!doughnut;
    const serEls = gtn(chartNode, "ser");
    if (!serEls.length) return;
    const ser = serEls[0];
    const values = readValues(ser).map((v) => typeof v === "number" && v > 0 ? v : 0);
    const cats = readCategories(ser);
    const dptClrs = dataPointColors(ser, themeColors);
    const total = values.reduce((a, b) => a + b, 0);
    if (!total) return;
    const cr = Math.min(cw, ch) * 0.38;
    const pcx = cx + cw * 0.44;
    const pcy = cy + ch * 0.5;
    const holeR = isDoughnut ? cr * 0.55 : 0;
    let startAngle = -Math.PI / 2;
    for (let i = 0; i < values.length; i++) {
      if (!values[i]) continue;
      const sweep = values[i] / total * Math.PI * 2;
      const color = dptClrs[i] || seriesColor(ser, i, themeColors);
      const midA = startAngle + sweep / 2;
      const explode = i === 0 ? cr * 0.04 : 0;
      const eox = explode * Math.cos(midA);
      const eoy = explode * Math.sin(midA);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pcx + eox, pcy + eoy);
      ctx.arc(pcx + eox, pcy + eoy, cr, startAngle, startAngle + sweep);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowColor = "rgba(0,0,0,0.12)";
      ctx.shadowBlur = 4 * scale;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5 * scale;
      ctx.stroke();
      ctx.restore();
      if (holeR > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(pcx, pcy, holeR, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.restore();
      }
      const pct = values[i] / total;
      if (pct > 0.05) {
        const lx = pcx + eox + cr * 0.65 * Math.cos(midA);
        const ly = pcy + eoy + cr * 0.65 * Math.sin(midA);
        const fontSize2 = Math.max(8, Math.min(13, cr * 0.15)) * scale;
        ctx.save();
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${fontSize2}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(Math.round(pct * 100) + "%", lx, ly);
        ctx.restore();
      }
      startAngle += sweep;
    }
    if (isDoughnut) {
      const fontSize2 = Math.max(10, Math.min(16, cr * 0.22)) * scale;
      ctx.save();
      ctx.font = `bold ${fontSize2}px sans-serif`;
      ctx.fillStyle = "#333";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(fmtLabel(total), pcx, pcy);
      ctx.restore();
    }
    const legX = cx + cw * 0.78;
    const fontSize = Math.max(8, Math.min(12, cw * 0.022)) * scale;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = "middle";
    const rowH = fontSize * 1.8;
    const startY = pcy - values.length * rowH / 2;
    for (let i = 0; i < values.length; i++) {
      const lx = legX;
      const ly = startY + i * rowH;
      const color = dptClrs[i] || seriesColor(ser, i, themeColors);
      ctx.fillStyle = color;
      roundRect(ctx, lx, ly - fontSize * 0.5, fontSize * 1.2, fontSize);
      ctx.fill();
      ctx.fillStyle = "#444";
      const label = String(cats[i] ?? `Item ${i + 1}`);
      ctx.fillText(label, lx + fontSize * 1.5, ly);
    }
  }
  function renderScatterChart(ctx, chartEl, cx, cy, cw, ch, themeColors, scale) {
    const scatterChart = g1(chartEl, "scatterChart") || g1(chartEl, "bubbleChart");
    const serEls = gtn(scatterChart, "ser");
    const seriesData = serEls.map((s, i) => {
      const xVals = readCache(g1(g1(s, "xVal"), "numCache"));
      const yVals = readCache(g1(g1(s, "yVal"), "numCache"));
      const bubSz = readCache(g1(g1(s, "bubbleSize"), "numCache"));
      return {
        name: seriesName(s),
        color: seriesColor(s, i, themeColors),
        points: xVals.map((x, j) => ({ x, y: yVals[j], r: bubSz[j] })).filter((p) => typeof p.x === "number" && typeof p.y === "number")
      };
    });
    if (!seriesData.length) return;
    const b = chartBounds(cx, cy, cw, ch, { hasLegend: seriesData.length > 1 });
    const allX = seriesData.flatMap((s) => s.points.map((p) => p.x));
    const allY = seriesData.flatMap((s) => s.points.map((p) => p.y));
    const rangeX = calcAxisRange(allX, false);
    const rangeY = calcAxisRange(allY);
    const fontSize = Math.max(7, Math.min(11, b.w * 0.018)) * scale;
    const stepsX = Math.round((rangeX.max - rangeX.min) / rangeX.step);
    const stepsY = Math.round((rangeY.max - rangeY.min) / rangeY.step);
    ctx.font = `${fontSize}px sans-serif`;
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#666";
    for (let t = 0; t <= stepsX; t++) {
      const val = rangeX.min + t * rangeX.step;
      const pct = (val - rangeX.min) / (rangeX.max - rangeX.min);
      const gx = b.x + pct * b.w;
      drawGridLine(ctx, gx, b.y, gx, b.y + b.h);
      ctx.fillText(fmtLabel(val), gx, b.y + b.h + fontSize * 1.5);
    }
    ctx.textAlign = "right";
    for (let t = 0; t <= stepsY; t++) {
      const val = rangeY.min + t * rangeY.step;
      const pct = (val - rangeY.min) / (rangeY.max - rangeY.min);
      const gy = b.y + b.h - pct * b.h;
      drawGridLine(ctx, b.x, gy, b.x + b.w, gy);
      ctx.fillText(fmtLabel(val), b.x - 4 * scale, gy);
    }
    ctx.restore();
    drawAxisLine(ctx, b.x, b.y, b.x, b.y + b.h);
    drawAxisLine(ctx, b.x, b.y + b.h, b.x + b.w, b.y + b.h);
    const maxR = seriesData.flatMap((s) => s.points.map((p) => p.r ?? 1));
    const maxBubble = Math.max(...maxR.filter((v) => typeof v === "number"), 1);
    const maxBubbleR = Math.min(b.w, b.h) * 0.06;
    for (const ser of seriesData) {
      for (const pt of ser.points) {
        const px2 = b.x + (pt.x - rangeX.min) / (rangeX.max - rangeX.min) * b.w;
        const py = b.y + b.h - (pt.y - rangeY.min) / (rangeY.max - rangeY.min) * b.h;
        const r = pt.r != null ? pt.r / maxBubble * maxBubbleR : 4 * scale;
        ctx.save();
        ctx.fillStyle = ser.color + "aa";
        ctx.strokeStyle = ser.color;
        ctx.lineWidth = 1 * scale;
        ctx.beginPath();
        ctx.arc(px2, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
    if (seriesData.length > 1) {
      drawLegend(ctx, cx, cy, cw, b.legendY, seriesData, scale);
    }
  }
  function renderRadarChart(ctx, chartEl, cx, cy, cw, ch, themeColors, scale) {
    const radarChart = g1(chartEl, "radarChart");
    const serEls = gtn(radarChart, "ser");
    const seriesData = serEls.map((s, i) => ({
      name: seriesName(s),
      values: readValues(s),
      color: seriesColor(s, i, themeColors)
    }));
    if (!seriesData.length) return;
    const cats = readCategories(serEls[0]) || [];
    const N = cats.length || seriesData[0]?.values.length || 0;
    if (N < 3) return;
    const pcx = cx + cw * 0.5;
    const pcy = cy + ch * 0.5;
    const r = Math.min(cw, ch) * 0.34;
    const range = calcAxisRange(seriesData.flatMap((s) => s.values));
    const rings = 4;
    for (let ring = 1; ring <= rings; ring++) {
      const rr = r * ring / rings;
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const angle = i / N * Math.PI * 2 - Math.PI / 2;
        const px2 = pcx + rr * Math.cos(angle);
        const py = pcy + rr * Math.sin(angle);
        if (i === 0) ctx.moveTo(px2, py);
        else ctx.lineTo(px2, py);
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.restore();
    }
    for (let i = 0; i < N; i++) {
      const angle = i / N * Math.PI * 2 - Math.PI / 2;
      drawAxisLine(ctx, pcx, pcy, pcx + r * Math.cos(angle), pcy + r * Math.sin(angle));
      const lx = pcx + (r + 16 * scale) * Math.cos(angle);
      const ly = pcy + (r + 16 * scale) * Math.sin(angle);
      ctx.save();
      ctx.font = `${Math.max(7, 11 * scale)}px sans-serif`;
      ctx.fillStyle = "#555";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(cats[i] ?? i + 1), lx, ly);
      ctx.restore();
    }
    for (const ser of seriesData) {
      const pts = ser.values.map((v, i) => {
        const angle = i / N * Math.PI * 2 - Math.PI / 2;
        const pct = (v - range.min) / (range.max - range.min);
        return {
          x: pcx + r * pct * Math.cos(angle),
          y: pcy + r * pct * Math.sin(angle)
        };
      });
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.fillStyle = ser.color + "44";
      ctx.fill();
      ctx.strokeStyle = ser.color;
      ctx.lineWidth = 1.5 * scale;
      ctx.stroke();
      ctx.restore();
    }
    drawLegend(ctx, cx, cy, cw, cy + ch - 20 * scale, seriesData, scale);
  }
  function drawChartTitle(ctx, chartEl, cx, cy, cw, scale) {
    const titleEl = g1(g1(chartEl, "chart"), "title");
    if (!titleEl) return false;
    const txEl = g1(titleEl, "tx");
    if (!txEl) return false;
    let text = "";
    for (const t of gtn(txEl, "t")) text += t.textContent;
    if (!text.trim()) return false;
    const fontSize = Math.max(10, Math.min(16, cw * 0.03)) * scale;
    ctx.save();
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = "#333";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(text, cx + cw / 2, cy + 6 * scale);
    ctx.restore();
    return true;
  }
  function renderChart(ctx, chartDoc, cx, cy, cw, ch, themeColors, scale) {
    if (!chartDoc) return;
    const chartEl = chartDoc;
    ctx.save();
    ctx.fillStyle = "#fff";
    roundRect(ctx, cx, cy, cw, ch, 4 * scale);
    ctx.fill();
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();
    const hasTitle = drawChartTitle(ctx, chartEl, cx, cy, cw, scale);
    const ty = hasTitle ? cy + Math.min(ch * 0.08, 24 * scale) : cy;
    const th = ch - (ty - cy);
    const plotArea = g1(chartEl, "plotArea");
    if (!plotArea) return;
    const b3d = g1(plotArea, "bar3DChart") || g1(plotArea, "barChart");
    const l3d = g1(plotArea, "line3DChart") || g1(plotArea, "lineChart");
    const a3d = g1(plotArea, "area3DChart") || g1(plotArea, "areaChart");
    const p3d = g1(plotArea, "pie3DChart") || g1(plotArea, "pieChart");
    const dnut = g1(plotArea, "doughnutChart");
    const sct = g1(plotArea, "scatterChart") || g1(plotArea, "bubbleChart");
    const rdr = g1(plotArea, "radarChart");
    if (b3d) renderBarChart(ctx, plotArea, cx, ty, cw, th, themeColors, scale);
    else if (l3d) renderLineChart(ctx, plotArea, cx, ty, cw, th, themeColors, scale);
    else if (a3d) renderAreaChart(ctx, plotArea, cx, ty, cw, th, themeColors, scale);
    else if (dnut) renderPieChart(ctx, plotArea, cx, ty, cw, th, themeColors, scale);
    else if (p3d) renderPieChart(ctx, plotArea, cx, ty, cw, th, themeColors, scale);
    else if (sct) renderScatterChart(ctx, plotArea, cx, ty, cw, th, themeColors, scale);
    else if (rdr) renderRadarChart(ctx, plotArea, cx, ty, cw, th, themeColors, scale);
    else {
      ctx.save();
      ctx.fillStyle = "#aaa";
      ctx.font = `${12 * scale}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const typeEl = plotArea.firstElementChild;
      ctx.fillText(typeEl?.localName ?? "Chart", cx + cw / 2, cy + ch / 2);
      ctx.restore();
    }
  }
  var DEFAULT_PALETTE;
  var init_charts = __esm({
    "node_modules/pptx-browser/src/charts.js"() {
      init_utils();
      init_colors();
      DEFAULT_PALETTE = [
        "#4472C4",
        "#ED7D31",
        "#A9D18E",
        "#FF0000",
        "#FFC000",
        "#5B9BD5",
        "#70AD47",
        "#C00000",
        "#7030A0",
        "#00B0F0",
        "#FF7F00",
        "#9E480E"
      ];
    }
  });

  // node_modules/pptx-browser/src/effects3d.js
  function emu(el, name, def = 0, scale = 1) {
    const v = el ? parseInt(el.getAttribute(name) || def, 10) : def;
    return v * scale;
  }
  function read3dColor(parentEl, themeColors) {
    if (!parentEl) return null;
    const colorChild = findFirstColorChild(parentEl);
    if (!colorChild) return null;
    const c = resolveColorElement(colorChild, themeColors);
    return c ? colorToCss(c) : null;
  }
  function drawBevel(ctx, sp3d, x, y, w, h, scale) {
    const bevelT = g1(sp3d, "bevelT");
    const bevelB = g1(sp3d, "bevelB");
    const bevel = bevelT || bevelB;
    if (!bevel) return;
    const bw = Math.max(2 * scale, emu(bevel, "w", 76200, scale));
    const bh = Math.max(2 * scale, emu(bevel, "h", 76200, scale));
    const prst = attr(bevel, "prst", "circle");
    const inset = prst.toLowerCase().includes("in");
    const bwx = Math.min(bw, w * 0.3);
    const bhy = Math.min(bh, h * 0.3);
    const lightColor = inset ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.35)";
    const shadowColor = inset ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.20)";
    const gTop = ctx.createLinearGradient(x, y, x, y + bhy);
    gTop.addColorStop(0, lightColor);
    gTop.addColorStop(1, "rgba(255,255,255,0)");
    ctx.save();
    ctx.fillStyle = gTop;
    ctx.fillRect(x, y, w, bhy);
    const gBot = ctx.createLinearGradient(x, y + h - bhy, x, y + h);
    gBot.addColorStop(0, "rgba(0,0,0,0)");
    gBot.addColorStop(1, shadowColor);
    ctx.fillStyle = gBot;
    ctx.fillRect(x, y + h - bhy, w, bhy);
    const gLeft = ctx.createLinearGradient(x, y, x + bwx, y);
    gLeft.addColorStop(0, lightColor);
    gLeft.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gLeft;
    ctx.fillRect(x, y, bwx, h);
    const gRight = ctx.createLinearGradient(x + w - bwx, y, x + w, y);
    gRight.addColorStop(0, "rgba(0,0,0,0)");
    gRight.addColorStop(1, shadowColor);
    ctx.fillStyle = gRight;
    ctx.fillRect(x + w - bwx, y, bwx, h);
    ctx.restore();
  }
  function drawExtrusion(ctx, sp3d, themeColors, x, y, w, h, scale) {
    const extH = emu(sp3d, "extrusionH", 0, scale);
    if (extH < 1 * scale) return;
    const clrEl = g1(sp3d, "extrusionClr") || g1(sp3d, "contourClr");
    const color = read3dColor(clrEl, themeColors) || "rgba(0,0,0,0.3)";
    const depth = Math.min(extH / 914400 * 72 * scale, Math.min(w, h) * 0.15);
    const dx = depth * 0.7;
    const dy = depth * 0.7;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w + dx, y + dy);
    ctx.lineTo(x + w + dx, y + h + dy);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + dx, y + h + dy);
    ctx.lineTo(x + w + dx, y + h + dy);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function drawContour(ctx, sp3d, themeColors, x, y, w, h, scale) {
    const contourW = emu(sp3d, "contourW", 0, scale);
    if (contourW < 0.5) return;
    const clrEl = g1(sp3d, "contourClr");
    const color = read3dColor(clrEl, themeColors) || "#888888";
    const cw = Math.max(0.5, contourW / 914400 * 72 * scale);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = cw;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }
  function applyCamera(ctx, scene3d, x, y, w, h) {
    if (!scene3d) return () => {
    };
    const camera = g1(scene3d, "camera");
    if (!camera) return () => {
    };
    const prst = attr(camera, "prst", "orthographicFront");
    const rot = g1(camera, "rot");
    const isOrtho = prst.toLowerCase().includes("orthographic");
    if (isOrtho && !rot) return () => {
    };
    const lat = rot ? attrInt(rot, "lat", 0) / 6e4 : 0;
    const lon = rot ? attrInt(rot, "lon", 0) / 6e4 : 0;
    const rev = rot ? attrInt(rot, "rev", 0) / 6e4 : 0;
    const latR = lat * Math.PI / 180;
    const lonR = lon * Math.PI / 180;
    const skewX = Math.sin(lonR) * 0.15;
    const skewY = Math.sin(latR) * 0.08;
    ctx.save();
    ctx.transform(
      1,
      skewY,
      skewX,
      1,
      x * -skewX,
      y * -skewY
      // pivot at shape origin
    );
    return () => ctx.restore();
  }
  function drawLighting(ctx, scene3d, x, y, w, h) {
    if (!scene3d) return;
    const lightRig = g1(scene3d, "lightRig");
    if (!lightRig) return;
    const dir = attr(lightRig, "dir", "t");
    const rig = attr(lightRig, "rig", "balanced");
    const dirMap = {
      t: { gx: x + w / 2, gy: y },
      b: { gx: x + w / 2, gy: y + h },
      l: { gx: x, gy: y + h / 2 },
      r: { gx: x + w, gy: y + h / 2 },
      tl: { gx: x, gy: y },
      tr: { gx: x + w, gy: y },
      bl: { gx: x, gy: y + h },
      br: { gx: x + w, gy: y + h }
    };
    const { gx, gy } = dirMap[dir] || dirMap.t;
    const intensity = rig === "flat" ? 0.08 : rig === "balanced" ? 0.14 : rig === "sunrise" ? 0.2 : rig === "harsh" ? 0.28 : 0.12;
    const radius = Math.sqrt(w * w + h * h);
    const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
    grad.addColorStop(0, `rgba(255,255,255,${intensity})`);
    grad.addColorStop(0.5, "rgba(255,255,255,0)");
    grad.addColorStop(1, `rgba(0,0,0,${intensity * 0.5})`);
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  function setup3D(ctx, spPr, themeColors, x, y, w, h, scale) {
    if (!spPr) return { applyCamera: () => () => {
    }, overlay: () => {
    } };
    const sp3d = g1(spPr, "sp3d") || g1(spPr, "scene3d")?.parentNode && null;
    const scene3d = g1(spPr, "scene3d");
    if (sp3d) {
      drawExtrusion(ctx, sp3d, themeColors, x, y, w, h, scale);
    }
    const cleanupCamera = applyCamera(ctx, scene3d, x, y, w, h);
    return {
      /** Call this *after* filling the shape to draw bevel + lighting on top. */
      overlay() {
        if (sp3d) {
          drawBevel(ctx, sp3d, x, y, w, h, scale);
          drawContour(ctx, sp3d, themeColors, x, y, w, h, scale);
        }
        if (scene3d) {
          drawLighting(ctx, scene3d, x, y, w, h);
        }
      },
      /** Call this when done to restore canvas state. */
      cleanup: cleanupCamera
    };
  }
  function has3D(spPr) {
    if (!spPr) return false;
    return !!(g1(spPr, "sp3d") || g1(spPr, "scene3d"));
  }
  var init_effects3d = __esm({
    "node_modules/pptx-browser/src/effects3d.js"() {
      init_utils();
      init_colors();
    }
  });

  // node_modules/pptx-browser/src/smartart.js
  var smartart_exports = {};
  __export(smartart_exports, {
    renderSmartArt: () => renderSmartArt
  });
  function nodeColor(i, themeColors) {
    const key = `accent${i % 6 + 1}`;
    if (themeColors[key]) return "#" + themeColors[key];
    return PALETTE[i % PALETTE.length];
  }
  function lighten(hex, amount = 0.45) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lr = Math.round(r + (255 - r) * amount);
    const lg = Math.round(g + (255 - g) * amount);
    const lb = Math.round(b + (255 - b) * amount);
    return `rgb(${lr},${lg},${lb})`;
  }
  function nodeText(ptEl) {
    const texts = [];
    for (const t of gtn(ptEl, "t")) {
      const txt = t.textContent.trim();
      if (txt) texts.push(txt);
    }
    return texts.join(" ");
  }
  function readNodes(dataDoc) {
    if (!dataDoc) return [];
    const ptLst = g1(dataDoc, "ptLst");
    if (!ptLst) return [];
    const nodes = [];
    for (const pt of gtn(ptLst, "pt")) {
      const type = attr(pt, "type", "node");
      if (type === "parTrans" || type === "sibTrans") continue;
      const text = nodeText(pt);
      if (text || type === "node") {
        nodes.push({ id: attr(pt, "modelId", ""), type, text });
      }
    }
    return nodes.filter((n) => n.text);
  }
  function detectLayout(layoutDoc) {
    if (!layoutDoc) return "list";
    const diagDef = g1(layoutDoc, "layoutDef") || layoutDoc;
    const typ = attr(diagDef, "uniqueId", "") || attr(diagDef, "defStyle", "") || "";
    const t = typ.toLowerCase();
    if (t.includes("chevron") || t.includes("arrowprocess") || t.includes("process"))
      return "process";
    if (t.includes("cycle") || t.includes("continuouscycle"))
      return "cycle";
    if (t.includes("hierarchy") || t.includes("orgchart") || t.includes("org"))
      return "hierarchy";
    if (t.includes("radial") || t.includes("diverging"))
      return "radial";
    if (t.includes("pyramid") || t.includes("invertedpyramid"))
      return "pyramid";
    if (t.includes("funnel"))
      return "funnel";
    if (t.includes("venn"))
      return "venn";
    if (t.includes("matrix"))
      return "matrix";
    if (t.includes("list") || t.includes("bullet"))
      return "list";
    if (t.includes("relationship") || t.includes("balance"))
      return "relationship";
    return "list";
  }
  function drawText(ctx, text, x, y, maxW, maxH, size, color = "#fff", align = "center") {
    if (!text) return;
    ctx.save();
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    const words = text.split(" ");
    const lineH = size * 1.3;
    let lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW - 4 && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    const maxLines = Math.max(1, Math.floor(maxH / lineH));
    if (lines.length > maxLines) lines = lines.slice(0, maxLines);
    const startY = y - (lines.length - 1) * lineH / 2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, startY + i * lineH);
    }
    ctx.restore();
  }
  function autoFontSize(text, w, h, maxSz = 14) {
    const approxCharsPerLine = Math.floor(w / (maxSz * 0.55));
    const words = text.split(" ");
    const lines = Math.ceil(words.join(" ").length / Math.max(approxCharsPerLine, 1));
    const byH = h / (lines * 1.4);
    return Math.max(8, Math.min(maxSz, byH));
  }
  function fillRoundRect(ctx, x, y, w, h, r, fill, stroke) {
    ctx.save();
    ctx.beginPath();
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawArrow(ctx, x1, y1, x2, y2, color, lw = 1.5) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 8;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
    ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function renderProcess(ctx, nodes, x, y, w, h, themeColors, scale) {
    if (!nodes.length) return;
    const N = nodes.length;
    const itemW = w / N;
    const pad = Math.min(itemW * 0.08, 10 * scale);
    const arrowW = Math.min(itemW * 0.12, 18 * scale);
    const boxW = itemW - arrowW - pad;
    const boxH = h * 0.7;
    const boxY = y + (h - boxH) / 2;
    for (let i = 0; i < N; i++) {
      const color = nodeColor(i, themeColors);
      const bx = x + itemW * i + pad / 2;
      const isLast = i === N - 1;
      ctx.save();
      ctx.beginPath();
      const tipX = bx + boxW + (isLast ? 0 : arrowW);
      ctx.moveTo(bx, boxY);
      ctx.lineTo(bx + boxW, boxY);
      if (!isLast) ctx.lineTo(tipX, boxY + boxH / 2);
      ctx.lineTo(bx + boxW, boxY + boxH);
      ctx.lineTo(bx, boxY + boxH);
      if (i > 0) ctx.lineTo(bx + arrowW, boxY + boxH / 2);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
      const fs = autoFontSize(nodes[i].text, boxW - arrowW, boxH) * scale;
      ctx.font = `${fs}px sans-serif`;
      const cx2 = bx + (boxW + (i > 0 ? arrowW : 0)) / 2;
      drawText(ctx, nodes[i].text, cx2, boxY + boxH / 2, boxW, boxH, fs);
    }
  }
  function renderCycle(ctx, nodes, x, y, w, h, themeColors, scale) {
    if (!nodes.length) return;
    const N = nodes.length;
    const pcx = x + w / 2;
    const pcy = y + h / 2;
    const orbitR = Math.min(w, h) * 0.33;
    const nodeR = Math.min(orbitR * 0.32, 40 * scale);
    ctx.save();
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 2 * scale;
    ctx.setLineDash([4 * scale, 4 * scale]);
    ctx.beginPath();
    ctx.arc(pcx, pcy, orbitR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    for (let i = 0; i < N; i++) {
      const angle = i / N * Math.PI * 2 - Math.PI / 2;
      const nx = pcx + orbitR * Math.cos(angle);
      const ny = pcy + orbitR * Math.sin(angle);
      const color = nodeColor(i, themeColors);
      ctx.save();
      ctx.beginPath();
      ctx.arc(nx, ny, nodeR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
      if (N > 1) {
        const nextAngle = (i + 1) / N * Math.PI * 2 - Math.PI / 2;
        const midAngle = (angle + nextAngle) / 2;
        const ax1 = pcx + orbitR * Math.cos(angle + 0.15);
        const ay1 = pcy + orbitR * Math.sin(angle + 0.15);
        const ax2 = pcx + orbitR * Math.cos(nextAngle - 0.15);
        const ay2 = pcy + orbitR * Math.sin(nextAngle - 0.15);
        ctx.save();
        ctx.strokeStyle = color + "99";
        ctx.lineWidth = 1.5 * scale;
        ctx.beginPath();
        ctx.moveTo(ax1, ay1);
        ctx.quadraticCurveTo(
          pcx + orbitR * 1.1 * Math.cos(midAngle),
          pcy + orbitR * 1.1 * Math.sin(midAngle),
          ax2,
          ay2
        );
        ctx.stroke();
        ctx.restore();
      }
      const fs = autoFontSize(nodes[i].text, nodeR * 1.7, nodeR * 1.2) * scale;
      ctx.font = `${fs}px sans-serif`;
      drawText(ctx, nodes[i].text, nx, ny, nodeR * 2, nodeR * 1.8, fs);
    }
  }
  function renderHierarchy(ctx, nodes, x, y, w, h, themeColors, scale) {
    if (!nodes.length) return;
    const root = nodes[0];
    const children = nodes.slice(1);
    const N = Math.max(children.length, 1);
    const rowH = h / (children.length > 0 ? 2.8 : 1.2);
    const boxH = rowH * 0.75;
    const rootW = Math.min(w * 0.3, 160 * scale);
    const rootH = boxH;
    const rootX = x + (w - rootW) / 2;
    const rootY = y + (rowH - rootH) / 2;
    const color0 = nodeColor(0, themeColors);
    fillRoundRect(ctx, rootX, rootY, rootW, rootH, 6 * scale, color0, null);
    const fs0 = autoFontSize(root.text, rootW - 10 * scale, rootH) * scale;
    ctx.font = `bold ${fs0}px sans-serif`;
    drawText(ctx, root.text, rootX + rootW / 2, rootY + rootH / 2, rootW - 10, rootH, fs0);
    if (!children.length) return;
    const childW = (w - 20 * scale) / N;
    const childRowY = y + rowH * 1.5;
    const lineStartY = rootY + rootH;
    const lineEndY = childRowY - 4 * scale;
    ctx.save();
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.moveTo(rootX + rootW / 2, lineStartY);
    ctx.lineTo(rootX + rootW / 2, (lineStartY + lineEndY) / 2);
    ctx.lineTo(x + 10 * scale, (lineStartY + lineEndY) / 2);
    ctx.lineTo(x + w - 10 * scale, (lineStartY + lineEndY) / 2);
    ctx.stroke();
    ctx.restore();
    for (let i = 0; i < children.length; i++) {
      const cx2 = x + childW * i + 8 * scale;
      const cy2 = childRowY;
      const cw2 = childW - 16 * scale;
      const ch2 = boxH;
      const color = nodeColor(i + 1, themeColors);
      ctx.save();
      ctx.strokeStyle = "#999";
      ctx.lineWidth = 1.5 * scale;
      ctx.beginPath();
      ctx.moveTo(cx2 + cw2 / 2, (lineStartY + lineEndY) / 2);
      ctx.lineTo(cx2 + cw2 / 2, cy2);
      ctx.stroke();
      ctx.restore();
      fillRoundRect(ctx, cx2, cy2, cw2, ch2, 5 * scale, color, null);
      const fs = autoFontSize(children[i].text, cw2 - 8 * scale, ch2) * scale;
      ctx.font = `${fs}px sans-serif`;
      drawText(ctx, children[i].text, cx2 + cw2 / 2, cy2 + ch2 / 2, cw2 - 8, ch2, fs);
    }
  }
  function renderRadial(ctx, nodes, x, y, w, h, themeColors, scale) {
    if (!nodes.length) return;
    const center = nodes[0];
    const spokes = nodes.slice(1);
    const pcx = x + w / 2;
    const pcy = y + h / 2;
    const coreR = Math.min(w, h) * 0.18;
    const orbitR = Math.min(w, h) * 0.36;
    const nodeR = Math.min(orbitR * 0.28, 38 * scale);
    const N = spokes.length || 1;
    const c0 = nodeColor(0, themeColors);
    ctx.save();
    ctx.beginPath();
    ctx.arc(pcx, pcy, coreR, 0, Math.PI * 2);
    ctx.fillStyle = c0;
    ctx.fill();
    ctx.restore();
    const cfs = autoFontSize(center.text, coreR * 1.6, coreR * 1.2) * scale;
    ctx.font = `bold ${cfs}px sans-serif`;
    drawText(ctx, center.text, pcx, pcy, coreR * 2, coreR * 2, cfs);
    for (let i = 0; i < N; i++) {
      const angle = i / N * Math.PI * 2 - Math.PI / 2;
      const nx = pcx + orbitR * Math.cos(angle);
      const ny = pcy + orbitR * Math.sin(angle);
      const color = nodeColor(i + 1, themeColors);
      const lx1 = pcx + coreR * Math.cos(angle);
      const ly1 = pcy + coreR * Math.sin(angle);
      const lx2 = nx - nodeR * Math.cos(angle);
      const ly2 = ny - nodeR * Math.sin(angle);
      drawArrow(ctx, lx1, ly1, lx2, ly2, color + "99", 1.5 * scale);
      ctx.save();
      ctx.beginPath();
      ctx.arc(nx, ny, nodeR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
      const fs = autoFontSize(spokes[i].text, nodeR * 1.7, nodeR * 1.2) * scale;
      ctx.font = `${fs}px sans-serif`;
      drawText(ctx, spokes[i].text, nx, ny, nodeR * 2, nodeR * 1.8, fs);
    }
  }
  function renderPyramid(ctx, nodes, x, y, w, h, themeColors, scale) {
    if (!nodes.length) return;
    const N = nodes.length;
    const layerH = h / N;
    for (let i = 0; i < N; i++) {
      const t = (N - i) / N;
      const layerW = w * t;
      const lx = x + (w - layerW) / 2;
      const ly = y + i * layerH;
      const color = nodeColor(i, themeColors);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lx, ly + layerH);
      ctx.lineTo(lx + layerW, ly + layerH);
      const topW = w * ((N - i - 1) / N);
      ctx.lineTo(x + (w + topW) / 2, ly);
      ctx.lineTo(x + (w - topW) / 2, ly);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2 * scale;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      const fs = autoFontSize(nodes[i].text, layerW * 0.6, layerH * 0.7) * scale;
      ctx.font = `${fs}px sans-serif`;
      drawText(ctx, nodes[i].text, x + w / 2, ly + layerH / 2, layerW * 0.6, layerH * 0.7, fs);
    }
  }
  function renderFunnel(ctx, nodes, x, y, w, h, themeColors, scale) {
    if (!nodes.length) return;
    const N = nodes.length;
    const layerH = h / N;
    for (let i = 0; i < N; i++) {
      const topFrac = 1 - i / N * 0.55;
      const botFrac = 1 - (i + 1) / N * 0.55;
      const topW = w * topFrac;
      const botW = w * botFrac;
      const lx1 = x + (w - topW) / 2;
      const lx2 = x + (w - botW) / 2;
      const ly = y + i * layerH;
      const color = nodeColor(i, themeColors);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lx1, ly);
      ctx.lineTo(lx1 + topW, ly);
      ctx.lineTo(lx2 + botW, ly + layerH);
      ctx.lineTo(lx2, ly + layerH);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2 * scale;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      const mw = (topW + botW) / 2;
      const fs = autoFontSize(nodes[i].text, mw * 0.8, layerH * 0.7) * scale;
      ctx.font = `${fs}px sans-serif`;
      drawText(ctx, nodes[i].text, x + w / 2, ly + layerH / 2, mw * 0.8, layerH * 0.7, fs);
    }
  }
  function renderVenn(ctx, nodes, x, y, w, h, themeColors, scale) {
    if (!nodes.length) return;
    const N = Math.min(nodes.length, 4);
    const pcx = x + w / 2;
    const pcy = y + h / 2;
    const cr = Math.min(w, h) * (N <= 2 ? 0.32 : 0.28);
    const spread = cr * 0.65;
    const angles = [];
    for (let i = 0; i < N; i++) angles.push(i / N * Math.PI * 2 - Math.PI / 2);
    for (let i = 0; i < N; i++) {
      const nx = N > 1 ? pcx + spread * Math.cos(angles[i]) : pcx;
      const ny = N > 1 ? pcy + spread * Math.sin(angles[i]) : pcy;
      const color = nodeColor(i, themeColors);
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(nx, ny, cr, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5 * scale;
      ctx.stroke();
      ctx.restore();
      const lx = N > 1 ? pcx + (spread + cr * 0.45) * Math.cos(angles[i]) : pcx;
      const ly = N > 1 ? pcy + (spread + cr * 0.45) * Math.sin(angles[i]) : pcy;
      const fs = autoFontSize(nodes[i].text, cr * 1.2, cr * 0.7) * scale;
      ctx.font = `${fs}px sans-serif`;
      drawText(ctx, nodes[i].text, lx, ly, cr * 1.2, cr * 0.7, fs, "#333");
    }
  }
  function renderMatrix(ctx, nodes, x, y, w, h, themeColors, scale) {
    const grid = [
      nodes[0] || { text: "" },
      nodes[1] || { text: "" },
      nodes[2] || { text: "" },
      nodes[3] || { text: "" }
    ];
    const cellW = w / 2;
    const cellH = h / 2;
    const pad = 8 * scale;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const idx = row * 2 + col;
        const cx2 = x + col * cellW + pad;
        const cy2 = y + row * cellH + pad;
        const cw2 = cellW - pad * 2;
        const ch2 = cellH - pad * 2;
        const color = nodeColor(idx, themeColors);
        fillRoundRect(ctx, cx2, cy2, cw2, ch2, 8 * scale, color, null);
        const fs = autoFontSize(grid[idx].text, cw2 - 10, ch2) * scale;
        ctx.font = `${fs}px sans-serif`;
        drawText(ctx, grid[idx].text, cx2 + cw2 / 2, cy2 + ch2 / 2, cw2 - 10, ch2, fs);
      }
    }
  }
  function renderList(ctx, nodes, x, y, w, h, themeColors, scale) {
    if (!nodes.length) return;
    const N = nodes.length;
    const itemH = h / N;
    const dotR = Math.min(itemH * 0.2, 14 * scale);
    const pad = dotR * 3;
    for (let i = 0; i < N; i++) {
      const iy = y + i * itemH;
      const cy2 = iy + itemH / 2;
      const color = nodeColor(i, themeColors);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + dotR, cy2, dotR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
      fillRoundRect(
        ctx,
        x + pad,
        iy + itemH * 0.1,
        w - pad - 4 * scale,
        itemH * 0.8,
        4 * scale,
        color + "22",
        null
      );
      const fs = autoFontSize(nodes[i].text, w - pad - 20 * scale, itemH * 0.7) * scale;
      ctx.font = `${fs}px sans-serif`;
      ctx.fillStyle = "#333";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(nodes[i].text, x + pad + 8 * scale, cy2);
    }
  }
  function renderRelationship(ctx, nodes, x, y, w, h, themeColors, scale) {
    if (nodes.length < 2) {
      renderList(ctx, nodes, x, y, w, h, themeColors, scale);
      return;
    }
    const center = nodes[Math.floor(nodes.length / 2)];
    const left = nodes.slice(0, Math.floor(nodes.length / 2));
    const right = nodes.slice(Math.floor(nodes.length / 2) + 1);
    const pcx = x + w / 2;
    const pcy = y + h / 2;
    const midR = Math.min(w * 0.14, h * 0.25);
    const c0 = nodeColor(Math.floor(nodes.length / 2), themeColors);
    ctx.save();
    ctx.beginPath();
    ctx.arc(pcx, pcy, midR, 0, Math.PI * 2);
    ctx.fillStyle = c0;
    ctx.fill();
    ctx.restore();
    const cfs = autoFontSize(center.text, midR * 1.6, midR * 1.2) * scale;
    ctx.font = `bold ${cfs}px sans-serif`;
    drawText(ctx, center.text, pcx, pcy, midR * 2, midR * 1.8, cfs);
    const rowH = h / Math.max(left.length, right.length, 1);
    const boxW = w * 0.3;
    const boxH = rowH * 0.7;
    const drawSide = (group, side) => {
      const bx = side === "left" ? x : x + w - boxW;
      const arrowX2 = side === "left" ? pcx - midR : pcx + midR;
      for (let i = 0; i < group.length; i++) {
        const by = y + rowH * i + (rowH - boxH) / 2;
        const color = nodeColor(i + (side === "right" ? left.length + 1 : 0), themeColors);
        fillRoundRect(ctx, bx, by, boxW, boxH, 5 * scale, color, null);
        const fs = autoFontSize(group[i].text, boxW - 8, boxH) * scale;
        ctx.font = `${fs}px sans-serif`;
        drawText(ctx, group[i].text, bx + boxW / 2, by + boxH / 2, boxW - 8, boxH, fs);
        const arrowX1 = side === "left" ? bx + boxW : bx;
        drawArrow(ctx, arrowX1, by + boxH / 2, arrowX2, pcy, color + "88", 1.5 * scale);
      }
    };
    drawSide(left, "left");
    drawSide(right, "right");
  }
  function renderFallback(ctx, nodes, x, y, w, h, themeColors, scale) {
    const N = nodes.length;
    if (!N) return;
    const cols = Math.ceil(Math.sqrt(N));
    const rows = Math.ceil(N / cols);
    const cellW = w / cols;
    const cellH = h / rows;
    const pad = Math.min(cellW, cellH) * 0.1;
    for (let i = 0; i < N; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = x + col * cellW + pad;
      const by = y + row * cellH + pad;
      const bw = cellW - pad * 2;
      const bh = cellH - pad * 2;
      const color = nodeColor(i, themeColors);
      fillRoundRect(ctx, bx, by, bw, bh, 8 * scale, color, null);
      const light = lighten(color);
      ctx.save();
      const grad = ctx.createLinearGradient(bx, by, bx, by + bh * 0.5);
      grad.addColorStop(0, "rgba(255,255,255,0.18)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect?.(bx, by, bw, bh, 8 * scale);
      ctx.fill();
      ctx.restore();
      const fs = autoFontSize(nodes[i].text, bw - 12 * scale, bh) * scale;
      ctx.font = `${fs}px sans-serif`;
      drawText(ctx, nodes[i].text, bx + bw / 2, by + bh / 2, bw - 12 * scale, bh, fs);
    }
  }
  function renderSmartArt(ctx, dataDoc, layoutDoc, x, y, w, h, themeColors, scale) {
    const nodes = readNodes(dataDoc);
    const layout = detectLayout(layoutDoc);
    const pad = 16 * scale;
    ctx.save();
    ctx.fillStyle = "#f7f9fc";
    ctx.strokeStyle = "#e0e4ec";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect?.(x, y, w, h, 6 * scale) || ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    const ix = x + pad;
    const iy = y + pad;
    const iw = w - pad * 2;
    const ih = h - pad * 2;
    if (!nodes.length) {
      ctx.fillStyle = "#aaa";
      ctx.font = `${12 * scale}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("SmartArt Diagram", x + w / 2, y + h / 2);
      ctx.restore();
      return;
    }
    switch (layout) {
      case "process":
        renderProcess(ctx, nodes, ix, iy, iw, ih, themeColors, scale);
        break;
      case "cycle":
        renderCycle(ctx, nodes, ix, iy, iw, ih, themeColors, scale);
        break;
      case "hierarchy":
        renderHierarchy(ctx, nodes, ix, iy, iw, ih, themeColors, scale);
        break;
      case "radial":
        renderRadial(ctx, nodes, ix, iy, iw, ih, themeColors, scale);
        break;
      case "pyramid":
        renderPyramid(ctx, nodes, ix, iy, iw, ih, themeColors, scale);
        break;
      case "funnel":
        renderFunnel(ctx, nodes, ix, iy, iw, ih, themeColors, scale);
        break;
      case "venn":
        renderVenn(ctx, nodes, ix, iy, iw, ih, themeColors, scale);
        break;
      case "matrix":
        renderMatrix(ctx, nodes, ix, iy, iw, ih, themeColors, scale);
        break;
      case "list":
        renderList(ctx, nodes, ix, iy, iw, ih, themeColors, scale);
        break;
      case "relationship":
        renderRelationship(ctx, nodes, ix, iy, iw, ih, themeColors, scale);
        break;
      default:
        renderFallback(ctx, nodes, ix, iy, iw, ih, themeColors, scale);
    }
    ctx.restore();
  }
  var PALETTE;
  var init_smartart = __esm({
    "node_modules/pptx-browser/src/smartart.js"() {
      init_utils();
      PALETTE = [
        "#4472C4",
        "#ED7D31",
        "#A9D18E",
        "#FF0000",
        "#FFC000",
        "#5B9BD5",
        "#70AD47",
        "#C00000",
        "#7030A0",
        "#00B0F0"
      ];
    }
  });

  // node_modules/pptx-browser/src/render.js
  var render_exports = {};
  __export(render_exports, {
    applyEffects: () => applyEffects,
    applyFill: () => applyFill,
    applyOutline: () => applyOutline,
    buildPlaceholderMap: () => buildPlaceholderMap,
    computeLineHeight: () => computeLineHeight,
    getDefaultFontSize: () => getDefaultFontSize,
    getRels: () => getRels,
    loadImages: () => loadImages,
    renderBackground: () => renderBackground,
    renderConnector: () => renderConnector,
    renderGraphicFrame: () => renderGraphicFrame,
    renderGroupShape: () => renderGroupShape,
    renderPicture: () => renderPicture,
    renderShape: () => renderShape,
    renderSpTree: () => renderSpTree,
    renderTable: () => renderTable,
    renderTextBody: () => renderTextBody,
    resolvePlaceholderXfrm: () => resolvePlaceholderXfrm,
    wrapText: () => wrapText
  });
  async function applyFill(ctx, fillEl, x, y, w, h, scale, themeColors, imageCache) {
    if (!fillEl) return false;
    const name = fillEl.localName;
    if (name === "noFill") {
      return false;
    }
    if (name === "solidFill") {
      const colorChild = findFirstColorChild(fillEl);
      const c = resolveColorElement(colorChild, themeColors);
      if (c) {
        ctx.fillStyle = colorToCss(c);
        ctx.fill();
        return true;
      }
      return false;
    }
    if (name === "gradFill") {
      const gsLst = g1(fillEl, "gsLst");
      if (!gsLst) return false;
      const stops = gtn(gsLst, "gs").map((gs) => {
        const pos = attrInt(gs, "pos", 0) / 1e5;
        const colorChild = findFirstColorChild(gs);
        const c = resolveColorElement(colorChild, themeColors);
        return { pos, color: c };
      }).sort((a, b) => a.pos - b.pos);
      if (stops.length < 2) return false;
      const linEl = g1(fillEl, "lin");
      const pathEl = g1(fillEl, "path");
      const gcx = x + w / 2, gcy = y + h / 2;
      let gradient;
      if (linEl || !linEl && !pathEl) {
        const angRaw = attrInt(linEl, "ang", 0);
        const angDeg = angRaw / 6e4;
        const angRad = (angDeg - 90) * Math.PI / 180;
        const cosA = Math.cos(angRad);
        const sinA = Math.sin(angRad);
        const len = Math.abs(w * cosA) + Math.abs(h * sinA);
        const x1 = gcx - len / 2 * cosA;
        const y1 = gcy - len / 2 * sinA;
        const x2 = gcx + len / 2 * cosA;
        const y2 = gcy + len / 2 * sinA;
        gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      } else {
        const fillToRect = g1(pathEl, "fillToRect");
        const focusL = attrInt(fillToRect, "l", 5e4) / 1e5;
        const focusT = attrInt(fillToRect, "t", 5e4) / 1e5;
        const focusR = attrInt(fillToRect, "r", 5e4) / 1e5;
        const focusB = attrInt(fillToRect, "b", 5e4) / 1e5;
        const fx = x + w * (focusL + (1 - focusL - focusR) / 2);
        const fy = y + h * (focusT + (1 - focusT - focusB) / 2);
        const outerR = Math.sqrt(w * w + h * h) / 2;
        gradient = ctx.createRadialGradient(fx, fy, 0, gcx, gcy, outerR);
      }
      for (const stop of stops) {
        if (stop.color) {
          gradient.addColorStop(stop.pos, colorToCss(stop.color));
        }
      }
      ctx.fillStyle = gradient;
      ctx.fill();
      return true;
    }
    if (name === "blipFill") {
      const blip = g1(fillEl, "blip");
      const rEmbed = blip ? blip.getAttribute("r:embed") || blip.getAttribute("embed") : null;
      if (rEmbed && imageCache && imageCache[rEmbed]) {
        const img = imageCache[rEmbed];
        const stretch = g1(fillEl, "stretch");
        const fillRect = stretch ? g1(stretch, "fillRect") : null;
        let ix = x, iy = y, iw = w, ih = h;
        if (fillRect) {
          const l = attrInt(fillRect, "l", 0) / 1e5;
          const t = attrInt(fillRect, "t", 0) / 1e5;
          const r = attrInt(fillRect, "r", 0) / 1e5;
          const b = attrInt(fillRect, "b", 0) / 1e5;
          ix = x + w * l;
          iy = y + h * t;
          iw = w - w * l - w * r;
          ih = h - h * t - h * b;
        }
        const tile = g1(fillEl, "tile");
        if (tile) {
          const pattern = ctx.createPattern(img, "repeat");
          if (pattern) {
            ctx.fillStyle = pattern;
            ctx.fill();
            return true;
          }
        }
        const alphaMod = g1(fillEl, "alphaModFix") || g1(blip, "alphaModFix");
        const alphaVal = alphaMod ? attrInt(alphaMod, "amt", 1e5) / 1e5 : 1;
        ctx.save();
        ctx.clip();
        if (alphaVal < 1) ctx.globalAlpha = alphaVal;
        ctx.drawImage(img, ix, iy, iw, ih);
        ctx.restore();
        return true;
      }
      return false;
    }
    if (name === "pattFill") {
      const fgClrEl = g1(fillEl, "fgClr");
      const bgClrEl = g1(fillEl, "bgClr");
      const fgC = fgClrEl ? resolveColorElement(findFirstColorChild(fgClrEl), themeColors) : { r: 0, g: 0, b: 0, a: 1 };
      const bgC = bgClrEl ? resolveColorElement(findFirstColorChild(bgClrEl), themeColors) : { r: 255, g: 255, b: 255, a: 1 };
      const fgCss = colorToCss(fgC);
      const bgCss = colorToCss(bgC);
      const prst = attr(fillEl, "prst", "dotGrid");
      let tc = null, tile = null;
      try {
        tile = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(8, 8) : document.createElement("canvas");
        const N2 = 8;
        tile.width = N2;
        tile.height = N2;
        tc = tile.getContext("2d");
      } catch (_) {
      }
      const N = 8;
      if (!tc) {
        ctx.fillStyle = colorToCss(fgC);
        ctx.fill();
        return true;
      }
      tc.fillStyle = bgCss;
      tc.fillRect(0, 0, N, N);
      tc.fillStyle = fgCss;
      switch (prst) {
        case "smGrid":
        case "dotGrid":
        case "dotDmnd":
          for (let i = 0; i < N; i += 2) {
            for (let j = 0; j < N; j += 2) tc.fillRect(i, j, 1, 1);
          }
          break;
        case "lgGrid":
        case "cross":
          tc.fillRect(0, 0, N, 1);
          tc.fillRect(0, 0, 1, N);
          break;
        case "diagBd":
        case "fwdDiag":
          for (let d = 0; d < N * 2; d++) tc.fillRect(d % N, Math.floor(d / N) * 2, 1, 1);
          break;
        case "bkDiag":
        case "ltDnDiag":
          for (let d = 0; d < N * 2; d++) tc.fillRect(N - 1 - d % N, Math.floor(d / N) * 2, 1, 1);
          break;
        case "horzBrick":
        case "horz":
          tc.fillRect(0, N / 2, N, 1);
          break;
        case "vert":
        case "vertBrick":
          tc.fillRect(N / 2, 0, 1, N);
          break;
        case "smCheck":
        case "lgCheck":
          for (let r = 0; r < N; r++) {
            for (let c2 = 0; c2 < N; c2++) {
              if ((r + c2) % 2 === 0) tc.fillRect(c2, r, 1, 1);
            }
          }
          break;
        default:
          for (let i = 0; i < N; i += 4) tc.fillRect(i, i, 2, 2);
      }
      const pattern = ctx.createPattern(tile, "repeat");
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fill();
        return true;
      }
      ctx.fillStyle = colorToCss(fgC, (fgC.a ?? 1) * 0.4);
      ctx.fill();
      return true;
    }
    if (name === "grpFill") {
      return false;
    }
    return false;
  }
  async function getRels(files2, partPath) {
    const parts = partPath.split("/");
    const filename = parts.pop();
    const relsPath2 = [...parts, "_rels", filename + ".rels"].join("/");
    const rawData = files2[relsPath2];
    if (!rawData) return {};
    const content = new TextDecoder().decode(rawData);
    const doc = parseXml(content);
    const rels = {};
    for (const rel of Array.from(doc.getElementsByTagName("Relationship"))) {
      const id = rel.getAttribute("Id");
      const target = rel.getAttribute("Target");
      const type = rel.getAttribute("Type") || "";
      const mode = rel.getAttribute("TargetMode") || "Internal";
      let fullPath = target;
      if (mode !== "External") {
        if (target.startsWith("/")) {
          fullPath = target.slice(1);
        } else {
          const baseParts = partPath.split("/");
          baseParts.pop();
          const targetParts = target.split("/");
          for (const part of targetParts) {
            if (part === "..") baseParts.pop();
            else if (part !== ".") baseParts.push(part);
          }
          fullPath = baseParts.join("/");
        }
      }
      rels[id] = { target, fullPath, type, external: mode === "External" };
    }
    return rels;
  }
  async function loadImages(files2, rels) {
    const cache = {};
    const imgExts = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "tif", "svg"]);
    for (const [rId, rel] of Object.entries(rels)) {
      if (rel.external) continue;
      const ext = rel.fullPath.split(".").pop().toLowerCase();
      if (!imgExts.has(ext)) continue;
      try {
        const data = files2[rel.fullPath];
        if (!data) continue;
        const mimeMap = {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          webp: "image/webp",
          bmp: "image/bmp",
          tiff: "image/tiff",
          tif: "image/tiff",
          svg: "image/svg+xml"
        };
        const mime = mimeMap[ext] || "image/png";
        const blob = new Blob([data], { type: mime });
        const url = URL.createObjectURL(blob);
        const img = await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => resolve(null);
          image.src = url;
        });
        cache[rId] = img;
      } catch (e) {
      }
    }
    return cache;
  }
  function computeLineHeight(lnSpcEl, baseSzPx, scale) {
    if (!lnSpcEl) return baseSzPx * 1.2;
    const spcPct = g1(lnSpcEl, "spcPct");
    const spcPts = g1(lnSpcEl, "spcPts");
    if (spcPct) {
      return baseSzPx * (attrInt(spcPct, "val", 1e5) / 1e5);
    } else if (spcPts) {
      const val = attrInt(spcPts, "val", 0);
      return val / 100 * 12700 * (scale || 1);
    }
    return baseSzPx * 1.2;
  }
  function wrapText(ctx, text, maxWidth) {
    if (maxWidth <= 0 || !text) return text ? [text] : [];
    const CJK_RE = /[\u3000-\u9fff\uac00-\ud7af\uf900-\ufaff\ufe30-\ufeff]/;
    const lines = [];
    let line = "";
    if (CJK_RE.test(text)) {
      for (const ch of text) {
        const test = line + ch;
        if (ctx.measureText(test).width <= maxWidth) {
          line = test;
        } else {
          if (line) lines.push(line);
          line = ch;
        }
      }
      if (line) lines.push(line);
      return lines.length ? lines : [""];
    }
    const words = text.split(/(\s+)/);
    for (const token of words) {
      const test = line + token;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else if (!line.trim()) {
        for (const ch of token) {
          const t2 = line + ch;
          if (ctx.measureText(t2).width > maxWidth && line) {
            lines.push(line);
            line = ch;
          } else {
            line = t2;
          }
        }
      } else {
        lines.push(line.trimEnd());
        line = token.trimStart();
      }
    }
    if (line.trim()) lines.push(line);
    return lines.length ? lines : [""];
  }
  function parseBullet(pPr, defRPr, themeColors, themeData) {
    if (!pPr) return null;
    if (g1(pPr, "buNone")) return null;
    const buChar = g1(pPr, "buChar");
    const buAutoNum = g1(pPr, "buAutoNum");
    if (!buChar && !buAutoNum) return null;
    let color = null;
    const buClr = g1(pPr, "buClr");
    if (buClr) {
      const colorChild = findFirstColorChild(buClr);
      color = resolveColorElement(colorChild, themeColors);
    }
    const buSzPct = g1(pPr, "buSzPct");
    const buSzPts = g1(pPr, "buSzPts");
    let sizePct = 1;
    if (buSzPct) sizePct = attrInt(buSzPct, "val", 1e5) / 1e5;
    const sizePts = buSzPts ? attrInt(buSzPts, "val", 0) / 100 : null;
    let fontFamily = null;
    const buFont = g1(pPr, "buFont");
    if (buFont) {
      const tf = buFont.getAttribute("typeface");
      if (tf) fontFamily = tf;
    }
    if (buChar) {
      return {
        type: "char",
        char: buChar.getAttribute("char") || "\u2022",
        color,
        sizePct,
        sizePts,
        fontFamily
      };
    }
    if (buAutoNum) {
      return {
        type: "autoNum",
        numType: buAutoNum.getAttribute("type") || "arabicPeriod",
        startAt: attrInt(buAutoNum, "startAt", 1),
        color,
        sizePct,
        sizePts,
        fontFamily
      };
    }
    return null;
  }
  function formatAutoNum(type, n) {
    switch (type) {
      case "arabicPeriod":
        return n + ".";
      case "arabicParenR":
        return n + ")";
      case "arabicParenBoth":
        return "(" + n + ")";
      case "romanLcPeriod":
        return toRoman(n).toLowerCase() + ".";
      case "romanUcPeriod":
        return toRoman(n) + ".";
      case "alphaLcParenR":
        return String.fromCharCode(96 + n) + ")";
      case "alphaUcParenR":
        return String.fromCharCode(64 + n) + ")";
      case "alphaLcPeriod":
        return String.fromCharCode(96 + n) + ".";
      case "alphaUcPeriod":
        return String.fromCharCode(64 + n) + ".";
      default:
        return n + ".";
    }
  }
  function toRoman(n) {
    const vals = [1e3, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
    const syms = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
    let result = "";
    for (let i = 0; i < vals.length; i++) {
      while (n >= vals[i]) {
        result += syms[i];
        n -= vals[i];
      }
    }
    return result;
  }
  function drawBullet(ctx, bullet, x, baseline, autoNumCounters) {
    if (!bullet) return;
    const fontMatch = ctx.font.match(/(d+(?:.d+)?)px/);
    const baseSzPx = fontMatch ? parseFloat(fontMatch[1]) : 16;
    const szPx = bullet.sizePts != null ? bullet.sizePts * (baseSzPx / 12) : baseSzPx * bullet.sizePct;
    ctx.save();
    if (bullet.color) {
      ctx.fillStyle = colorToCss(bullet.color);
      ctx.strokeStyle = ctx.fillStyle;
    }
    const family = bullet.fontFamily ? '"' + bullet.fontFamily + '", sans-serif' : ctx.font.split(/\d+px\s+/)[1] || "sans-serif";
    ctx.font = szPx + "px " + family;
    if (bullet.type === "char") {
      ctx.fillText(bullet.char, x, baseline);
    } else if (bullet.type === "autoNum") {
      const key = bullet.numType + ":" + bullet.startAt;
      if (autoNumCounters[key] === void 0) autoNumCounters[key] = bullet.startAt;
      const label = formatAutoNum(bullet.numType, autoNumCounters[key]);
      autoNumCounters[key]++;
      ctx.fillText(label, x, baseline);
    }
    ctx.restore();
  }
  async function renderTextBody(ctx, txBody, bx, by, bw, bh, scale, themeColors, themeData, defaultFontSz = 1800) {
    if (!txBody) return;
    const bodyPr = g1(txBody, "bodyPr");
    const anchor = attr(bodyPr, "anchor", "t");
    const wrap = attr(bodyPr, "wrap", "square");
    const vert = attr(bodyPr, "vert", "horz");
    const lIns = attrInt(bodyPr, "lIns", 91440) * scale;
    const tIns = attrInt(bodyPr, "tIns", 45720) * scale;
    const rIns = attrInt(bodyPr, "rIns", 91440) * scale;
    const bIns = attrInt(bodyPr, "bIns", 45720) * scale;
    const tx = bx + lIns;
    const ty = by + tIns;
    const tw = bw - lIns - rIns;
    const th = bh - tIns - bIns;
    const doWrap = wrap !== "none";
    const isVert = vert === "vert" || vert === "vert270" || vert === "eaVert";
    if (isVert) {
      ctx.save();
      if (vert === "vert270") {
        ctx.translate(bx + bw, by);
        ctx.rotate(Math.PI / 2);
      } else {
        ctx.translate(bx, by + bh);
        ctx.rotate(-Math.PI / 2);
      }
    }
    const normAutoFit = g1(bodyPr, "normAutoFit") || g1(txBody, "normAutoFit");
    const spAutoFit = g1(bodyPr, "spAutoFit") || g1(txBody, "spAutoFit");
    const explicitFontScale = normAutoFit ? normAutoFit.getAttribute("fontScale") : null;
    let fontScaleAttr = explicitFontScale ? parseInt(explicitFontScale, 10) / 1e5 : 1;
    const lstStyle = g1(txBody, "lstStyle");
    const lstDefRPr = lstStyle ? g1(lstStyle, "defRPr") : null;
    function resolveRPrAttr(rPr, paraDefRPr, attrName, fallback) {
      const v1 = rPr ? rPr.getAttribute(attrName) : null;
      if (v1 !== null && v1 !== "") return v1;
      const v2 = paraDefRPr ? paraDefRPr.getAttribute(attrName) : null;
      if (v2 !== null && v2 !== "") return v2;
      const v3 = lstDefRPr ? lstDefRPr.getAttribute(attrName) : null;
      if (v3 !== null && v3 !== "") return v3;
      return fallback;
    }
    const paragraphs = gtn(txBody, "p");
    const paraLayouts = [];
    let totalHeight = 0;
    for (const para of paragraphs) {
      const pPr = g1(para, "pPr");
      const algn = attr(pPr, "algn", "l");
      const lvl = attrInt(pPr, "lvl", 0);
      const marL = attrInt(pPr, "marL", 0) * scale;
      const indent = attrInt(pPr, "indent", 0) * scale;
      const defRPr = g1(pPr, "defRPr");
      const bullet = pPr ? parseBullet(pPr, defRPr, themeColors, themeData) : null;
      const spcBef = g1(pPr, "spcBef");
      const spcAft = g1(pPr, "spcAft");
      const lnSpc = g1(pPr, "lnSpc");
      let paraDefSz = defaultFontSz;
      if (lstDefRPr) {
        const sz = lstDefRPr.getAttribute("sz");
        if (sz) paraDefSz = parseInt(sz, 10);
      }
      if (defRPr) {
        const sz = defRPr.getAttribute("sz");
        if (sz) paraDefSz = parseInt(sz, 10);
      }
      let spaceBefore = 0, spaceAfter = 0;
      if (spcBef) {
        const sp = g1(spcBef, "spcPct");
        const spp = g1(spcBef, "spcPts");
        if (sp) spaceBefore = paraDefSz * 127 * scale * (attrInt(sp, "val", 0) / 1e5);
        else if (spp) spaceBefore = attrInt(spp, "val", 0) * EMU_PER_PT * scale / 100;
      }
      if (spcAft) {
        const sp = g1(spcAft, "spcPct");
        const spp = g1(spcAft, "spcPts");
        if (sp) spaceAfter = paraDefSz * 127 * scale * (attrInt(sp, "val", 0) / 1e5);
        else if (spp) spaceAfter = attrInt(spp, "val", 0) * EMU_PER_PT * scale / 100;
      }
      const runEls = [];
      for (const child of para.children) {
        const ln = child.localName;
        if (ln === "r" || ln === "br" || ln === "fld") runEls.push(child);
      }
      if (runEls.length === 0) {
        const endParaRPr = g1(para, "endParaRPr");
        const sz = attrInt(endParaRPr || defRPr, "sz", paraDefSz);
        const szPx = sz * 127 * scale * fontScaleAttr;
        paraLayouts.push({ lines: [""], algn, marL, spaceBefore, spaceAfter, szPx, lnSpc, runs: [], emptyPara: true, bullet });
        totalHeight += spaceBefore + szPx * 1.2 + spaceAfter;
        continue;
      }
      let paraLines = [];
      let currentLine = [];
      let maxSzPx = 0;
      for (const runEl of runEls) {
        if (runEl.localName === "br") {
          paraLines.push({ runs: currentLine, maxSzPx: Math.max(maxSzPx, paraDefSz * 127 * scale) });
          currentLine = [];
          maxSzPx = 0;
          continue;
        }
        const rPr = g1(runEl, "rPr");
        const tEl = g1(runEl, "t");
        let text = tEl ? tEl.textContent : "";
        const fontInfo = buildFontInherited(rPr, defRPr, scale * fontScaleAttr, themeData, paraDefSz, lstDefRPr);
        ctx.font = fontInfo.fontStr;
        const szPx = fontInfo.szPx;
        if (szPx > maxSzPx) maxSzPx = szPx;
        const color = getRunColorInherited(rPr, defRPr, themeColors);
        const underline = resolveRPrAttr(rPr, defRPr, "u", "none") !== "none";
        const strikethrough = resolveRPrAttr(rPr, defRPr, "strike", "noStrike") !== "noStrike";
        const baseline = parseInt(resolveRPrAttr(rPr, defRPr, "baseline", "0"), 10);
        if (doWrap) {
          const words = text.split(" ");
          for (let wi = 0; wi < words.length; wi++) {
            const word = words[wi];
            const testRun = { text: word, rPr, fontInfo, color, underline, strikethrough, baseline };
            let lineW = indent + marL;
            for (const run of currentLine) {
              ctx.font = run.fontInfo.fontStr;
              lineW += ctx.measureText(run.text).width;
            }
            ctx.font = fontInfo.fontStr;
            const wordW = ctx.measureText(word).width;
            const sep = currentLine.length ? ctx.measureText(" ").width : 0;
            if (lineW + sep + wordW > tw && currentLine.length > 0) {
              paraLines.push({ runs: currentLine, maxSzPx: Math.max(maxSzPx, szPx) });
              currentLine = [{ text: word, rPr, fontInfo, color, underline, strikethrough, baseline }];
              maxSzPx = szPx;
            } else {
              if (currentLine.length > 0) {
                const spaceRun = { text: " ", rPr, fontInfo, color, underline: false, strikethrough: false, baseline };
                currentLine.push(spaceRun);
              }
              currentLine.push({ text: word, rPr, fontInfo, color, underline, strikethrough, baseline });
            }
          }
        } else {
          currentLine.push({ text, rPr, fontInfo, color, underline, strikethrough, baseline });
          if (szPx > maxSzPx) maxSzPx = szPx;
        }
      }
      if (currentLine.length > 0) {
        paraLines.push({ runs: currentLine, maxSzPx: Math.max(maxSzPx, paraDefSz * 127 * scale) });
      }
      const lnSpcPx = lnSpc ? computeLineHeight(lnSpc, paraDefSz * 127 * scale * fontScaleAttr, scale) : null;
      paraLayouts.push({ lines: paraLines, algn, marL, indent, spaceBefore, spaceAfter, lnSpcPx, emptyPara: false, bullet });
      for (const line of paraLines) {
        totalHeight += spaceBefore + (lnSpcPx || line.maxSzPx * 1.2) + spaceAfter;
      }
    }
    if (normAutoFit && !explicitFontScale && totalHeight > th && th > 0) {
      let lo = 0.3, hi = 1;
      for (let iter = 0; iter < 8; iter++) {
        const mid = (lo + hi) / 2;
        let testH = 0;
        for (const para of paragraphs) {
          const pPr2 = g1(para, "pPr");
          const defRPr2 = pPr2 ? g1(pPr2, "defRPr") : null;
          let pSz = defaultFontSz;
          if (lstDefRPr) {
            const v = lstDefRPr.getAttribute("sz");
            if (v) pSz = parseInt(v, 10);
          }
          if (defRPr2) {
            const v = defRPr2.getAttribute("sz");
            if (v) pSz = parseInt(v, 10);
          }
          const runEls2 = Array.from(para.children).filter((c) => ["r", "br", "fld"].includes(c.localName));
          const szPx = pSz * 127 * scale * mid;
          if (runEls2.length === 0) {
            testH += szPx * 1.2;
            continue;
          }
          const totalText = runEls2.reduce((s, e) => {
            const t = g1(e, "t");
            return s + (t ? t.textContent.length : 0);
          }, 0);
          const effectiveTw = tw > 0 ? tw : bw;
          const sampleText = totalText > 0 ? runEls2.reduce((s, e) => {
            const t = g1(e, "t");
            return s + (t ? t.textContent : "");
          }, "").slice(0, 20) : "W";
          ctx.font = `${szPx}px sans-serif`;
          const avgCharW = sampleText.length > 0 ? ctx.measureText(sampleText).width / sampleText.length : szPx * 0.6;
          const charsPerLine = Math.max(1, Math.floor(effectiveTw / avgCharW));
          const estLines = Math.max(1, Math.ceil(totalText / charsPerLine));
          testH += estLines * szPx * 1.2;
        }
        if (testH <= th) lo = mid;
        else hi = mid;
      }
      fontScaleAttr = (lo + hi) / 2;
    }
    let startY = ty;
    if (anchor === "ctr") {
      startY = ty + (th - totalHeight) / 2;
    } else if (anchor === "b") {
      startY = ty + th - totalHeight;
    }
    let curY = startY;
    const autoNumCounters = {};
    for (const paraLayout of paraLayouts) {
      const { lines, algn, marL, indent, spaceBefore, spaceAfter, lnSpcPx, emptyPara, bullet } = paraLayout;
      curY += spaceBefore;
      if (emptyPara) {
        curY += lines[0] ? lnSpcPx || paraLayout.szPx * 1.2 : 12 * scale;
        curY += spaceAfter;
        continue;
      }
      for (const lineObj of lines) {
        const { runs, maxSzPx } = lineObj;
        const lineH = lnSpcPx || maxSzPx * 1.2;
        const baseline = curY + maxSzPx * 0.85;
        let lineW = 0;
        for (const run of runs) {
          ctx.font = run.fontInfo.fontStr;
          lineW += ctx.measureText(run.text).width;
        }
        let runX = tx + marL;
        if (algn === "ctr") {
          runX = tx + (tw - lineW) / 2;
        } else if (algn === "r") {
          runX = tx + tw - lineW;
        }
        const isFirstLineOfPara = lineObj === lines[0];
        if (bullet && isFirstLineOfPara) {
          const bulletX = tx + marL + indent;
          drawBullet(ctx, bullet, bulletX, baseline, autoNumCounters);
        }
        let justWordGap = 0;
        if (algn === "just") {
          const isLastLine = lineObj === lines[lines.length - 1];
          if (!isLastLine) {
            let spaceCount = 0;
            for (const run of runs) {
              ctx.font = run.fontInfo.fontStr;
              spaceCount += (run.text.match(/ /g) || []).length;
            }
            const slack = tw - marL - lineW;
            if (spaceCount > 0 && slack > 0) {
              justWordGap = slack / spaceCount;
            }
          }
        }
        const drawRunSegment = (text, rx, drawY, fi, underline, strike) => {
          ctx.font = fi.fontStr;
          const sw = ctx.measureText(text).width;
          ctx.fillText(text, rx, drawY);
          const lw = Math.max(0.5, fi.szPx * 0.07);
          if (underline) {
            ctx.save();
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.moveTo(rx, drawY + lw * 1.5);
            ctx.lineTo(rx + sw, drawY + lw * 1.5);
            ctx.stroke();
            ctx.restore();
          }
          if (strike) {
            ctx.save();
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = lw;
            ctx.beginPath();
            ctx.moveTo(rx, drawY - fi.szPx * 0.3);
            ctx.lineTo(rx + sw, drawY - fi.szPx * 0.3);
            ctx.stroke();
            ctx.restore();
          }
          return sw;
        };
        for (const run of runs) {
          const c = run.color;
          ctx.fillStyle = c ? typeof c === "string" ? c : colorToCss(c) : "#000000";
          let drawY = baseline;
          let fi = run.fontInfo;
          if (run.baseline !== 0) {
            const subSz = fi.szPx * 0.65;
            const subFont = `${fi.italic ? "italic " : ""}${fi.bold ? "bold " : ""}${subSz}px "${fi.family}", sans-serif`;
            fi = { ...fi, szPx: subSz, fontStr: subFont };
            if (run.baseline > 0) drawY = baseline - run.fontInfo.szPx * 0.38;
            else drawY = baseline + run.fontInfo.szPx * 0.12;
          }
          if (justWordGap > 0 && run.text.includes(" ")) {
            ctx.font = fi.fontStr;
            const parts = run.text.split(" ");
            for (let pi = 0; pi < parts.length; pi++) {
              const pw = drawRunSegment(parts[pi], runX, drawY, fi, run.underline, run.strikethrough);
              runX += pw;
              if (pi < parts.length - 1) {
                ctx.font = fi.fontStr;
                runX += ctx.measureText(" ").width + justWordGap;
              }
            }
          } else {
            ctx.font = fi.fontStr;
            const rw = ctx.measureText(run.text).width;
            drawRunSegment(run.text, runX, drawY, fi, run.underline, run.strikethrough);
            runX += rw;
          }
        }
        curY += lineH;
      }
      curY += spaceAfter;
    }
    if (isVert) ctx.restore();
  }
  function applyEffects(ctx, spPr, themeColors, scale) {
    const effectLst = g1(spPr, "effectLst");
    if (!effectLst) return () => {
    };
    const outerShdw = g1(effectLst, "outerShdw");
    const innerShdw = g1(effectLst, "innerShdw");
    const shadow = outerShdw || innerShdw;
    if (shadow) {
      const blurRad = attrInt(shadow, "blurRad", 38100) * scale;
      const dist = attrInt(shadow, "dist", 38100) * scale;
      const dirRaw = attrInt(shadow, "dir", 27e5);
      const dirRad = dirRaw / 6e4 * Math.PI / 180;
      const offsetX = dist * Math.cos(dirRad);
      const offsetY = dist * Math.sin(dirRad);
      const colorChild = findFirstColorChild(shadow);
      const c = resolveColorElement(colorChild, themeColors);
      const shadowColor = c ? colorToCss(c) : "rgba(0,0,0,0.35)";
      ctx.shadowBlur = Math.min(blurRad, 40);
      ctx.shadowOffsetX = offsetX;
      ctx.shadowOffsetY = offsetY;
      ctx.shadowColor = shadowColor;
    }
    const glow = g1(effectLst, "glow");
    if (glow) {
      const rad = attrInt(glow, "rad", 0) * scale;
      const colorChild = findFirstColorChild(glow);
      const c = resolveColorElement(colorChild, themeColors);
      if (c) {
        ctx.shadowBlur = Math.min(rad, 30);
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowColor = colorToCss(c);
      }
    }
    return () => {
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowColor = "transparent";
    };
  }
  async function renderShape(ctx, spEl, rels, imageCache, themeColors, themeData, scale, parentGroup = null, placeholderMap = null) {
    const spPr = g1(spEl, "spPr");
    const xfrm = g1(spPr, "xfrm");
    let x = 0, y = 0, w = 0, h = 0;
    let rot = 0;
    let flipH = false, flipV = false;
    if (xfrm) {
      const off = g1(xfrm, "off");
      const ext = g1(xfrm, "ext");
      if (off) {
        x = attrInt(off, "x", 0) * scale;
        y = attrInt(off, "y", 0) * scale;
      }
      if (ext) {
        w = attrInt(ext, "cx", 0) * scale;
        h = attrInt(ext, "cy", 0) * scale;
      }
      rot = attrInt(xfrm, "rot", 0) / 6e4;
      flipH = attr(xfrm, "flipH", "0") === "1";
      flipV = attr(xfrm, "flipV", "0") === "1";
    } else {
      const phData = resolvePlaceholderXfrm(spEl, placeholderMap);
      if (phData) {
        x = phData.x * scale;
        y = phData.y * scale;
        w = phData.w * scale;
        h = phData.h * scale;
      } else {
        return;
      }
    }
    if (w <= 0 || h <= 0) return;
    if (parentGroup) {
      const { grpOff, grpExt, chOff, chExt } = parentGroup;
      const scaleX = grpExt.cx / chExt.cx;
      const scaleY = grpExt.cy / chExt.cy;
      x = grpOff.x + (x / scale - chOff.x) * scaleX * scale;
      y = grpOff.y + (y / scale - chOff.y) * scaleY * scale;
      w = w * scaleX;
      h = h * scaleY;
    }
    const cx = x + w / 2, cy = y + h / 2;
    ctx.save();
    if (rot !== 0 || flipH || flipV) {
      ctx.translate(cx, cy);
      if (rot !== 0) ctx.rotate(rot * Math.PI / 180);
      if (flipH) ctx.scale(-1, 1);
      if (flipV) ctx.scale(1, -1);
      ctx.translate(-cx, -cy);
    }
    const prstGeom = g1(spPr, "prstGeom");
    const custGeom = g1(spPr, "custGeom");
    const prst = prstGeom ? attr(prstGeom, "prst", "rect") : "rect";
    const adjValues = {};
    if (prstGeom) {
      const avLst = g1(prstGeom, "avLst");
      if (avLst) {
        let idx = 0;
        for (const gd of gtn(avLst, "gd")) {
          const fmla = attr(gd, "fmla", "");
          const m = fmla.match(/val\s+(-?\d+)/);
          if (m) adjValues[idx] = parseInt(m[1]);
          idx++;
        }
      }
    }
    const getFill = () => {
      const fillNames = ["noFill", "solidFill", "gradFill", "blipFill", "pattFill", "grpFill"];
      for (const child of spPr ? spPr.children : []) {
        if (fillNames.includes(child.localName)) return child;
      }
      const styleEl = g1(spEl, "style");
      if (styleEl) {
        const fillRef = g1(styleEl, "fillRef");
        if (fillRef) {
          const idx = attrInt(fillRef, "idx", 1);
          if (idx === 0) return parseXml("<noFill/>").documentElement;
          const colorChild = findFirstColorChild(fillRef);
          if (colorChild) {
            const ns = "http://schemas.openxmlformats.org/drawingml/2006/main";
            const doc = parseXml('<solidFill xmlns="' + ns + '">' + colorChild.outerHTML + "</solidFill>");
            return doc.documentElement;
          }
        }
      }
      return null;
    };
    const getOutline = () => {
      const ln = g1(spPr, "ln");
      if (ln) return ln;
      const styleEl = g1(spEl, "style");
      if (styleEl) {
        const lnRef = g1(styleEl, "lnRef");
        if (lnRef) {
          const idx = attrInt(lnRef, "idx", 1);
          if (idx === 0) return null;
          const colorChild = findFirstColorChild(lnRef);
          if (colorChild) {
            const ns = "http://schemas.openxmlformats.org/drawingml/2006/main";
            const doc = parseXml('<ln xmlns="' + ns + '"><solidFill>' + colorChild.outerHTML + "</solidFill></ln>");
            return doc.documentElement;
          }
        }
      }
      return null;
    };
    if (custGeom) {
      const pathLst = g1(custGeom, "pathLst");
      if (pathLst) {
        for (const pathEl of gtn(pathLst, "path")) {
          const pw = attrInt(pathEl, "w", 1) || 1;
          const ph = attrInt(pathEl, "h", 1) || 1;
          const sx = w / pw, sy = h / ph;
          ctx.beginPath();
          let cx0 = x, cy0 = y;
          for (const cmd of pathEl.children) {
            switch (cmd.localName) {
              case "moveTo": {
                const pt = g1(cmd, "pt");
                if (pt) ctx.moveTo(x + attrInt(pt, "x", 0) * sx, y + attrInt(pt, "y", 0) * sy);
                break;
              }
              case "lnTo": {
                const pt = g1(cmd, "pt");
                if (pt) ctx.lineTo(x + attrInt(pt, "x", 0) * sx, y + attrInt(pt, "y", 0) * sy);
                break;
              }
              case "cubicBezTo": {
                const pts = gtn(cmd, "pt");
                if (pts.length >= 3) {
                  ctx.bezierCurveTo(
                    x + attrInt(pts[0], "x", 0) * sx,
                    y + attrInt(pts[0], "y", 0) * sy,
                    x + attrInt(pts[1], "x", 0) * sx,
                    y + attrInt(pts[1], "y", 0) * sy,
                    x + attrInt(pts[2], "x", 0) * sx,
                    y + attrInt(pts[2], "y", 0) * sy
                  );
                }
                break;
              }
              case "quadBezTo": {
                const pts = gtn(cmd, "pt");
                if (pts.length >= 2) {
                  ctx.quadraticCurveTo(
                    x + attrInt(pts[0], "x", 0) * sx,
                    y + attrInt(pts[0], "y", 0) * sy,
                    x + attrInt(pts[1], "x", 0) * sx,
                    y + attrInt(pts[1], "y", 0) * sy
                  );
                }
                break;
              }
              case "arcTo": {
                const wR = attrInt(cmd, "wR", 0) * sx;
                const hR = attrInt(cmd, "hR", 0) * sy;
                const stAng = attrInt(cmd, "stAng", 0) / 6e4 * Math.PI / 180;
                const swAng = attrInt(cmd, "swAng", 0) / 6e4 * Math.PI / 180;
                const lastX = ctx._lastX || x;
                const lastY = ctx._lastY || y;
                const ecx = lastX - wR * Math.cos(stAng);
                const ecy = lastY - hR * Math.sin(stAng);
                if (wR === hR) {
                  ctx.arc(ecx, ecy, wR, stAng, stAng + swAng, swAng < 0);
                } else {
                  ctx.ellipse(ecx, ecy, wR, hR, 0, stAng, stAng + swAng, swAng < 0);
                }
                break;
              }
              case "close":
                ctx.closePath();
                break;
            }
          }
          const fillEl = getFill();
          if (fillEl) await applyFill(ctx, fillEl, x, y, w, h, scale, themeColors, imageCache);
          const lnEl = getOutline();
          if (lnEl) applyOutline(ctx, lnEl, themeColors, scale);
        }
      }
      ctx.restore();
      const txBody2 = g1(spEl, "txBody");
      if (txBody2) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        const defSz = getDefaultFontSize(spEl, themeData);
        await renderTextBody(ctx, txBody2, x, y, w, h, scale, themeColors, themeData, defSz);
        ctx.restore();
      }
      return;
    }
    ctx.beginPath();
    const pathDrawn = drawPresetGeom(ctx, prst, x, y, w, h, adjValues);
    const cleanupEffects = applyEffects(ctx, spPr, themeColors, scale);
    const fx3d = x, fy3d = y, fw3d = w, fh3d = h;
    const effects3d = has3D(spPr) ? setup3D(ctx, spPr, themeColors, fx3d, fy3d, fw3d, fh3d, scale) : null;
    try {
      const fillEl = getFill();
      let filled = false;
      if (fillEl) {
        filled = await applyFill(ctx, fillEl, x, y, w, h, scale, themeColors, imageCache);
      }
      if (effects3d) {
        effects3d.overlay();
      }
      const lnEl = getOutline();
      if (lnEl) {
        applyOutline(ctx, lnEl, themeColors, scale);
      } else if (!filled) {
        if (prst === "line" || prst === "straightConnector1") {
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    } finally {
      cleanupEffects();
      if (effects3d?.cleanup) effects3d.cleanup();
    }
    ctx.restore();
    const txBody = g1(spEl, "txBody");
    if (txBody) {
      ctx.save();
      if (rot !== 0 || flipH || flipV) {
        ctx.translate(cx, cy);
        if (rot !== 0) ctx.rotate(rot * Math.PI / 180);
        if (flipH) ctx.scale(-1, 1);
        if (flipV) ctx.scale(1, -1);
        ctx.translate(-cx, -cy);
      }
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      const defSz = getDefaultFontSize(spEl, themeData);
      await renderTextBody(ctx, txBody, x, y, w, h, scale, themeColors, themeData, defSz);
      ctx.restore();
    }
  }
  function getDefaultFontSize(spEl, themeData) {
    const nvSpPr = g1(spEl, "nvSpPr");
    const nvPr = nvSpPr ? g1(nvSpPr, "nvPr") : null;
    const ph = nvPr ? g1(nvPr, "ph") : null;
    if (ph) {
      const phType = attr(ph, "type", "body");
      if (phType === "title" || phType === "ctrTitle") return 4400;
      if (phType === "subTitle" || phType === "body") return 2800;
    }
    return 1800;
  }
  function applyOutline(ctx, lnEl, themeColors, scale) {
    if (!lnEl) return;
    const noFill = g1(lnEl, "noFill");
    if (noFill) return;
    const solidFill = g1(lnEl, "solidFill");
    const gradFill = g1(lnEl, "gradFill");
    const w = attrInt(lnEl, "w", 12700);
    const lineW = Math.max(0.5, w * scale);
    let strokeColor = "#000000";
    if (solidFill) {
      const colorChild = findFirstColorChild(solidFill);
      const c = resolveColorElement(colorChild, themeColors);
      if (c) strokeColor = colorToCss(c);
    } else if (gradFill) {
      strokeColor = "#888888";
    }
    const prstDash = g1(lnEl, "prstDash");
    const dashType = prstDash ? attr(prstDash, "val", "solid") : "solid";
    const capType = attr(lnEl, "cap", "flat");
    const joinType = attr(lnEl, "cmpd", "sng");
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineW;
    ctx.lineCap = capType === "rnd" ? "round" : capType === "sq" ? "square" : "butt";
    ctx.lineJoin = "round";
    switch (dashType) {
      case "dash":
        ctx.setLineDash([lineW * 4, lineW * 2]);
        break;
      case "dot":
        ctx.setLineDash([lineW, lineW * 2]);
        break;
      case "dashDot":
        ctx.setLineDash([lineW * 4, lineW * 2, lineW, lineW * 2]);
        break;
      case "lgDash":
        ctx.setLineDash([lineW * 8, lineW * 3]);
        break;
      case "lgDashDot":
        ctx.setLineDash([lineW * 8, lineW * 3, lineW, lineW * 3]);
        break;
      default:
        ctx.setLineDash([]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  async function renderPicture(ctx, picEl, rels, imageCache, themeColors, scale) {
    const spPr = g1(picEl, "spPr");
    const xfrm = g1(spPr, "xfrm");
    if (!xfrm) return;
    const off = g1(xfrm, "off");
    const ext = g1(xfrm, "ext");
    if (!off || !ext) return;
    const x = attrInt(off, "x", 0) * scale;
    const y = attrInt(off, "y", 0) * scale;
    const w = attrInt(ext, "cx", 0) * scale;
    const h = attrInt(ext, "cy", 0) * scale;
    const rot = attrInt(xfrm, "rot", 0) / 6e4;
    const flipH = attr(xfrm, "flipH", "0") === "1";
    const flipV = attr(xfrm, "flipV", "0") === "1";
    if (w <= 0 || h <= 0) return;
    const blipFill = g1(picEl, "blipFill");
    const blip = blipFill ? g1(blipFill, "blip") : null;
    const rEmbed = blip ? blip.getAttribute("r:embed") || blip.getAttribute("embed") : null;
    const cx = x + w / 2, cy = y + h / 2;
    ctx.save();
    if (rot !== 0 || flipH || flipV) {
      ctx.translate(cx, cy);
      if (rot !== 0) ctx.rotate(rot * Math.PI / 180);
      if (flipH) ctx.scale(-1, 1);
      if (flipV) ctx.scale(1, -1);
      ctx.translate(-cx, -cy);
    }
    if (rEmbed && imageCache[rEmbed]) {
      const img = imageCache[rEmbed];
      const prstGeom = g1(spPr, "prstGeom");
      const prst = prstGeom ? attr(prstGeom, "prst", "rect") : "rect";
      const adjValues = {};
      if (prstGeom) {
        const avLst = g1(prstGeom, "avLst");
        if (avLst) {
          let idx = 0;
          for (const gd of gtn(avLst, "gd")) {
            const m = (attr(gd, "fmla", "") || "").match(/val\s+(-?\d+)/);
            if (m) adjValues[idx] = parseInt(m[1]);
            idx++;
          }
        }
      }
      ctx.beginPath();
      drawPresetGeom(ctx, prst, x, y, w, h, adjValues);
      ctx.clip();
      const srcRect = blipFill ? g1(blipFill, "srcRect") : null;
      if (srcRect) {
        const l = attrInt(srcRect, "l", 0) / 1e5;
        const t = attrInt(srcRect, "t", 0) / 1e5;
        const r = attrInt(srcRect, "r", 0) / 1e5;
        const b = attrInt(srcRect, "b", 0) / 1e5;
        const sw = img.naturalWidth * (1 - l - r);
        const sh = img.naturalHeight * (1 - t - b);
        ctx.drawImage(
          img,
          img.naturalWidth * l,
          img.naturalHeight * t,
          sw,
          sh,
          x,
          y,
          w,
          h
        );
      } else {
        ctx.drawImage(img, x, y, w, h);
      }
      const lnEl = g1(spPr, "ln");
      if (lnEl) {
        ctx.beginPath();
        drawPresetGeom(ctx, prst, x, y, w, h, adjValues);
        applyOutline(ctx, lnEl, themeColors, scale);
      }
    } else {
      ctx.fillStyle = "#e0e0e0";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#aaa";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h);
      ctx.moveTo(x + w, y);
      ctx.lineTo(x, y + h);
      ctx.stroke();
    }
    ctx.restore();
  }
  async function renderTable(ctx, graphicFrame, themeColors, themeData, scale) {
    const xfrm = g1(graphicFrame, "xfrm");
    if (!xfrm) return;
    const off = g1(xfrm, "off");
    const ext = g1(xfrm, "ext");
    if (!off || !ext) return;
    const fx = attrInt(off, "x", 0) * scale;
    const fy = attrInt(off, "y", 0) * scale;
    const fw = attrInt(ext, "cx", 0) * scale;
    const fh = attrInt(ext, "cy", 0) * scale;
    const graphic = g1(graphicFrame, "graphic");
    const graphicData = graphic ? g1(graphic, "graphicData") : null;
    const tbl = graphicData ? g1(graphicData, "tbl") : null;
    if (!tbl) return;
    const tblPr = g1(tbl, "tblPr");
    const bandRow = tblPr ? attr(tblPr, "bandRow", "0") === "1" : false;
    const bandCol = tblPr ? attr(tblPr, "bandCol", "0") === "1" : false;
    const firstRow = tblPr ? attr(tblPr, "firstRow", "0") === "1" : false;
    const lastRow = tblPr ? attr(tblPr, "lastRow", "0") === "1" : false;
    const firstCol = tblPr ? attr(tblPr, "firstCol", "0") === "1" : false;
    const lastCol = tblPr ? attr(tblPr, "lastCol", "0") === "1" : false;
    const tblGrid = g1(tbl, "tblGrid");
    const colWidths = gtn(tblGrid, "gridCol").map((gc) => attrInt(gc, "w", 0) * scale);
    const rows = gtn(tbl, "tr");
    let curY = fy;
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const rowH = attrInt(row, "h", 457200) * scale;
      const cells = gtn(row, "tc");
      let curX = fx;
      const isFirstRow = ri === 0;
      const isLastRow = ri === rows.length - 1;
      const isOddRow = ri % 2 === 1;
      for (let ci = 0; ci < cells.length; ci++) {
        const cell = cells[ci];
        const gridSpan = attrInt(cell, "gridSpan", 1);
        const vMerge = attr(cell, "vMerge", "0") === "1";
        let cellW = 0;
        for (let gs = 0; gs < gridSpan; gs++) {
          cellW += colWidths[ci + gs] || 0;
        }
        const tcPr = g1(cell, "tcPr");
        const fillEl = tcPr ? [...tcPr.children].find((c) => ["noFill", "solidFill", "gradFill", "blipFill", "pattFill"].includes(c.localName)) ?? null : null;
        ctx.save();
        ctx.beginPath();
        ctx.rect(curX, curY, cellW, rowH);
        if (fillEl) {
          await applyFill(ctx, fillEl, curX, curY, cellW, rowH, scale, themeColors, null);
        } else {
          let bandFill = null;
          if (firstRow && isFirstRow) {
            bandFill = themeColors.accent1 ? "#" + themeColors.accent1.toLowerCase() : "#4472C4";
          } else if (lastRow && isLastRow) {
            bandFill = "#e0e0e0";
          } else if (bandRow && isOddRow) {
            bandFill = "rgba(0,0,0,0.06)";
          }
          ctx.fillStyle = bandFill || "transparent";
          if (bandFill) ctx.fill();
        }
        const borderProps = [
          { el: g1(tcPr, "lnL"), x1: curX, y1: curY, x2: curX, y2: curY + rowH },
          { el: g1(tcPr, "lnR"), x1: curX + cellW, y1: curY, x2: curX + cellW, y2: curY + rowH },
          { el: g1(tcPr, "lnT"), x1: curX, y1: curY, x2: curX + cellW, y2: curY },
          { el: g1(tcPr, "lnB"), x1: curX, y1: curY + rowH, x2: curX + cellW, y2: curY + rowH }
        ];
        for (const border of borderProps) {
          if (!border.el) {
            ctx.beginPath();
            ctx.strokeStyle = "#cccccc";
            ctx.lineWidth = 0.5;
            ctx.moveTo(border.x1, border.y1);
            ctx.lineTo(border.x2, border.y2);
            ctx.stroke();
          } else {
            const noFill2 = g1(border.el, "noFill");
            if (!noFill2) {
              ctx.beginPath();
              ctx.moveTo(border.x1, border.y1);
              ctx.lineTo(border.x2, border.y2);
              applyOutline(ctx, border.el, themeColors, scale);
            }
          }
        }
        ctx.restore();
        const txBody = g1(cell, "txBody");
        if (txBody) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(curX, curY, cellW, rowH);
          ctx.clip();
          await renderTextBody(ctx, txBody, curX, curY, cellW, rowH, scale, themeColors, themeData, 1400);
          ctx.restore();
        }
        curX += cellW;
      }
      curY += rowH;
    }
  }
  async function renderGroupShape(ctx, grpSpEl, rels, imageCache, themeColors, themeData, scale) {
    const grpSpPr = g1(grpSpEl, "grpSpPr");
    const xfrm = g1(grpSpPr, "xfrm");
    if (!xfrm) return;
    const off = g1(xfrm, "off");
    const ext = g1(xfrm, "ext");
    const chOff = g1(xfrm, "chOff");
    const chExt = g1(xfrm, "chExt");
    if (!off || !ext || !chOff || !chExt) return;
    const rot = attrInt(xfrm, "rot", 0) / 6e4;
    const flipH = attr(xfrm, "flipH", "0") === "1";
    const flipV = attr(xfrm, "flipV", "0") === "1";
    const parentGroup = {
      grpOff: { x: attrInt(off, "x", 0) * scale, y: attrInt(off, "y", 0) * scale },
      grpExt: { cx: attrInt(ext, "cx", 0) * scale, cy: attrInt(ext, "cy", 0) * scale },
      chOff: { x: attrInt(chOff, "x", 0), y: attrInt(chOff, "y", 0) },
      chExt: { cx: attrInt(chExt, "cx", 1), cy: attrInt(chExt, "cy", 1) }
    };
    const grpCx = parentGroup.grpOff.x + parentGroup.grpExt.cx / 2;
    const grpCy = parentGroup.grpOff.y + parentGroup.grpExt.cy / 2;
    ctx.save();
    if (rot !== 0 || flipH || flipV) {
      ctx.translate(grpCx, grpCy);
      if (rot !== 0) ctx.rotate(rot * Math.PI / 180);
      if (flipH) ctx.scale(-1, 1);
      if (flipV) ctx.scale(1, -1);
      ctx.translate(-grpCx, -grpCy);
    }
    for (const child of grpSpEl.children) {
      const ln = child.localName;
      if (ln === "sp") await renderShape(ctx, child, rels, imageCache, themeColors, themeData, scale, parentGroup);
      else if (ln === "pic") await renderPicture(ctx, child, rels, imageCache, themeColors, scale);
      else if (ln === "grpSp") await renderGroupShape(ctx, child, rels, imageCache, themeColors, themeData, scale);
      else if (ln === "graphicFrame") await renderGraphicFrame(ctx, child, themeColors, themeData, scale, files, rels);
      else if (ln === "cxnSp") await renderConnector(ctx, child, themeColors, scale);
    }
    ctx.restore();
  }
  function drawArrowEnd(ctx, lnEl, endName, tipX, tipY, fromX, fromY, themeColors, scale) {
    const endEl = g1(lnEl, endName);
    if (!endEl) return;
    const type = endEl.getAttribute("type") || "none";
    if (type === "none") return;
    const sizeMap = { sm: 3, med: 6, lg: 9 };
    const lineW = Math.max(0.5, attrInt(lnEl, "w", 12700) * scale);
    const aw = lineW * (sizeMap[endEl.getAttribute("w") || "med"] ?? 6);
    const al = lineW * (sizeMap[endEl.getAttribute("len") || "med"] ?? 6);
    const angle = Math.atan2(fromY - tipY, fromX - tipX);
    ctx.save();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.strokeStyle = ctx.strokeStyle;
    switch (type) {
      case "triangle":
      case "arrow":
      case "stealth": {
        const open = type === "arrow";
        const indent = type === "stealth" ? al * 0.5 : 0;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(
          tipX + al * Math.cos(angle) + aw / 2 * Math.sin(angle),
          tipY + al * Math.sin(angle) - aw / 2 * Math.cos(angle)
        );
        if (!open) ctx.lineTo(tipX + indent * Math.cos(angle), tipY + indent * Math.sin(angle));
        ctx.lineTo(
          tipX + al * Math.cos(angle) - aw / 2 * Math.sin(angle),
          tipY + al * Math.sin(angle) + aw / 2 * Math.cos(angle)
        );
        ctx.closePath();
        if (open) ctx.stroke();
        else ctx.fill();
        break;
      }
      case "diamond": {
        const mid = al / 2;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(
          tipX + mid * Math.cos(angle) + aw / 2 * Math.sin(angle),
          tipY + mid * Math.sin(angle) - aw / 2 * Math.cos(angle)
        );
        ctx.lineTo(tipX + al * Math.cos(angle), tipY + al * Math.sin(angle));
        ctx.lineTo(
          tipX + mid * Math.cos(angle) - aw / 2 * Math.sin(angle),
          tipY + mid * Math.sin(angle) + aw / 2 * Math.cos(angle)
        );
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "oval": {
        const rx = al / 2, ry = aw / 2;
        const cx = tipX + rx * Math.cos(angle), cy = tipY + rx * Math.sin(angle);
        ctx.beginPath();
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.scale(1, ry / rx);
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.restore();
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }
  async function renderConnector(ctx, cxnSpEl, themeColors, scale) {
    const spPr = g1(cxnSpEl, "spPr");
    const xfrm = g1(spPr, "xfrm");
    if (!xfrm) return;
    const off = g1(xfrm, "off");
    const ext = g1(xfrm, "ext");
    if (!off || !ext) return;
    const x = attrInt(off, "x", 0) * scale;
    const y = attrInt(off, "y", 0) * scale;
    const w = attrInt(ext, "cx", 0) * scale;
    const h = attrInt(ext, "cy", 0) * scale;
    const rot = attrInt(xfrm, "rot", 0) / 6e4;
    const flipH = attr(xfrm, "flipH", "0") === "1";
    const flipV = attr(xfrm, "flipV", "0") === "1";
    const cx = x + w / 2, cy = y + h / 2;
    const lnEl = g1(spPr, "ln");
    ctx.save();
    if (rot !== 0 || flipH || flipV) {
      ctx.translate(cx, cy);
      if (rot !== 0) ctx.rotate(rot * Math.PI / 180);
      if (flipH) ctx.scale(-1, 1);
      if (flipV) ctx.scale(1, -1);
      ctx.translate(-cx, -cy);
    }
    const prstGeom = g1(spPr, "prstGeom");
    const prst = prstGeom ? attr(prstGeom, "prst", "line") : "line";
    const isLine = prst === "line" || prst === "straightConnector1";
    ctx.beginPath();
    if (isLine) {
      const x2 = flipH ? x : x + w;
      const y2 = flipV ? y : y + h;
      const x1 = flipH ? x + w : x;
      const y1 = flipV ? y + h : y;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    } else {
      drawPresetGeom(ctx, prst, x, y, w, h, {});
    }
    if (lnEl) {
      applyOutline(ctx, lnEl, themeColors, scale);
      if (isLine) {
        const x1r = flipH ? x + w : x, y1r = flipV ? y + h : y;
        const x2r = flipH ? x : x + w, y2r = flipV ? y : y + h;
        drawArrowEnd(ctx, lnEl, "headEnd", x2r, y2r, x1r, y1r, themeColors, scale);
        drawArrowEnd(ctx, lnEl, "tailEnd", x1r, y1r, x2r, y2r, themeColors, scale);
      }
    } else {
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
  async function renderBackground(ctx, slideDoc, masterDoc, layoutDoc, rels, masterRels, imageCache, themeColors, scale, slideW, slideH) {
    const canvasW = slideW * scale;
    const canvasH = slideH * scale;
    const getBg = (doc) => {
      const cSld = g1(doc, "cSld");
      if (!cSld) return null;
      const bg = g1(cSld, "bg");
      if (!bg) return null;
      const bgPr = g1(bg, "bgPr");
      const bgRef = g1(bg, "bgRef");
      return { bgPr, bgRef };
    };
    const slideBg = slideDoc ? getBg(slideDoc) : null;
    const layoutBg = layoutDoc ? getBg(layoutDoc) : null;
    const masterBg = masterDoc ? getBg(masterDoc) : null;
    const bgData = slideBg || layoutBg || masterBg;
    let rendered = false;
    if (bgData) {
      const { bgPr, bgRef } = bgData;
      if (bgPr) {
        const fills = ["noFill", "solidFill", "gradFill", "blipFill", "pattFill"];
        for (const fn of fills) {
          const fillEl = g1(bgPr, fn);
          if (fillEl) {
            ctx.beginPath();
            ctx.rect(0, 0, canvasW, canvasH);
            const useCache = bgData === masterBg ? Object.assign({}, imageCache) : imageCache;
            const ok = await applyFill(ctx, fillEl, 0, 0, canvasW, canvasH, 1, themeColors, useCache);
            if (ok) rendered = true;
            break;
          }
        }
      } else if (bgRef) {
        const idx = attrInt(bgRef, "idx", 0);
        const colorChild = findFirstColorChild(bgRef);
        const c = resolveColorElement(colorChild, themeColors);
        if (c) {
          ctx.fillStyle = colorToCss(c);
          ctx.fillRect(0, 0, canvasW, canvasH);
          rendered = true;
        }
      }
    }
    if (!rendered) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvasW, canvasH);
    }
  }
  function buildPlaceholderMap(docs) {
    const map = {};
    for (const doc of docs) {
      if (!doc) continue;
      const cSld = g1(doc, "cSld");
      const spTree = cSld ? g1(cSld, "spTree") : null;
      if (!spTree) continue;
      for (const sp of gtn(spTree, "sp")) {
        const nvSpPr = g1(sp, "nvSpPr");
        const nvPr = nvSpPr ? g1(nvSpPr, "nvPr") : null;
        const ph = nvPr ? g1(nvPr, "ph") : null;
        if (!ph) continue;
        const phType = attr(ph, "type", "body");
        const phIdx = attr(ph, "idx", "0");
        const key = `${phType}:${phIdx}`;
        if (map[key]) continue;
        const spPr = g1(sp, "spPr");
        const xfrm = g1(spPr, "xfrm");
        if (!xfrm) continue;
        const off = g1(xfrm, "off");
        const ext = g1(xfrm, "ext");
        if (!off || !ext) continue;
        map[key] = {
          x: attrInt(off, "x", 0),
          y: attrInt(off, "y", 0),
          w: attrInt(ext, "cx", 0),
          h: attrInt(ext, "cy", 0),
          txBody: g1(sp, "txBody")
        };
      }
    }
    return map;
  }
  function resolvePlaceholderXfrm(spEl, placeholderMap) {
    if (!placeholderMap) return null;
    const nvSpPr = g1(spEl, "nvSpPr");
    const nvPr = nvSpPr ? g1(nvSpPr, "nvPr") : null;
    const ph = nvPr ? g1(nvPr, "ph") : null;
    if (!ph) return null;
    const phType = attr(ph, "type", "body");
    const phIdx = attr(ph, "idx", "0");
    return placeholderMap[`${phType}:${phIdx}`] || placeholderMap[`${phType}:0`] || placeholderMap[`body:${phIdx}`] || null;
  }
  async function renderGraphicFrame(ctx, graphicFrame, themeColors, themeData, scale, files2, slideRels) {
    const graphic = g1(graphicFrame, "graphic");
    const graphicData = graphic ? g1(graphic, "graphicData") : null;
    const uri = graphicData ? attr(graphicData, "uri", "") : "";
    if (g1(graphicFrame, "tbl") || graphicData && g1(graphicData, "tbl")) {
      return renderTable(ctx, graphicFrame, themeColors, themeData, scale);
    }
    const xfrm = g1(graphicFrame, "xfrm");
    if (!xfrm) return;
    const off = g1(xfrm, "off"), ext = g1(xfrm, "ext");
    if (!off || !ext) return;
    const fx = attrInt(off, "x", 0) * scale;
    const fy = attrInt(off, "y", 0) * scale;
    const fw = attrInt(ext, "cx", 0) * scale;
    const fh = attrInt(ext, "cy", 0) * scale;
    if (fw <= 0 || fh <= 0) return;
    const isChart = uri.includes("chart");
    const isDiagram = uri.includes("diagram");
    if (isChart && files2 && slideRels) {
      const chartEl = graphicData ? g1(graphicData, "chart") : null;
      const rId = chartEl ? chartEl.getAttribute("r:id") || chartEl.getAttribute("id") : null;
      const rel = rId ? slideRels[rId] : null;
      if (rel && files2[rel.fullPath]) {
        const chartXml = new TextDecoder().decode(files2[rel.fullPath]);
        const chartDoc = parseXml(chartXml);
        renderChart(ctx, chartDoc, fx, fy, fw, fh, themeColors, scale);
        return;
      }
    }
    if (isDiagram && files2 && slideRels) {
      const dgmEl = graphicData ? g1(graphicData, "relIds") : null;
      const dmId = dgmEl ? dgmEl.getAttribute("r:dm") || dgmEl.getAttribute("dm") : null;
      const rel = dmId ? slideRels[dmId] : null;
      if (rel && files2[rel.fullPath]) {
        const dataXml = new TextDecoder().decode(files2[rel.fullPath]);
        const dataDoc = parseXml(dataXml);
        const loId = dgmEl ? dgmEl.getAttribute("r:lo") || dgmEl.getAttribute("lo") : null;
        const loRel = loId ? slideRels[loId] : null;
        const layoutDoc = loRel && files2[loRel.fullPath] ? parseXml(new TextDecoder().decode(files2[loRel.fullPath])) : null;
        const { renderSmartArt: renderSmartArt2 } = await Promise.resolve().then(() => (init_smartart(), smartart_exports));
        renderSmartArt2(ctx, dataDoc, layoutDoc, fx, fy, fw, fh, themeColors, scale);
        return;
      }
    }
    const label = isChart ? "\u{1F4CA} Chart" : isDiagram ? "\u{1F537} Diagram" : "\u2B1B Graphic";
    ctx.save();
    ctx.fillStyle = "#f4f4f8";
    ctx.strokeStyle = "#ccccdd";
    ctx.lineWidth = 1;
    ctx.fillRect(fx, fy, fw, fh);
    ctx.strokeRect(fx, fy, fw, fh);
    ctx.fillStyle = "#999";
    ctx.font = `${Math.min(fw * 0.07, 16 * scale)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, fx + fw / 2, fy + fh / 2);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }
  async function renderSpTree(ctx, spTreeEl, rels, imageCache, themeColors, themeData, scale, placeholderMap, files2) {
    if (!spTreeEl) return;
    for (const child of spTreeEl.children) {
      const ln = child.localName;
      try {
        if (ln === "sp") await renderShape(ctx, child, rels, imageCache, themeColors, themeData, scale, null, placeholderMap);
        else if (ln === "pic") await renderPicture(ctx, child, rels, imageCache, themeColors, scale);
        else if (ln === "grpSp") await renderGroupShape(ctx, child, rels, imageCache, themeColors, themeData, scale);
        else if (ln === "graphicFrame") await renderGraphicFrame(ctx, child, themeColors, themeData, scale, files2, rels);
        else if (ln === "cxnSp") await renderConnector(ctx, child, themeColors, scale);
      } catch (e) {
        console.warn("Error rendering shape:", ln, e);
      }
    }
  }
  var init_render = __esm({
    "node_modules/pptx-browser/src/render.js"() {
      init_utils();
      init_colors();
      init_shapes();
      init_fonts();
      init_charts();
      init_effects3d();
    }
  });

  // node_modules/pptx-browser/src/animation.js
  var animation_exports = {};
  __export(animation_exports, {
    PptxPlayer: () => PptxPlayer,
    compositeShape: () => compositeShape,
    parseAnimations: () => parseAnimations,
    parseTransition: () => parseTransition,
    renderTransitionFrame: () => renderTransitionFrame
  });
  function parseAnimations(slideDoc) {
    if (!slideDoc) return [];
    const timing = g1(slideDoc, "timing");
    if (!timing) return [];
    const tnLst = g1(timing, "tnLst");
    if (!tnLst) return [];
    const steps = [];
    function walkPar(parEl, clickNum, inheritDelay) {
      const cTn = g1(parEl, "cTn");
      if (!cTn) return;
      const nodeType = attr(cTn, "nodeType", "");
      if (nodeType === "clickEffect") clickNum += 1;
      if (nodeType === "withEffect" && clickNum === 0) clickNum = 0;
      const delay = attrInt(cTn, "delay", 0) + inheritDelay;
      const childTnLst = g1(parEl, "childTnLst") || g1(cTn, "childTnLst");
      if (!childTnLst) return;
      for (const child of childTnLst.children) {
        const ln = child.localName;
        if (ln === "par") {
          walkPar(child, clickNum, delay);
        } else if (ln === "seq") {
          const seqCTn = g1(child, "cTn");
          const seqNodeType = seqCTn ? attr(seqCTn, "nodeType", "") : "";
          const newClick = seqNodeType === "clickEffect" ? clickNum + 1 : clickNum;
          const seqChild = g1(child, "childTnLst");
          if (seqChild) {
            for (const seqItem of seqChild.children) {
              if (seqItem.localName === "par") walkPar(seqItem, newClick, delay);
            }
          }
        } else if (ln === "set" || ln === "animEffect" || ln === "anim" || ln === "animScale" || ln === "animClr") {
          const step = parseAnimEffect(child, clickNum, delay);
          if (step) steps.push(step);
        }
      }
    }
    function walkSeq(seqEl, baseClick) {
      const childTnLst = g1(seqEl, "childTnLst") || g1(g1(seqEl, "cTn"), "childTnLst");
      if (!childTnLst) return;
      let clickNum = baseClick;
      for (const child of childTnLst.children) {
        if (child.localName === "par") {
          const cTn = g1(child, "cTn");
          const nodeType = cTn ? attr(cTn, "nodeType", "") : "";
          if (nodeType === "clickEffect" || nodeType === "clickPar") clickNum++;
          walkPar(child, clickNum, 0);
        }
      }
    }
    for (const child of tnLst.children) {
      if (child.localName === "par") walkPar(child, 0, 0);
      else if (child.localName === "seq") walkSeq(child, 0);
    }
    for (const animEl of gtn(tnLst, "animEffect")) {
      const step = parseAnimEffect(animEl, 0, 0);
      if (step) steps.push(step);
    }
    return steps.sort((a, b) => a.clickNum - b.clickNum || a.delay - b.delay);
  }
  function parseAnimEffect(el, clickNum, inheritDelay) {
    const cTn = g1(el, "cTn");
    const tgtEl = g1(el, "tgt") || g1(cTn, "tgt");
    const spTgt = tgtEl ? g1(tgtEl, "spTgt") : null;
    const shapeId = spTgt ? attr(spTgt, "spid", null) : null;
    if (!shapeId) return null;
    const durStr = cTn ? attr(cTn, "dur", null) : null;
    const duration = durStr === "indefinite" ? 2e3 : durStr ? parseInt(durStr, 10) : DEFAULT_DURATION;
    const delay = (cTn ? attrInt(cTn, "delay", 0) : 0) + inheritDelay;
    const filter = attr(el, "filter", null);
    const type = attr(el, "type", null) || (filter ? "filter" : "set");
    const dir = attr(el, "dir", null) || (filter ? filter.split("(")[1]?.replace(")", "") : null) || "";
    let effectType = "emphasis";
    if (type === "in" || el.localName === "set" && attr(g1(el, "attrNameLst") || el, "attrName", "") === "style.visibility" && attr(el, "to", "") === "visible")
      effectType = "entrance";
    if (type === "out" || el.localName === "set" && attr(el, "to", "") === "hidden")
      effectType = "exit";
    let effectName = filter || el.localName;
    if (filter) {
      const fLow = filter.toLowerCase();
      if (fLow.includes("fade")) effectName = "fade";
      else if (fLow.includes("fly")) effectName = "fly";
      else if (fLow.includes("appear")) effectName = "appear";
      else if (fLow.includes("zoom")) effectName = "zoom";
      else if (fLow.includes("wipe")) effectName = "wipe";
      else if (fLow.includes("wheel")) effectName = "wheel";
      else if (fLow.includes("blinds")) effectName = "blinds";
      else if (fLow.includes("box")) effectName = "box";
      else if (fLow.includes("dissolve")) effectName = "dissolve";
      else if (fLow.includes("split")) effectName = "split";
      else if (fLow.includes("stretch")) effectName = "stretch";
      else if (fLow.includes("diamond")) effectName = "diamond";
      else if (fLow.includes("plus")) effectName = "plus";
      else if (fLow.includes("wedge")) effectName = "wedge";
      else if (fLow.includes("random")) effectName = "dissolve";
      else if (fLow.includes("strips")) effectName = "strips";
      else if (fLow.includes("peek")) effectName = "fly";
      else if (fLow.includes("checkerboard")) effectName = "dissolve";
      else effectName = "fade";
    }
    return {
      shapeId,
      type: effectType,
      effect: effectName,
      clickNum,
      delay,
      duration,
      dir,
      raw: el.localName
    };
  }
  function parseTransition(slideDoc) {
    if (!slideDoc) return null;
    const trans = g1(slideDoc, "transition");
    if (!trans) return null;
    const dur = attrInt(trans, "dur", 700);
    const spd = attr(trans, "spd", "med");
    const speed = spd === "slow" ? 1200 : spd === "fast" ? 300 : dur;
    const child = trans.firstElementChild;
    const type = child?.localName || "fade";
    const dir = child ? attr(child, "dir", "l") : "l";
    return { type, duration: speed, dir };
  }
  function easeOut(t) {
    return 1 - Math.pow(1 - t, 2);
  }
  function easeIn(t) {
    return t * t;
  }
  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  function computeShapeState(step, progress, shapeW, shapeH) {
    const t = Math.max(0, Math.min(1, progress));
    const isEntrance = step.type === "entrance";
    const p = isEntrance ? easeOut(t) : easeIn(t);
    const state = {
      opacity: 1,
      tx: 0,
      ty: 0,
      scaleX: 1,
      scaleY: 1,
      clipProgress: 1,
      clipDir: "none",
      spin: 0
    };
    const effect = step.effect;
    const dir = step.dir;
    if (isEntrance) {
      switch (effect) {
        case "appear":
          state.opacity = t >= 0.01 ? 1 : 0;
          break;
        case "fade":
        case "dissolve":
          state.opacity = p;
          break;
        case "fly":
        case "flyIn": {
          state.opacity = Math.min(1, p * 1.5);
          const dist = 1 - p;
          if (dir.includes("l")) state.tx = -shapeW * dist;
          else if (dir.includes("r")) state.tx = shapeW * dist;
          else if (dir.includes("t")) state.ty = -shapeH * dist;
          else state.ty = shapeH * dist;
          break;
        }
        case "zoom":
          state.opacity = p;
          state.scaleX = 0.1 + p * 0.9;
          state.scaleY = 0.1 + p * 0.9;
          break;
        case "wipe":
          state.clipProgress = p;
          state.clipDir = dir || "r";
          break;
        case "split":
          state.clipProgress = p;
          state.clipDir = dir.includes("v") ? "split-v" : "split-h";
          break;
        case "blinds":
          state.clipProgress = p;
          state.clipDir = dir.includes("v") ? "blinds-v" : "blinds-h";
          break;
        case "box":
          state.clipProgress = p;
          state.clipDir = "box";
          break;
        case "wheel":
          state.clipProgress = p;
          state.clipDir = "wheel";
          break;
        case "wedge":
          state.clipProgress = p;
          state.clipDir = "wedge";
          break;
        case "strips":
          state.clipProgress = p;
          state.clipDir = dir.includes("r") ? "strips-r" : "strips-l";
          break;
        case "stretch":
          state.opacity = p;
          if (dir.includes("h")) {
            state.scaleX = p;
            state.scaleY = 1;
          } else {
            state.scaleX = 1;
            state.scaleY = p;
          }
          break;
        case "plus":
        case "diamond":
          state.clipProgress = p;
          state.clipDir = effect;
          break;
        default:
          state.opacity = p;
      }
    } else if (step.type === "exit") {
      const exitStep = { ...step, type: "entrance" };
      const entered = computeShapeState(exitStep, 1 - t, shapeW, shapeH);
      return entered;
    } else {
      switch (effect) {
        case "spin":
          state.spin = p * 360;
          break;
        case "grow":
        case "shrink": {
          const maxScale = effect === "grow" ? 1.5 : 0.5;
          const midT = t < 0.5 ? t * 2 : (1 - t) * 2;
          state.scaleX = 1 + (maxScale - 1) * midT;
          state.scaleY = state.scaleX;
          break;
        }
        case "flash":
          state.opacity = t < 0.5 ? t < 0.25 ? 0 : 1 : t < 0.75 ? 0 : 1;
          break;
        default:
          state.opacity = 0.5 + 0.5 * Math.cos(t * Math.PI * 4);
      }
    }
    return state;
  }
  function applyClipMask(ctx, clipDir, clipProgress, x, y, w, h) {
    const p = clipProgress;
    ctx.beginPath();
    switch (clipDir) {
      case "r":
        ctx.rect(x, y, w * p, h);
        break;
      case "l":
        ctx.rect(x + w * (1 - p), y, w * p, h);
        break;
      case "t":
        ctx.rect(x, y, w, h * p);
        break;
      case "b":
        ctx.rect(x, y + h * (1 - p), w, h * p);
        break;
      case "split-h": {
        const hw = w * p / 2;
        ctx.rect(x + w / 2 - hw, y, hw * 2, h);
        break;
      }
      case "split-v": {
        const hh = h * p / 2;
        ctx.rect(x, y + h / 2 - hh, w, hh * 2);
        break;
      }
      case "box": {
        const inset = Math.min(w, h) * (1 - p) / 2;
        ctx.rect(x + inset, y + inset, w - inset * 2, h - inset * 2);
        break;
      }
      case "wheel": {
        const cx2 = x + w / 2, cy2 = y + h / 2;
        const r = Math.sqrt(w * w + h * h) / 2;
        ctx.moveTo(cx2, cy2);
        ctx.arc(cx2, cy2, r, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
        ctx.closePath();
        break;
      }
      case "wedge": {
        const cx2 = x + w / 2, cy2 = y + h / 2;
        const r = Math.sqrt(w * w + h * h) / 2;
        const a = p * Math.PI;
        ctx.moveTo(cx2, cy2);
        ctx.arc(cx2, cy2, r, -Math.PI / 2 - a, -Math.PI / 2 + a);
        ctx.closePath();
        break;
      }
      case "blinds-h": {
        const bands = 6;
        const bh = h / bands;
        for (let i = 0; i < bands; i++) {
          ctx.rect(x, y + i * bh, w, bh * p);
        }
        break;
      }
      case "blinds-v": {
        const bands = 6;
        const bw2 = w / bands;
        for (let i = 0; i < bands; i++) {
          ctx.rect(x + i * bw2, y, bw2 * p, h);
        }
        break;
      }
      case "strips-r": {
        const bands = 8;
        const bh = h / bands;
        const bw2 = w / bands;
        for (let i = 0; i < bands; i++) {
          ctx.rect(x, y + i * bh, bw2 * (i + 1) * p, bh);
        }
        break;
      }
      case "strips-l": {
        const bands = 8;
        const bh = h / bands;
        const bw2 = w / bands;
        for (let i = 0; i < bands; i++) {
          const tw = bw2 * (bands - i) * p;
          ctx.rect(x + w - tw, y + i * bh, tw, bh);
        }
        break;
      }
      case "diamond": {
        const cx2 = x + w / 2, cy2 = y + h / 2;
        const rw = w / 2 * p, rh = h / 2 * p;
        ctx.moveTo(cx2 - rw, cy2);
        ctx.lineTo(cx2, cy2 - rh);
        ctx.lineTo(cx2 + rw, cy2);
        ctx.lineTo(cx2, cy2 + rh);
        ctx.closePath();
        break;
      }
      case "plus": {
        const cx2 = x + w / 2, cy2 = y + h / 2;
        const arm = Math.min(w, h) / 2 * p;
        const thick = arm * 0.4;
        ctx.rect(cx2 - thick, cy2 - arm, thick * 2, arm * 2);
        ctx.rect(cx2 - arm, cy2 - thick, arm * 2, thick * 2);
        break;
      }
      default:
        ctx.rect(x, y, w, h);
    }
    ctx.clip();
  }
  function renderTransitionFrame(outCtx, fromCanvas, toCanvas, transition, progress) {
    const p = easeInOut(progress);
    const W = outCtx.canvas.width;
    const H = outCtx.canvas.height;
    outCtx.clearRect(0, 0, W, H);
    const type = transition?.type || "fade";
    const dir = transition?.dir || "l";
    switch (type) {
      case "cut":
        outCtx.drawImage(p < 0.5 ? fromCanvas : toCanvas, 0, 0, W, H);
        break;
      case "fade":
      case "fade_slow":
      default:
        outCtx.drawImage(fromCanvas, 0, 0, W, H);
        outCtx.globalAlpha = p;
        outCtx.drawImage(toCanvas, 0, 0, W, H);
        outCtx.globalAlpha = 1;
        break;
      case "push": {
        const dx = dir === "l" ? -W * p : dir === "r" ? W * p : 0;
        const dy = dir === "u" ? -H * p : dir === "d" ? H * p : 0;
        outCtx.drawImage(fromCanvas, dx, dy, W, H);
        outCtx.drawImage(
          toCanvas,
          dx + (dir === "l" ? W : dir === "r" ? -W : 0),
          dy + (dir === "u" ? H : dir === "d" ? -H : 0),
          W,
          H
        );
        break;
      }
      case "cover":
      case "uncover": {
        const isUncover = type === "uncover";
        const dx = dir === "l" ? -W * (1 - p) : dir === "r" ? W * (1 - p) : 0;
        const dy = dir === "u" ? -H * (1 - p) : dir === "d" ? H * (1 - p) : 0;
        if (isUncover) {
          outCtx.drawImage(toCanvas, 0, 0, W, H);
          outCtx.drawImage(fromCanvas, dx, dy, W, H);
        } else {
          outCtx.drawImage(fromCanvas, 0, 0, W, H);
          outCtx.drawImage(toCanvas, dx, dy, W, H);
        }
        break;
      }
      case "wipe": {
        outCtx.drawImage(fromCanvas, 0, 0, W, H);
        outCtx.save();
        outCtx.beginPath();
        if (dir === "l") outCtx.rect(W * (1 - p), 0, W * p, H);
        else if (dir === "r") outCtx.rect(0, 0, W * p, H);
        else if (dir === "u") outCtx.rect(0, H * (1 - p), W, H * p);
        else outCtx.rect(0, 0, W, H * p);
        outCtx.clip();
        outCtx.drawImage(toCanvas, 0, 0, W, H);
        outCtx.restore();
        break;
      }
      case "zoom":
      case "newsflash": {
        outCtx.drawImage(fromCanvas, 0, 0, W, H);
        outCtx.save();
        outCtx.globalAlpha = p;
        const s = type === "newsflash" ? 1 + (1 - p) * 3 : 0.05 + p * 0.95;
        outCtx.translate(W / 2, H / 2);
        outCtx.scale(s, s);
        outCtx.drawImage(toCanvas, -W / 2, -H / 2, W, H);
        outCtx.restore();
        outCtx.globalAlpha = 1;
        break;
      }
      case "dissolve":
      case "wheel":
      case "blinds": {
        outCtx.drawImage(fromCanvas, 0, 0, W, H);
        outCtx.globalAlpha = p;
        outCtx.drawImage(toCanvas, 0, 0, W, H);
        outCtx.globalAlpha = 1;
        break;
      }
    }
  }
  function compositeShape(outCtx, shapeCanvas, state, cx, cy, cw, ch) {
    if (state.opacity === 0) return;
    outCtx.save();
    outCtx.globalAlpha = state.opacity;
    const pivX = cx + cw / 2;
    const pivY = cy + ch / 2;
    outCtx.translate(pivX + state.tx, pivY + state.ty);
    if (state.spin) outCtx.rotate(state.spin * Math.PI / 180);
    if (state.scaleX !== 1 || state.scaleY !== 1) {
      outCtx.scale(state.scaleX, state.scaleY);
    }
    if (state.clipProgress < 1) {
      applyClipMask(outCtx, state.clipDir, state.clipProgress, -cw / 2, -ch / 2, cw, ch);
    }
    outCtx.drawImage(shapeCanvas, -cw / 2, -ch / 2, cw, ch);
    outCtx.restore();
  }
  var DEFAULT_DURATION, PptxPlayer;
  var init_animation = __esm({
    "node_modules/pptx-browser/src/animation.js"() {
      init_utils();
      DEFAULT_DURATION = 500;
      PptxPlayer = class {
        /**
         * @param {object}            renderer    — a loaded PptxRenderer instance
         * @param {HTMLCanvasElement} canvas      — output canvas
         */
        constructor(renderer, canvas) {
          this.renderer = renderer;
          this.canvas = canvas;
          this.ctx = canvas.getContext("2d");
          this._slideIndex = 0;
          this._steps = [];
          this._transition = null;
          this._clickNum = 0;
          this._activeAnimations = [];
          this._shapeStates = /* @__PURE__ */ new Map();
          this._baseCanvas = null;
          this._playing = false;
          this._rafId = null;
          this.onSlideComplete = null;
          this.onClickReady = null;
          this.onTransitionStart = null;
          this.onTransitionEnd = null;
        }
        // ── Public API ─────────────────────────────────────────────────────────────
        /** Pre-render the static slide and parse its animations. */
        async loadSlide(slideIndex) {
          this._slideIndex = slideIndex;
          this._clickNum = 0;
          this._shapeStates.clear();
          this._stopAnimations();
          const files2 = this.renderer._files;
          const slidePath = this.renderer.slidePaths[slideIndex];
          if (!slidePath || !files2) return;
          const slideXml = files2[slidePath] ? new TextDecoder().decode(files2[slidePath]) : null;
          if (!slideXml) return;
          const { parseXml: parseXml3 } = await Promise.resolve().then(() => (init_utils(), utils_exports)).catch(() => ({
            parseXml: (s) => new DOMParser().parseFromString(s, "application/xml")
          }));
          const slideDoc = parseXml3(slideXml);
          this._steps = parseAnimations(slideDoc);
          this._transition = parseTransition(slideDoc);
          const entranceIds = new Set(
            this._steps.filter((s) => s.type === "entrance").map((s) => s.shapeId)
          );
          this._initiallyHidden = entranceIds;
          this._baseCanvas = await this._renderBaseSlide();
          this._drawBase();
          await this._playClickGroup(0);
        }
        /** Advance to next click group. */
        async nextClick() {
          this._clickNum++;
          await this._playClickGroup(this._clickNum);
        }
        /** Start playback of all remaining click groups automatically. */
        async play(autoAdvanceMs = 1500) {
          this._playing = true;
          const maxClick = Math.max(...this._steps.map((s) => s.clickNum), 0);
          while (this._playing && this._clickNum <= maxClick) {
            await this._playClickGroup(this._clickNum);
            this._clickNum++;
            if (this._clickNum <= maxClick) {
              await this._delay(autoAdvanceMs);
            }
          }
          this._playing = false;
        }
        /** Pause all running animations. */
        pause() {
          this._playing = false;
          this._stopAnimations();
        }
        /** Reset to initial state. */
        async stop() {
          this._playing = false;
          this._stopAnimations();
          this._shapeStates.clear();
          this._clickNum = 0;
          if (this._baseCanvas) this._drawBase();
        }
        /**
         * Animate a transition from the current slide to a new slide index.
         * @param {number} nextIndex
         * @returns {Promise<void>} resolves when transition completes
         */
        async transitionTo(nextIndex) {
          const fromCanvas = document.createElement("canvas");
          fromCanvas.width = this.canvas.width;
          fromCanvas.height = this.canvas.height;
          fromCanvas.getContext("2d").drawImage(this.canvas, 0, 0);
          await this.loadSlide(nextIndex);
          const toCanvas = this._baseCanvas;
          const transition = this._transition || { type: "fade", duration: 700, dir: "l" };
          this.onTransitionStart?.({ from: this._slideIndex - 1, to: nextIndex, transition });
          await this._animateTransition(fromCanvas, toCanvas, transition);
          this.onTransitionEnd?.({ slideIndex: nextIndex });
        }
        // ── Private methods ────────────────────────────────────────────────────────
        async _renderBaseSlide() {
          const w = this.canvas.width;
          const bc = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, Math.round(w / (this.renderer.slideSize.cx / this.renderer.slideSize.cy))) : Object.assign(document.createElement("canvas"), { width: w, height: Math.round(w / (this.renderer.slideSize.cx / this.renderer.slideSize.cy)) });
          await this.renderer.renderSlide(this._slideIndex, bc, w);
          return bc;
        }
        _drawBase() {
          if (!this._baseCanvas) return;
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          this.ctx.drawImage(this._baseCanvas, 0, 0, this.canvas.width, this.canvas.height);
        }
        async _playClickGroup(clickNum) {
          const groupSteps = this._steps.filter((s) => s.clickNum === clickNum);
          if (!groupSteps.length) return;
          this.onClickReady?.({ clickNum, stepCount: groupSteps.length });
          const maxDelay = Math.max(...groupSteps.map((s) => s.delay + s.duration), 0);
          await new Promise((resolve) => {
            const startTime = performance.now();
            const completed = /* @__PURE__ */ new Set();
            const frame = (now) => {
              const elapsed = now - startTime;
              for (const step of groupSteps) {
                if (completed.has(step)) continue;
                const stepElapsed = elapsed - step.delay;
                if (stepElapsed < 0) continue;
                const progress = Math.min(1, stepElapsed / step.duration);
                const sw = this.canvas.width;
                const sh = this.canvas.height;
                const state = computeShapeState(step, progress, sw * 0.3, sh * 0.3);
                this._shapeStates.set(step.shapeId, { ...state, step });
                if (progress >= 1) completed.add(step);
              }
              this._composite();
              if (completed.size < groupSteps.length) {
                this._rafId = requestAnimationFrame(frame);
              } else {
                resolve();
              }
            };
            this._rafId = requestAnimationFrame(frame);
          });
        }
        _composite() {
          this._drawBase();
          for (const [shapeId, state] of this._shapeStates) {
            if (state.opacity < 0.99) {
            }
          }
        }
        async _animateTransition(fromCanvas, toCanvas, transition) {
          const duration = transition.duration;
          await new Promise((resolve) => {
            const start = performance.now();
            const frame = (now) => {
              const progress = Math.min(1, (now - start) / duration);
              renderTransitionFrame(this.ctx, fromCanvas, toCanvas, transition, progress);
              if (progress < 1) {
                this._rafId = requestAnimationFrame(frame);
              } else {
                resolve();
              }
            };
            this._rafId = requestAnimationFrame(frame);
          });
        }
        _stopAnimations() {
          if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
          }
        }
        _delay(ms) {
          return new Promise((r) => setTimeout(r, ms));
        }
      };
    }
  });

  // node_modules/pptx-browser/src/slideshow.js
  var slideshow_exports = {};
  __export(slideshow_exports, {
    SlideShow: () => SlideShow
  });
  var SlideShow;
  var init_slideshow = __esm({
    "node_modules/pptx-browser/src/slideshow.js"() {
      SlideShow = class {
        /**
         * @param {object}          renderer  — loaded PptxRenderer instance
         * @param {HTMLElement}     container — DOM element to attach to
         * @param {object}          [opts]
         * @param {boolean}         [opts.fullscreen=true]    — request fullscreen on start
         * @param {boolean}         [opts.showNotes=false]    — show presenter notes panel
         * @param {boolean}         [opts.showThumbs=false]   — show thumbnail strip
         * @param {boolean}         [opts.showHud=true]       — show slide counter HUD
         * @param {boolean}         [opts.loop=false]         — loop back to start at end
         * @param {boolean}         [opts.autoAdvance=0]      — ms between slides (0=manual)
         * @param {function}        [opts.onSlideChange]      — (index) => void
         */
        constructor(renderer, container, opts = {}) {
          this.renderer = renderer;
          this.container = container;
          this.opts = {
            fullscreen: true,
            showNotes: false,
            showThumbs: false,
            showHud: true,
            loop: false,
            autoAdvance: 0,
            ...opts
          };
          this._index = 0;
          this._playing = false;
          this._player = null;
          this._autoTimer = null;
          this._el = null;
          this._canvas = null;
          this._notesEl = null;
          this._hudEl = null;
          this._thumbsEl = null;
          this._thumbnails = [];
          this._touchStartX = 0;
          this._touchStartY = 0;
          this._onKey = this._onKey.bind(this);
          this._onResize = this._onResize.bind(this);
          this._onFsChange = this._onFsChange.bind(this);
          this._onTouchStart = this._onTouchStart.bind(this);
          this._onTouchEnd = this._onTouchEnd.bind(this);
        }
        // ── Lifecycle ───────────────────────────────────────────────────────────────
        /** Start the slide show, optionally requesting fullscreen. */
        async start(slideIndex = 0) {
          this._playing = true;
          this._index = Math.max(0, Math.min(slideIndex, this.renderer.slideCount - 1));
          this._buildDOM();
          this._attachEvents();
          if (this.opts.fullscreen) {
            await this._requestFullscreen();
          }
          if (this.opts.showThumbs) {
            this._generateThumbnails();
          }
          await this._renderCurrent();
          this._updateHud();
          if (this.opts.autoAdvance > 0) {
            this._startAutoAdvance();
          }
        }
        /** Stop and clean up. */
        stop() {
          this._playing = false;
          this._stopAutoAdvance();
          this._detachEvents();
          if (document.fullscreenElement === this._el) {
            document.exitFullscreen().catch(() => {
            });
          }
          if (this._el && this._el.parentNode) {
            this._el.parentNode.removeChild(this._el);
          }
          this._el = null;
          this._canvas = null;
          this._player = null;
          this.opts.onSlideChange?.(null);
        }
        /** Go to a specific slide. */
        async goto(index) {
          if (!this._playing) return;
          const newIndex = Math.max(0, Math.min(index, this.renderer.slideCount - 1));
          if (newIndex === this._index) return;
          const prevIndex = this._index;
          this._index = newIndex;
          this._resetAutoAdvance();
          await this._renderCurrent(prevIndex);
          this._updateHud();
          this.opts.onSlideChange?.(this._index);
        }
        /** Advance to next slide (or next animation click). */
        async next() {
          if (!this._playing) return;
          if (this._player) {
            const steps = this.renderer.getAnimations?.(this._index) || [];
            const maxClick = steps.length ? Math.max(...steps.map((s) => s.clickNum), 0) : 0;
            await this._player.nextClick?.();
          }
          if (this._index < this.renderer.slideCount - 1) {
            await this.goto(this._index + 1);
          } else if (this.opts.loop) {
            await this.goto(0);
          }
        }
        /** Go to previous slide. */
        async prev() {
          if (!this._playing) return;
          if (this._index > 0) {
            await this.goto(this._index - 1);
          } else if (this.opts.loop) {
            await this.goto(this.renderer.slideCount - 1);
          }
        }
        get currentIndex() {
          return this._index;
        }
        get isPlaying() {
          return this._playing;
        }
        // ── DOM construction ────────────────────────────────────────────────────────
        _buildDOM() {
          const el = document.createElement("div");
          el.style.cssText = [
            "position:fixed",
            "inset:0",
            "z-index:999999",
            "background:#000",
            "display:flex",
            "flex-direction:column",
            "align-items:center",
            "justify-content:center",
            "user-select:none",
            "touch-action:none"
          ].join(";");
          el.setAttribute("tabindex", "0");
          this._el = el;
          const canvasWrap = document.createElement("div");
          canvasWrap.style.cssText = "position:relative; flex:1; display:flex; align-items:center; justify-content:center; width:100%; overflow:hidden;";
          const canvas = document.createElement("canvas");
          canvas.style.cssText = "display:block; box-shadow:0 4px 32px rgba(0,0,0,0.6);";
          this._canvas = canvas;
          canvasWrap.appendChild(canvas);
          el.appendChild(canvasWrap);
          if (this.opts.showHud) {
            const hud = document.createElement("div");
            hud.style.cssText = [
              "position:absolute",
              "bottom:24px",
              "left:50%",
              "transform:translateX(-50%)",
              "display:flex",
              "align-items:center",
              "gap:12px",
              "background:rgba(0,0,0,0.55)",
              "backdrop-filter:blur(8px)",
              "border-radius:24px",
              "padding:8px 20px",
              "color:white",
              "font:500 14px/1 system-ui,sans-serif",
              "pointer-events:none"
            ].join(";");
            this._hudEl = hud;
            el.appendChild(hud);
          }
          if (this.opts.showNotes) {
            const notes = document.createElement("div");
            notes.style.cssText = [
              "width:100%",
              "max-height:22vh",
              "overflow-y:auto",
              "background:rgba(0,0,0,0.7)",
              "backdrop-filter:blur(8px)",
              "color:#e0e0e0",
              "font:14px/1.5 system-ui,sans-serif",
              "padding:12px 24px",
              "white-space:pre-wrap",
              "flex-shrink:0"
            ].join(";");
            this._notesEl = notes;
            el.appendChild(notes);
          }
          if (this.opts.showThumbs) {
            const thumbs = document.createElement("div");
            thumbs.style.cssText = [
              "display:flex",
              "gap:6px",
              "padding:8px 16px",
              "overflow-x:auto",
              "background:rgba(0,0,0,0.7)",
              "width:100%",
              "flex-shrink:0"
            ].join(";");
            this._thumbsEl = thumbs;
            el.appendChild(thumbs);
            for (let i = 0; i < this.renderer.slideCount; i++) {
              const thumb = document.createElement("canvas");
              thumb.width = 120;
              thumb.height = Math.round(120 / (this.renderer.slideSize.cx / this.renderer.slideSize.cy));
              thumb.style.cssText = "flex-shrink:0; cursor:pointer; border:2px solid transparent; border-radius:3px; opacity:0.6; transition:opacity 0.2s,border-color 0.2s;";
              thumb.title = `Slide ${i + 1}`;
              const idx = i;
              thumb.addEventListener("click", () => this.goto(idx));
              thumbs.appendChild(thumb);
              this._thumbnails.push(thumb);
            }
          }
          canvasWrap.addEventListener("click", () => this.next());
          this._buildNavArrows(canvasWrap);
          const closeBtn = document.createElement("button");
          closeBtn.textContent = "\u2715";
          closeBtn.style.cssText = [
            "position:absolute",
            "top:16px",
            "right:20px",
            "background:rgba(255,255,255,0.15)",
            "border:none",
            "color:white",
            "font-size:18px",
            "width:36px",
            "height:36px",
            "border-radius:50%",
            "cursor:pointer",
            "opacity:0.7",
            "transition:opacity 0.2s"
          ].join(";");
          closeBtn.addEventListener("mouseover", () => closeBtn.style.opacity = "1");
          closeBtn.addEventListener("mouseout", () => closeBtn.style.opacity = "0.7");
          closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.stop();
          });
          el.appendChild(closeBtn);
          this.container.appendChild(el);
          el.focus();
          this._resizeCanvas();
        }
        _buildNavArrows(parent) {
          const makeArrow = (dir) => {
            const btn = document.createElement("button");
            btn.textContent = dir === "prev" ? "\u276E" : "\u276F";
            btn.style.cssText = [
              "position:absolute",
              dir === "prev" ? "left:16px" : "right:16px",
              "top:50%",
              "transform:translateY(-50%)",
              "background:rgba(255,255,255,0.18)",
              "border:none",
              "color:white",
              "font-size:22px",
              "width:48px",
              "height:64px",
              "border-radius:8px",
              "cursor:pointer",
              "opacity:0",
              "transition:opacity 0.2s"
            ].join(";");
            btn.addEventListener("mouseenter", () => btn.style.opacity = "1");
            btn.addEventListener("mouseleave", () => btn.style.opacity = "0");
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              dir === "prev" ? this.prev() : this.next();
            });
            parent.addEventListener("mouseenter", () => btn.style.opacity = "0.5");
            parent.addEventListener("mouseleave", () => btn.style.opacity = "0");
            parent.appendChild(btn);
          };
          makeArrow("prev");
          makeArrow("next");
        }
        // ── Canvas sizing ───────────────────────────────────────────────────────────
        _resizeCanvas() {
          if (!this._canvas || !this._el) return;
          const { cx, cy } = this.renderer.slideSize;
          const aspect = cx / cy;
          const container = this._canvas.parentElement;
          const availW = container.clientWidth || window.innerWidth;
          const availH = container.clientHeight || window.innerHeight * 0.75;
          let w = availW, h = w / aspect;
          if (h > availH) {
            h = availH;
            w = h * aspect;
          }
          this._canvas.width = Math.round(w * window.devicePixelRatio);
          this._canvas.height = Math.round(h * window.devicePixelRatio);
          this._canvas.style.width = Math.round(w) + "px";
          this._canvas.style.height = Math.round(h) + "px";
        }
        // ── Rendering ───────────────────────────────────────────────────────────────
        async _renderCurrent(prevIndex = null) {
          if (!this._canvas) return;
          this._resizeCanvas();
          if (prevIndex !== null && this.renderer.getTransition) {
            const transition = this.renderer.getTransition(this._index);
            if (transition && transition.type !== "cut" && typeof OffscreenCanvas !== "undefined") {
              const { renderTransitionFrame: renderTransitionFrame2 } = await Promise.resolve().then(() => (init_animation(), animation_exports));
              const from = new OffscreenCanvas(this._canvas.width, this._canvas.height);
              from.getContext("2d").drawImage(this._canvas, 0, 0);
              await this.renderer.renderSlide(this._index, this._canvas, this._canvas.width / window.devicePixelRatio);
              const to = new OffscreenCanvas(this._canvas.width, this._canvas.height);
              to.getContext("2d").drawImage(this._canvas, 0, 0);
              const ctx = this._canvas.getContext("2d");
              const dur = transition.duration || 700;
              const start = performance.now();
              await new Promise((resolve) => {
                const frame = (now) => {
                  const p = Math.min(1, (now - start) / dur);
                  renderTransitionFrame2(ctx, from, to, transition, p);
                  if (p < 1) requestAnimationFrame(frame);
                  else resolve();
                };
                requestAnimationFrame(frame);
              });
              this._updateThumbnail(this._index);
              this._updateNotes();
              return;
            }
          }
          await this.renderer.renderSlide(this._index, this._canvas, this._canvas.width / window.devicePixelRatio);
          this._updateThumbnail(this._index);
          this._updateNotes();
        }
        _updateThumbnail(index) {
          const thumb = this._thumbnails[index];
          if (!thumb || !this._canvas) return;
          thumb.getContext("2d").drawImage(this._canvas, 0, 0, thumb.width, thumb.height);
          this._thumbnails.forEach((t, i) => {
            t.style.borderColor = i === this._index ? "#4af" : "transparent";
            t.style.opacity = i === this._index ? "1" : "0.6";
          });
        }
        _updateHud() {
          if (!this._hudEl) return;
          const n = this.renderer.slideCount;
          this._hudEl.innerHTML = `
      <span style="opacity:0.7">Slide</span>
      <strong>${this._index + 1}</strong>
      <span style="opacity:0.5">of ${n}</span>
    `;
        }
        async _updateNotes() {
          if (!this._notesEl) return;
          try {
            const notes = await this.renderer.getSlideNotes(this._index);
            this._notesEl.textContent = notes || "(no notes)";
          } catch (_) {
            this._notesEl.textContent = "";
          }
        }
        async _generateThumbnails() {
          for (let i = 0; i < this.renderer.slideCount; i++) {
            if (!this._playing) break;
            const thumb = this._thumbnails[i];
            if (!thumb) continue;
            try {
              await this.renderer.renderSlide(i, thumb, thumb.width);
            } catch (_) {
            }
            await new Promise((r) => setTimeout(r, 50));
          }
        }
        // ── Keyboard & touch ────────────────────────────────────────────────────────
        _attachEvents() {
          document.addEventListener("keydown", this._onKey);
          window.addEventListener("resize", this._onResize);
          document.addEventListener("fullscreenchange", this._onFsChange);
          if (this._el) {
            this._el.addEventListener("touchstart", this._onTouchStart, { passive: true });
            this._el.addEventListener("touchend", this._onTouchEnd, { passive: true });
          }
        }
        _detachEvents() {
          document.removeEventListener("keydown", this._onKey);
          window.removeEventListener("resize", this._onResize);
          document.removeEventListener("fullscreenchange", this._onFsChange);
        }
        _onKey(e) {
          if (!this._playing) return;
          switch (e.key) {
            case "ArrowRight":
            case "ArrowDown":
            case " ":
            case "PageDown":
              e.preventDefault();
              this.next();
              break;
            case "ArrowLeft":
            case "ArrowUp":
            case "PageUp":
            case "Backspace":
              e.preventDefault();
              this.prev();
              break;
            case "Home":
              e.preventDefault();
              this.goto(0);
              break;
            case "End":
              e.preventDefault();
              this.goto(this.renderer.slideCount - 1);
              break;
            case "Escape":
            case "q":
            case "Q":
              e.preventDefault();
              this.stop();
              break;
            case "f":
            case "F":
              e.preventDefault();
              this._toggleFullscreen();
              break;
          }
        }
        _onResize() {
          this._resizeCanvas();
          this._renderCurrent();
        }
        _onFsChange() {
          if (!document.fullscreenElement) {
            this.stop();
          }
        }
        _onTouchStart(e) {
          this._touchStartX = e.touches[0].clientX;
          this._touchStartY = e.touches[0].clientY;
        }
        _onTouchEnd(e) {
          const dx = e.changedTouches[0].clientX - this._touchStartX;
          const dy = e.changedTouches[0].clientY - this._touchStartY;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) this.next();
            else this.prev();
          } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
            this.next();
          }
        }
        // ── Fullscreen ──────────────────────────────────────────────────────────────
        async _requestFullscreen() {
          try {
            const el = this._el;
            if (el.requestFullscreen) await el.requestFullscreen();
            else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
          } catch (_) {
          }
        }
        async _toggleFullscreen() {
          if (document.fullscreenElement) {
            await document.exitFullscreen().catch(() => {
            });
          } else {
            await this._requestFullscreen();
          }
        }
        // ── Auto-advance ─────────────────────────────────────────────────────────────
        _startAutoAdvance() {
          this._stopAutoAdvance();
          if (this.opts.autoAdvance > 0) {
            this._autoTimer = setInterval(() => this.next(), this.opts.autoAdvance);
          }
        }
        _stopAutoAdvance() {
          if (this._autoTimer) {
            clearInterval(this._autoTimer);
            this._autoTimer = null;
          }
        }
        _resetAutoAdvance() {
          if (this.opts.autoAdvance > 0) this._startAutoAdvance();
        }
      };
    }
  });

  // node_modules/pptx-browser/src/index.js
  var index_exports = {};
  __export(index_exports, {
    PptxPlayer: () => PptxPlayer,
    PptxRenderer: () => PptxRenderer,
    PptxWriter: () => PptxWriter,
    SlideShow: () => SlideShow,
    clearRegisteredFonts: () => clearRegisteredFonts,
    compositeShape: () => compositeShape,
    copySlideToClipboard: () => copySlideToClipboard,
    createLazyDeck: () => createLazyDeck,
    default: () => PptxRenderer,
    downloadAllSlides: () => downloadAllSlides,
    downloadAsPdf: () => downloadAsPdf,
    downloadSlide: () => downloadSlide,
    exportSlideToPdf: () => exportSlideToPdf,
    exportToPdf: () => exportToPdf,
    extractAll: () => extractAll,
    extractSlide: () => extractSlide,
    extractText: () => extractText,
    isFontAvailable: () => isFontAvailable,
    listEmbeddedFonts: () => listEmbeddedFonts,
    listRegisteredFonts: () => listRegisteredFonts,
    loadEmbeddedFonts: () => loadEmbeddedFonts,
    parseAnimations: () => parseAnimations,
    parseTransition: () => parseTransition,
    registerFont: () => registerFont,
    registerFonts: () => registerFonts,
    renderAllSlidesToSvg: () => renderAllSlidesToSvg,
    renderSlideToSvg: () => renderSlideToSvg,
    renderTransitionFrame: () => renderTransitionFrame,
    searchSlides: () => searchSlides
  });

  // node_modules/pptx-browser/src/zip.js
  async function readZip(input) {
    const data = input instanceof Uint8Array ? input : new Uint8Array(input);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const EOCD_SIG = 101010256;
    const EOCD64_SIG = 101075792;
    const EOCD64_LOC = 117853008;
    let eocdOff = -1;
    const searchStart = Math.max(0, data.length - 65557);
    for (let i = data.length - 22; i >= searchStart; i--) {
      if (view.getUint32(i, true) === EOCD_SIG) {
        eocdOff = i;
        break;
      }
    }
    if (eocdOff === -1) throw new Error("Not a valid ZIP file: EOCD not found");
    let cdOffset, cdCount;
    const locatorOff = eocdOff - 20;
    if (locatorOff >= 0 && view.getUint32(locatorOff, true) === EOCD64_LOC) {
      const eocd64Off = Number(view.getBigUint64(locatorOff + 8, true));
      if (view.getUint32(eocd64Off, true) !== EOCD64_SIG) {
        throw new Error("Invalid ZIP64 end record");
      }
      cdOffset = Number(view.getBigUint64(eocd64Off + 48, true));
      cdCount = Number(view.getBigUint64(eocd64Off + 32, true));
    } else {
      cdOffset = view.getUint32(eocdOff + 16, true);
      cdCount = view.getUint16(eocdOff + 8, true);
    }
    if (cdOffset + 4 > data.length) {
      throw new Error("ZIP central directory offset is outside the file");
    }
    const CD_SIG = 33639248;
    const files2 = {};
    let pos = cdOffset;
    for (let i = 0; i < cdCount; i++) {
      if (pos + 46 > data.length) break;
      if (view.getUint32(pos, true) !== CD_SIG) break;
      const method = view.getUint16(pos + 10, true);
      let compSize = view.getUint32(pos + 20, true);
      let uncompSize = view.getUint32(pos + 24, true);
      const nameLen = view.getUint16(pos + 28, true);
      const extraLen = view.getUint16(pos + 30, true);
      const commentLen = view.getUint16(pos + 32, true);
      let localOffset = view.getUint32(pos + 42, true);
      const name = utf8(data, pos + 46, nameLen);
      if (compSize === 4294967295 || uncompSize === 4294967295 || localOffset === 4294967295) {
        const extraStart = pos + 46 + nameLen;
        const extraEnd = extraStart + extraLen;
        let ep = extraStart;
        while (ep + 4 <= extraEnd) {
          const tag = view.getUint16(ep, true);
          const size = view.getUint16(ep + 2, true);
          if (tag === 1) {
            let off = ep + 4;
            if (uncompSize === 4294967295 && off + 8 <= extraEnd) {
              uncompSize = Number(view.getBigUint64(off, true));
              off += 8;
            }
            if (compSize === 4294967295 && off + 8 <= extraEnd) {
              compSize = Number(view.getBigUint64(off, true));
              off += 8;
            }
            if (localOffset === 4294967295 && off + 8 <= extraEnd) {
              localOffset = Number(view.getBigUint64(off, true));
            }
            break;
          }
          ep += 4 + size;
        }
      }
      pos += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith("/")) continue;
      if (method !== 0 && method !== 8) continue;
      if (localOffset + 30 > data.length) continue;
      const lhNameLen = view.getUint16(localOffset + 26, true);
      const lhExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
      if (dataStart + compSize > data.length) continue;
      const compData = data.subarray(dataStart, dataStart + compSize);
      try {
        files2[name] = method === 0 ? compData.slice() : await inflateRaw(compData);
      } catch (e) {
        console.warn(`[zip.js] Failed to decompress "${name}":`, e.message);
      }
    }
    return files2;
  }
  async function inflateRaw(compData) {
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    writer.write(compData);
    writer.close();
    const chunks = [];
    let totalLen = 0;
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLen += value.length;
    }
    const out = new Uint8Array(totalLen);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }
  function utf8(data, start, len) {
    return new TextDecoder().decode(data.subarray(start, start + len));
  }

  // node_modules/pptx-browser/src/index.js
  init_utils();

  // node_modules/pptx-browser/src/theme.js
  init_utils();
  function parseTheme(themeDoc) {
    if (!themeDoc) {
      return { colors: {}, majorFont: "Calibri Light", minorFont: "Calibri" };
    }
    const clrScheme = g1(themeDoc, "clrScheme");
    const colors = {};
    if (clrScheme) {
      const slots = [
        "dk1",
        "lt1",
        "dk2",
        "lt2",
        "accent1",
        "accent2",
        "accent3",
        "accent4",
        "accent5",
        "accent6",
        "hlink",
        "folHlink"
      ];
      for (const key of slots) {
        const el = g1(clrScheme, key);
        if (!el) continue;
        const srgb = g1(el, "srgbClr");
        const sysClr = g1(el, "sysClr");
        if (srgb) {
          colors[key] = srgb.getAttribute("val") || "";
        } else if (sysClr) {
          colors[key] = sysClr.getAttribute("lastClr") || "";
        }
      }
    }
    const fontScheme = g1(themeDoc, "fontScheme");
    let majorFont = "Calibri Light", minorFont = "Calibri";
    if (fontScheme) {
      const majorFontEl = g1(fontScheme, "majorFont");
      const minorFontEl = g1(fontScheme, "minorFont");
      if (majorFontEl) {
        const latin = g1(majorFontEl, "latin");
        if (latin) majorFont = latin.getAttribute("typeface") || majorFont;
      }
      if (minorFontEl) {
        const latin = g1(minorFontEl, "latin");
        if (latin) minorFont = latin.getAttribute("typeface") || minorFont;
      }
    }
    return { colors, majorFont, minorFont };
  }
  function parseClrMap(masterDoc) {
    if (!masterDoc) return {};
    const clrMap = g1(masterDoc, "clrMap");
    if (!clrMap) return {};
    const map = {};
    const attrs = [
      "bg1",
      "tx1",
      "bg2",
      "tx2",
      "accent1",
      "accent2",
      "accent3",
      "accent4",
      "accent5",
      "accent6",
      "hlink",
      "folHlink"
    ];
    for (const a of attrs) {
      const v = clrMap.getAttribute(a);
      if (v) map[a] = v;
    }
    return map;
  }
  function buildThemeColors(themeData, clrMap) {
    const base = { ...themeData.colors };
    for (const [key, ref] of Object.entries(clrMap)) {
      if (base[ref] !== void 0) base[key] = base[ref];
    }
    return base;
  }

  // node_modules/pptx-browser/src/index.js
  init_fonts();
  init_render();

  // node_modules/pptx-browser/src/zip-writer.js
  async function deflateRaw(data) {
    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    const reader = cs.readable.getReader();
    writer.write(data);
    writer.close();
    const chunks = [];
    let total = 0;
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }
  var CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      t[i] = c;
    }
    return t;
  })();
  function crc32(data) {
    let crc = 4294967295;
    for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 255] ^ crc >>> 8;
    return (crc ^ 4294967295) >>> 0;
  }
  var BufWriter = class {
    constructor() {
      this._chunks = [];
      this._size = 0;
    }
    append(u8) {
      this._chunks.push(u8);
      this._size += u8.length;
    }
    get size() {
      return this._size;
    }
    concat() {
      const out = new Uint8Array(this._size);
      let off = 0;
      for (const c of this._chunks) {
        out.set(c, off);
        off += c.length;
      }
      return out;
    }
  };
  function u16le(n) {
    return new Uint8Array([n & 255, n >> 8 & 255]);
  }
  function u32le(n) {
    return new Uint8Array([n & 255, n >> 8 & 255, n >> 16 & 255, n >> 24 & 255]);
  }
  var enc = new TextEncoder();
  function utf8bytes(s) {
    return enc.encode(s);
  }
  var DOS_DATE = 18977;
  var DOS_TIME = 0;
  var ZipWriter = class {
    constructor() {
      this._entries = [];
    }
    /**
     * Add a file from a UTF-8 string.
     * @param {string} name
     * @param {string} text
     */
    async addText(name, text) {
      return this.addBytes(name, enc.encode(text));
    }
    /**
     * Add a file from raw bytes, with optional DEFLATE compression.
     * @param {string}     name
     * @param {Uint8Array} data
     * @param {boolean}    [compress=true]  false for already-compressed data
     */
    async addBytes(name, data, compress = true) {
      const nameBytes = utf8bytes(name);
      const crc = crc32(data);
      const uncompSize = data.length;
      let compData, method;
      if (compress && data.length > 32) {
        const deflated = await deflateRaw(data);
        if (deflated.length < data.length) {
          compData = deflated;
          method = 8;
        } else {
          compData = data;
          method = 0;
        }
      } else {
        compData = data;
        method = 0;
      }
      this._entries.push({ name, nameBytes, compData, uncompSize, crc, method, localOffset: 0 });
    }
    /**
     * Serialize the archive and return the ZIP bytes.
     * @returns {Promise<Uint8Array>}
     */
    async finalize() {
      const body = new BufWriter();
      const cdEntries = [];
      for (const entry of this._entries) {
        entry.localOffset = body.size;
        body.append(new Uint8Array([80, 75, 3, 4]));
        body.append(u16le(20));
        body.append(u16le(2048));
        body.append(u16le(entry.method));
        body.append(u16le(DOS_TIME));
        body.append(u16le(DOS_DATE));
        body.append(u32le(entry.crc));
        body.append(u32le(entry.compData.length));
        body.append(u32le(entry.uncompSize));
        body.append(u16le(entry.nameBytes.length));
        body.append(u16le(0));
        body.append(entry.nameBytes);
        body.append(entry.compData);
      }
      const cdOffset = body.size;
      for (const entry of this._entries) {
        body.append(new Uint8Array([80, 75, 1, 2]));
        body.append(u16le(798));
        body.append(u16le(20));
        body.append(u16le(2048));
        body.append(u16le(entry.method));
        body.append(u16le(DOS_TIME));
        body.append(u16le(DOS_DATE));
        body.append(u32le(entry.crc));
        body.append(u32le(entry.compData.length));
        body.append(u32le(entry.uncompSize));
        body.append(u16le(entry.nameBytes.length));
        body.append(u16le(0));
        body.append(u16le(0));
        body.append(u16le(0));
        body.append(u16le(0));
        body.append(u32le(0));
        body.append(u32le(entry.localOffset));
        body.append(entry.nameBytes);
        cdEntries.push(entry);
      }
      const cdSize = body.size - cdOffset;
      body.append(new Uint8Array([80, 75, 5, 6]));
      body.append(u16le(0));
      body.append(u16le(0));
      body.append(u16le(this._entries.length));
      body.append(u16le(this._entries.length));
      body.append(u32le(cdSize));
      body.append(u32le(cdOffset));
      body.append(u16le(0));
      return body.concat();
    }
  };
  async function writeZip(files2) {
    const w = new ZipWriter();
    for (const [path, data] of Object.entries(files2)) {
      if (typeof data === "string") {
        await w.addText(path, data);
      } else {
        await w.addBytes(path, data);
      }
    }
    return w.finalize();
  }

  // node_modules/pptx-browser/src/writer.js
  var dec = new TextDecoder();
  var enc2 = new TextEncoder();
  var NS = {
    p: "http://schemas.openxmlformats.org/presentationml/2006/main",
    a: "http://schemas.openxmlformats.org/drawingml/2006/main",
    r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    rel: "http://schemas.openxmlformats.org/package/2006/relationships",
    ct: "http://schemas.openxmlformats.org/package/2006/content-types"
  };
  function parseXml2(str) {
    return new DOMParser().parseFromString(str, "application/xml");
  }
  function serializeXml(doc) {
    const s = new XMLSerializer().serializeToString(doc);
    if (s.startsWith("<?xml")) return s;
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + s;
  }
  function xmlBytes(doc) {
    return enc2.encode(serializeXml(doc));
  }
  function readXml(files2, path) {
    const raw = files2[path];
    if (!raw) return null;
    return parseXml2(dec.decode(raw));
  }
  function g12(node, name) {
    if (!node) return null;
    const all = node.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) if (all[i].localName === name) return all[i];
    return null;
  }
  function gtn2(node, name) {
    if (!node) return [];
    const r = [];
    const all = node.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) if (all[i].localName === name) r.push(all[i]);
    return r;
  }
  function attr2(el, name, def = null) {
    if (!el) return def;
    const v = el.getAttribute(name);
    return v !== null ? v : def;
  }
  function relsPath(filePath) {
    const parts = filePath.split("/");
    const name = parts.pop();
    return [...parts, "_rels", name + ".rels"].join("/");
  }
  function parseRels(files2, filePath) {
    const doc = readXml(files2, relsPath(filePath));
    if (!doc) return {};
    const map = {};
    for (const rel of Array.from(doc.getElementsByTagName("Relationship"))) {
      const id = rel.getAttribute("Id");
      const target = rel.getAttribute("Target");
      const type = rel.getAttribute("Type") || "";
      let fullPath = target;
      if (!target.startsWith("/") && !target.startsWith("http")) {
        const dir = filePath.split("/").slice(0, -1).join("/");
        fullPath = dir ? dir + "/" + target.replace(/^\.\.\//, "") : target;
        const parts = fullPath.split("/");
        const resolved = [];
        for (const p of parts) {
          if (p === "..") resolved.pop();
          else resolved.push(p);
        }
        fullPath = resolved.join("/");
      }
      map[id] = { id, target, type, fullPath };
    }
    return map;
  }
  function buildRelsDoc(rels) {
    const doc = parseXml2('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
    const root = doc.documentElement;
    for (const rel of Object.values(rels)) {
      const el = doc.createElementNS(NS.rel, "Relationship");
      el.setAttribute("Id", rel.id);
      el.setAttribute("Type", rel.type);
      el.setAttribute("Target", rel.target);
      if (rel.targetMode) el.setAttribute("TargetMode", rel.targetMode);
      root.appendChild(el);
    }
    return doc;
  }
  function nextRId(rels) {
    const nums = Object.keys(rels).map((id) => parseInt(id.replace("rId", ""), 10)).filter((n) => !isNaN(n));
    return "rId" + ((nums.length ? Math.max(...nums) : 0) + 1);
  }
  function findShapeByName(spTree, name) {
    for (const child of spTree.children) {
      const ln = child.localName;
      if (ln === "sp" || ln === "pic" || ln === "cxnSp") {
        const nvEl = g12(child, "nvSpPr") || g12(child, "nvPicPr") || g12(child, "nvCxnSpPr");
        const cNvPr = nvEl ? g12(nvEl, "cNvPr") : null;
        if (cNvPr) {
          const shapeName = cNvPr.getAttribute("name") || "";
          if (shapeName === name) return child;
        }
      } else if (ln === "grpSp") {
        const found = findShapeByName(child, name);
        if (found) return found;
      }
    }
    return null;
  }
  function getSpTree(slideDoc) {
    const cSld = g12(slideDoc, "cSld");
    return cSld ? g12(cSld, "spTree") : null;
  }
  function replaceInDoc(doc, find, replace, caseSensitive = true) {
    for (const t of gtn2(doc, "t")) {
      const orig = t.textContent;
      if (!orig) continue;
      const newText = caseSensitive ? orig.split(find).join(replace) : orig.replace(new RegExp(escapeRegex(find), "gi"), replace);
      if (newText !== orig) t.textContent = newText;
    }
  }
  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  var MIME_EXT = {
    "image/jpeg": "jpeg",
    "image/jpg": "jpeg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg"
  };
  var CT_MAP = {
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml"
  };
  function addContentType(files2, ext, partName) {
    const ctPath = "[Content_Types].xml";
    const doc = readXml(files2, ctPath);
    if (!doc) return;
    const root = doc.documentElement;
    for (const ov2 of gtn2(doc, "Override")) {
      if (ov2.getAttribute("PartName") === "/" + partName) return;
    }
    const ov = doc.createElementNS(NS.ct, "Override");
    ov.setAttribute("PartName", "/" + partName);
    ov.setAttribute("ContentType", CT_MAP[ext] || "application/octet-stream");
    root.appendChild(ov);
    files2[ctPath] = xmlBytes(doc);
  }
  var PptxWriter = class _PptxWriter {
    constructor(files2) {
      this._files = files2;
      this._presPath = "ppt/presentation.xml";
      this._presDoc = readXml(files2, this._presPath);
      this._presRels = parseRels(files2, this._presPath);
      this._slidePaths = this._buildSlidePaths();
    }
    // ── Factory ─────────────────────────────────────────────────────────────────
    /** Clone from an already-loaded PptxRenderer. O(1) — shares byte arrays. */
    static fromRenderer(renderer) {
      const files2 = {};
      for (const [k, v] of Object.entries(renderer._files)) {
        files2[k] = v instanceof Uint8Array ? v.slice() : v;
      }
      return new _PptxWriter(files2);
    }
    /** Parse from raw ArrayBuffer or Uint8Array. */
    static async fromBytes(buffer) {
      const files2 = await readZip(buffer);
      return new _PptxWriter(files2);
    }
    // ── Slide list ──────────────────────────────────────────────────────────────
    _buildSlidePaths() {
      if (!this._presDoc) return [];
      const sldIdLst = g12(this._presDoc, "sldIdLst");
      if (!sldIdLst) return [];
      const paths = [];
      for (const sldId of sldIdLst.children) {
        if (sldId.localName !== "sldId") continue;
        const rId = sldId.getAttribute("r:id") || sldId.getAttribute("id");
        const rel = this._presRels[rId];
        if (rel) paths.push(rel.fullPath);
      }
      return paths;
    }
    _savePresDoc() {
      this._files[this._presPath] = xmlBytes(this._presDoc);
    }
    _savePresRels() {
      this._files[relsPath(this._presPath)] = xmlBytes(buildRelsDoc(this._presRels));
    }
    getSlidePaths() {
      return [...this._slidePaths];
    }
    getSlideCount() {
      return this._slidePaths.length;
    }
    _slideDoc(idx) {
      const path = this._slidePaths[idx];
      if (!path) throw new RangeError(`Slide ${idx} out of range`);
      return readXml(this._files, path);
    }
    _saveSlideDoc(idx, doc) {
      this._files[this._slidePaths[idx]] = xmlBytes(doc);
    }
    // ── Template substitution ────────────────────────────────────────────────────
    /**
     * Replace `{{key}}` placeholders with values from a data object.
     * Applied to every slide, every text shape, and speaker notes.
     *
     * @param {Record<string, string|number>} data
     * @param {object} [opts]
     * @param {string} [opts.open='{{']
     * @param {string} [opts.close='}}']
     * @param {number[]} [opts.slides]  limit to specific slide indices
     */
    applyTemplate(data, opts = {}) {
      const { open = "{{", close = "}}", slides } = opts;
      const indices = slides ?? this._slidePaths.map((_, i) => i);
      for (const idx of indices) {
        const doc = this._slideDoc(idx);
        for (const [key, value] of Object.entries(data)) {
          const token = open + key + close;
          replaceInDoc(doc, token, String(value));
        }
        this._saveSlideDoc(idx, doc);
      }
      for (const idx of indices) {
        this._applyTemplateToNotes(idx, data, open, close);
      }
    }
    _applyTemplateToNotes(idx, data, open, close) {
      const slideRels = parseRels(this._files, this._slidePaths[idx]);
      const notesRel = Object.values(slideRels).find((r) => r.type?.includes("notesSlide"));
      if (!notesRel) return;
      const notesDoc = readXml(this._files, notesRel.fullPath);
      if (!notesDoc) return;
      for (const [key, value] of Object.entries(data)) {
        replaceInDoc(notesDoc, open + key + close, String(value));
      }
      this._files[notesRel.fullPath] = xmlBytes(notesDoc);
    }
    // ── Global find-and-replace ──────────────────────────────────────────────────
    /**
     * Find and replace text across all (or specified) slides.
     * @param {string} find
     * @param {string} replace
     * @param {object} [opts]
     * @param {boolean} [opts.caseSensitive=true]
     * @param {boolean} [opts.includeNotes=false]
     * @param {number[]} [opts.slides]
     */
    replaceText(find, replace, opts = {}) {
      const { caseSensitive = true, includeNotes = false, slides } = opts;
      const indices = slides ?? this._slidePaths.map((_, i) => i);
      for (const idx of indices) {
        const doc = this._slideDoc(idx);
        replaceInDoc(doc, find, replace, caseSensitive);
        this._saveSlideDoc(idx, doc);
        if (includeNotes) {
          const slideRels = parseRels(this._files, this._slidePaths[idx]);
          const notesRel = Object.values(slideRels).find((r) => r.type?.includes("notesSlide"));
          if (notesRel) {
            const nd = readXml(this._files, notesRel.fullPath);
            if (nd) {
              replaceInDoc(nd, find, replace, caseSensitive);
              this._files[notesRel.fullPath] = xmlBytes(nd);
            }
          }
        }
      }
    }
    // ── Shape text ───────────────────────────────────────────────────────────────
    /**
     * Set the text content of a named shape on a slide.
     * Preserves the formatting of the first run; clears all other runs.
     *
     * @param {number} slideIdx
     * @param {string} shapeName     exact `name` attribute of the shape
     * @param {string} text          new text (use \n for line breaks)
     * @param {object} [opts]
     * @param {boolean} [opts.preserveFormatting=true]
     */
    setShapeText(slideIdx, shapeName, text, opts = {}) {
      const { preserveFormatting = true } = opts;
      const doc = this._slideDoc(slideIdx);
      const spTree = getSpTree(doc);
      if (!spTree) return this;
      const shape = findShapeByName(spTree, shapeName);
      if (!shape) throw new Error(`Shape "${shapeName}" not found on slide ${slideIdx}`);
      const txBody = g12(shape, "txBody");
      if (!txBody) return this;
      const firstRun = g12(txBody, "r");
      const refRPr = firstRun ? g12(firstRun, "rPr") : null;
      const refPPr = g12(g12(txBody, "p"), "pPr");
      for (const p of gtn2(txBody, "p")) p.parentNode.removeChild(p);
      const lines = text.split("\n");
      const nsA = NS.a;
      for (const line of lines) {
        const p = doc.createElementNS(nsA, "a:p");
        if (refPPr && preserveFormatting) {
          p.appendChild(refPPr.cloneNode(true));
        }
        const r = doc.createElementNS(nsA, "a:r");
        if (refRPr && preserveFormatting) {
          r.appendChild(refRPr.cloneNode(true));
        }
        const t = doc.createElementNS(nsA, "a:t");
        t.textContent = line;
        r.appendChild(t);
        p.appendChild(r);
        txBody.appendChild(p);
      }
      this._saveSlideDoc(slideIdx, doc);
      return this;
    }
    /**
     * Read the plain text of a named shape.
     * @param {number} slideIdx
     * @param {string} shapeName
     * @returns {string}
     */
    getShapeText(slideIdx, shapeName) {
      const doc = this._slideDoc(slideIdx);
      const spTree = getSpTree(doc);
      if (!spTree) return "";
      const shape = findShapeByName(spTree, shapeName);
      if (!shape) return "";
      return gtn2(shape, "t").map((t) => t.textContent).join("");
    }
    // ── Add text box ─────────────────────────────────────────────────────────────
    /**
     * Add a new text box to a slide.
     *
     * @param {number} slideIdx
     * @param {string} text
     * @param {object} style
     * @param {number} style.x      EMU from left edge
     * @param {number} style.y      EMU from top edge
     * @param {number} style.w      EMU width
     * @param {number} style.h      EMU height
     * @param {string} [style.color]      hex colour, no #
     * @param {number} [style.fontSize]   pt * 100  (e.g. 2400 = 24pt)
     * @param {boolean}[style.bold]
     * @param {string} [style.align]      l|ctr|r
     * @param {string} [style.fontFamily]
     */
    addTextBox(slideIdx, text, style = {}) {
      const {
        x = 914400,
        y = 914400,
        w = 4572e3,
        h = 914400,
        color = "000000",
        fontSize = 1800,
        bold = false,
        align = "l",
        fontFamily = "Calibri"
      } = style;
      const doc = this._slideDoc(slideIdx);
      const spTree = getSpTree(doc);
      if (!spTree) return this;
      const maxId = Math.max(0, ...gtn2(spTree, "cNvPr").map((e) => parseInt(e.getAttribute("id") || "0", 10)));
      const newId = maxId + 1;
      const name = `TextBox ${newId}`;
      const nsA = NS.a, nsP = NS.p;
      const xml = `<p:sp xmlns:p="${nsP}" xmlns:a="${nsA}">
  <p:nvSpPr>
    <p:cNvPr id="${newId}" name="${name}"/>
    <p:cNvSpPr txBox="1"><a:spLocks noGrp="1"/></p:cNvSpPr>
    <p:nvPr/>
  </p:nvSpPr>
  <p:spPr>
    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    <a:noFill/>
  </p:spPr>
  <p:txBody>
    <a:bodyPr wrap="square" rtlCol="0"><a:spAutoFit/></a:bodyPr>
    <a:lstStyle/>
    <a:p>
      <a:pPr algn="${align}"/>
      <a:r>
        <a:rPr lang="en-US" sz="${fontSize}" b="${bold ? 1 : 0}" dirty="0">
          <a:solidFill><a:srgbClr val="${color}"/></a:solidFill>
          <a:latin typeface="${fontFamily}"/>
        </a:rPr>
        <a:t>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</a:t>
      </a:r>
    </a:p>
  </p:txBody>
</p:sp>`;
      const frag = parseXml2(xml);
      spTree.appendChild(doc.adoptNode(frag.documentElement));
      this._saveSlideDoc(slideIdx, doc);
      return this;
    }
    // ── Image replacement ─────────────────────────────────────────────────────────
    /**
     * Replace the image in a named picture shape.
     *
     * @param {number}     slideIdx
     * @param {string}     shapeName
     * @param {Uint8Array} imageBytes
     * @param {string}     [mimeType='image/jpeg']
     */
    async setShapeImage(slideIdx, shapeName, imageBytes, mimeType = "image/jpeg") {
      const doc = this._slideDoc(slideIdx);
      const spTree = getSpTree(doc);
      if (!spTree) return this;
      const shape = findShapeByName(spTree, shapeName);
      if (!shape) throw new Error(`Shape "${shapeName}" not found on slide ${slideIdx}`);
      const slideRels = parseRels(this._files, this._slidePaths[slideIdx]);
      const blipFill = g12(shape, "blipFill");
      const blip = blipFill ? g12(blipFill, "blip") : null;
      const oldRId = blip ? blip.getAttribute("r:embed") || blip.getAttribute("embed") : null;
      const oldRel = oldRId ? slideRels[oldRId] : null;
      const ext = MIME_EXT[mimeType] || "jpeg";
      const mediaIdx = Object.keys(this._files).filter((p) => p.startsWith("ppt/media/")).length + 1;
      const mediaPath = `ppt/media/image${mediaIdx}.${ext}`;
      this._files[mediaPath] = imageBytes;
      let rId;
      if (oldRId && oldRel) {
        rId = oldRId;
        slideRels[rId] = {
          id: rId,
          type: oldRel.type,
          target: `../media/image${mediaIdx}.${ext}`,
          fullPath: mediaPath
        };
      } else {
        rId = nextRId(slideRels);
        slideRels[rId] = {
          id: rId,
          type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
          target: `../media/image${mediaIdx}.${ext}`,
          fullPath: mediaPath
        };
      }
      if (blip) {
        blip.setAttribute("r:embed", rId);
      }
      this._files[relsPath(this._slidePaths[slideIdx])] = xmlBytes(buildRelsDoc(slideRels));
      this._saveSlideDoc(slideIdx, doc);
      addContentType(this._files, ext, mediaPath);
      return this;
    }
    /**
     * Add a new image shape to a slide.
     *
     * @param {number}     slideIdx
     * @param {Uint8Array} imageBytes
     * @param {string}     [mimeType='image/jpeg']
     * @param {object}     rect      { x, y, w, h } in EMU
     */
    async addImage(slideIdx, imageBytes, mimeType = "image/jpeg", rect = {}) {
      const {
        x = 914400,
        y = 914400,
        w = 2743200,
        h = 2057400
      } = rect;
      const ext = MIME_EXT[mimeType] || "jpeg";
      const mediaIdx = Object.keys(this._files).filter((p) => p.startsWith("ppt/media/")).length + 1;
      const mediaPath = `ppt/media/image${mediaIdx}.${ext}`;
      this._files[mediaPath] = imageBytes;
      const slideRels = parseRels(this._files, this._slidePaths[slideIdx]);
      const rId = nextRId(slideRels);
      slideRels[rId] = {
        id: rId,
        type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
        target: `../media/image${mediaIdx}.${ext}`,
        fullPath: mediaPath
      };
      this._files[relsPath(this._slidePaths[slideIdx])] = xmlBytes(buildRelsDoc(slideRels));
      const doc = this._slideDoc(slideIdx);
      const spTree = getSpTree(doc);
      if (!spTree) return this;
      const maxId = Math.max(0, ...gtn2(spTree, "cNvPr").map((e) => parseInt(e.getAttribute("id") || "0", 10)));
      const newId = maxId + 1;
      const nsA = NS.a, nsP = NS.p;
      const xml = `<p:pic xmlns:p="${nsP}" xmlns:a="${nsA}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:nvPicPr>
    <p:cNvPr id="${newId}" name="Picture ${newId}"/>
    <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
    <p:nvPr/>
  </p:nvPicPr>
  <p:blipFill>
    <a:blip r:embed="${rId}"/>
    <a:stretch><a:fillRect/></a:stretch>
  </p:blipFill>
  <p:spPr>
    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
  </p:spPr>
</p:pic>`;
      const frag = parseXml2(xml);
      spTree.appendChild(doc.adoptNode(frag.documentElement));
      this._saveSlideDoc(slideIdx, doc);
      addContentType(this._files, ext, mediaPath);
      return this;
    }
    // ── Slide background ─────────────────────────────────────────────────────────
    /**
     * Set a solid colour background on a slide.
     * @param {number} slideIdx
     * @param {string} hexRgb   6-digit hex, no '#'
     */
    setSlideBackground(slideIdx, hexRgb) {
      const doc = this._slideDoc(slideIdx);
      const cSld = g12(doc, "cSld");
      if (!cSld) return this;
      const oldBg = g12(cSld, "bg");
      if (oldBg) cSld.removeChild(oldBg);
      const nsA = NS.a, nsP = NS.p;
      const xml = `<p:bg xmlns:p="${nsP}" xmlns:a="${nsA}">
  <p:bgPr><a:solidFill><a:srgbClr val="${hexRgb}"/></a:solidFill>
  <a:effectLst/></p:bgPr></p:bg>`;
      const bgEl = doc.adoptNode(parseXml2(xml).documentElement);
      cSld.insertBefore(bgEl, cSld.firstChild);
      this._saveSlideDoc(slideIdx, doc);
      return this;
    }
    // ── Theme colours ─────────────────────────────────────────────────────────────
    /**
     * Override a theme colour.
     * Key: dk1|lt1|dk2|lt2|accent1…accent6|hlink|folHlink
     * Value: 6-digit hex RGB, no '#'
     *
     * @param {string} key
     * @param {string} hexRgb
     */
    setThemeColor(key, hexRgb) {
      const presRels = this._presRels;
      let themePath = Object.values(presRels).find((r) => r.type?.includes("theme"))?.fullPath;
      if (!themePath) {
        const masterRel = Object.values(presRels).find((r) => r.type?.includes("slideMaster"));
        if (masterRel) {
          const mr = parseRels(this._files, masterRel.fullPath);
          themePath = Object.values(mr).find((r) => r.type?.includes("theme"))?.fullPath;
        }
      }
      if (!themePath) return this;
      const doc = readXml(this._files, themePath);
      if (!doc) return this;
      const fmtScheme = g12(doc, "fmtScheme");
      const clrScheme = g12(doc, "clrScheme");
      if (!clrScheme) return this;
      for (const child of clrScheme.children) {
        if (child.localName === key) {
          const srgb = g12(child, "srgbClr");
          if (srgb) {
            srgb.setAttribute("val", hexRgb);
          } else {
            while (child.firstChild) child.removeChild(child.firstChild);
            const nsA = NS.a;
            const el = doc.createElementNS(nsA, "a:srgbClr");
            el.setAttribute("val", hexRgb);
            child.appendChild(el);
          }
          break;
        }
      }
      this._files[themePath] = xmlBytes(doc);
      return this;
    }
    // ── Slide operations ──────────────────────────────────────────────────────────
    /**
     * Duplicate a slide.
     * @param {number} fromIdx       source slide index
     * @param {number} [toIdx]       insert position (default: end)
     */
    duplicateSlide(fromIdx, toIdx) {
      const insertAt = toIdx ?? this._slidePaths.length;
      const srcPath = this._slidePaths[fromIdx];
      if (!srcPath) throw new RangeError(`Slide ${fromIdx} out of range`);
      const nums = Object.keys(this._files).map((p) => p.match(/ppt\/slides\/slide(\d+)\.xml/)).filter(Boolean).map((m) => parseInt(m[1], 10));
      const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
      const newSlidePath = `ppt/slides/slide${nextNum}.xml`;
      const newRelsPath = relsPath(newSlidePath);
      this._files[newSlidePath] = this._files[srcPath].slice();
      const srcRelsPath = relsPath(srcPath);
      if (this._files[srcRelsPath]) {
        this._files[newRelsPath] = this._files[srcRelsPath].slice();
      }
      const newRId = nextRId(this._presRels);
      const target = `slides/slide${nextNum}.xml`;
      this._presRels[newRId] = {
        id: newRId,
        type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
        target,
        fullPath: newSlidePath
      };
      this._savePresRels();
      const sldIdLst = g12(this._presDoc, "sldIdLst");
      if (sldIdLst) {
        const ids = gtn2(sldIdLst, "sldId").map((el) => parseInt(el.getAttribute("id") || "0", 10));
        const nextId = (ids.length ? Math.max(...ids) : 255) + 1;
        const nsP = NS.p;
        const sldIdEl = this._presDoc.createElementNS(nsP, "p:sldId");
        sldIdEl.setAttribute("id", String(nextId));
        sldIdEl.setAttributeNS(NS.r, "r:id", newRId);
        const children = Array.from(sldIdLst.children);
        if (insertAt >= children.length) {
          sldIdLst.appendChild(sldIdEl);
        } else {
          sldIdLst.insertBefore(sldIdEl, children[insertAt]);
        }
      }
      this._savePresDoc();
      this._slidePaths = this._buildSlidePaths();
      const ctPath = "[Content_Types].xml";
      const ctDoc = readXml(this._files, ctPath);
      if (ctDoc) {
        const root = ctDoc.documentElement;
        const ov = ctDoc.createElementNS(NS.ct, "Override");
        ov.setAttribute("PartName", "/" + newSlidePath);
        ov.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.presentationml.slide+xml");
        root.appendChild(ov);
        this._files[ctPath] = xmlBytes(ctDoc);
      }
      return this;
    }
    /**
     * Remove a slide.
     * @param {number} slideIdx
     */
    removeSlide(slideIdx) {
      if (this._slidePaths.length <= 1) throw new Error("Cannot remove the last slide");
      const path = this._slidePaths[slideIdx];
      if (!path) throw new RangeError(`Slide ${slideIdx} out of range`);
      const sldIdLst = g12(this._presDoc, "sldIdLst");
      if (sldIdLst) {
        for (const sldId of Array.from(sldIdLst.children)) {
          const rId = sldId.getAttribute("r:id") || sldId.getAttribute("id");
          const rel = this._presRels[rId];
          if (rel && rel.fullPath === path) {
            sldIdLst.removeChild(sldId);
            delete this._presRels[rId];
            break;
          }
        }
      }
      this._savePresDoc();
      this._savePresRels();
      this._slidePaths = this._buildSlidePaths();
      return this;
    }
    /**
     * Reorder slides.
     * @param {number[]} newOrder  e.g. [2, 0, 1] to put slide 2 first
     */
    reorderSlides(newOrder) {
      if (newOrder.length !== this._slidePaths.length) {
        throw new Error("newOrder must have the same length as the current slide count");
      }
      const sldIdLst = g12(this._presDoc, "sldIdLst");
      if (!sldIdLst) return this;
      const children = Array.from(sldIdLst.children).filter((el) => el.localName === "sldId");
      for (const c of children) sldIdLst.removeChild(c);
      for (const idx of newOrder) {
        if (children[idx]) sldIdLst.appendChild(children[idx]);
      }
      this._savePresDoc();
      this._slidePaths = this._buildSlidePaths();
      return this;
    }
    // ── Speaker notes ─────────────────────────────────────────────────────────────
    /**
     * Set the speaker notes for a slide. Creates the notes slide if absent.
     * @param {number} slideIdx
     * @param {string} text
     */
    setSlideNotes(slideIdx, text) {
      const slidePath = this._slidePaths[slideIdx];
      const slideRels = parseRels(this._files, slidePath);
      const notesRel = Object.values(slideRels).find((r) => r.type?.includes("notesSlide"));
      if (notesRel) {
        const nd = readXml(this._files, notesRel.fullPath);
        if (nd) {
          for (const sp of gtn2(nd, "sp")) {
            const nvPr = g12(g12(sp, "nvSpPr"), "nvPr");
            const ph = nvPr ? g12(nvPr, "ph") : null;
            if (ph && attr2(ph, "type") !== "sldNum") {
              for (const t of gtn2(sp, "t")) t.textContent = "";
              const firstT = g12(sp, "t");
              if (firstT) firstT.textContent = text;
              break;
            }
          }
          this._files[notesRel.fullPath] = xmlBytes(nd);
        }
      } else {
        this._createNotesSlide(slideIdx, slidePath, slideRels, text);
      }
      return this;
    }
    _createNotesSlide(slideIdx, slidePath, slideRels, text) {
      const num = Object.keys(this._files).filter((p) => p.startsWith("ppt/notesSlides/")).length + 1;
      const nsP = NS.p, nsA = NS.a;
      const notesPath = `ppt/notesSlides/notesSlide${num}.xml`;
      const notesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:p="${nsP}" xmlns:a="${nsA}">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder 1"/>
        <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
        <p:nvPr><p:ph type="body" idx="1"/></p:nvPr>
      </p:nvSpPr>
      <p:spPr/>
      <p:txBody><a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:t>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:notes>`;
      this._files[notesPath] = enc2.encode(notesXml);
      const newRId = nextRId(slideRels);
      slideRels[newRId] = {
        id: newRId,
        type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide",
        target: `../notesSlides/notesSlide${num}.xml`,
        fullPath: notesPath
      };
      this._files[relsPath(slidePath)] = xmlBytes(buildRelsDoc(slideRels));
    }
    // ── Serialisation ─────────────────────────────────────────────────────────────
    /**
     * Serialize the edited PPTX to bytes.
     * @returns {Promise<Uint8Array>}
     */
    async save() {
      return writeZip(this._files);
    }
    /**
     * Download as a PPTX file in the browser.
     * @param {string} [filename='edited.pptx']
     */
    async download(filename = "edited.pptx") {
      const bytes = await this.save();
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e4);
    }
    // ── Utility ───────────────────────────────────────────────────────────────────
    /**
     * List all shape names on a slide.
     * @param {number} slideIdx
     * @returns {Array<{id, name, type}>}
     */
    listShapes(slideIdx) {
      const doc = this._slideDoc(slideIdx);
      const spTree = getSpTree(doc);
      if (!spTree) return [];
      const shapes = [];
      for (const child of spTree.children) {
        const ln = child.localName;
        if (!["sp", "pic", "cxnSp", "graphicFrame"].includes(ln)) continue;
        const nvEl = g12(child, "nvSpPr") || g12(child, "nvPicPr") || g12(child, "nvGraphicFramePr") || g12(child, "nvCxnSpPr");
        const cNvPr = nvEl ? g12(nvEl, "cNvPr") : null;
        shapes.push({
          id: cNvPr?.getAttribute("id") || "",
          name: cNvPr?.getAttribute("name") || "",
          type: ln
        });
      }
      return shapes;
    }
  };

  // node_modules/pptx-browser/src/pdf.js
  var enc3 = new TextEncoder();
  function dpiToWidth(renderer, dpi) {
    const inches = renderer.slideSize.cx / 914400;
    return Math.round(inches * dpi);
  }
  var PdfBuf = class {
    constructor() {
      this._parts = [];
      this._size = 0;
    }
    write(s) {
      const b = typeof s === "string" ? enc3.encode(s) : s;
      this._parts.push(b);
      this._size += b.length;
      return this._size;
    }
    get size() {
      return this._size;
    }
    concat() {
      const out = new Uint8Array(this._size);
      let off = 0;
      for (const p of this._parts) {
        out.set(p, off);
        off += p.length;
      }
      return out;
    }
  };
  async function canvasToJpeg(canvas, quality = 0.92) {
    if (typeof canvas.convertToBlob === "function") {
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
      const buf = await blob.arrayBuffer();
      return new Uint8Array(buf);
    }
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("canvas.toBlob failed"));
          return;
        }
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(reject);
      }, "image/jpeg", quality);
    });
  }
  async function renderSlide(renderer, slideIndex, widthPx) {
    const { cx, cy } = renderer.slideSize;
    const h = Math.round(widthPx * cy / cx);
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(widthPx, h) : Object.assign(document.createElement("canvas"), { width: widthPx, height: h });
    await renderer.renderSlide(slideIndex, canvas, widthPx);
    return canvas;
  }
  function slidePageSize(cx, cy) {
    const w = cx / 914400 * 72;
    const h = cy / 914400 * 72;
    return { w, h };
  }
  var PdfWriter = class {
    constructor() {
      this._buf = new PdfBuf();
      this._xref = [];
      this._objNum = 0;
    }
    _nextObj() {
      return ++this._objNum;
    }
    /** Write a PDF object. Returns its object number. */
    _writeObj(num, dictStr, streamData = null) {
      const off = this._buf.size;
      this._xref[num] = off;
      this._buf.write(`${num} 0 obj
`);
      if (streamData) {
        const len = streamData.length;
        this._buf.write(`${dictStr.replace("__LEN__", len)}
`);
        this._buf.write("stream\r\n");
        this._buf.write(streamData);
        this._buf.write("\r\nendstream\n");
      } else {
        this._buf.write(`${dictStr}
`);
      }
      this._buf.write("endobj\n\n");
      return num;
    }
    /** Reserve the next N object numbers. Returns first number. */
    _reserveObjs(n) {
      const first = this._objNum + 1;
      this._objNum += n;
      return first;
    }
    // ── Build PDF ───────────────────────────────────────────────────────────────
    async build(renderer, opts = {}) {
      const {
        widthPx = 1920,
        quality = 0.92,
        slideList = null,
        onProgress = null
      } = opts;
      const indices = slideList ?? Array.from({ length: renderer.slideCount }, (_, i) => i);
      const n = indices.length;
      const { cx, cy } = renderer.slideSize;
      const { w: pgW, h: pgH } = slidePageSize(cx, cy);
      this._buf.write("%PDF-1.4\n");
      this._buf.write("%\xFF\xFE\xFD\xFC\n\n");
      const catalogNum = this._nextObj();
      const pagesNum = this._nextObj();
      const pageNums = Array.from({ length: n }, () => this._nextObj());
      const imageNums = Array.from({ length: n }, () => this._nextObj());
      const contentNums = Array.from({ length: n }, () => this._nextObj());
      this._writeObj(catalogNum, `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`);
      const kidsStr = pageNums.map((n2) => `${n2} 0 R`).join(" ");
      this._writeObj(pagesNum, `<< /Type /Pages /Kids [${kidsStr}] /Count ${n} >>`);
      for (let i = 0; i < n; i++) {
        const slideIdx = indices[i];
        onProgress?.(i, n);
        const canvas = await renderSlide(renderer, slideIdx, widthPx);
        const jpegData = await canvasToJpeg(canvas, quality);
        const imgW = canvas.width;
        const imgH = canvas.height;
        this._writeObj(
          pageNums[i],
          `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${pgW.toFixed(3)} ${pgH.toFixed(3)}] /Resources << /XObject << /Im${i} ${imageNums[i]} 0 R >> >> /Contents ${contentNums[i]} 0 R >>`
        );
        this._writeObj(
          imageNums[i],
          `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length __LEN__ >>`,
          jpegData
        );
        const contentStr = `q ${pgW.toFixed(3)} 0 0 ${pgH.toFixed(3)} 0 0 cm /Im${i} Do Q`;
        this._writeObj(
          contentNums[i],
          `<< /Length __LEN__ >>`,
          enc3.encode(contentStr)
        );
      }
      onProgress?.(n, n);
      const xrefOffset = this._buf.size;
      const totalObjs = this._objNum + 1;
      this._buf.write(`xref
0 ${totalObjs}
`);
      this._buf.write("0000000000 65535 f \r\n");
      for (let i = 1; i < totalObjs; i++) {
        const off = this._xref[i] ?? 0;
        this._buf.write(String(off).padStart(10, "0") + " 00000 n \r\n");
      }
      this._buf.write(`trailer
<< /Size ${totalObjs} /Root ${catalogNum} 0 R >>
`);
      this._buf.write(`startxref
${xrefOffset}
%%EOF
`);
      return this._buf.concat();
    }
  };
  async function exportToPdf(renderer, opts = {}) {
    const {
      width = null,
      dpi = 150,
      quality = 0.92,
      slides = null,
      onProgress = null
    } = opts;
    const resolvedWidth = width ?? dpiToWidth(renderer, dpi);
    const writer = new PdfWriter();
    return writer.build(renderer, {
      widthPx: resolvedWidth,
      quality,
      slideList: slides,
      onProgress
    });
  }
  async function downloadAsPdf(renderer, filename = "presentation.pdf", opts = {}) {
    const bytes = await exportToPdf(renderer, opts);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e4);
  }
  async function exportSlideToPdf(slideIndex, renderer, opts = {}) {
    return exportToPdf(renderer, { ...opts, slides: [slideIndex] });
  }

  // node_modules/pptx-browser/src/index.js
  init_animation();

  // node_modules/pptx-browser/src/svg.js
  init_utils();
  init_colors();
  init_fonts();
  init_render();
  var _idSeq = 0;
  function uid(prefix = "el") {
    return `${prefix}${++_idSeq}`;
  }
  function esc(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function px(n) {
    return `${+n.toFixed(3)}`;
  }
  function colStr(c) {
    return c ? colorToCss(c) : "none";
  }
  function fillAttr(fillEl, defs, themeColors, x, y, w, h) {
    if (!fillEl) return { fill: "none", fillAttrs: "" };
    const ln = fillEl.localName;
    if (ln === "noFill") return { fill: "none", fillAttrs: "" };
    if (ln === "solidFill") {
      const cc = findFirstColorChild(fillEl);
      const c = resolveColorElement(cc, themeColors);
      const css = colStr(c);
      const opacity = c?.a != null ? c.a / 255 : 1;
      return { fill: css, fillAttrs: opacity < 1 ? ` fill-opacity="${px(opacity)}"` : "" };
    }
    if (ln === "gradFill") {
      const gsLst = g1(fillEl, "gsLst");
      const stops = gsLst ? gtn(gsLst, "gs").map((gs) => {
        const pos = attrInt(gs, "pos", 0) / 1e5;
        const cc = findFirstColorChild(gs);
        const c = resolveColorElement(cc, themeColors);
        return { pos, color: colStr(c), opacity: c?.a != null ? c.a / 255 : 1 };
      }) : [];
      const linEl = g1(fillEl, "lin");
      const pathEl = g1(fillEl, "path");
      const gradId = uid("grad");
      let gradDef;
      if (pathEl) {
        const fillToRect = g1(pathEl, "fillToRect");
        const fl = attrInt(fillToRect, "l", 5e4) / 1e5;
        const ft = attrInt(fillToRect, "t", 5e4) / 1e5;
        const cx = x + w * fl;
        const cy = y + h * ft;
        const r = Math.sqrt(w * w + h * h) / 2;
        gradDef = `<radialGradient id="${gradId}" cx="${px(cx)}" cy="${px(cy)}" r="${px(r)}" gradientUnits="userSpaceOnUse">`;
        for (const s of stops) {
          gradDef += `<stop offset="${px(s.pos)}" stop-color="${esc(s.color)}"${s.opacity < 1 ? ` stop-opacity="${px(s.opacity)}"` : ""}/>`;
        }
        gradDef += `</radialGradient>`;
      } else {
        const angRaw = attrInt(linEl, "ang", 0);
        const ang = (angRaw / 6e4 - 90) * (Math.PI / 180);
        const cos = Math.cos(ang), sin = Math.sin(ang);
        const half = Math.sqrt(w * w + h * h) / 2;
        const cx2 = x + w / 2, cy2 = y + h / 2;
        gradDef = `<linearGradient id="${gradId}" x1="${px(cx2 - cos * half)}" y1="${px(cy2 - sin * half)}" x2="${px(cx2 + cos * half)}" y2="${px(cy2 + sin * half)}" gradientUnits="userSpaceOnUse">`;
        for (const s of stops) {
          gradDef += `<stop offset="${px(s.pos)}" stop-color="${esc(s.color)}"${s.opacity < 1 ? ` stop-opacity="${px(s.opacity)}"` : ""}/>`;
        }
        gradDef += `</linearGradient>`;
      }
      defs.push(gradDef);
      return { fill: `url(#${gradId})`, fillAttrs: "" };
    }
    if (ln === "blipFill") {
      return { fill: "none", fillAttrs: "" };
    }
    return { fill: "none", fillAttrs: "" };
  }
  function strokeAttrs(lnEl, themeColors, scale) {
    if (!lnEl) return "";
    if (g1(lnEl, "noFill")) return ' stroke="none"';
    const solidFill = g1(lnEl, "solidFill");
    const cc = solidFill ? findFirstColorChild(solidFill) : null;
    const c = resolveColorElement(cc, themeColors);
    const color = colStr(c) || "#000";
    const w = Math.max(0.5, attrInt(lnEl, "w", 12700) / 914400 * 96);
    const prstDash = g1(lnEl, "prstDash");
    const dash = prstDash ? attr(prstDash, "val", "solid") : "solid";
    let dashArr = "";
    if (dash === "dash") dashArr = ` stroke-dasharray="${px(w * 4)},${px(w * 2)}"`;
    else if (dash === "dot") dashArr = ` stroke-dasharray="${px(w)},${px(w * 2)}"`;
    else if (dash === "dashDot") dashArr = ` stroke-dasharray="${px(w * 4)},${px(w * 2)},${px(w)},${px(w * 2)}"`;
    else if (dash === "lgDash") dashArr = ` stroke-dasharray="${px(w * 8)},${px(w * 3)}"`;
    const cap = attr(lnEl, "cap", "flat");
    const capSvg = cap === "rnd" ? "round" : cap === "sq" ? "square" : "butt";
    return ` stroke="${esc(color)}" stroke-width="${px(w)}" stroke-linecap="${capSvg}" stroke-linejoin="round"${dashArr}`;
  }
  function shadowFilter(effectLst, defs) {
    if (!effectLst) return "";
    const outerShdw = g1(effectLst, "outerShdw");
    if (!outerShdw) return "";
    const dist = attrInt(outerShdw, "dist", 38100) / 914400 * 96;
    const dir = attrInt(outerShdw, "dir", 27e5) / 6e4;
    const blurR = attrInt(outerShdw, "blurRad", 38100) / 914400 * 96;
    const ang = dir * Math.PI / 180;
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist;
    const cc = findFirstColorChild(outerShdw);
    const c = resolveColorElement(cc, {});
    const col = c ? colorToCss(c) : "rgba(0,0,0,0.5)";
    const opacity = c?.a != null ? c.a / 255 : 0.5;
    const filterId = uid("shd");
    defs.push(
      `<filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${px(dx)}" dy="${px(dy)}" stdDeviation="${px(blurR / 2)}" flood-color="${esc(col)}" flood-opacity="${px(opacity)}"/></filter>`
    );
    return ` filter="url(#${filterId})"`;
  }
  function presetToSvgPath(prst, x, y, w, h, adjValues) {
    const cmds = [];
    const mock = {
      beginPath() {
        cmds.length = 0;
      },
      moveTo(px2, py2) {
        cmds.push(`M${px(px2)},${px(py2)}`);
      },
      lineTo(px2, py2) {
        cmds.push(`L${px(px2)},${px(py2)}`);
      },
      bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey) {
        cmds.push(`C${px(c1x)},${px(c1y)},${px(c2x)},${px(c2y)},${px(ex)},${px(ey)}`);
      },
      quadraticCurveTo(cpx, cpy, ex, ey) {
        cmds.push(`Q${px(cpx)},${px(cpy)},${px(ex)},${px(ey)}`);
      },
      arc(cx2, cy2, r, start, end, ccw) {
        const startX = cx2 + r * Math.cos(start);
        const startY = cy2 + r * Math.sin(start);
        const endX = cx2 + r * Math.cos(end);
        const endY = cy2 + r * Math.sin(end);
        let sweep = end - start;
        if (ccw) sweep = -(Math.PI * 2 - Math.abs(sweep));
        const large = Math.abs(sweep) > Math.PI ? 1 : 0;
        const sweepFlag = sweep > 0 ? 1 : 0;
        if (cmds.length === 0) cmds.push(`M${px(startX)},${px(startY)}`);
        cmds.push(`A${px(r)},${px(r)},0,${large},${sweepFlag},${px(endX)},${px(endY)}`);
      },
      arcTo(x1, y1, x2, y2, r) {
        cmds.push(`L${px(x1)},${px(y1)} L${px(x2)},${px(y2)}`);
      },
      closePath() {
        cmds.push("Z");
      },
      fill() {
      },
      stroke() {
      },
      save() {
      },
      restore() {
      },
      translate() {
      },
      rotate() {
      },
      scale() {
      },
      rect(rx, ry, rw, rh) {
        cmds.push(`M${px(rx)},${px(ry)}L${px(rx + rw)},${px(ry)}L${px(rx + rw)},${px(ry + rh)}L${px(rx)},${px(ry + rh)}Z`);
      },
      setLineDash() {
      },
      measureText() {
        return { width: 0 };
      }
    };
    try {
      if (_drawPresetGeom) {
        _drawPresetGeom(mock, prst, x, y, w, h, adjValues || {});
      }
    } catch (e) {
      return `M${px(x)},${px(y)}L${px(x + w)},${px(y)}L${px(x + w)},${px(y + h)}L${px(x)},${px(y + h)}Z`;
    }
    return cmds.join(" ") || `M${px(x)},${px(y)}L${px(x + w)},${px(y)}L${px(x + w)},${px(y + h)}L${px(x)},${px(y + h)}Z`;
  }
  var _drawPresetGeom = null;
  function xfrmAttrs(xfrm) {
    if (!xfrm) return "";
    const rot = attrInt(xfrm, "rot", 0) / 6e4;
    const flipH = attr(xfrm, "flipH", "0") === "1";
    const flipV = attr(xfrm, "flipV", "0") === "1";
    const off = g1(xfrm, "off");
    const ext = g1(xfrm, "ext");
    if (!off || !ext) return "";
    const x = attrInt(off, "x", 0) / 914400 * 96;
    const y = attrInt(off, "y", 0) / 914400 * 96;
    const w = attrInt(ext, "cx", 0) / 914400 * 96;
    const h = attrInt(ext, "cy", 0) / 914400 * 96;
    const cx = x + w / 2, cy = y + h / 2;
    const parts = [];
    if (rot) parts.push(`rotate(${px(rot)},${px(cx)},${px(cy)})`);
    if (flipH) parts.push(`scale(-1,1) translate(${px(-x * 2 - w)},0)`);
    if (flipV) parts.push(`scale(1,-1) translate(0,${px(-y * 2 - h)})`);
    return parts.length ? ` transform="${parts.join(" ")}"` : "";
  }
  function xfrmBounds(xfrm) {
    if (!xfrm) return null;
    const off = g1(xfrm, "off"), ext = g1(xfrm, "ext");
    if (!off || !ext) return null;
    return {
      x: attrInt(off, "x", 0) / 914400 * 96,
      y: attrInt(off, "y", 0) / 914400 * 96,
      w: attrInt(ext, "cx", 0) / 914400 * 96,
      h: attrInt(ext, "cy", 0) / 914400 * 96
    };
  }
  function textBodyToSvg(txBody, bx, by, bw, bh, themeColors, themeData, defs) {
    if (!txBody) return "";
    const bodyPr = g1(txBody, "bodyPr");
    const vert = attr(bodyPr, "vert", "horz");
    const isVert = vert === "vert" || vert === "vert270" || vert === "wordArtVert";
    const anchor = attr(bodyPr, "anchor", "t");
    const lIns = attrInt(bodyPr, "lIns", 91440) / 914400 * 96;
    const rIns = attrInt(bodyPr, "rIns", 91440) / 914400 * 96;
    const tIns = attrInt(bodyPr, "tIns", 45720) / 914400 * 96;
    const bIns = attrInt(bodyPr, "bIns", 45720) / 914400 * 96;
    const tx = bx + lIns, tw = bw - lIns - rIns;
    const ty = by + tIns, th = bh - tIns - bIns;
    const defaultFontSz = 1800;
    const lstStyle = g1(txBody, "lstStyle");
    const lstDefRPr = lstStyle ? g1(lstStyle, "defRPr") : null;
    const paragraphs = gtn(txBody, "p");
    let svgLines = "";
    let curY = ty;
    const clipId = uid("clip");
    defs.push(`<clipPath id="${clipId}"><rect x="${px(bx)}" y="${px(by)}" width="${px(bw)}" height="${px(bh)}"/></clipPath>`);
    const vertTransform = isVert ? ` transform="rotate(-90,${px(bx + bw / 2)},${px(by + bh / 2)})"` : "";
    const autoNumCtrs = {};
    for (const para of paragraphs) {
      const pPr = g1(para, "pPr");
      const algn = attr(pPr, "algn", "l");
      const marL = attrInt(pPr, "marL", 0) / 914400 * 96;
      const indent = attrInt(pPr, "indent", 0) / 914400 * 96;
      const defRPr = g1(pPr, "defRPr");
      let paraDefSz = defaultFontSz;
      if (lstDefRPr) {
        const sz = lstDefRPr.getAttribute("sz");
        if (sz) paraDefSz = parseInt(sz, 10);
      }
      if (defRPr) {
        const sz = defRPr.getAttribute("sz");
        if (sz) paraDefSz = parseInt(sz, 10);
      }
      const spcBef = g1(pPr, "spcBef");
      const spcAft = g1(pPr, "spcAft");
      const lnSpc = g1(pPr, "lnSpc");
      let spaceBefore = 0, spaceAfter = 0;
      if (spcBef) {
        const sp = g1(spcBef, "spcPct"), spp = g1(spcBef, "spcPts");
        if (sp) spaceBefore = paraDefSz * EMU_PER_PT / 914400 * 96 * (attrInt(sp, "val", 0) / 1e5);
        else if (spp) spaceBefore = attrInt(spp, "val", 0) / 100 / 72 * 96;
      }
      if (spcAft) {
        const sp = g1(spcAft, "spcPct"), spp = g1(spcAft, "spcPts");
        if (sp) spaceAfter = paraDefSz * EMU_PER_PT / 914400 * 96 * (attrInt(sp, "val", 0) / 1e5);
        else if (spp) spaceAfter = attrInt(spp, "val", 0) / 100 / 72 * 96;
      }
      const buChar = pPr ? g1(pPr, "buChar") : null;
      const buAutoNum = pPr ? g1(pPr, "buAutoNum") : null;
      const buNone = pPr ? g1(pPr, "buNone") : null;
      const hasBullet = !buNone && (buChar || buAutoNum);
      curY += spaceBefore;
      const runEls = [];
      for (const child of para.children) {
        if (child.localName === "r" || child.localName === "br" || child.localName === "fld")
          runEls.push(child);
      }
      if (!runEls.length) {
        const endRPr = g1(para, "endParaRPr");
        const sz = attrInt(endRPr || defRPr, "sz", paraDefSz);
        const szPx = sz / 100 / 72 * 96;
        const lnH2 = szPx * 1.2;
        curY += lnH2 + spaceAfter;
        continue;
      }
      let lineText = "";
      for (const rEl of runEls) {
        if (rEl.localName === "br") {
          lineText += "\n";
          continue;
        }
        const t = g1(rEl, "t") || g1(rEl, "fldVal");
        if (t) lineText += t.textContent;
      }
      const tspans = [];
      for (const rEl of runEls) {
        if (rEl.localName === "br") {
          tspans.push({ br: true });
          continue;
        }
        const rPr = g1(rEl, "rPr") || g1(rEl, "r")?.firstElementChild;
        const tEl = g1(rEl, "t");
        if (!tEl) continue;
        const text = tEl.textContent;
        if (!text) continue;
        const fi = buildFontInherited(rEl, defRPr, lstDefRPr, themeColors, themeData, paraDefSz);
        const szPx = fi?.szPx || paraDefSz / 100 / 72 * 96;
        const family = fi?.family || "sans-serif";
        const bold = fi?.bold ? "bold" : "normal";
        const italic = fi?.italic ? "italic" : "normal";
        const color = fi?.color ? colorToCss(fi.color) : "#000000";
        const underline = rPr ? (rPr.getAttribute("u") || "none") !== "none" : false;
        const strike = rPr ? (rPr.getAttribute("strike") || "noStrike") !== "noStrike" : false;
        const baseline2 = rPr ? parseInt(rPr.getAttribute("baseline") || "0", 10) : 0;
        tspans.push({ text, szPx, family, bold, italic, color, underline, strike, baseline: baseline2 });
      }
      if (!tspans.length) {
        curY += spaceAfter;
        continue;
      }
      const sizes = tspans.filter((t) => !t.br && t.szPx).map((t) => t.szPx);
      const maxSzPx = sizes.length ? Math.max(...sizes) : paraDefSz / 100 / 72 * 96;
      const lnH = maxSzPx * 1.2;
      const baseline = curY + maxSzPx * 0.85;
      let textAnchor = "start";
      let xPos = tx + marL;
      if (algn === "ctr") {
        textAnchor = "middle";
        xPos = tx + tw / 2;
      } else if (algn === "r") {
        textAnchor = "end";
        xPos = tx + tw;
      }
      let bulletSvg = "";
      if (hasBullet) {
        const bx2 = tx + marL + indent;
        let bulletChar = "";
        if (buChar) {
          bulletChar = esc(buChar.getAttribute("char") || "\u2022");
        } else if (buAutoNum) {
          const numType = buAutoNum.getAttribute("type") || "arabicPeriod";
          const startAt = attrInt(buAutoNum, "startAt", 1);
          const key = numType + ":" + startAt;
          if (!autoNumCtrs[key]) autoNumCtrs[key] = startAt;
          bulletChar = esc(formatAutoNum2(numType, autoNumCtrs[key]++));
        }
        const bSzPx = maxSzPx;
        bulletSvg = `<text x="${px(bx2)}" y="${px(baseline)}" font-size="${px(bSzPx)}" font-family="sans-serif" fill="#000">${bulletChar}</text>`;
      }
      let tspanSvg = "";
      let firstSpan = true;
      for (const ts of tspans) {
        if (ts.br) {
          curY += lnH;
          tspanSvg += `<tspan x="${px(xPos)}" dy="${px(lnH)}">`;
          firstSpan = false;
          continue;
        }
        const dy = firstSpan ? 0 : 0;
        const deco = ts.underline ? "underline" : ts.strike ? "line-through" : "none";
        let adjustedY = baseline;
        if (ts.baseline > 0) adjustedY = baseline - ts.szPx * 0.38;
        else if (ts.baseline < 0) adjustedY = baseline + ts.szPx * 0.12;
        const subSzPx = ts.baseline !== 0 ? ts.szPx * 0.65 : ts.szPx;
        tspanSvg += `<tspan font-family="${esc(ts.family)}, sans-serif" font-size="${px(subSzPx)}" font-weight="${ts.bold}" font-style="${ts.italic}" fill="${esc(ts.color)}"` + (deco !== "none" ? ` text-decoration="${deco}"` : "") + (ts.baseline !== 0 ? ` dy="${px(adjustedY - baseline)}"` : "") + `>${esc(ts.text)}</tspan>`;
        firstSpan = false;
      }
      svgLines += bulletSvg;
      svgLines += `<text x="${px(xPos)}" y="${px(baseline)}" text-anchor="${textAnchor}">${tspanSvg}</text>`;
      curY += lnH + spaceAfter;
    }
    return `<g clip-path="url(#${clipId})"${vertTransform}>${svgLines}</g>`;
  }
  function formatAutoNum2(type, n) {
    switch (type) {
      case "arabicPeriod":
        return n + ".";
      case "arabicParenR":
        return n + ")";
      case "arabicParenBoth":
        return "(" + n + ")";
      case "romanLcPeriod":
        return toRoman2(n).toLowerCase() + ".";
      case "romanUcPeriod":
        return toRoman2(n) + ".";
      case "alphaLcParenR":
        return String.fromCharCode(96 + n) + ")";
      case "alphaUcParenR":
        return String.fromCharCode(64 + n) + ")";
      default:
        return n + ".";
    }
  }
  function toRoman2(n) {
    const v = [1e3, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
    const s = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
    let r = "";
    for (let i = 0; i < v.length; i++) while (n >= v[i]) {
      r += s[i];
      n -= v[i];
    }
    return r;
  }
  async function shapesToSvg(spTreeEl, rels, files2, themeColors, themeData, defs) {
    if (!spTreeEl) return "";
    let out = "";
    for (const child of spTreeEl.children) {
      const ln = child.localName;
      if (ln === "sp") out += await shapeToSvg(child, themeColors, themeData, defs);
      else if (ln === "pic") out += await pictureToSvg(child, rels, files2, themeColors, defs);
      else if (ln === "cxnSp") out += await connectorToSvg(child, themeColors, defs);
      else if (ln === "grpSp") out += await groupToSvg(child, rels, files2, themeColors, themeData, defs);
      else if (ln === "graphicFrame") out += await graphicFrameToSvg(child, themeColors, defs);
    }
    return out;
  }
  async function shapeToSvg(spEl, themeColors, themeData, defs) {
    const spPr = g1(spEl, "spPr");
    const xfrm = g1(spPr, "xfrm");
    const b = xfrmBounds(xfrm);
    if (!b) return "";
    const prstGeom = g1(spPr, "prstGeom");
    const prst = prstGeom ? attr(prstGeom, "prst", "rect") : "rect";
    const custGeom = g1(spPr, "custGeom");
    const fillNames = ["noFill", "solidFill", "gradFill", "blipFill", "pattFill"];
    let fillElSource = null;
    for (const fn of fillNames) {
      const el = g1(spPr, fn);
      if (el) {
        fillElSource = el;
        break;
      }
    }
    if (!fillElSource) {
      const styleEl = g1(spEl, "style");
      const fillRef = styleEl ? g1(styleEl, "fillRef") : null;
      if (fillRef && attrInt(fillRef, "idx", 1) !== 0) {
        const cc = findFirstColorChild(fillRef);
        const c = resolveColorElement(cc, themeColors);
        if (c) {
          const ns = "http://schemas.openxmlformats.org/drawingml/2006/main";
          const doc2 = new DOMParser().parseFromString(`<solidFill xmlns="${ns}"><srgbClr val="${colorToCss(c).replace("#", "")}"/></solidFill>`, "application/xml");
          fillElSource = doc2.documentElement;
        }
      }
    }
    const { fill, fillAttrs } = fillAttr(fillElSource, defs, themeColors, b.x, b.y, b.w, b.h);
    let lnEl = g1(spPr, "ln");
    if (!lnEl) {
      const styleEl = g1(spEl, "style");
      const lnRef = styleEl ? g1(styleEl, "lnRef") : null;
      if (lnRef && attrInt(lnRef, "idx", 1) !== 0) {
        const cc = findFirstColorChild(lnRef);
        const c = resolveColorElement(cc, themeColors);
        if (c) {
          const ns = "http://schemas.openxmlformats.org/drawingml/2006/main";
          const doc2 = new DOMParser().parseFromString(`<ln xmlns="${ns}"><solidFill><srgbClr val="${colorToCss(c).replace("#", "")}"/></solidFill></ln>`, "application/xml");
          lnEl = doc2.documentElement;
        }
      }
    }
    const stroke = strokeAttrs(lnEl, themeColors, 1);
    const effectLst = g1(spPr, "effectLst");
    const filt = shadowFilter(effectLst, defs);
    const transform = xfrmAttrs(xfrm);
    let pathSvg = "";
    if (prst === "rect" || !prstGeom && !custGeom) {
      pathSvg = `<rect x="${px(b.x)}" y="${px(b.y)}" width="${px(b.w)}" height="${px(b.h)}" fill="${esc(fill)}"${fillAttrs}${stroke}${filt}${transform}/>`;
    } else {
      const d = presetToSvgPath(prst, b.x, b.y, b.w, b.h, {});
      pathSvg = `<path d="${esc(d)}" fill="${esc(fill)}"${fillAttrs}${stroke}${filt}${transform}/>`;
    }
    const txBody = g1(spEl, "txBody");
    const textSvg = txBody ? textBodyToSvg(txBody, b.x, b.y, b.w, b.h, themeColors, themeData, defs) : "";
    return `<g>${pathSvg}${textSvg}</g>`;
  }
  async function pictureToSvg(picEl, rels, files2, themeColors, defs) {
    const spPr = g1(picEl, "spPr");
    const xfrm = g1(spPr, "xfrm");
    const b = xfrmBounds(xfrm);
    if (!b) return "";
    const blipFill = g1(picEl, "blipFill");
    const blip = blipFill ? g1(blipFill, "blip") : null;
    const rId = blip ? blip.getAttribute("r:embed") || blip.getAttribute("embed") : null;
    const rel = rId ? rels[rId] : null;
    const imgData = rel ? files2[rel.fullPath] : null;
    const transform = xfrmAttrs(xfrm);
    const effectLst = g1(spPr, "effectLst");
    const filt = shadowFilter(effectLst, defs);
    if (!imgData) {
      return `<rect x="${px(b.x)}" y="${px(b.y)}" width="${px(b.w)}" height="${px(b.h)}" fill="#e0e0e0"${transform}/>`;
    }
    const ext = rel.fullPath.split(".").pop().toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "svg" ? "image/svg+xml" : "image/jpeg";
    const raw = imgData instanceof Uint8Array ? imgData : new Uint8Array(imgData);
    const b64 = btoa(Array.from(raw, (b2) => String.fromCharCode(b2)).join(""));
    const clipId = uid("pic");
    defs.push(`<clipPath id="${clipId}"><rect x="${px(b.x)}" y="${px(b.y)}" width="${px(b.w)}" height="${px(b.h)}"/></clipPath>`);
    return `<image x="${px(b.x)}" y="${px(b.y)}" width="${px(b.w)}" height="${px(b.h)}" href="data:${mime};base64,${b64}" clip-path="url(#${clipId})"${filt}${transform} preserveAspectRatio="xMidYMid slice"/>`;
  }
  async function connectorToSvg(cxnSpEl, themeColors, defs) {
    const spPr = g1(cxnSpEl, "spPr");
    const xfrm = g1(spPr, "xfrm");
    const b = xfrmBounds(xfrm);
    if (!b) return "";
    const lnEl = g1(spPr, "ln");
    const stroke = strokeAttrs(lnEl, themeColors, 1);
    const transform = xfrmAttrs(xfrm);
    return `<line x1="${px(b.x)}" y1="${px(b.y)}" x2="${px(b.x + b.w)}" y2="${px(b.y + b.h)}" fill="none"${stroke}${transform}/>`;
  }
  async function groupToSvg(grpSpEl, rels, files2, themeColors, themeData, defs) {
    const spPr = g1(grpSpEl, "grpSpPr");
    const xfrm = g1(spPr, "xfrm");
    const b = xfrmBounds(xfrm);
    const transform = xfrm ? xfrmAttrs(xfrm) : "";
    const children = await shapesToSvg(grpSpEl, rels, files2, themeColors, themeData, defs);
    return `<g${transform}>${children}</g>`;
  }
  async function graphicFrameToSvg(graphicFrame, themeColors, defs) {
    const xfrm = g1(graphicFrame, "xfrm");
    const b = xfrmBounds(xfrm);
    if (!b) return "";
    return `<rect x="${px(b.x)}" y="${px(b.y)}" width="${px(b.w)}" height="${px(b.h)}" fill="#f4f4f8" stroke="#ccc" stroke-width="1"/><text x="${px(b.x + b.w / 2)}" y="${px(b.y + b.h / 2)}" text-anchor="middle" font-size="14" fill="#999">Chart</text>`;
  }
  async function backgroundToSvg(slideDoc, masterDoc, layoutDoc, files2, masterRels, themeColors, slideW, slideH, defs) {
    const getbg = (doc) => {
      const cSld = g1(doc, "cSld");
      const bg = cSld ? g1(cSld, "bg") : null;
      if (!bg) return null;
      return { bgPr: g1(bg, "bgPr"), bgRef: g1(bg, "bgRef") };
    };
    const bgData = getbg(slideDoc) || getbg(layoutDoc) || getbg(masterDoc);
    if (!bgData) return `<rect width="${px(slideW)}" height="${px(slideH)}" fill="white"/>`;
    const { bgPr, bgRef } = bgData;
    if (bgPr) {
      const fills = ["noFill", "solidFill", "gradFill", "blipFill", "pattFill"];
      for (const fn of fills) {
        const fillEl = g1(bgPr, fn);
        if (fillEl) {
          if (fn === "blipFill") {
            const blip = g1(fillEl, "blip");
            const rId = blip ? blip.getAttribute("r:embed") || blip.getAttribute("embed") : null;
            const rel = rId && masterRels ? masterRels[rId] : null;
            const imgData = rel ? files2[rel.fullPath] : null;
            if (imgData) {
              const ext = rel.fullPath.split(".").pop().toLowerCase();
              const mime = ext === "png" ? "image/png" : "image/jpeg";
              const raw = imgData instanceof Uint8Array ? imgData : new Uint8Array(imgData);
              const b64 = btoa(Array.from(raw, (b) => String.fromCharCode(b)).join(""));
              return `<image width="${px(slideW)}" height="${px(slideH)}" href="data:${mime};base64,${b64}" preserveAspectRatio="xMidYMid slice"/>`;
            }
          }
          const { fill, fillAttrs } = fillAttr(fillEl, defs, themeColors, 0, 0, slideW, slideH);
          return `<rect width="${px(slideW)}" height="${px(slideH)}" fill="${esc(fill)}"${fillAttrs}/>`;
        }
      }
    }
    if (bgRef) {
      const cc = findFirstColorChild(bgRef);
      const c = resolveColorElement(cc, themeColors);
      if (c) return `<rect width="${px(slideW)}" height="${px(slideH)}" fill="${esc(colorToCss(c))}"/>`;
    }
    return `<rect width="${px(slideW)}" height="${px(slideH)}" fill="white"/>`;
  }
  async function renderSlideToSvg(slideIndex, renderer) {
    const {
      _files: files2,
      slidePaths,
      slideSize,
      themeColors,
      themeData,
      masterDoc,
      masterRels
    } = renderer;
    if (slideIndex < 0 || slideIndex >= slidePaths.length) throw new Error("Slide index out of range");
    const slidePath = slidePaths[slideIndex];
    const slideXml = files2[slidePath] ? new TextDecoder().decode(files2[slidePath]) : null;
    if (!slideXml) throw new Error(`Cannot read slide ${slideIndex}`);
    const slideDoc = parseXml(slideXml);
    const slideRels = await getRels(files2, slidePath);
    const layoutRel = Object.values(slideRels).find((r) => r.type?.includes("slideLayout"));
    const layoutDoc = layoutRel && files2[layoutRel.fullPath] ? parseXml(new TextDecoder().decode(files2[layoutRel.fullPath])) : null;
    const layoutRels = layoutRel ? await getRels(files2, layoutRel.fullPath) : {};
    const W = slideSize.cx / 914400 * 96;
    const H = slideSize.cy / 914400 * 96;
    const defs = [];
    const bgSvg = await backgroundToSvg(
      slideDoc,
      masterDoc,
      layoutDoc,
      files2,
      masterRels,
      themeColors,
      W,
      H,
      defs
    );
    const masterTree = g1(g1(masterDoc, "cSld"), "spTree");
    const layoutTree = layoutDoc ? g1(g1(layoutDoc, "cSld"), "spTree") : null;
    const slideTree = g1(g1(slideDoc, "cSld"), "spTree");
    const masterSvg = masterTree ? await shapesToSvg(masterTree, masterRels, files2, themeColors, themeData, defs) : "";
    const layoutSvg = layoutTree ? await shapesToSvg(layoutTree, layoutRels, files2, themeColors, themeData, defs) : "";
    const slideSvg = slideTree ? await shapesToSvg(slideTree, slideRels, files2, themeColors, themeData, defs) : "";
    const defsBlock = defs.length ? `<defs>${defs.join("\n")}</defs>` : "";
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
      `  width="${px(W)}" height="${px(H)}" viewBox="0 0 ${px(W)} ${px(H)}">`,
      defsBlock,
      bgSvg,
      masterSvg,
      layoutSvg,
      slideSvg,
      `</svg>`
    ].join("\n");
  }
  async function renderAllSlidesToSvg(renderer) {
    const results = [];
    for (let i = 0; i < renderer.slideCount; i++) {
      results.push(await renderSlideToSvg(i, renderer));
    }
    return results;
  }

  // node_modules/pptx-browser/src/fntdata.js
  function deriveObfuscationKey(rId) {
    const hex = rId.replace(/[{}\-]/g, "");
    if (hex.length < 32) {
      const padded = hex.padEnd(32, "0");
      return hexToBytes(padded.slice(0, 32));
    }
    const data1 = hex.slice(0, 8);
    const data2 = hex.slice(8, 12);
    const data3 = hex.slice(12, 16);
    const data4 = hex.slice(16, 32);
    const key = new Uint8Array(16);
    key[0] = parseInt(data1.slice(6, 8), 16);
    key[1] = parseInt(data1.slice(4, 6), 16);
    key[2] = parseInt(data1.slice(2, 4), 16);
    key[3] = parseInt(data1.slice(0, 2), 16);
    key[4] = parseInt(data2.slice(2, 4), 16);
    key[5] = parseInt(data2.slice(0, 2), 16);
    key[6] = parseInt(data3.slice(2, 4), 16);
    key[7] = parseInt(data3.slice(0, 2), 16);
    for (let i = 0; i < 8; i++) {
      key[8 + i] = parseInt(data4.slice(i * 2, i * 2 + 2), 16);
    }
    const key32 = new Uint8Array(32);
    key32.set(key);
    key32.set(key, 16);
    return key32;
  }
  function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
  function decodeFontData(data, key) {
    const decoded = new Uint8Array(data);
    for (let i = 0; i < Math.min(32, decoded.length); i++) {
      decoded[i] ^= key[i];
    }
    return decoded;
  }
  function isValidFont(bytes) {
    if (bytes.length < 4) return false;
    const sig = bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3];
    return sig === 65536 || sig === 1330926671 || sig === 1953658213 || sig === 2001684038 || sig === 2001684018;
  }
  var _loadedEmbedded = /* @__PURE__ */ new Set();
  async function loadEmbeddedFonts(files2, presRels) {
    const results = [];
    const presXml = files2["ppt/presentation.xml"];
    if (!presXml) return results;
    const parser = new DOMParser();
    const presDoc = parser.parseFromString(new TextDecoder().decode(presXml), "application/xml");
    const embeddedFontLst = presDoc.querySelector("embeddedFontLst") || [...presDoc.getElementsByTagName("*")].find((el) => el.localName === "embeddedFontLst");
    if (!embeddedFontLst) return results;
    const embeddedFonts = [...embeddedFontLst.children].filter((el) => el.localName === "embeddedFont");
    for (const fontEl of embeddedFonts) {
      const fontDescEl = [...fontEl.children].find((el) => el.localName === "font");
      if (!fontDescEl) continue;
      const typeface = fontDescEl.getAttribute("typeface") || fontDescEl.getAttribute("t");
      if (!typeface) continue;
      const variants = [
        { el: [...fontEl.children].find((e) => e.localName === "regular"), weight: "400", style: "normal" },
        { el: [...fontEl.children].find((e) => e.localName === "bold"), weight: "700", style: "normal" },
        { el: [...fontEl.children].find((e) => e.localName === "italic"), weight: "400", style: "italic" },
        { el: [...fontEl.children].find((e) => e.localName === "boldItalic"), weight: "700", style: "italic" }
      ];
      for (const { el, weight, style } of variants) {
        if (!el) continue;
        const rId = el.getAttribute("r:id") || el.getAttribute("id") || el.getAttributeNS(
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
          "id"
        );
        if (!rId) continue;
        const cacheKey = `${typeface}:${weight}:${style}`;
        if (_loadedEmbedded.has(cacheKey)) {
          results.push({ typeface, weight, style, status: "already-loaded" });
          continue;
        }
        const rel = presRels ? presRels[rId] : null;
        if (!rel) {
          results.push({ typeface, weight, style, status: "rel-not-found", rId });
          continue;
        }
        const rawData = files2[rel.fullPath];
        if (!rawData) {
          results.push({ typeface, weight, style, status: "file-not-found", path: rel.fullPath });
          continue;
        }
        let decoded = null;
        const key = deriveObfuscationKey(rId);
        const attempt1 = decodeFontData(rawData, key);
        if (isValidFont(attempt1)) {
          decoded = attempt1;
        } else {
          const basename = rel.fullPath.split("/").pop().replace(".fntdata", "");
          const key2 = deriveObfuscationKey(basename);
          const attempt2 = decodeFontData(rawData, key2);
          if (isValidFont(attempt2)) {
            decoded = attempt2;
          } else {
            if (isValidFont(rawData)) {
              decoded = rawData;
            }
          }
        }
        if (!decoded) {
          results.push({ typeface, weight, style, status: "decode-failed", path: rel.fullPath });
          continue;
        }
        try {
          const fontFace = new FontFace(typeface, decoded.buffer, { weight, style });
          await fontFace.load();
          document.fonts.add(fontFace);
          _loadedEmbedded.add(cacheKey);
          results.push({ typeface, weight, style, status: "loaded", path: rel.fullPath });
        } catch (err) {
          results.push({ typeface, weight, style, status: "load-failed", error: err.message });
        }
      }
    }
    return results;
  }
  function listEmbeddedFonts(files2) {
    const presXml = files2["ppt/presentation.xml"];
    if (!presXml) return [];
    const presDoc = new DOMParser().parseFromString(
      new TextDecoder().decode(presXml),
      "application/xml"
    );
    const embeddedFonts = [...presDoc.getElementsByTagName("*")].filter((el) => el.localName === "embeddedFont");
    return embeddedFonts.map((fontEl) => {
      const fontDescEl = [...fontEl.children].find((el) => el.localName === "font");
      const typeface = fontDescEl ? fontDescEl.getAttribute("typeface") || fontDescEl.getAttribute("t") || "" : "";
      const variants = ["regular", "bold", "italic", "boldItalic"].filter((v) => [...fontEl.children].some((el) => el.localName === v));
      return { typeface, variants, loaded: variants.some((v) => _loadedEmbedded.has(
        `${typeface}:${v === "bold" || v === "boldItalic" ? "700" : "400"}:${v.includes("talic") ? "italic" : "normal"}`
      )) };
    }).filter((f) => f.typeface);
  }

  // node_modules/pptx-browser/src/extract.js
  function g13(node, name) {
    if (!node) return null;
    const all = node.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) if (all[i].localName === name) return all[i];
    return null;
  }
  function gtn3(node, name) {
    if (!node) return [];
    const r = [];
    const all = node.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) if (all[i].localName === name) r.push(all[i]);
    return r;
  }
  function attr3(el, name, def = null) {
    if (!el) return def;
    const v = el.getAttribute(name);
    return v !== null ? v : def;
  }
  function attrInt2(el, name, def = 0) {
    const v = attr3(el, name);
    return v !== null ? parseInt(v, 10) : def;
  }
  function extractRun(rEl, defRPr) {
    const rPr = g13(rEl, "rPr");
    const tEl = g13(rEl, "t");
    if (!tEl) return null;
    const text = tEl.textContent || "";
    const szRaw = rPr ? parseInt(rPr.getAttribute("sz") || "0", 10) : defRPr ? parseInt(defRPr.getAttribute("sz") || "0", 10) : 0;
    const fontSize = szRaw ? szRaw / 100 : 12;
    const bold = rPr ? rPr.getAttribute("b") === "1" : false;
    const italic = rPr ? rPr.getAttribute("i") === "1" : false;
    const u = rPr ? rPr.getAttribute("u") || "none" : "none";
    let color = "#000000";
    if (rPr) {
      const solidFill = g13(rPr, "solidFill") || g13(rPr, "lumMod");
      if (solidFill) {
        const srgb = g13(solidFill, "srgbClr");
        if (srgb) color = "#" + (srgb.getAttribute("val") || "000000");
      }
    }
    return { text, bold, italic, underline: u !== "none", fontSize, color };
  }
  function extractParagraph(paraEl) {
    const pPr = g13(paraEl, "pPr");
    const algn = attr3(pPr, "algn", "l");
    const level = attrInt2(pPr, "lvl", 0);
    const defRPr = g13(pPr, "defRPr");
    let bullet = null;
    if (pPr && !g13(pPr, "buNone")) {
      const buChar = g13(pPr, "buChar");
      const buAutoNum = g13(pPr, "buAutoNum");
      if (buChar) bullet = buChar.getAttribute("char") || "\u2022";
      else if (buAutoNum) bullet = "{auto}";
    }
    const runs = [];
    for (const child of paraEl.children) {
      if (child.localName === "r") {
        const run = extractRun(child, defRPr);
        if (run) runs.push(run);
      } else if (child.localName === "br") {
        runs.push({ text: "\n", bold: false, italic: false, underline: false, fontSize: 12, color: "#000" });
      } else if (child.localName === "fld") {
        const t = g13(child, "t");
        if (t) runs.push({ text: t.textContent, bold: false, italic: false, underline: false, fontSize: 12, color: "#555" });
      }
    }
    const text = runs.map((r) => r.text).join("");
    return { runs, text, align: algn, level, bullet };
  }
  function extractTextBody(txBody) {
    if (!txBody) return [];
    return gtn3(txBody, "p").map(extractParagraph).filter((p) => p.text.trim());
  }
  function detectShapeType(spEl) {
    const nvSpPr = g13(spEl, "nvSpPr");
    const nvPr = nvSpPr ? g13(nvSpPr, "nvPr") : null;
    const ph = nvPr ? g13(nvPr, "ph") : null;
    if (ph) {
      const phType = attr3(ph, "type", "body");
      if (phType === "title" || phType === "ctrTitle") return "title";
      if (phType === "subTitle") return "subtitle";
      if (phType === "body") return "body";
    }
    const txBody = g13(spEl, "txBody");
    if (txBody) return "textBox";
    return "other";
  }
  function getShapeId(spEl) {
    const nvSpPr = g13(spEl, "nvSpPr");
    const cNvPr = nvSpPr ? g13(nvSpPr, "cNvPr") : null;
    return cNvPr ? attr3(cNvPr, "id", "") : "";
  }
  function getShapeName(spEl) {
    const nvSpPr = g13(spEl, "nvSpPr");
    const cNvPr = nvSpPr ? g13(nvSpPr, "cNvPr") : null;
    return cNvPr ? attr3(cNvPr, "name", "") : "";
  }
  function extractTable(graphicFrame) {
    const tbl = g13(graphicFrame, "tbl");
    if (!tbl) return null;
    const nvGraphicFramePr = g13(graphicFrame, "nvGraphicFramePr");
    const cNvPr = nvGraphicFramePr ? g13(nvGraphicFramePr, "cNvPr") : null;
    const id = cNvPr ? attr3(cNvPr, "id", "") : "";
    const name = cNvPr ? attr3(cNvPr, "name", "") : "";
    const rows = [];
    let ri = 0;
    for (const rowEl of gtn3(tbl, "tr")) {
      const cells = [];
      let ci = 0;
      for (const tcEl of gtn3(rowEl, "tc")) {
        const gridSpan = attrInt2(tcEl, "gridSpan", 1);
        const rowSpan = attrInt2(tcEl, "rowSpan", 1);
        const paragraphs = extractTextBody(g13(tcEl, "txBody"));
        const text2 = paragraphs.map((p) => p.text).join("\n");
        cells.push({ row: ri, col: ci, rowSpan, colSpan: gridSpan, text: text2, paragraphs });
        ci++;
      }
      rows.push(cells);
      ri++;
    }
    const text = rows.map((row) => row.map((cell) => cell.text).join("	")).join("\n");
    return { id, name, rows, text };
  }
  function extractChartRef(graphicFrame, slideRels) {
    const graphic = g13(graphicFrame, "graphic");
    const graphicData = graphic ? g13(graphic, "graphicData") : null;
    const chartEl = graphicData ? g13(graphicData, "chart") : null;
    if (!chartEl) return null;
    const rId = chartEl.getAttribute("r:id") || chartEl.getAttribute("id");
    const nvFramePr = g13(graphicFrame, "nvGraphicFramePr");
    const cNvPr = nvFramePr ? g13(nvFramePr, "cNvPr") : null;
    return {
      id: cNvPr ? attr3(cNvPr, "id", "") : "",
      name: cNvPr ? attr3(cNvPr, "name", "") : "",
      rId
    };
  }
  function extractChartContent(chartDoc) {
    if (!chartDoc) return { chartType: "unknown", seriesNames: [], categories: [] };
    const plotArea = g13(chartDoc, "plotArea");
    if (!plotArea) return { chartType: "unknown", seriesNames: [], categories: [] };
    const chartTypes = [
      "barChart",
      "lineChart",
      "pieChart",
      "areaChart",
      "scatterChart",
      "doughnutChart",
      "radarChart",
      "bubbleChart",
      "bar3DChart",
      "line3DChart",
      "pie3DChart",
      "area3DChart"
    ];
    let chartType = "unknown";
    let chartNode = null;
    for (const t of chartTypes) {
      chartNode = g13(plotArea, t);
      if (chartNode) {
        chartType = t.replace("3DChart", "Chart").replace("Chart", "");
        break;
      }
    }
    const serEls = chartNode ? gtn3(chartNode, "ser") : [];
    const seriesNames = serEls.map((s) => {
      const tx = g13(s, "tx");
      if (!tx) return null;
      const v = g13(tx, "v");
      if (v) return v.textContent.trim();
      const strCache = g13(tx, "strCache");
      const pt = strCache ? g13(strCache, "pt") : null;
      const vEl = pt ? g13(pt, "v") : null;
      return vEl ? vEl.textContent.trim() : null;
    }).filter(Boolean);
    const cats = serEls.length > 0 ? (() => {
      const catEl = g13(serEls[0], "cat") || g13(serEls[0], "xVal");
      if (!catEl) return [];
      const cache = g13(catEl, "strCache") || g13(catEl, "numCache");
      if (!cache) return [];
      return gtn3(cache, "pt").map((pt) => g13(pt, "v")?.textContent || "").filter(Boolean);
    })() : [];
    return { chartType, seriesNames, categories: cats };
  }
  function extractNotes(notesDoc) {
    if (!notesDoc) return "";
    const cSld = g13(notesDoc, "cSld");
    const spTree = cSld ? g13(cSld, "spTree") : null;
    if (!spTree) return "";
    const parts = [];
    for (const spEl of gtn3(spTree, "sp")) {
      const nvSpPr = g13(spEl, "nvSpPr");
      const nvPr = nvSpPr ? g13(nvSpPr, "nvPr") : null;
      const ph = nvPr ? g13(nvPr, "ph") : null;
      if (ph && attr3(ph, "type") === "sldNum") continue;
      const txBody = g13(spEl, "txBody");
      if (txBody) {
        const text = gtn3(txBody, "r").map((r) => g13(r, "t")?.textContent || "").join("");
        if (text.trim()) parts.push(text.trim());
      }
    }
    return parts.join("\n\n");
  }
  async function extractSlide(slideIndex, renderer) {
    const { _files: files2, slidePaths } = renderer;
    if (slideIndex < 0 || slideIndex >= slidePaths.length)
      throw new Error("Slide index out of range");
    const slideXml = files2[slidePaths[slideIndex]];
    if (!slideXml) return emptySlide(slideIndex);
    const slideDoc = new DOMParser().parseFromString(
      new TextDecoder().decode(slideXml),
      "application/xml"
    );
    const { getRels: getRels2 } = await Promise.resolve().then(() => (init_render(), render_exports));
    const slideRels = await getRels2(files2, slidePaths[slideIndex]);
    const notesRel = Object.values(slideRels).find((r) => r.type?.includes("notesSlide"));
    let notes = "";
    if (notesRel && files2[notesRel.fullPath]) {
      const notesDoc = new DOMParser().parseFromString(
        new TextDecoder().decode(files2[notesRel.fullPath]),
        "application/xml"
      );
      notes = extractNotes(notesDoc);
    }
    const cSld = g13(slideDoc, "cSld");
    const spTree = cSld ? g13(cSld, "spTree") : null;
    if (!spTree) return { index: slideIndex, title: "", subtitle: "", textShapes: [], tables: [], images: [], charts: [], notes, text: notes };
    const textShapes = [];
    const tables = [];
    const images = [];
    const charts = [];
    for (const child of spTree.children) {
      const ln = child.localName;
      if (ln === "sp") {
        const txBody = g13(child, "txBody");
        if (!txBody) continue;
        const type = detectShapeType(child);
        const id = getShapeId(child);
        const name = getShapeName(child);
        const paragraphs = extractTextBody(txBody);
        const text = paragraphs.map((p) => p.text).join("\n");
        if (text.trim()) textShapes.push({ id, name, type, paragraphs, text });
      } else if (ln === "pic") {
        const nvPicPr = g13(child, "nvPicPr");
        const cNvPr = nvPicPr ? g13(nvPicPr, "cNvPr") : null;
        const id = cNvPr ? attr3(cNvPr, "id", "") : "";
        const name = cNvPr ? attr3(cNvPr, "name", "") : "";
        const altText = cNvPr ? attr3(cNvPr, "descr", "") || attr3(cNvPr, "title", "") : "";
        const nvPr = nvPicPr ? g13(nvPicPr, "nvPr") : null;
        const cNvPrExt = nvPr ? g13(nvPr, "extLst") : null;
        images.push({ id, name, altText, title: name });
      } else if (ln === "graphicFrame") {
        const uri = (() => {
          const graphic = g13(child, "graphic");
          const gd = graphic ? g13(graphic, "graphicData") : null;
          return gd ? attr3(gd, "uri", "") : "";
        })();
        if (uri.includes("table") || g13(child, "tbl")) {
          const t = extractTable(child);
          if (t) tables.push(t);
        } else if (uri.includes("chart")) {
          const ref = extractChartRef(child, slideRels);
          if (ref) {
            const rel = ref.rId ? slideRels[ref.rId] : null;
            let chartContent = { chartType: "chart", seriesNames: [], categories: [] };
            if (rel && files2[rel.fullPath]) {
              const chartDoc = new DOMParser().parseFromString(
                new TextDecoder().decode(files2[rel.fullPath]),
                "application/xml"
              );
              chartContent = extractChartContent(chartDoc);
            }
            charts.push({ id: ref.id, name: ref.name, ...chartContent });
          }
        }
      } else if (ln === "grpSp") {
        for (const spEl of gtn3(child, "sp")) {
          const txBody = g13(spEl, "txBody");
          if (!txBody) continue;
          const type = detectShapeType(spEl);
          const id = getShapeId(spEl);
          const name = getShapeName(spEl);
          const paragraphs = extractTextBody(txBody);
          const text = paragraphs.map((p) => p.text).join("\n");
          if (text.trim()) textShapes.push({ id, name, type, paragraphs, text });
        }
      }
    }
    const titleShape = textShapes.find((s) => s.type === "title");
    const subtitleShape = textShapes.find((s) => s.type === "subtitle");
    const title = titleShape?.text || "";
    const subtitle = subtitleShape?.text || "";
    const allText = [
      title,
      subtitle,
      ...textShapes.filter((s) => s.type !== "title" && s.type !== "subtitle").map((s) => s.text),
      ...tables.map((t) => t.text),
      ...charts.map((c) => [c.name, ...c.seriesNames, ...c.categories].join(" ")),
      notes
    ].filter(Boolean).join("\n\n");
    return { index: slideIndex, title, subtitle, textShapes, tables, images, charts, notes, text: allText };
  }
  function emptySlide(index) {
    return { index, title: "", subtitle: "", textShapes: [], tables: [], images: [], charts: [], notes: "", text: "" };
  }
  async function extractAll(renderer) {
    const results = [];
    for (let i = 0; i < renderer.slideCount; i++) {
      results.push(await extractSlide(i, renderer));
    }
    return results;
  }
  async function extractText(slideIndex, renderer) {
    const content = await extractSlide(slideIndex, renderer);
    return content.text;
  }
  async function searchSlides(query, renderer) {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const results = [];
    for (let i = 0; i < renderer.slideCount; i++) {
      const content = await extractSlide(i, renderer);
      const haystack = content.text.toLowerCase();
      if (!haystack.includes(q)) continue;
      const excerpts = [];
      let pos = 0;
      while ((pos = haystack.indexOf(q, pos)) !== -1) {
        const start = Math.max(0, pos - 60);
        const end = Math.min(content.text.length, pos + q.length + 60);
        const before = content.text.slice(start, pos);
        const match = content.text.slice(pos, pos + q.length);
        const after = content.text.slice(pos + q.length, end);
        excerpts.push({ before: (start > 0 ? "\u2026" : "") + before, match, after: after + (end < content.text.length ? "\u2026" : "") });
        pos += q.length;
        if (excerpts.length >= 3) break;
      }
      results.push({
        slideIndex: i,
        title: content.title,
        score: excerpts.length + (content.title.toLowerCase().includes(q) ? 10 : 0),
        excerpts
      });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  // node_modules/pptx-browser/src/index.js
  init_slideshow();

  // node_modules/pptx-browser/src/clipboard.js
  function dpiToWidth2(renderer, dpi) {
    const inches = renderer.slideSize.cx / 914400;
    return Math.round(inches * dpi);
  }
  async function copySlideToClipboard(slideIndex, renderer, opts = {}) {
    if (typeof opts === "number") opts = { width: opts };
    const { width = null, dpi = 150 } = opts;
    const resolvedWidth = width ?? dpiToWidth2(renderer, dpi);
    const canvas = await _renderToCanvas(slideIndex, renderer, resolvedWidth);
    const dataUrl = canvas.toDataURL("image/png");
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob })
        ]);
        return { success: true, method: "clipboard-api", dataUrl };
      } catch (err) {
        if (err.name !== "NotAllowedError") throw err;
      }
    }
    if (document.execCommand) {
      try {
        const img = new Image();
        img.src = dataUrl;
        await new Promise((r) => {
          img.onload = r;
        });
        const div = document.createElement("div");
        div.contentEditable = "true";
        div.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;";
        div.appendChild(img);
        document.body.appendChild(div);
        const range = document.createRange();
        range.selectNodeContents(div);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        const ok = document.execCommand("copy");
        document.body.removeChild(div);
        sel.removeAllRanges();
        if (ok) return { success: true, method: "execCommand", dataUrl };
      } catch (_) {
      }
    }
    const win = window.open();
    if (win) {
      win.document.write(`<img src="${dataUrl}" style="max-width:100%">`);
      win.document.title = `Slide ${slideIndex + 1}`;
    }
    return { success: false, method: "opened-tab", dataUrl };
  }
  async function downloadSlide(slideIndex, renderer, opts = {}, filename) {
    if (typeof opts === "number") opts = { width: opts };
    const { width = null, dpi = 300, filename: fn } = opts;
    const resolvedWidth = width ?? dpiToWidth2(renderer, dpi);
    const canvas = await _renderToCanvas(slideIndex, renderer, resolvedWidth);
    const dataUrl = canvas.toDataURL("image/png");
    const name = filename || fn || `slide-${slideIndex + 1}.png`;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = name;
    a.click();
  }
  async function downloadAllSlides(renderer, opts = {}, onProgress) {
    if (typeof opts === "number") opts = { width: opts };
    const { onProgress: progFn, ...slideOpts } = opts;
    const progress = onProgress || progFn;
    const n = renderer.slideCount;
    for (let i = 0; i < n; i++) {
      await downloadSlide(i, renderer, slideOpts);
      progress?.(i + 1, n);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  async function _renderToCanvas(slideIndex, renderer, width) {
    const { cx, cy } = renderer.slideSize;
    const aspect = cx / cy;
    const h = Math.round(width / aspect);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = h;
    await renderer.renderSlide(slideIndex, canvas, width);
    return canvas;
  }
  function createLazyDeck(renderer, container, opts = {}) {
    const {
      thumbWidth = 320,
      fullWidth = 1280,
      gap = "24px",
      background = "#1a1a1a",
      slideBackground = "#fff",
      shadow = true,
      clickToShow = false,
      maxWidth = "900px",
      rootMargin = 200,
      onSlideVisible,
      onSlideRendered
    } = opts;
    const { cx, cy } = renderer.slideSize;
    const aspect = cx / cy;
    const n = renderer.slideCount;
    container.style.cssText = `
    background:${background};
    padding:${gap};
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:${gap};
    overflow-y:auto;
    position:relative;
  `;
    const slideWrappers = [];
    const canvases = [];
    const renderStates = [];
    for (let i = 0; i < n; i++) {
      const wrap = document.createElement("div");
      wrap.style.cssText = `
      width:100%;
      max-width:${maxWidth};
      position:relative;
      background:${slideBackground};
      border-radius:4px;
      ${shadow ? "box-shadow:0 4px 24px rgba(0,0,0,0.5);" : ""}
      overflow:hidden;
      aspect-ratio:${cx}/${cy};
      flex-shrink:0;
    `;
      wrap.setAttribute("data-slide", i);
      const badge = document.createElement("div");
      badge.style.cssText = `
      position:absolute;bottom:8px;right:10px;
      background:rgba(0,0,0,0.45);color:#fff;
      font:11px/1.4 system-ui,sans-serif;
      padding:2px 7px;border-radius:10px;
      pointer-events:none;z-index:1;
    `;
      badge.textContent = i + 1;
      wrap.appendChild(badge);
      const canvas = document.createElement("canvas");
      canvas.style.cssText = "display:block;width:100%;height:100%;";
      canvas.width = thumbWidth;
      canvas.height = Math.round(thumbWidth / aspect);
      wrap.appendChild(canvas);
      const placeholder = _buildPlaceholder(i, cx, cy, slideBackground);
      wrap.appendChild(placeholder);
      if (clickToShow) {
        wrap.style.cursor = "pointer";
        wrap.addEventListener("click", () => {
          const show = new (init_slideshow(), __toCommonJS(slideshow_exports)).SlideShow(renderer, document.body);
          show.start(i);
        });
      }
      container.appendChild(wrap);
      slideWrappers.push(wrap);
      canvases.push(canvas);
      renderStates.push("pending");
    }
    const renderQueue = [];
    let renderBusy = false;
    async function processQueue() {
      if (renderBusy || renderQueue.length === 0) return;
      renderBusy = true;
      while (renderQueue.length > 0) {
        const idx = renderQueue.shift();
        if (renderStates[idx] === "full") continue;
        const canvas = canvases[idx];
        const wrap = slideWrappers[idx];
        const placeholder = wrap.querySelector("[data-placeholder]");
        try {
          canvas.width = fullWidth;
          canvas.height = Math.round(fullWidth / aspect);
          await renderer.renderSlide(idx, canvas, fullWidth);
          renderStates[idx] = "full";
          canvas.style.transition = "opacity 0.3s";
          canvas.style.opacity = "1";
          if (placeholder) placeholder.style.display = "none";
          onSlideRendered?.(idx);
        } catch (err) {
          console.warn(`LazyDeck: failed to render slide ${idx}`, err);
        }
      }
      renderBusy = false;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const idx = parseInt(entry.target.getAttribute("data-slide"), 10);
        if (isNaN(idx) || renderStates[idx] === "full") continue;
        onSlideVisible?.(idx);
        for (const neighbor of [idx, idx - 1, idx + 1, idx + 2].filter((j) => j >= 0 && j < n)) {
          if (renderStates[neighbor] !== "full" && !renderQueue.includes(neighbor)) {
            renderQueue.push(neighbor);
          }
        }
        processQueue();
      }
    }, {
      root: container,
      rootMargin: `${rootMargin}px`,
      threshold: 0
    });
    slideWrappers.forEach((w) => observer.observe(w));
    return {
      destroy() {
        observer.disconnect();
        container.innerHTML = "";
      },
      scrollTo(index, behavior = "smooth") {
        const wrap = slideWrappers[index];
        if (wrap) wrap.scrollIntoView({ behavior, block: "start" });
      },
      async renderAll(onProgress) {
        for (let i = 0; i < n; i++) {
          if (renderStates[i] !== "full") {
            renderQueue.push(i);
          }
        }
        await processQueue();
      },
      getCanvas(index) {
        return canvases[index] || null;
      },
      get slideCount() {
        return n;
      }
    };
  }
  function _buildPlaceholder(index, cx, cy, bg) {
    const el = document.createElement("div");
    el.setAttribute("data-placeholder", "1");
    el.style.cssText = `
    position:absolute;inset:0;
    display:flex;align-items:center;justify-content:center;
    background:${bg};
    flex-direction:column;gap:12px;
  `;
    const linesHtml = `
    <div style="width:55%;height:18px;background:#e0e0e0;border-radius:3px;animation:pulse 1.4s ease-in-out infinite;"></div>
    <div style="width:72%;height:10px;background:#ebebeb;border-radius:3px;animation:pulse 1.4s ease-in-out infinite 0.1s;"></div>
    <div style="width:62%;height:10px;background:#ebebeb;border-radius:3px;animation:pulse 1.4s ease-in-out infinite 0.2s;"></div>
    <div style="width:45%;height:10px;background:#ebebeb;border-radius:3px;animation:pulse 1.4s ease-in-out infinite 0.3s;"></div>
  `;
    if (!document.getElementById("_pptx_lazy_css")) {
      const style = document.createElement("style");
      style.id = "_pptx_lazy_css";
      style.textContent = `@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`;
      document.head.appendChild(style);
    }
    el.innerHTML = linesHtml;
    return el;
  }

  // node_modules/pptx-browser/src/index.js
  init_fonts();
  init_animation();
  init_slideshow();
  var PptxRenderer = class {
    constructor() {
      this._files = {};
      this.slideSize = { cx: 9144e3, cy: 5143500 };
      this.slidePaths = [];
      this.slideCount = 0;
      this.themeData = null;
      this.themeColors = {};
      this.masterDoc = null;
      this.masterRels = {};
      this.masterImages = {};
      this._blobUrls = [];
      this.embeddedFonts = [];
    }
    // ── Loading ──────────────────────────────────────────────────────────────
    /**
     * Load a PPTX file.
     * @param {File|Blob|ArrayBuffer|Uint8Array} source
     * @param {(progress: number, message: string) => void} [onProgress]
     */
    async load(source, onProgress = () => {
    }) {
      let buf;
      if (source instanceof Uint8Array) {
        buf = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
      } else if (source instanceof ArrayBuffer) {
        buf = source;
      } else if (typeof source.arrayBuffer === "function") {
        buf = await source.arrayBuffer();
      } else {
        throw new TypeError("PptxRenderer.load(): expected File, Blob, ArrayBuffer, or Uint8Array");
      }
      onProgress(0.05, "Decompressing\u2026");
      this._files = await readZip(buf);
      onProgress(0.1, "Parsing presentation\u2026");
      const presXml = this._readText("ppt/presentation.xml");
      if (!presXml) throw new Error("Invalid PPTX: missing ppt/presentation.xml");
      const presDoc = parseXml(presXml);
      const sldSz = g1(presDoc, "sldSz");
      if (sldSz) {
        this.slideSize = {
          cx: attrInt(sldSz, "cx", 9144e3),
          cy: attrInt(sldSz, "cy", 5143500)
        };
      }
      const presRels = await getRels(this._files, "ppt/presentation.xml");
      this.embeddedFonts = detectEmbeddedFonts(presDoc, presRels);
      if (this.embeddedFonts.length > 0) {
        const names = this.embeddedFonts.map((f) => f.family).join(", ");
        console.info("[pptx-browser] PPTX contains embedded fonts: " + names + ". Use registerFont() to supply woff2/ttf versions.");
      }
      const sldIdLst = g1(presDoc, "sldIdLst");
      if (sldIdLst) {
        for (const sldId of sldIdLst.children) {
          if (sldId.localName !== "sldId") continue;
          const rId = sldId.getAttribute("r:id") || sldId.getAttribute("id");
          const rel = presRels[rId];
          if (rel) this.slidePaths.push(rel.fullPath);
        }
      }
      this.slideCount = this.slidePaths.length;
      onProgress(0.2, "Loading theme\u2026");
      let themePath = Object.values(presRels).find((r) => r.type?.includes("theme"))?.fullPath;
      if (!themePath) {
        const masterRel2 = Object.values(presRels).find((r) => r.type?.includes("slideMaster"));
        if (masterRel2) {
          const mr2 = await getRels(this._files, masterRel2.fullPath);
          themePath = Object.values(mr2).find((r) => r.type?.includes("theme"))?.fullPath;
        }
      }
      if (themePath) {
        const themeXml = this._readText(themePath);
        if (themeXml) this.themeData = parseTheme(parseXml(themeXml));
      }
      if (!this.themeData) {
        this.themeData = { colors: {}, majorFont: "Calibri Light", minorFont: "Calibri" };
      }
      this.themeColors = { ...this.themeData.colors };
      onProgress(0.3, "Loading master\u2026");
      const masterRel = Object.values(presRels).find((r) => r.type?.includes("slideMaster"));
      if (masterRel) {
        const masterXml = this._readText(masterRel.fullPath);
        if (masterXml) {
          this.masterDoc = parseXml(masterXml);
          this.masterRels = await getRels(this._files, masterRel.fullPath);
          this.masterImages = await loadImages(this._files, this.masterRels);
          this._trackBlobs(this.masterImages);
          const clrMap = parseClrMap(this.masterDoc);
          this.themeColors = buildThemeColors(this.themeData, clrMap);
        }
      }
      onProgress(1, "Ready");
    }
    // ── Rendering ─────────────────────────────────────────────────────────────
    /**
     * Render a single slide onto a canvas element.
     *
     * @param {number}            slideIndex  0-based slide index
     * @param {HTMLCanvasElement} canvas
     * @param {number}            [width=1280]  output canvas width in pixels
     */
    async renderSlide(slideIndex, canvas, width = 1280) {
      if (slideIndex < 0 || slideIndex >= this.slidePaths.length) {
        throw new RangeError(`Slide ${slideIndex} out of range (0\u2013${this.slidePaths.length - 1})`);
      }
      const slidePath = this.slidePaths[slideIndex];
      const slideXml = this._readText(slidePath);
      if (!slideXml) throw new Error(`Could not read slide: ${slidePath}`);
      const slideDoc = parseXml(slideXml);
      const slideRels = await getRels(this._files, slidePath);
      const slideImages = await loadImages(this._files, slideRels);
      this._trackBlobs(slideImages);
      let layoutDoc = null, layoutRels = {}, layoutImages = {};
      const layoutRel = Object.values(slideRels).find((r) => r.type?.includes("slideLayout"));
      if (layoutRel) {
        const layoutXml = this._readText(layoutRel.fullPath);
        if (layoutXml) {
          layoutDoc = parseXml(layoutXml);
          layoutRels = await getRels(this._files, layoutRel.fullPath);
          layoutImages = await loadImages(this._files, layoutRels);
          this._trackBlobs(layoutImages);
        }
      }
      const allImages = { ...this.masterImages, ...layoutImages, ...slideImages };
      const placeholderMap = buildPlaceholderMap([layoutDoc, this.masterDoc]);
      const usedFonts = collectUsedFonts([slideDoc, layoutDoc, this.masterDoc]);
      await loadGoogleFontsFor(usedFonts, this.themeData);
      const scale = width / this.slideSize.cx;
      const height = Math.round(this.slideSize.cy * scale);
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, width, height);
      await renderBackground(
        ctx,
        slideDoc,
        this.masterDoc,
        layoutDoc,
        slideRels,
        this.masterRels,
        allImages,
        this.themeColors,
        scale,
        this.slideSize.cx,
        this.slideSize.cy
      );
      await this._renderNonPlaceholders(ctx, this.masterDoc, this.masterRels, this.masterImages, scale);
      await this._renderNonPlaceholders(ctx, layoutDoc, layoutRels, layoutImages, scale);
      const cSld = g1(slideDoc, "cSld");
      const spTree = cSld ? g1(cSld, "spTree") : null;
      if (spTree) {
        await renderSpTree(
          ctx,
          spTree,
          slideRels,
          allImages,
          this.themeColors,
          this.themeData,
          scale,
          placeholderMap,
          this._files
        );
      }
    }
    /**
     * Render all slides and return an array of canvas elements.
     * Useful for generating thumbnails.
     *
     * @param {number} [width=320]
     * @returns {Promise<HTMLCanvasElement[]>}
     */
    async renderAllSlides(width = 320) {
      const canvases = [];
      for (let i = 0; i < this.slideCount; i++) {
        const c = document.createElement("canvas");
        await this.renderSlide(i, c, width);
        canvases.push(c);
      }
      return canvases;
    }
    // ── Font management ────────────────────────────────────────────────────────
    /**
     * Register a custom font for this rendering session.
     * Call before renderSlide() for fonts that should be used in the PPTX.
     *
     * Accepts woff, woff2, ttf, otf files.
     *
     * @param {string} family
     *   The font name exactly as it appears in the PPTX, OR the MS Office name
     *   it should replace (e.g. "Calibri" to override the default substitute).
     * @param {string|URL|File|Blob|ArrayBuffer|Uint8Array} source
     * @param {object} [descriptors] — FontFace descriptors: { weight, style, unicodeRange }
     * @returns {Promise<FontFace>}
     *
     * @example
     * // Load regular weight
     * await renderer.registerFont('Acme Sans', '/fonts/acme-sans.woff2');
     *
     * // Load bold variant
     * await renderer.registerFont('Acme Sans', '/fonts/acme-sans-bold.woff2', { weight: '700' });
     *
     * // From a File object (e.g. dropped by user)
     * await renderer.registerFont('Acme Sans', file);
     *
     * // Override Calibri with your brand font
     * await renderer.registerFont('Calibri', '/fonts/brand.woff2');
     */
    registerFont(family, source, descriptors) {
      return registerFont(family, source, descriptors);
    }
    /**
     * Register multiple custom fonts at once.
     *
     * @param {Record<string, string | Array<{url: string, weight?: string, style?: string}>>} fontMap
     * @returns {Promise<void>}
     *
     * @example
     * await renderer.registerFonts({
     *   'Brand Sans': '/fonts/brand-sans.woff2',
     *   'Brand Serif': [
     *     { url: '/fonts/brand-serif.woff2',      weight: '400' },
     *     { url: '/fonts/brand-serif-bold.woff2', weight: '700' },
     *   ],
     * });
     */
    registerFonts(fontMap) {
      return registerFonts(fontMap);
    }
    /**
     * List all custom fonts currently registered.
     * @returns {{ family: string, weight: string, style: string, status: string }[]}
     */
    listRegisteredFonts() {
      return listRegisteredFonts();
    }
    // ── Private helpers ───────────────────────────────────────────────────────
    _readText(path) {
      const data = this._files[path];
      return data ? new TextDecoder().decode(data) : null;
    }
    _trackBlobs(imageCache) {
      for (const img of Object.values(imageCache)) {
        if (img?.src?.startsWith("blob:")) this._blobUrls.push(img.src);
      }
    }
    async _renderNonPlaceholders(ctx, doc, rels, images, scale) {
      if (!doc) return;
      const cSld = g1(doc, "cSld");
      const spTree = cSld ? g1(cSld, "spTree") : null;
      if (!spTree) return;
      for (const child of spTree.children) {
        const ln = child.localName;
        if (!["sp", "pic", "grpSp", "graphicFrame", "cxnSp"].includes(ln)) continue;
        const nvSpPr = g1(child, "nvSpPr");
        const nvPr = nvSpPr ? g1(nvSpPr, "nvPr") : null;
        if (nvPr && g1(nvPr, "ph")) continue;
        try {
          if (ln === "sp") await renderShape(ctx, child, rels, images, this.themeColors, this.themeData, scale);
          else if (ln === "pic") await renderPicture(ctx, child, rels, images, this.themeColors, scale);
          else if (ln === "grpSp") await renderGroupShape(ctx, child, rels, images, this.themeColors, this.themeData, scale);
          else if (ln === "graphicFrame") await renderGraphicFrame(ctx, child, this.themeColors, this.themeData, scale);
          else if (ln === "cxnSp") await renderConnector(ctx, child, this.themeColors, scale);
        } catch (e) {
          console.warn(`[PptxRenderer] master/layout shape error (${ln}):`, e);
        }
      }
    }
    // ── Metadata ─────────────────────────────────────────────────────────────
    /**
     * Parse animation steps for a slide.
     * Returns AnimStep[] sorted by clickNum then delay.
     * @param {number} slideIndex
     */
    getAnimations(slideIndex) {
      const slidePath = this.slidePaths[slideIndex];
      if (!slidePath || !this._files) return [];
      const raw = this._files[slidePath];
      if (!raw) return [];
      const slideDoc = parseXml(new TextDecoder().decode(raw));
      return parseAnimations(slideDoc);
    }
    /**
     * Parse slide transition info.
     * @param {number} slideIndex
     * @returns {{ type, duration, dir }|null}
     */
    getTransition(slideIndex) {
      const slidePath = this.slidePaths[slideIndex];
      if (!slidePath || !this._files) return null;
      const raw = this._files[slidePath];
      if (!raw) return null;
      const slideDoc = parseXml(new TextDecoder().decode(raw));
      return parseTransition(slideDoc);
    }
    /**
     * Create a PptxPlayer bound to this renderer and a canvas element.
     * Drives animation playback and slide transitions.
     *
     * @param {HTMLCanvasElement} canvas
     * @returns {PptxPlayer}
     * @example
     * const player = renderer.createPlayer(canvas);
     * await player.loadSlide(0);
     * player.play();
     * nextBtn.onclick = () => player.nextClick();
     */
    createPlayer(canvas) {
      return new PptxPlayer(this, canvas);
    }
    // ── SVG Export ──────────────────────────────────────────────────────────────
    /**
     * Render a slide to an SVG string.
     * SVG output has vector text (searchable), inline base64 images,
     * and proper gradient fills — matches PowerPoint's "Save as SVG".
     *
     * @param {number} slideIndex
     * @returns {Promise<string>}  complete SVG markup
     */
    async toSvg(slideIndex) {
      return renderSlideToSvg(slideIndex, this);
    }
    /**
     * Render all slides to SVG strings.
     * @returns {Promise<string[]>}
     */
    async allToSvg() {
      return renderAllSlidesToSvg(this);
    }
    // ── Embedded fonts ──────────────────────────────────────────────────────────
    /**
     * Decode and load any embedded fonts from the PPTX.
     * Fonts are loaded via FontFace API and become available to the renderer.
     *
     * @returns {Promise<EmbeddedFontResult[]>}  per-variant load results
     */
    async loadEmbeddedFonts() {
      const presRels = this._presRels || {};
      return loadEmbeddedFonts(this._files, presRels);
    }
    /**
     * List embedded fonts without loading them.
     * @returns {EmbeddedFontInfo[]}
     */
    listEmbeddedFonts() {
      return listEmbeddedFonts(this._files);
    }
    // ── Text extraction ─────────────────────────────────────────────────────────
    /**
     * Extract structured content from a slide.
     * Returns title, body text, tables, chart series names, alt text.
     * @param {number} slideIndex
     * @returns {Promise<SlideContent>}
     */
    async extractSlide(slideIndex) {
      return extractSlide(slideIndex, this);
    }
    /**
     * Extract content from all slides.
     * @returns {Promise<SlideContent[]>}
     */
    async extractAll() {
      return extractAll(this);
    }
    /**
     * Get all text from a slide as a plain string.
     * @param {number} slideIndex
     * @returns {Promise<string>}
     */
    async extractText(slideIndex) {
      return extractText(slideIndex, this);
    }
    /**
     * Full-text search across all slides.
     * @param {string} query
     * @returns {Promise<SearchResult[]>}
     */
    async searchSlides(query) {
      return searchSlides(query, this);
    }
    // ── Slide show ──────────────────────────────────────────────────────────────
    /**
     * Create a full-screen slide show player.
     *
     * @param {HTMLElement} container  — DOM element to mount into
     * @param {object}      [opts]     — SlideShow options
     * @returns {SlideShow}
     *
     * @example
     * const show = renderer.createShow(document.body, { showNotes: true });
     * await show.start(0);
     * // keyboard: ←→ Space PageUp/Down Home End Esc F
     */
    createShow(container, opts = {}) {
      return new SlideShow(this, container, opts);
    }
    // ── Clipboard / download ────────────────────────────────────────────────────
    /**
     * Copy a slide as a PNG image to the system clipboard.
     * @param {number} slideIndex
     * @param {object} [opts]
     * @param {number} [opts.dpi=150]   dots per inch
     * @param {number} [opts.width]    pixel width override
     * @returns {Promise<{success, method, dataUrl}>}
     */
    async copySlide(slideIndex, opts = {}) {
      return copySlideToClipboard(slideIndex, this, opts);
    }
    /**
     * Download a slide as a PNG file.
     * @param {number} slideIndex
     * @param {object} [opts]
     * @param {number} [opts.dpi=300]    dots per inch
     * @param {number} [opts.width]     pixel width override
     * @param {string} [opts.filename]
     */
    async downloadSlide(slideIndex, opts = {}) {
      return downloadSlide(slideIndex, this, opts);
    }
    /**
     * Download all slides as PNG files.
     * @param {object}   [opts]
     * @param {number}   [opts.dpi=300]      dots per inch
     * @param {number}   [opts.width]        pixel width override
     * @param {function} [opts.onProgress]   (completed, total) => void
     */
    async downloadAllSlides(opts = {}) {
      return downloadAllSlides(this, opts);
    }
    // ── Progressive deck view ───────────────────────────────────────────────────
    /**
     * Create a scrollable deck view with progressive lazy rendering.
     * Slides render on-demand as they scroll into the viewport.
     *
     * @param {HTMLElement} container
     * @param {object}      [opts]     — LazyDeckOpts
     * @returns {LazyDeckController}
     *
     * @example
     * const deck = renderer.createDeck(document.getElementById('viewer'));
     * // Scroll to slide 5:
     * deck.scrollTo(5);
     * // Force render everything:
     * await deck.renderAll();
     * // Clean up:
     * deck.destroy();
     */
    createDeck(container, opts = {}) {
      return createLazyDeck(this, container, opts);
    }
    // ── PPTX editing ────────────────────────────────────────────────────────────
    /**
     * Create a PptxWriter from this renderer for editing and re-export.
     *
     * @returns {PptxWriter}
     *
     * @example
     * const writer = renderer.edit();
     * writer.applyTemplate({ company: 'Acme', year: '2025' });
     * writer.setShapeText(0, 'Title 1', 'New Title');
     * writer.duplicateSlide(0);
     * await writer.download('edited.pptx');
     */
    edit() {
      return PptxWriter.fromRenderer(this);
    }
    // ── PDF export ──────────────────────────────────────────────────────────────
    /**
     * Export all slides (or a subset) to a PDF binary.
     *
     * @param {object}   [opts]
     * @param {number}   [opts.dpi=150]       dots per inch (96=screen, 150=default, 300=print)
     * @param {number}   [opts.width]         pixel width — overrides dpi if set
     * @param {number}   [opts.quality=0.92]  JPEG quality 0..1
     * @param {number[]} [opts.slides]        slide indices (default: all)
     * @param {function} [opts.onProgress]    (done, total) => void
     * @returns {Promise<Uint8Array>}
     *
     * @example
     * const bytes = await renderer.toPdf({ width: 2560, quality: 0.95 });
     * const blob = new Blob([bytes], { type: 'application/pdf' });
     */
    async toPdf(opts = {}) {
      return exportToPdf(this, opts);
    }
    /**
     * Export and download as a PDF file.
     * @param {string} [filename='presentation.pdf']
     * @param {object} [opts]
     */
    async downloadPdf(filename = "presentation.pdf", opts = {}) {
      return downloadAsPdf(this, filename, opts);
    }
    /**
     * Export a single slide to PDF bytes.
     * @param {number} slideIndex
     * @param {object} [opts]
     * @returns {Promise<Uint8Array>}
     */
    async slideToPdf(slideIndex, opts = {}) {
      return exportSlideToPdf(slideIndex, this, opts);
    }
    /**
     * Get the speaker notes for a slide as plain text.
     * @param {number} slideIndex
     * @returns {Promise<string>} speaker notes, or empty string
     */
    async getSlideNotes(slideIndex) {
      if (slideIndex < 0 || slideIndex >= this.slidePaths.length) return "";
      const slideRels = await getRels(this._files, this.slidePaths[slideIndex]);
      const notesRel = Object.values(slideRels).find((r) => r.type?.includes("notesSlide"));
      if (!notesRel) return "";
      const notesXml = this._readText(notesRel.fullPath);
      if (!notesXml) return "";
      const doc = parseXml(notesXml);
      const texts = [];
      for (const sp of gtn(doc, "sp")) {
        const nvPr = g1(g1(sp, "nvSpPr"), "nvPr");
        const ph = nvPr ? g1(nvPr, "ph") : null;
        if (ph && attr(ph, "type") === "sldNum") continue;
        for (const t of gtn(sp, "t")) {
          texts.push(t.textContent);
        }
      }
      return texts.join("").trim();
    }
    /**
     * Get basic metadata about the presentation.
     * @returns {{ slideCount: number, width: number, height: number, widthEmu: number, heightEmu: number }}
     */
    getInfo() {
      return {
        slideCount: this.slideCount,
        widthEmu: this.slideSize.cx,
        heightEmu: this.slideSize.cy,
        /** Slide width in inches (1 EMU = 1/914400 inch) */
        width: this.slideSize.cx / 914400,
        /** Slide height in inches */
        height: this.slideSize.cy / 914400,
        /** Aspect ratio (width / height) */
        aspectRatio: this.slideSize.cx / this.slideSize.cy
      };
    }
    /**
     * Render a slide and return a data URL (PNG by default).
     * @param {number} slideIndex
     * @param {number} [width=1280]
     * @param {string} [format='image/png']
     * @param {number} [quality=0.92]  used for image/jpeg
     * @returns {Promise<string>} data URL
     */
    async toDataURL(slideIndex, width = 1280, format = "image/png", quality = 0.92) {
      const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(1, 1) : document.createElement("canvas");
      await this.renderSlide(slideIndex, canvas, width);
      if (canvas instanceof OffscreenCanvas) {
        const blob = await canvas.convertToBlob({ type: format, quality });
        return new Promise((resolve) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.readAsDataURL(blob);
        });
      }
      return canvas.toDataURL(format, quality);
    }
    /**
     * Render a slide and return a Blob.
     * @param {number} slideIndex
     * @param {number} [width=1280]
     * @param {string} [format='image/png']
     * @returns {Promise<Blob>}
     */
    async toBlob(slideIndex, width = 1280, format = "image/png") {
      const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(1, 1) : document.createElement("canvas");
      await this.renderSlide(slideIndex, canvas, width);
      if (canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type: format });
      return new Promise((resolve) => canvas.toBlob(resolve, format));
    }
    // ── Lifecycle ─────────────────────────────────────────────────────────────
    /** Release all blob: URLs created during rendering. */
    destroy() {
      for (const url of this._blobUrls) {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {
        }
      }
      this._blobUrls = [];
      this._files = {};
      this.masterDoc = null;
      this.masterImages = {};
    }
  };
  return __toCommonJS(index_exports);
})();
