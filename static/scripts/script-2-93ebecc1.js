/* Starfall Explore - client side.
 * Everything a reader has found lives in their own browser (localStorage). No server, no accounts.
 * Reader build: undiscovered pages are sealed, undiscovered links are veiled.
 * Dev build (window.__SF_DEV): nothing is sealed or veiled.
 */
;(function () {
  if (window.__sfInit) return
  window.__sfInit = true

  var DEV = !!window.__SF_DEV
  var CFG = window.__SF_CFG || { entries: [], landingSlug: "index", journalSlug: "journal", landing: {} }
  var KEY = "sf.v1"
  var SVG = "http://www.w3.org/2000/svg"
  var entrySlugs = {}
  CFG.entries.forEach(function (e) {
    entrySlugs[e.slug] = e
  })

  // ---------- storage ----------
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY))
      if (s && s.pages) return s
    } catch (e) {}
    return { v: 1, pages: {}, last: null }
  }
  function save(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch (e) {}
  }

  // ---------- helpers ----------
  function hash(str) {
    var h = 2166136261
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return h >>> 0
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }
  function svg(tag, attrs) {
    var n = document.createElementNS(SVG, tag)
    for (var k in attrs) n.setAttribute(k, attrs[k])
    return n
  }
  function curSlug() {
    return document.body.dataset.slug || "index"
  }
  function rootPath() {
    var depth = curSlug().split("/").length - 1
    return depth === 0 ? "." : new Array(depth).fill("..").join("/")
  }
  function hrefFor(slug) {
    return rootPath() + "/" + slug
  }
  // Small seeded random generator: the same page always gets the same scrawl.
  function rng(seed) {
    var s = seed >>> 0
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      return s / 4294967296
    }
  }
  function prettySeg(seg) {
    return decodeURIComponent(seg)
      .replace(/-and-/g, " & ")
      .replace(/-/g, " ")
      .replace(/\b[a-z]/g, function (c) {
        return c.toUpperCase()
      })
  }
  function categoryOf(slug) {
    var seg = slug.split("/")[0]
    return slug.indexOf("/") === -1 ? "Elsewhere" : prettySeg(seg)
  }
  function hue(str) {
    return hash(str) % 360
  }
  function cleanup(fn) {
    if (window.addCleanup) window.addCleanup(fn)
  }
  function fmtDate(ts) {
    try {
      return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    } catch (e) {
      return ""
    }
  }
  function pageTitle() {
    var h = document.querySelector("h1.article-title")
    if (h && h.textContent.trim()) return h.textContent.trim()
    return (document.title || "").split(" | ")[0].trim() || curSlug()
  }
  // Slug of an internal link: Quartz sets data-slug on most, but e.g. property links only have an href.
  function slugOf(a) {
    if (a.dataset && a.dataset.slug) return a.dataset.slug
    var href = a.getAttribute("href")
    if (!href) return null
    try {
      var u = new URL(href, location.href)
      if (u.origin !== location.origin) return null
      var p = decodeURIComponent(u.pathname)
      var bp = document.body.dataset.basepath || ""
      if (bp && p.indexOf(bp) === 0) p = p.slice(bp.length)
      p = p.replace(/^\/+/, "").replace(/\.html$/, "").replace(/\/$/, "")
      return p || CFG.landingSlug
    } catch (e) {
      return null
    }
  }
  function outLinks(self) {
    var art = document.querySelector("article") || document.querySelector(".center")
    var out = {}
    if (art) {
      art.querySelectorAll("a.internal").forEach(function (a) {
        var s = slugOf(a)
        if (s && s !== self && s !== CFG.landingSlug && s !== CFG.journalSlug) out[s] = true
      })
    }
    return Object.keys(out)
  }
  function discoveredCount(st) {
    return Object.keys(st.pages).length
  }
  function isFrontier(st, slug) {
    for (var k in st.pages) {
      if (st.pages[k].out && st.pages[k].out.indexOf(slug) !== -1) return k
    }
    return null
  }

  // ---------- core: record this page ----------
  function track(st, slug) {
    var known = st.pages[slug]
    var parent = null
    if (!known) {
      if (st.last && st.pages[st.last] && st.pages[st.last].out && st.pages[st.last].out.indexOf(slug) !== -1) {
        parent = st.last
      } else {
        parent = isFrontier(st, slug)
      }
    }
    var rec = known || { t: "", f: parent, at: Date.now(), n: 0, out: [] }
    rec.t = pageTitle()
    rec.n = (rec.n || 0) + 1
    rec.out = outLinks(slug)
    st.pages[slug] = rec
    st.last = slug
    st.recent = (st.recent || []).filter(function (s) {
      return s !== slug
    })
    st.recent.push(slug)
    if (st.recent.length > 14) st.recent.shift()
    save(st)
    return !known
  }

  // ---------- veiled links ----------
  function veilLinks(st, slug) {
    if (DEV) return
    document.querySelectorAll("a.internal").forEach(function (a) {
      if (a.closest(".sf-nav, #sf-landing, .sf-journal, .sf-trail")) return
      if (a.classList.contains("sf-veiled")) return
      var s = slugOf(a)
      if (!s || s === slug || s === CFG.landingSlug || s === CFG.journalSlug || st.pages[s]) return
      a.classList.add("sf-veiled")
      a.removeAttribute("title")
      a.setAttribute("aria-label", "Undiscovered")
      if (a.children.length) return
      // The name stays in the text, invisible, so the gap is exactly as wide and as tall as the word itself. In the gap, a few
      // stars wander. Held under the cursor, all of them gather and settle onto the strokes of the letters, and spell the word.
      var original = a.textContent.replace(/\s+/g, " ").trim()
      a.textContent = ""
      var real = el("span", "sf-real", original)
      real.setAttribute("aria-hidden", "true")
      a.appendChild(real)
      if (st.rev && st.rev[s]) {
        // Revealed earlier: the name stays readable, though the page itself is still undiscovered.
        a.classList.add("sf-known")
        a.setAttribute("aria-label", original)
        return
      }
      var orb = { a: a, real: real, slug: s, text: original, p: 0, t: hash("t:" + s) % 100, hover: false, built: false, done: false, visible: false }
      var board = svg("svg", { class: "sf-orb", "aria-hidden": "true", focusable: "false" })
      a.appendChild(board)
      orb.board = board
      a.__orb = orb
      function on() {
        orbEnsure(orb)
        if (!orb.built || orb.done) return
        orb.hover = true
        orbWake()
      }
      function off() {
        orb.hover = false
      }
      a.addEventListener("pointerenter", on)
      a.addEventListener("pointerleave", off)
      a.addEventListener("focus", on)
      a.addEventListener("blur", off)
      orbWatch(orb)
    })
  }

  // ---- the stars in a name: they wander while it is in view, and gather into its letters when it is held ----
  var ORB_LIVE = []
  var ORB_RAF = 0
  var ORB_LAST = 0
  var ORB_IO = null
  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  function orbWatch(o) {
    if (!("IntersectionObserver" in window)) {
      o.visible = true
      return
    }
    if (!ORB_IO)
      ORB_IO = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            var orb = en.target.__orb
            if (!orb || orb.done) return
            orb.visible = en.isIntersecting
            if (orb.visible) {
              var go = function () {
                orbEnsure(orb)
                orbWake()
              }
              var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()
              ready.then(go)
            }
          })
        },
        { rootMargin: "80px" },
      )
    ORB_IO.observe(o.a)
  }
  function orbWake() {
    if (ORB_RAF) return
    ORB_LAST = performance.now()
    ORB_RAF = requestAnimationFrame(orbTick)
  }
  function orbTick(now) {
    var dt = Math.min(0.05, (now - ORB_LAST) / 1000)
    ORB_LAST = now
    var any = false
    document.querySelectorAll("a.sf-veiled").forEach(function (a) {
      var o = a.__orb
      if (!o || o.done || !o.built || !(o.visible || o.hover || o.p > 0)) return
      any = true
      if (!REDUCED || o.hover) o.t += dt
      // about five seconds of holding to gather; letting go, they drift slowly apart again
      o.p = Math.max(0, Math.min(1, o.p + (o.hover ? dt / (REDUCED ? 1.5 : 5.5) : -dt / 3.5)))
      orbDraw(o)
      if (o.p >= 1) orbFinish(o)
    })
    ORB_RAF = any ? requestAnimationFrame(orbTick) : 0
  }

  // ---- the cipher: every letter has its own constellation, drawn once and used whenever a name gathers ----
  // Points are on a small grid, strokes are separated by "|". Capitals fill a 4 x 6 box. Lower case sits on a 4-high x-height,
  // with ascenders to 6 and descenders to -2.
  var CIPHER_UP = {
    A: "0,0 0.7,2 2,6 3.3,2 4,0|0.7,2 3.3,2",
    B: "0,0 0,6 3,6 4,5 4,4 3,3 2,3 0,3|3,3 4,2 4,1 3,0 0,0",
    C: "4,5 3,6 1,6 0,5 0,1 1,0 3,0 4,1",
    D: "0,0 0,6 2.5,6 4,4.5 4,1.5 2.5,0 0,0",
    E: "4,6 0,6 0,0 4,0|0,3 3,3",
    F: "4,6 0,6 0,0|0,3 3,3",
    G: "4,5 3,6 1,6 0,5 0,1 1,0 3,0 4,1 4,3 2.5,3",
    H: "0,6 0,0|4,6 4,0|0,3 4,3",
    I: "1,6 3,6|2,6 2,0|1,0 3,0",
    J: "4,6 4,1 3,0 1,0 0,1",
    K: "0,6 0,0|4,6 0,3 4,0",
    L: "0,6 0,0 4,0",
    M: "0,0 0,6 2,2.5 4,6 4,0",
    N: "0,0 0,6 4,0 4,6",
    O: "1,6 3,6 4,5 4,1 3,0 1,0 0,1 0,5 1,6",
    P: "0,0 0,6 3,6 4,5 4,4 3,3 0,3",
    Q: "1,6 3,6 4,5 4,1 3,0 1,0 0,1 0,5 1,6|2.5,2 4,0",
    R: "0,0 0,6 3,6 4,5 4,4 3,3 2,3 0,3|2,3 4,0",
    S: "4,5 3,6 1,6 0,5 0,4 1,3 3,3 4,2 4,1 3,0 1,0 0,1",
    T: "0,6 4,6|2,6 2,0",
    U: "0,6 0,1 1,0 3,0 4,1 4,6",
    V: "0,6 2,0 4,6",
    W: "0,6 1,0 2,4 3,0 4,6",
    X: "0,6 2,3 4,0|4,6 2,3 0,0",
    Y: "0,6 2,3 4,6|2,3 2,0",
    Z: "0,6 4,6 0,0 4,0",
    "0": "1,6 3,6 4,5 4,1 3,0 1,0 0,1 0,5 1,6",
    "1": "1,5 2,6 2,0",
    "2": "0,5 1,6 3,6 4,5 4,4 0,0 4,0",
    "3": "0,5 1,6 3,6 4,5 4,4 3,3 2,3|3,3 4,2 4,1 3,0 1,0 0,1",
    "4": "3,0 3,6 0,2 4,2",
    "5": "4,6 0,6 0,3 3,3 4,2 4,1 3,0 1,0 0,1",
    "6": "4,5 3,6 1,6 0,5 0,1 1,0 3,0 4,1 4,2 3,3 0,3",
    "7": "0,6 4,6 1,0",
    "8": "1,3 0,4 0,5 1,6 3,6 4,5 4,4 3,3 1,3 0,2 0,1 1,0 3,0 4,1 4,2 3,3",
    "9": "0,1 1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,4 1,3 4,3",
    "&": "4,0 1,4 1,5 2,6 3,5 3,4 0,1 1,0 3,0 4,2",
    "-": "0.5,3 3.5,3",
    "\u2014": "0,3 4,3",
    "\u2013": "0.5,3 3.5,3",
    "'": "2,6",
    "\u2019": "2,6",
    ".": "2,0",
    ",": "2,0 1,-1",
    ":": "2,1|2,4",
    ";": "2,4|2,0 1,-1",
    "?": "0,5 1,6 3,6 4,5 4,4 2,3 2,2|2,0",
    "!": "2,6 2,2|2,0",
  }
  var CIPHER_LOW = {
    a: "4,4 4,3 4,1 4,0|4,3 3,4 1,4 0,3 0,1 1,0 3,0 4,1",
    b: "0,6 0,3 0,1 0,0|0,3 1,4 3,4 4,3 4,1 3,0 1,0 0,1",
    c: "4,3 3,4 1,4 0,3 0,1 1,0 3,0 4,1",
    d: "4,6 4,3 4,1 4,0|4,3 3,4 1,4 0,3 0,1 1,0 3,0 4,1",
    e: "0,2 4,2 4,3 3,4 1,4 0,3 0,1 1,0 3,0 4,1",
    f: "4,5 3,6 2,6 1,5 1,4 1,0|0,4 1,4 3,4",
    g: "4,4 4,3 4,1 4,-1 3,-2 1,-2 0,-1|4,3 3,4 1,4 0,3 0,1 1,0 3,0 4,1",
    h: "0,6 0,3 0,0|0,3 1,4 3,4 4,3 4,0",
    i: "2,4 2,0|2,6",
    j: "3,4 3,-1 2,-2 1,-2|3,6",
    k: "0,6 0,2 0,0|4,4 0,2 4,0",
    l: "2,6 2,0",
    m: "0,4 0,0|0,3 0.8,4 1.6,4 2,3 2,0|2,3 2.8,4 3.6,4 4,3 4,0",
    n: "0,4 0,0|0,3 1,4 3,4 4,3 4,0",
    o: "1,4 3,4 4,3 4,1 3,0 1,0 0,1 0,3 1,4",
    p: "0,4 0,3 0,1 0,-2|0,3 1,4 3,4 4,3 4,1 3,0 1,0 0,1",
    q: "4,4 4,3 4,1 4,-2|4,3 3,4 1,4 0,3 0,1 1,0 3,0 4,1",
    r: "0,4 0,0|0,3 1,4 2.5,4 3.5,3.6",
    s: "4,3 3,4 1,4 0,3 1,2 3,2 4,1 3,0 1,0 0,1",
    t: "1.5,6 1.5,4 1.5,1 2.5,0 4,0.6|0,4 1.5,4 3.5,4",
    u: "0,4 0,1 1,0 3,0 4,0|4,4 4,0",
    v: "0,4 2,0 4,4",
    w: "0,4 1,0 2,3 3,0 4,4",
    x: "0,4 2,2 4,0|4,4 2,2 0,0",
    y: "0,4 2,0.5 4,4|2,0.5 1,-2",
    z: "0,4 4,4 0,0 4,0",
  }
  var CIPHER_CACHE = {}
  function cipherGlyph(ch, upper) {
    var key = (upper ? "U" : "L") + ch
    if (CIPHER_CACHE[key]) return CIPHER_CACHE[key]
    var src = upper ? CIPHER_UP[ch] : CIPHER_LOW[ch]
    if (!src) src = CIPHER_UP[ch.toUpperCase()] && !upper ? CIPHER_LOW[ch] : "2,3"
    var strokes = src.split("|").map(function (s) {
      return s.split(" ").map(function (pt) {
        var xy = pt.split(",")
        return [parseFloat(xy[0]), parseFloat(xy[1])]
      })
    })
    CIPHER_CACHE[key] = { strokes: strokes, cap: !!upper || !!CIPHER_UP[ch] && !CIPHER_LOW[ch] }
    return CIPHER_CACHE[key]
  }

  // one shared star, drawn once and used everywhere: a bright core, a soft halo and a little cross of light
  function starDefs() {
    if (document.getElementById("sf-sg-defs")) return
    var s = svg("svg", { id: "sf-sg-defs", width: "0", height: "0", "aria-hidden": "true", style: "position:absolute;width:0;height:0;overflow:hidden" })
    var d = svg("defs", {})
    ;[
      ["sf-sg", 1, 3.6],
      ["sf-sgs", 0.7, 2.6],
    ].forEach(function (g) {
      var grp = svg("g", { id: g[0] })
      grp.appendChild(svg("circle", { r: (g[2] * 1.05).toFixed(2), fill: "currentColor", opacity: "0.18" }))
      grp.appendChild(svg("path", { d: "M" + -g[2] + " 0H" + g[2] + "M0 " + -g[2] + "V" + g[2], stroke: "currentColor", "stroke-width": "0.7", "stroke-linecap": "round", opacity: "0.8" }))
      grp.appendChild(svg("circle", { r: (1.15 * g[1]).toFixed(2), fill: "currentColor" }))
      d.appendChild(grp)
    })
    s.appendChild(d)
    document.body.appendChild(s)
  }

  function orbEnsure(o) {
    var a = o.a
    var real = o.real
    if (!a.isConnected) return
    var w = a.offsetWidth
    var h = a.offsetHeight
    var rw = real.offsetWidth
    var rh = real.offsetHeight
    if (!w || !h || !rw || !rh) return
    if (o.built && o.w === w && o.h === h && o.rw === rw) return
    starDefs()
    var cs = getComputedStyle(real)
    var cv = document.createElement("canvas")
    var ctx = cv.getContext("2d")
    if (!ctx) return
    var fsz = parseFloat(cs.fontSize)
    ctx.font = cs.fontStyle + " " + cs.fontWeight + " " + fsz + "px " + cs.fontFamily
    var txt = o.text
    if (cs.textTransform === "uppercase") txt = txt.toUpperCase()
    var asc = ctx.measureText(txt).fontBoundingBoxAscent || fsz * 0.82
    function asc1(ch, fb) {
      var mm = ctx.measureText(ch)
      return mm.actualBoundingBoxAscent || fb
    }
    var xh = asc1("x", fsz * 0.45)
    var capH = asc1("H", fsz * 0.68)
    var ascH = Math.max(asc1("b", fsz * 0.72), capH)
    var ox = real.offsetLeft
    var oy = real.offsetTop
    var base = oy + asc
    var r = rng(hash("orb:" + o.slug))
    var targets = []
    var wander = []
    var links = []
    var letters = 0
    for (var c0 = 0; c0 < txt.length; c0++) if (txt.charAt(c0) !== " ") letters++
    var seenLetters = 0
    for (var ci = 0; ci < txt.length; ci++) {
      var ch = txt.charAt(ci)
      var x0 = ctx.measureText(txt.slice(0, ci)).width
      var adv = ctx.measureText(txt.slice(0, ci + 1)).width - x0
      if (ch === " " || adv < 1) continue
      var upper = ch !== ch.toLowerCase() || /[0-9&?!]/.test(ch) || (CIPHER_UP[ch] && !CIPHER_LOW[ch])
      var g = cipherGlyph(ch, upper)
      var pad = adv * 0.14
      var gx0 = ox + x0 + pad
      var gw = Math.max(2, adv - pad * 2)
      var idx = {}
      var letterDelay = 0.26 * (seenLetters / Math.max(1, letters - 1))
      seenLetters++
      g.strokes.forEach(function (stroke) {
        var prev = -1
        stroke.forEach(function (pt) {
          var key = pt[0] + "," + pt[1]
          if (idx[key] === undefined) {
            var px = gx0 + (pt[0] / 4) * gw
            var gy = pt[1]
            var py
            if (upper) py = base - (gy / 6) * capH
            else if (gy <= 4) py = base - (gy / 4) * xh
            else py = base - xh - ((gy - 4) / 2) * (ascH - xh)
            idx[key] = targets.length
            targets.push([px, py])
            wander.push({ a: 0.14 + r() * 0.3, b: 0.12 + r() * 0.3, f: r() * 6.28, g: r() * 6.28, d: letterDelay + r() * 0.08, big: r() < 0.3 })
          }
          if (prev !== -1 && prev !== idx[key]) links.push([prev, idx[key]])
          prev = idx[key]
        })
      })
    }
    var n = targets.length
    if (n < 2) return
    // the few that show while the name is not held
    var showN = Math.max(5, Math.min(13, Math.round(w / 9)))
    var restIdx = []
    for (var s2 = 0; s2 < Math.min(showN, n); s2++) restIdx.push(Math.floor((s2 + 0.5) * (n / Math.min(showN, n))))
    // a handful of loose joins while they wander (never all of them): short ones only, fading as they drift apart
    var loose = []
    for (var li = 0; li < restIdx.length - 1; li++) if (r() < 0.5) loose.push([restIdx[li], restIdx[li + 1]])
    for (var lj = 0; lj < n; lj++) if (r() < 0.05) loose.push([lj, (lj + 1 + Math.floor(r() * 6)) % n])
    var board = o.board
    board.innerHTML = ""
    board.setAttribute("width", w)
    board.setAttribute("height", h)
    board.setAttribute("viewBox", "0 0 " + w + " " + h)
    var gl = svg("g", { class: "sf-orb-loose" })
    var gs = svg("g", { class: "sf-orb-skel" })
    var gd = svg("g", { class: "sf-orb-dots" })
    var looseEls = loose.map(function () {
      var ln = svg("line", {})
      gl.appendChild(ln)
      return ln
    })
    var skelEls = links.map(function () {
      var ln2 = svg("line", {})
      gs.appendChild(ln2)
      return ln2
    })
    var sc = Math.max(0.42, Math.min(1, capH / 22))
    var dotEls = targets.map(function (_, i6) {
      var u = svg("use", { href: wander[i6].big ? "#sf-sg" : "#sf-sgs" })
      u.style.opacity = 0
      gd.appendChild(u)
      return u
    })
    board.appendChild(gl)
    board.appendChild(gs)
    board.appendChild(gd)
    o.w = w
    o.h = h
    o.rw = rw
    o.sc = sc
    o.targets = targets
    o.wander = wander
    o.links = links
    o.loose = loose
    o.restIdx = restIdx
    o.looseEls = looseEls
    o.skelEls = skelEls
    o.dotEls = dotEls
    o.built = true
    orbDraw(o)
  }

  function orbPos(o, i, e) {
    var wd = o.wander[i]
    var tg = o.targets[i]
    var wx = o.w * (0.5 + 0.47 * Math.sin(o.t * wd.a + wd.f))
    var wy = o.h * (0.5 + 0.42 * Math.sin(o.t * wd.b + wd.g))
    return [wx + (tg[0] - wx) * e, wy + (tg[1] - wy) * e]
  }
  function orbDraw(o) {
    var n = o.targets.length
    var pos = new Array(n)
    var es = new Array(n)
    var all = o.p > 0
    function ease(x) {
      x = Math.max(0, Math.min(1, x))
      return x * x * (3 - 2 * x)
    }
    var resting = {}
    o.restIdx.forEach(function (i) {
      resting[i] = 1
    })
    for (var i = 0; i < n; i++) {
      es[i] = ease((o.p - o.wander[i].d) / 0.62)
      var u = o.dotEls[i]
      if (all || resting[i]) {
        pos[i] = orbPos(o, i, es[i])
        u.setAttribute("transform", "translate(" + pos[i][0].toFixed(2) + " " + pos[i][1].toFixed(2) + ") scale(" + o.sc.toFixed(2) + ")")
        var tw = 0.62 + 0.3 * Math.sin(o.t * 1.1 + i * 1.7)
        // while not held, only a few stars show and twinkle; held, the rest come out of the dark one by one
        var op = resting[i] ? tw + (1 - tw) * Math.min(1, o.p * 2) : Math.min(1, Math.max(0, (o.p - o.wander[i].d * 0.8) * 3.2))
        u.style.opacity = op.toFixed(2)
      } else u.style.opacity = 0
    }
    // a few loose joins between stars that happen to drift near each other
    var maxd = Math.max(o.w * 0.3, o.h * 3)
    var fade = 1 - ease(o.p * 1.6)
    for (var c = 0; c < o.looseEls.length; c++) {
      var ln = o.looseEls[c]
      var pa = pos[o.loose[c][0]]
      var pb = pos[o.loose[c][1]]
      if (!pa || !pb || fade <= 0) {
        ln.style.opacity = 0
        continue
      }
      var dd = Math.hypot(pa[0] - pb[0], pa[1] - pb[1])
      ln.setAttribute("x1", pa[0].toFixed(2))
      ln.setAttribute("y1", pa[1].toFixed(2))
      ln.setAttribute("x2", pb[0].toFixed(2))
      ln.setAttribute("y2", pb[1].toFixed(2))
      ln.style.opacity = (Math.max(0, 1 - dd / maxd) * 0.5 * fade).toFixed(2)
    }
    // the letters' own lines, drawn between stars that have arrived
    for (var k = 0; k < o.skelEls.length; k++) {
      var l = o.links[k]
      var sl = o.skelEls[k]
      var ee = Math.min(es[l[0]], es[l[1]])
      if (!all || ee <= 0.03) {
        sl.style.opacity = 0
        continue
      }
      sl.setAttribute("x1", pos[l[0]][0].toFixed(2))
      sl.setAttribute("y1", pos[l[0]][1].toFixed(2))
      sl.setAttribute("x2", pos[l[1]][0].toFixed(2))
      sl.setAttribute("y2", pos[l[1]][1].toFixed(2))
      sl.style.opacity = (ee * ee * 0.95).toFixed(2)
    }
  }

  function orbFinish(o) {
    o.done = true
    // the stars sit exactly on the letters; the letters fade up beneath them, and nothing moves
    o.a.classList.add("sf-known")
    o.a.setAttribute("aria-label", o.text)
    var st = load()
    st.rev = st.rev || {}
    st.rev[o.slug] = 1
    save(st)
    // Now that this name is known, every other place it is written on this page is known too (other pages see it when they open)
    document.querySelectorAll("a.sf-veiled").forEach(function (a2) {
      var o2 = a2.__orb
      if (!o2 || o2 === o || o2.done || o2.slug !== o.slug) return
      o2.done = true
      o2.hover = false
      a2.classList.add("sf-known")
      a2.setAttribute("aria-label", o2.text)
      if (o2.board && o2.board.parentNode) o2.board.parentNode.removeChild(o2.board)
    })
  }

  // ---------- the properties, told in the world ----------
  var FRONT_LABELS = {
    type: "Kind",
    era: "Age",
    status: "Standing",
    features: "Known for",
    featured: "Concerning",
    region: "Found in",
    regions: "Holds",
    background: "Of its past",
    "notable residents": "Those who dwell there",
    title: "Called",
    race: "Of the",
    species: "Of the",
    class: "Fights as",
    allegiance: "Sworn to",
    proficiencies: "Skilled in",
    role: "Known as",
    "first appearance": "First seen in",
    continent: "Of the continent",
    capital: "Seat of power",
    source: "Recovered from",
    systems: "Workings",
    covers: "Spans",
    "also known as": "Also called",
  }
  function buildFront() {
    var det = document.querySelector(".center details.note-properties")
    if (!det) return
    det.style.display = "none"
    var theme = document.body.getAttribute("data-sf-theme")
    if (theme === "scrap" || theme === "plain-paper") return
    if (document.querySelector(".center .sf-front")) return
    var dl = el("dl", "sf-fields")
    det.querySelectorAll("tr.note-properties-row").forEach(function (tr) {
      var k = ((tr.children[0] && tr.children[0].textContent) || "").trim()
      var kl = k.toLowerCase()
      if (!k || kl === "tags" || kl === "theme" || kl === "name") return
      var row = el("div", "sf-field")
      row.appendChild(el("dt", "", FRONT_LABELS[kl] || k))
      var dd = el("dd", "")
      var cell = tr.children[1]
      if (cell)
        Array.prototype.forEach.call(cell.childNodes, function (n) {
          dd.appendChild(n.cloneNode(true))
        })
      row.appendChild(dd)
      dl.appendChild(row)
    })
    if (!dl.children.length) return
    var box = el("div", "sf-front")
    box.appendChild(dl)
    var h1 = document.querySelector(".center h1.article-title")
    if (h1 && h1.parentNode) h1.parentNode.insertBefore(box, h1.nextSibling)
  }

  // ---------- a scrap is written in a hurry: some words are struck out, and it is smudged ----------
  function roughUp(slug) {
    var rd2 = rng(hash("scrap:" + slug))
    var host = document.querySelector(".center")
    if (!host || host.querySelector(".sf-smudge")) return
    for (var i = 0; i < 6; i++) {
      var s = el("div", "sf-smudge")
      s.style.left = (rd2() * 90).toFixed(0) + "%"
      s.style.top = (4 + rd2() * 90).toFixed(0) + "%"
      s.style.width = (50 + rd2() * 150).toFixed(0) + "px"
      s.style.height = (24 + rd2() * 70).toFixed(0) + "px"
      s.style.transform = "rotate(" + (rd2() * 180).toFixed(0) + "deg)"
      s.style.opacity = (0.12 + rd2() * 0.2).toFixed(2)
      host.appendChild(s)
    }
    var made = 0
    host.querySelectorAll(".markdown-rendered > p").forEach(function (p, i) {
      if (made > 5 || i < 1 || (hash(slug + ":" + i) % 3 !== 0 && !(i === 2 && made === 0))) return
      var n = p.firstChild
      if (!n || n.nodeType !== 3) return
      var words = n.textContent.split(/(\s+)/)
      if (words.length < 16) return
      var cut = 4 + (hash(slug + i) % 4) * 2
      var len = 5 + (hash(slug + "x" + i) % 3) * 2
      var before = words.slice(0, cut).join("")
      var struck = words.slice(cut, cut + len).join("")
      var after = words.slice(cut + len).join("")
      var frag = document.createDocumentFragment()
      frag.appendChild(document.createTextNode(before))
      var sp = el("span", "sf-struck", struck)
      frag.appendChild(sp)
      frag.appendChild(document.createTextNode(after))
      p.replaceChild(frag, n)
      made++
    })
  }

  // ---------- a few words of one's own in the margin ----------
  function buildMargin(st, slug) {
    var art = document.querySelector("article")
    var theme = document.body.getAttribute("data-sf-theme")
    if (!art || theme === "scrap" || art.querySelector(".sf-marg")) return
    var box = el("div", "sf-marg")
    box.appendChild(el("span", "sf-marg-label", "in the margin"))
    var ta = el("textarea", "sf-marg-text")
    ta.rows = 2
    ta.placeholder = "something to remember about this one\u2026"
    ta.value = (st.marg && st.marg[slug]) || ""
    var timer = 0
    ta.addEventListener("input", function () {
      clearTimeout(timer)
      timer = setTimeout(function () {
        var s2 = load()
        s2.marg = s2.marg || {}
        if (ta.value.trim()) s2.marg[slug] = ta.value
        else delete s2.marg[slug]
        save(s2)
      }, 400)
    })
    box.appendChild(ta)
    art.appendChild(box)
  }

  // ---------- small furnishings on the paper: corners, tape, a clip, a tab; each theme dresses them differently ----------
  function buildDeco() {
    var host = document.querySelector(".center")
    if (!host || host.querySelector(".sf-deco")) return
    var d = el("div", "sf-deco")
    ;["a", "b", "c", "d"].forEach(function (k) {
      d.appendChild(el("i", k))
    })
    host.appendChild(d)
  }

  // ---------- a ribbon back to where I was ----------
  function buildRibbon(st, slug) {
    var host = document.querySelector(".center")
    var theme = document.body.getAttribute("data-sf-theme")
    if (!host || theme === "scrap" || host.querySelector(".sf-ribbon")) return
    var prev = null
    ;(st.recent || []).forEach(function (s) {
      if (s !== slug && st.pages[s]) prev = s
    })
    var a = el("a", "sf-ribbon" + (prev ? " internal" : ""), "")
    if (prev) {
      a.href = hrefFor(prev)
      a.dataset.slug = prev
      a.title = "Back to " + (st.pages[prev].t || "where I was")
    } else {
      a.href = rootPath() + "/"
      a.title = "Back to the sky"
    }
    a.setAttribute("aria-label", a.title)
    host.appendChild(a)
  }

  // ---------- trail ("found from") ----------
  function showTrail(st, slug) {
    var host = document.querySelector(".center")
    if (!host || host.querySelector(".sf-trail")) return
    var rec = st.pages[slug]
    if (!rec) return
    var box = el("div", "sf-trail sf-trail-p" + (hash("note:" + slug) % 6))
    if (rec.f && st.pages[rec.f]) {
      box.appendChild(document.createTextNode("Came to me by way of "))
      var a = el("a", "sf-trail-from", st.pages[rec.f].t || "an earlier page")
      a.href = hrefFor(rec.f)
      a.dataset.slug = rec.f
      a.className += " internal"
      box.appendChild(a)
    } else if (entrySlugs[slug]) {
      box.appendChild(document.createTextNode("Where it began"))
    } else {
      box.appendChild(document.createTextNode("I do not remember how I found this"))
    }
    var d = ""
    try {
      d = new Date(rec.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })
    } catch (e) {}
    box.appendChild(el("span", "sf-trail-date", d ? "  \u2014 " + d : ""))
    host.insertBefore(box, host.firstChild)
  }

  // ---------- sealed page ----------
  function sealPage() {
    document.body.classList.add("sf-sealed-page")
    document.title = "Sealed"
    var art = document.querySelector("article")
    if (!art || art.querySelector(".sf-sealed-msg")) return
    var box = el("div", "sf-sealed-msg")
    box.appendChild(el("div", "sf-sealed-glyph", "▓▒░"))
    box.appendChild(el("p", "sf-sealed-text", "I have not been here. I would remember."))
    box.appendChild(el("p", "sf-sealed-sub", "Something has to lead me here first."))
    var a = el("a", "sf-sealed-back", "Back to where I started")
    a.href = rootPath() + "/"
    box.appendChild(a)
    art.insertBefore(box, art.firstChild)
  }

  // ---------- sidebar nav ----------
  function updateNav(st) {
    var n = discoveredCount(st)
    document.querySelectorAll(".sf-nav-count").forEach(function (c) {
      c.textContent = n ? String(n) : ""
    })
  }

  // ---------- landing ----------
  // The sky: a set of constellations with one fixed layout for every reader (computed at build time, see layout.js).
  // Progress only decides what is visible:
  //   no star found     the figure is unseen, with only a very faint hint of it in the dark
  //   one star found    its faint outline appears, with empty rings where stars are missing
  //   two stars found   its name appears; three, and its meaning
  // The Starfall's crack runs outward from the Crater at the centre: what lies before it is whole and ruled; what lies after
  // it is broken off, loosely spaced, joined by faint kinked lines (never dashes); what straddles it is cracked.
  // The sky is larger than the screen. The three doors are in the opening view; the rest lies out past the edges, and the
  // reader moves across it by leaning the mouse on an edge, dragging, scrolling, or the arrow keys.

  function ensureLandingFont() {
    if (document.getElementById("sf-font")) return
    var l = document.createElement("link")
    l.id = "sf-font"
    l.rel = "stylesheet"
    l.href = "https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&family=Caveat:wght@500;600&family=Special+Elite&family=Kalam:wght@300;400&family=Pinyon+Script&display=swap"
    document.head.appendChild(l)
  }

  // Carried by the sidebar component, on the landing page only: { figs, nodes, bridges }
  var LAYOUT = null
  function layoutData() {
    if (!LAYOUT || !LAYOUT.figs.length) {
      var n = document.querySelector(".sf-nav")
      var parsed = null
      try {
        parsed = JSON.parse((n && n.dataset.layout) || "")
      } catch (e) {}
      if (parsed && parsed.figs && parsed.figs.length) LAYOUT = parsed
      else if (!LAYOUT) LAYOUT = { figs: [], nodes: [], bridges: [], world: { minX: -200, minY: -380, maxX: 1960, maxY: 1280, view: [0, 0] } }
    }
    return LAYOUT
  }

  // What the reader can see of the sky.
  function skyFor(st) {
    var L = layoutData()
    var byHash = {}
    L.nodes.forEach(function (n) {
      byHash[n.h] = n
    })
    var found = {} // hash -> { node, slug, title, hint, door, at }
    CFG.entries.forEach(function (e) {
      var n = byHash[hash(e.slug)]
      if (n) found[n.h] = { node: n, slug: e.slug, title: (st.pages[e.slug] && st.pages[e.slug].t) || null, hint: e.hint, door: true, at: -1 }
    })
    Object.keys(st.pages).forEach(function (s) {
      var n = byHash[hash(s)]
      if (!n) return
      var prev = found[n.h]
      found[n.h] = { node: n, slug: s, title: st.pages[s].t || s, hint: prev && prev.hint, door: !!(prev && prev.door), at: prev && prev.door ? -1 : st.pages[s].at }
    })
    if (DEV) {
      // the dev build shows the sky filled in: every star found, with its real name
      L.nodes.forEach(function (n, i) {
        if (n.u && !found[n.h]) found[n.h] = { node: n, slug: n.u, title: n.t, hint: null, door: !!n.d, at: i }
        else if (n.u && found[n.h] && !found[n.h].title) found[n.h].title = n.t
      })
    }
    var at = L.figs.map(function () {
      return {}
    })
    var count = L.figs.map(function () {
      return 0
    })
    var total = L.figs.map(function () {
      return 0
    })
    L.nodes.forEach(function (n) {
      total[n.f]++
    })
    Object.keys(found).forEach(function (h) {
      var n = found[h].node
      at[n.f][n.s] = found[h]
      count[n.f]++
    })
    return { L: L, found: found, at: at, count: count, total: total }
  }

  // the points of a line between two star positions, stopping short of each star
  function lineParts(type, a, b, seed) {
    var dx = b[0] - a[0]
    var dy = b[1] - a[1]
    var len = Math.hypot(dx, dy)
    var gap = 11
    if (len < 2 * gap + 10) return []
    var ux = dx / len
    var uy = dy / len
    function at(t) {
      return [a[0] + ux * t, a[1] + uy * t]
    }
    if (type === "r" || type === "s") return [[at(gap), at(len - gap)]]
    if (type === "g") {
      // spans the break: two stubs and a visible gap between them
      return [
        [at(gap), at(len * 0.36)],
        [at(len * 0.72), at(len - gap)],
      ]
    }
    // broken (after the Starfall): one angular jog, off the straight line
    var jog = (seed % 2 ? 1 : -1) * (7 + (seed % 5))
    var mid = at(len * (0.46 + (seed % 3) * 0.04))
    return [[at(gap), [mid[0] - uy * jog, mid[1] + ux * jog], at(len - gap)]]
  }

  function polyline(pts, cls, style) {
    return svg("polyline", {
      class: cls,
      points: pts
        .map(function (p) {
          return p[0].toFixed(1) + "," + p[1].toFixed(1)
        })
        .join(" "),
      pathLength: "1",
      style: style || "",
    })
  }

  // each constellation has its own muted tint, so they can be told apart at a glance
  function tint(f) {
    return "#e6dfcc"
  }

  function hullOf(pts) {
    var p = pts.slice().sort(function (a, b) {
      return a[0] - b[0] || a[1] - b[1]
    })
    function cross(o, a, b) {
      return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    }
    var lo = []
    p.forEach(function (q) {
      while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop()
      lo.push(q)
    })
    var up = []
    for (var i = p.length - 1; i >= 0; i--) {
      var q = p[i]
      while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop()
      up.push(q)
    }
    up.pop()
    lo.pop()
    return lo.concat(up)
  }

  function hullPoints(pts) {
    return hullOf(pts)
      .map(function (p) {
        return p[0] + "," + p[1]
      })
      .join(" ")
  }

  // Clouds of light behind the sky, wispy at the edges. Drawn once on a layer of their own.
  function nebulaSvg(sky) {
    var Wd = sky.L.world
    var W = Wd.maxX - Wd.minX
    var H = Wd.maxY - Wd.minY
    var s = layerSvg("sf-nebula", Wd, 1800)
    var defs = svg("defs", {})
    var filt = svg("filter", { id: "sf-wisp", x: "-30%", y: "-30%", width: "160%", height: "160%" })
    filt.appendChild(svg("feTurbulence", { type: "fractalNoise", baseFrequency: "0.0055 0.0085", numOctaves: "3", seed: "11", result: "n" }))
    filt.appendChild(svg("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale: "230", result: "d" }))
    filt.appendChild(svg("feGaussianBlur", { in: "d", stdDeviation: "26" }))
    defs.appendChild(filt)
    var tones = { v: "120,86,190", t: "52,132,150", a: "214,142,70", b: "70,92,176", r: "170,84,120" }
    Object.keys(tones).forEach(function (k) {
      var g = svg("radialGradient", { id: "sf-n-" + k })
      g.appendChild(svg("stop", { offset: "0", "stop-color": "rgb(" + tones[k] + ")", "stop-opacity": "0.34" }))
      g.appendChild(svg("stop", { offset: "0.6", "stop-color": "rgb(" + tones[k] + ")", "stop-opacity": "0.13" }))
      g.appendChild(svg("stop", { offset: "1", "stop-color": "rgb(" + tones[k] + ")", "stop-opacity": "0" }))
      defs.appendChild(g)
    })
    s.appendChild(defs)
    var cl = svg("g", { filter: "url(#sf-wisp)" })
    ;[
      ["v", 420, 40, 520, 260, -20],
      ["b", 1650, 120, 560, 240, 25],
      ["t", 260, 900, 480, 280, 15],
      ["r", 1900, 700, 520, 260, -30],
      ["a", 1090, 450, 420, 300, 0],
      ["v", 1500, 1300, 560, 250, 12],
      ["t", 900, -420, 520, 230, -8],
      ["b", 560, 1380, 500, 240, -18],
      ["r", 2000, -250, 420, 220, 20],
      ["v", 100, 380, 380, 300, 40],
    ].forEach(function (c) {
      cl.appendChild(svg("ellipse", { cx: c[1], cy: c[2], rx: c[3], ry: c[4], fill: "url(#sf-n-" + c[0] + ")", transform: "rotate(" + c[5] + " " + c[1] + " " + c[2] + ")" }))
    })
    // the same clouds go on beyond the edges of the sky: softer, further out, and never an edge
    var far = svg("g", {})
    var keys = ["v", "t", "b", "r", "a", "v", "b", "t"]
    for (var fi = 0; fi < 30; fi++) {
      var fang = fi * 2.399
      var frad = 1500 + (fi % 5) * 330
      var fx = 1090 + Math.cos(fang) * frad * 1.2
      var fy = 450 + Math.sin(fang) * frad
      if (fx > Wd.minX - 150 && fx < Wd.maxX + 150 && fy > Wd.minY - 150 && fy < Wd.maxY + 150) continue
      var frx = 480 + (fi % 4) * 140
      far.appendChild(svg("ellipse", { cx: fx.toFixed(0), cy: fy.toFixed(0), rx: frx, ry: (frx * (0.5 + (fi % 3) * 0.12)).toFixed(0), fill: "url(#sf-n-" + keys[fi % keys.length] + ")", transform: "rotate(" + ((fi * 37) % 90 - 45) + " " + fx.toFixed(0) + " " + fy.toFixed(0) + ")" }))
    }
    s.appendChild(far)
    s.appendChild(cl)
    // the Crater's light: a warm glow and soft beams, fading with distance
    var cg = svg("radialGradient", { id: "sf-crater", gradientUnits: "userSpaceOnUse", cx: 1090, cy: 450, r: 620 })
    cg.appendChild(svg("stop", { offset: "0", "stop-color": "#f3c17a", "stop-opacity": "0.2" }))
    cg.appendChild(svg("stop", { offset: "0.25", "stop-color": "#e2a255", "stop-opacity": "0.07" }))
    cg.appendChild(svg("stop", { offset: "1", "stop-color": "#e2a255", "stop-opacity": "0" }))
    defs.appendChild(cg)
    var beams = svg("g", { fill: "url(#sf-crater)" })
    beams.appendChild(svg("circle", { cx: 1090, cy: 450, r: 620, opacity: "0.55" }))
    var rb = rng(31)
    for (var bi = 0; bi < 11; bi++) {
      var ang = (bi / 11) * Math.PI * 2 + rb() * 0.35
      var len = 420 + rb() * 200
      var w0 = 3 + rb() * 5
      var w1 = 26 + rb() * 30
      var ux = Math.cos(ang)
      var uy = Math.sin(ang)
      var nx = -uy
      var ny = ux
      beams.appendChild(
        svg("path", {
          d: "M" + (1090 + nx * w0).toFixed(1) + " " + (450 + ny * w0).toFixed(1) + "L" + (1090 + ux * len + nx * w1).toFixed(1) + " " + (450 + uy * len + ny * w1).toFixed(1) + "L" + (1090 + ux * len - nx * w1).toFixed(1) + " " + (450 + uy * len - ny * w1).toFixed(1) + "L" + (1090 - nx * w0).toFixed(1) + " " + (450 - ny * w0).toFixed(1) + "Z",
          opacity: "0.12",
        }),
      )
    }
    s.appendChild(beams)
    return s
  }

  // A layer of the background: an svg a little larger than the world, so that swaying never shows an edge.
  function layerSvg(cls, Wd, M) {
    var W = Wd.maxX - Wd.minX
    var H = Wd.maxY - Wd.minY
    var s = svg("svg", { class: cls, viewBox: Wd.minX - M + " " + (Wd.minY - M) + " " + (W + 2 * M) + " " + (H + 2 * M), "aria-hidden": "true", preserveAspectRatio: "none" })
    s.style.left = "calc(" + -M + " * 0.0625cqw)"
    s.style.top = "calc(" + -M + " * 0.0625cqw)"
    s.style.width = "calc(" + (W + 2 * M) + " * 0.0625cqw)"
    s.style.height = "calc(" + (H + 2 * M) + " * 0.0625cqw)"
    return s
  }

  // ---- the night behind the sky: one canvas, drawn from the camera, so it is the same sky however far out or in you are ----
  // Clouds are painted once into a bitmap (they are soft, so little is lost); stars are never stored: they come from the cell of
  // the sky they stand in, so the night goes on for ever past the edges and costs the same to draw however far out you are.
  var STAR_C = 320
  function cellH(i, j, k) {
    var h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k + 17, 2147483629)
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
  var STAR_CACHE = {}
  function cellStars(i, j) {
    var key = i + "," + j
    if (STAR_CACHE[key]) return STAR_CACHE[key]
    var n = 8 + Math.floor(cellH(i, j, 0) * 3)
    var out = []
    for (var k = 1; k <= n; k++) {
      var c = cellH(i, j, k * 11)
      var cc = cellH(i, j, k * 11 + 1)
      out.push({
        x: (i + cellH(i, j, k * 11 + 2)) * STAR_C,
        y: (j + cellH(i, j, k * 11 + 3)) * STAR_C,
        r: c < 0.12 ? 1.7 : 0.6 + cellH(i, j, k * 11 + 4) * 0.8,
        col: cc < 0.18 ? "242,217,166" : cc < 0.34 ? "188,208,238" : "230,223,204",
        a: 0.3 + cellH(i, j, k * 11 + 5) * 0.6,
        tw: cellH(i, j, k * 11 + 6) < 0.12,
        ph: cellH(i, j, k * 11 + 7) * 6.28,
        sp: cellH(i, j, k * 11 + 8) < 0.03,
      })
    }
    STAR_CACHE[key] = out
    return out
  }

  // ---- noise, for clouds ----
  function nzh(i, j) {
    var n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
    return n - Math.floor(n)
  }
  function nz(x, y) {
    var xi = Math.floor(x)
    var yi = Math.floor(y)
    var xf = x - xi
    var yf = y - yi
    var u = xf * xf * (3 - 2 * xf)
    var v = yf * yf * (3 - 2 * yf)
    var a = nzh(xi, yi)
    var b = nzh(xi + 1, yi)
    var c = nzh(xi, yi + 1)
    var e = nzh(xi + 1, yi + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v
  }
  function nfbm(x, y) {
    return nz(x, y) * 0.5 + nz(x * 2.03 + 7, y * 2.03 + 3) * 0.25 + nz(x * 4.1 + 13, y * 4.1 + 9) * 0.125
  }

  // The nebulae: painted once, from noise, straight onto a canvas (no images, no filters, nothing a browser can decline to draw).
  function bakeClouds(Wd, M, ppu, done) {
    var tones = { v: [120, 86, 190], t: [52, 132, 150], a: [214, 142, 70], b: [70, 92, 176], r: [170, 84, 120] }
    var list = []
    ;[
      ["v", 420, 40, 520, 260, -20],
      ["b", 1650, 120, 560, 240, 25],
      ["t", 260, 900, 480, 280, 15],
      ["r", 1900, 700, 520, 260, -30],
      ["a", 1090, 450, 420, 300, 0],
      ["v", 1500, 1300, 560, 250, 12],
      ["t", 900, -420, 520, 230, -8],
      ["b", 560, 1380, 500, 240, -18],
      ["r", 2000, -250, 420, 220, 20],
      ["v", 100, 380, 380, 300, 40],
    ].forEach(function (c) {
      list.push({ x: c[1], y: c[2], rx: c[3], ry: c[4], rot: (c[5] * Math.PI) / 180, tone: tones[c[0]], amp: 0.34 })
    })
    // the same clouds go on past the edges of the sky, all the way round
    var keys = ["v", "t", "b", "r", "a", "v", "b", "t"]
    for (var fi = 0; fi < 34; fi++) {
      var ang = fi * 2.399
      var rad = 1300 + (fi % 5) * 330
      var fx = 1090 + Math.cos(ang) * rad * 1.2
      var fy = 450 + Math.sin(ang) * rad
      if (fx > Wd.minX - 100 && fx < Wd.maxX + 100 && fy > Wd.minY - 100 && fy < Wd.maxY + 100) continue
      var rx = 520 + (fi % 4) * 150
      list.push({ x: fx, y: fy, rx: rx, ry: rx * (0.5 + (fi % 3) * 0.12), rot: (((fi * 37) % 90) - 45) * 0.01745, tone: tones[keys[fi % keys.length]], amp: 0.28 })
    }
    var X0 = Wd.minX - M
    var Y0 = Wd.minY - M
    var pw = Math.round((Wd.maxX - Wd.minX + 2 * M) * ppu)
    var ph = Math.round((Wd.maxY - Wd.minY + 2 * M) * ppu)
    var cv = document.createElement("canvas")
    cv.width = pw
    cv.height = ph
    var ctx = cv.getContext("2d")
    var img = ctx.createImageData(pw, ph)
    var d = img.data
    var row = 0
    function chunk() {
      var until = performance.now() + 7
      for (; row < ph && performance.now() < until; row++) {
        for (var px = 0; px < pw; px++) {
          var wx = X0 + px / ppu
          var wy = Y0 + row / ppu
          // the wisps: the sky is bent a little by slow noise before the clouds are laid on it
          var wx2 = wx + (nfbm(wx / 650, wy / 650) - 0.5) * 520
          var wy2 = wy + (nfbm(wx / 650 + 31, wy / 650 + 17) - 0.5) * 520
          var det = 0.62 + 0.76 * nfbm(wx / 210 + 5, wy / 210 + 9)
          var r = 0
          var g = 0
          var b = 0
          var a = 0
          for (var ci = 0; ci < list.length; ci++) {
            var c = list[ci]
            var dx = wx2 - c.x
            var dy = wy2 - c.y
            if (Math.abs(dx) > c.rx * 1.8 || Math.abs(dy) > c.rx * 1.8) continue
            var cs = Math.cos(c.rot)
            var sn = Math.sin(c.rot)
            var u = (dx * cs + dy * sn) / c.rx
            var v = (-dx * sn + dy * cs) / c.ry
            var q = u * u + v * v
            if (q > 3.2) continue
            var dens = Math.exp(-q * 1.7) * c.amp * det
            r += c.tone[0] * dens
            g += c.tone[1] * dens
            b += c.tone[2] * dens
            a += dens
          }
          var o = (row * pw + px) * 4
          if (a < 0.003) {
            d[o + 3] = 0
            continue
          }
          d[o] = Math.min(255, (r / a) * 1.06)
          d[o + 1] = Math.min(255, (g / a) * 1.06)
          d[o + 2] = Math.min(255, (b / a) * 1.06)
          d[o + 3] = Math.round(Math.min(0.56, a * 1.05) * 255)
        }
      }
      if (row < ph) setTimeout(chunk, 4)
      else {
        ctx.putImageData(img, 0, 0)
        // the Crater's own light, and its soft beams
        var cx = (1090 - X0) * ppu
        var cy = (450 - Y0) * ppu
        var rr = 620 * ppu
        var gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr)
        gr.addColorStop(0, "rgba(243,193,122,0.2)")
        gr.addColorStop(0.25, "rgba(226,162,85,0.07)")
        gr.addColorStop(1, "rgba(226,162,85,0)")
        ctx.fillStyle = gr
        ctx.beginPath()
        ctx.arc(cx, cy, rr, 0, 6.283)
        ctx.fill()
        done(cv)
      }
    }
    setTimeout(chunk, 20)
  }

  function makeBackdrop(sky, stage) {
    var Wd = sky.L.world
    var cv = document.createElement("canvas")
    cv.className = "sf-backdrop"
    var ctx = cv.getContext("2d")
    var dpr = Math.min(1.5, window.devicePixelRatio || 1)
    var cloud = null
    var cloudM = 1800
    var cloudPpu = 0.12
    var last = { vx: Wd.view[0], vy: Wd.view[1], z: 1, sx: 0, sy: 0, S: 1 }
    var t0 = performance.now()
    var ready = false
    function size() {
      cv.width = Math.max(2, Math.round(stage.clientWidth * dpr))
      cv.height = Math.max(2, Math.round(stage.clientHeight * dpr))
    }
    size()
    // paint the clouds once
    bakeClouds(Wd, cloudM, cloudPpu, function (bm) {
      cloud = bm
      ready = true
      draw()
    })

    function draw(vx, vy, z, sx, sy, S) {
      if (vx !== undefined) last = { vx: vx, vy: vy, z: z, sx: sx, sy: sy, S: S }
      else {
        vx = last.vx
        vy = last.vy
        z = last.z
        sx = last.sx
        sy = last.sy
        S = last.S
      }
      var t = (performance.now() - t0) / 1000
      var k = S * z
      // the canvas is sized to the stage as it is now (it may not have had a size when it was made)
      var wantW = Math.max(2, Math.round(stage.clientWidth * dpr))
      var wantH = Math.max(2, Math.round(stage.clientHeight * dpr))
      if (wantW > 2 && (cv.width !== wantW || cv.height !== wantH)) {
        cv.width = wantW
        cv.height = wantH
      }
      var W = cv.width
      var H = cv.height
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, W, H)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      var cw = W / dpr
      var ch = H / dpr
      // clouds
      if (cloud) {
        var shx = sx * 1.2 * k
        var shy = sy * 1.2 * k
        var ox = (Wd.minX - cloudM - vx) * k + shx
        var oy = (Wd.minY - cloudM - vy) * k + shy
        var kk = k / cloudPpu
        var sx0 = Math.max(0, -ox / kk)
        var sy0 = Math.max(0, -oy / kk)
        var sx1 = Math.min(cloud.width, (cw - ox) / kk)
        var sy1 = Math.min(cloud.height, (ch - oy) / kk)
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = "high"
        if (sx1 > sx0 && sy1 > sy0) ctx.drawImage(cloud, sx0, sy0, sx1 - sx0, sy1 - sy0, ox + sx0 * kk, oy + sy0 * kk, (sx1 - sx0) * kk, (sy1 - sy0) * kk)
      }
      // stars, from the cells of the sky in view
      var shx2 = sx * 1.9 * k
      var shy2 = sy * 1.9 * k
      var wx0 = vx - (shx2 + 40) / k
      var wy0 = vy - (shy2 + 40) / k
      var wx1 = vx + (cw - shx2 + 40) / k
      var wy1 = vy + (ch - shy2 + 40) / k
      var i0 = Math.floor(wx0 / STAR_C)
      var i1 = Math.floor(wx1 / STAR_C)
      var j0 = Math.floor(wy0 / STAR_C)
      var j1 = Math.floor(wy1 / STAR_C)
      // very far out there are too many cells to draw; draw a sample of them, a little brighter, rather than none
      var stride = Math.max(1, Math.ceil(Math.sqrt(((i1 - i0 + 1) * (j1 - j0 + 1)) / 700)))
      var boost = stride > 1 ? Math.min(2.2, 0.8 + stride * 0.45) : 1
      for (var j = j0; j <= j1; j++)
        for (var i = i0; i <= i1; i++) {
          if (stride > 1 && (((i % stride) + stride) % stride !== 0 || ((j % stride) + stride) % stride !== 0)) continue
          var cs = cellStars(i, j)
          for (var q = 0; q < cs.length; q++) {
            var s = cs[q]
            var px = (s.x - vx) * k + shx2
            var py = (s.y - vy) * k + shy2
            if (px < -8 || py < -8 || px > cw + 8 || py > ch + 8) continue
            var a = Math.min(1, s.a * boost)
            if (s.tw) a *= 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(t * 1.1 + s.ph))
            var rp = s.r * k
            if (rp < 0.8) {
              // from far off a star is a point of light, never fainter than a point
              var side = Math.max(1.1, rp * 2.2)
              ctx.fillStyle = "rgba(" + s.col + "," + Math.max(0.5, a).toFixed(2) + ")"
              ctx.fillRect(px - side / 2, py - side / 2, side, side)
            } else {
              ctx.fillStyle = "rgba(" + s.col + "," + a.toFixed(2) + ")"
              ctx.beginPath()
              ctx.arc(px, py, Math.min(rp, 3), 0, 6.283)
              ctx.fill()
            }
            if (s.sp) {
              var fl = Math.pow(Math.max(0, Math.sin(t * 0.55 + s.ph)), 8)
              if (fl > 0.05) {
                var len = Math.max(3, 5 * k)
                ctx.strokeStyle = "rgba(239,232,212," + (fl * 0.9).toFixed(2) + ")"
                ctx.lineWidth = 0.9
                ctx.beginPath()
                ctx.moveTo(px - len, py)
                ctx.lineTo(px + len, py)
                ctx.moveTo(px, py - len)
                ctx.lineTo(px, py + len)
                ctx.stroke()
              }
            }
          }
        }
      depthLayer(vx, vy, z, sx, sy, S, cw, ch, 0.42, 0.45, 6001, 1, 0.5, 0.7, t)
      depthLayer(vx, vy, z, sx, sy, S, cw, ch, 1.45, 1.25, 9001, 7, 0.3, 2.2, t)
    }
    // Two more depths of stars on the same canvas (no new layers): far ones hardly move when the view does, near ones move faster, so
    // the sky has depth. They are the same kind of cell stars, drawn from other cells, and only as many as are in view.
    function depthLayer(vx, vy, z, sx, sy, S, cw, ch, pf, kz, salt, keep, amul, rad, tt) {
      var kf = S * Math.pow(z, kz)
      var cxw = (vx + cw / (2 * S * z)) * pf
      var cyw = (vy + ch / (2 * S * z)) * pf
      var hw = cw / (2 * kf) + 30
      var hh = ch / (2 * kf) + 30
      var i0 = Math.floor((cxw - hw) / STAR_C)
      var i1 = Math.floor((cxw + hw) / STAR_C)
      var j0 = Math.floor((cyw - hh) / STAR_C)
      var j1 = Math.floor((cyw + hh) / STAR_C)
      var stride = Math.max(1, Math.ceil(Math.sqrt(((i1 - i0 + 1) * (j1 - j0 + 1)) / 420)))
      for (var j = j0; j <= j1; j++)
        for (var i = i0; i <= i1; i++) {
          if (stride > 1 && (((i % stride) + stride) % stride !== 0 || ((j % stride) + stride) % stride !== 0)) continue
          var cs = cellStars(i + salt, j + salt)
          for (var q = 0; q < cs.length; q += keep) {
            var s = cs[q]
            var px = cw / 2 + (s.x - salt * STAR_C - cxw) * kf + sx * kf * 0.6
            var py = ch / 2 + (s.y - salt * STAR_C - cyw) * kf + sy * kf * 0.6
            if (px < -6 || py < -6 || px > cw + 6 || py > ch + 6) continue
            var a = s.a * amul
            if (s.tw) a *= 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(tt * 0.9 + s.ph))
            var rp = Math.max(0.5, s.r * kf * rad)
            ctx.fillStyle = "rgba(" + s.col + "," + Math.min(1, a).toFixed(2) + ")"
            if (rp < 1.1) ctx.fillRect(px - 0.6, py - 0.6, 1.2, 1.2)
            else {
              ctx.beginPath()
              ctx.arc(px, py, Math.min(rp, 4), 0, 6.283)
              ctx.fill()
            }
          }
        }
    }
    return {
      el: cv,
      draw: draw,
      resize: function () {
        dpr = Math.min(1.5, window.devicePixelRatio || 1)
        size()
        draw()
      },
    }
  }

  // The Erased: not a figure but a hole. Darkness eating into the corner of the sky, in ragged tongues and tendrils, with pieces
  // of sky already broken off and being swallowed beyond its reach. Made once from noise, then left to breathe.
  function voidCanvas(sky) {
    var Wd = sky.L.world
    var fig = null
    sky.L.figs.forEach(function (f) {
      if (f.k === "erased") fig = f
    })
    if (!fig) return null
    var core = fig.s.slice(0, 9)
    var cy = core.reduce(function (a, p) {
      return a + p[1]
    }, 0) / core.length
    var P = [Wd.minX - 160, cy + 250]
    var R = 520
    // the region it can reach: a good way out past the edges, and 2.4 R in from the corner
    var X0 = Wd.minX - 1800
    var X1 = P[0] + R * 2.6
    var Y0 = P[1] - R * 2.6
    var Y1 = Wd.maxY + 1800
    var ppu = 0.22
    var cwid = Math.round((X1 - X0) * ppu)
    var chei = Math.round((Y1 - Y0) * ppu)
    var cv = document.createElement("canvas")
    cv.className = "sf-voidlo"
    cv.width = cwid
    cv.height = chei
    var ctx = cv.getContext("2d")
    var img = ctx.createImageData(cwid, chei)
    var d = img.data
    function h(i, j) {
      var n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
      return n - Math.floor(n)
    }
    function vn(x, y) {
      var xi = Math.floor(x)
      var yi = Math.floor(y)
      var xf = x - xi
      var yf = y - yi
      var u = xf * xf * (3 - 2 * xf)
      var v = yf * yf * (3 - 2 * yf)
      var a = h(xi, yi)
      var b = h(xi + 1, yi)
      var c = h(xi, yi + 1)
      var e = h(xi + 1, yi + 1)
      return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v
    }
    function fbm(x, y) {
      return vn(x, y) * 0.5 + vn(x * 2.03 + 7, y * 2.03 + 3) * 0.25 + vn(x * 4.1 + 13, y * 4.1 + 9) * 0.125 + vn(x * 8.3 + 5, y * 8.3 + 21) * 0.0625
    }
    function sm(a, b, x) {
      var u = Math.max(0, Math.min(1, (x - a) / (b - a)))
      return u * u * (3 - 2 * u)
    }
    // one point of the void: written as four numbers (r, g, b, alpha) into data at offset o
    function shade(wx, wy, data, o) {
      var dd = Math.hypot(wx - P[0], wy - P[1]) / R
      if (dd > 3.4) {
        data[o + 3] = 0
        return
      }
      var n1 = fbm(wx / 240, wy / 240)
      // long tongues and tendrils reaching out of the mass, thinning as they go
      var ridge = 1 - Math.abs(2 * fbm(wx / 420 + 9, wy / 420 + 4) - 1)
      var tend = Math.pow(ridge, 5) * Math.max(0, 1 - dd / 2.3) * 1.05
      // pieces of sky already broken away, adrift beyond the edge of it
      var frag = sm(0.6, 0.68, fbm(wx / 150 + 30, wy / 150 + 11)) * Math.max(0, 1 - Math.abs(dd - 1.55) / 0.55) * 0.55
      var f = 1 - dd + 0.6 * (n1 - 0.5) + tend + frag
      var a = sm(-0.01, 0.045, f)
      // a faint violet breath where it is about to take more
      var fr = sm(-0.28, -0.01, f) * (1 - a) * 0.34
      if (a <= 0 && fr <= 0.004) {
        data[o + 3] = 0
        return
      }
      var vein = Math.max(0, ridge - 0.62) * 2.2 * a * sm(0.1, 0.5, f)
      var cr = 3 + vein * 22
      var cg = 4 + vein * 14
      var cb = 9 + vein * 40
      var al = a + (1 - a) * fr
      data[o] = (cr * a + 84 * (1 - a) * fr) / Math.max(al, 0.001)
      data[o + 1] = (cg * a + 62 * (1 - a) * fr) / Math.max(al, 0.001)
      data[o + 2] = (cb * a + 128 * (1 - a) * fr) / Math.max(al, 0.001)
      data[o + 3] = Math.round(al * 255)
    }
    var wrap = document.createElement("div")
    wrap.className = "sf-voidcv"
    cv.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%"
    wrap.appendChild(cv)
    var row = 0
    function chunk() {
      var until = performance.now() + 7
      for (; row < chei && performance.now() < until; row++) for (var px = 0; px < cwid; px++) shade(X0 + px / ppu, Y0 + row / ppu, d, (row * cwid + px) * 4)
      if (row < chei) setTimeout(chunk, 4)
      else {
        ctx.putImageData(img, 0, 0)
        wrap.classList.add("ready")
      }
    }
    setTimeout(chunk, 30)
    wrap.style.left = "calc(" + (X0 - Wd.minX) + " * 0.0625cqw)"
    wrap.style.top = "calc(" + (Y0 - Wd.minY) + " * 0.0625cqw)"
    wrap.style.width = "calc(" + (X1 - X0) + " * 0.0625cqw)"
    wrap.style.height = "calc(" + (Y1 - Y0) + " * 0.0625cqw)"
    wrap.style.transformOrigin = (((P[0] - X0) / (X1 - X0)) * 100).toFixed(1) + "% " + (((P[1] - Y0) / (Y1 - Y0)) * 100).toFixed(1) + "%"

    // Seen close up the low-resolution void shows its blocks. So the part of it that is in view is drawn again, at the resolution of
    // the screen, and laid over the same place; the coarse one is cut away beneath it. It is redone whenever the view settles.
    var hi = document.createElement("canvas")
    hi.style.cssText = "position:absolute;display:none"
    wrap.appendChild(hi)
    var job = 0
    wrap.cancel = function () {
      job++
    }
    wrap.refine = function (vx0, vy0, vw, vh, scale) {
      job++
      var mine = job
      var dprr = Math.min(2, window.devicePixelRatio || 1)
      var want = Math.min(scale * dprr, 1.4)
      var rx0 = Math.max(X0, vx0 - vw * 0.12)
      var ry0 = Math.max(Y0, vy0 - vh * 0.12)
      var rx1 = Math.min(X1, vx0 + vw * 1.12)
      var ry1 = Math.min(Y1, vy0 + vh * 1.12)
      if (want < ppu * 1.35 || rx1 <= rx0 || ry1 <= ry0) {
        hi.style.display = "none"
        cv.style.clipPath = "none"
        return
      }
      // no more than about two million points
      var hp = Math.min(want, Math.sqrt(1200000 / ((rx1 - rx0) * (ry1 - ry0))))
      if (hp < ppu * 1.35) {
        hi.style.display = "none"
        cv.style.clipPath = "none"
        return
      }
      var w = Math.max(2, Math.round((rx1 - rx0) * hp))
      var hgt = Math.max(2, Math.round((ry1 - ry0) * hp))
      var tile = document.createElement("canvas")
      tile.width = w
      tile.height = hgt
      var tc = tile.getContext("2d")
      var ti = tc.createImageData(w, hgt)
      var td = ti.data
      var r = 0
      function go() {
        if (mine !== job) return
        var until = performance.now() + 7
        for (; r < hgt && performance.now() < until; r++) for (var x = 0; x < w; x++) shade(rx0 + x / hp, ry0 + r / hp, td, (r * w + x) * 4)
        if (r < hgt) setTimeout(go, 4)
        else {
          tc.putImageData(ti, 0, 0)
          hi.width = w
          hi.height = hgt
          hi.getContext("2d").drawImage(tile, 0, 0)
          var fx0 = (rx0 - X0) / (X1 - X0)
          var fy0 = (ry0 - Y0) / (Y1 - Y0)
          var fx1 = (rx1 - X0) / (X1 - X0)
          var fy1 = (ry1 - Y0) / (Y1 - Y0)
          hi.style.left = (fx0 * 100).toFixed(4) + "%"
          hi.style.top = (fy0 * 100).toFixed(4) + "%"
          hi.style.width = ((fx1 - fx0) * 100).toFixed(4) + "%"
          hi.style.height = ((fy1 - fy0) * 100).toFixed(4) + "%"
          hi.style.display = "block"
          var L0 = (fx0 * 100).toFixed(4) + "%"
          var T0 = (fy0 * 100).toFixed(4) + "%"
          var L1 = (fx1 * 100).toFixed(4) + "%"
          var T1 = (fy1 * 100).toFixed(4) + "%"
          cv.style.clipPath = "polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, " + L0 + " " + T0 + ", " + L0 + " " + T1 + ", " + L1 + " " + T1 + ", " + L1 + " " + T0 + ", " + L0 + " " + T0 + ")"
        }
      }
      setTimeout(go, 0)
    }
    return wrap
  }

  // ---- the stars, as a lens sees them ----
  // One telescope for every star: the same diffraction spikes at the same angles on all of them (only their lengths differ with
  // brightness); an astigmatism that grows toward the edges of what you are looking at and stretches each star along the circle
  // about the middle of the view; and a lens flare (ghosts, a streak, a veil) thrown from the brightest stars through the
  // middle of the view, so it moves as the view moves.
  function makeStars(sky, stage) {
    var list = sky.starList || []
    var cv = document.createElement("canvas")
    cv.className = "sf-starcv"
    var fl = document.createElement("canvas")
    fl.className = "sf-flarecv"
    var ctx = cv.getContext("2d")
    var fctx = fl.getContext("2d")
    var dpr = Math.min(1.5, window.devicePixelRatio || 1)
    var t0 = performance.now()
    var THETA = 0.49
    var hov = {}
    var hovT = {}
    var last = null
    var raf = 0
    var rafLast = 0
    list.forEach(function (s) {
      var jr = ((s.h >>> 3) % 1000) / 1000
      // the reach of a star's spikes differs from star to star
      s.lf = 0.62 + jr * 0.85
      s.B = s.door ? 1.4 : Math.min(1.3, Math.pow(s.s / 12, 1.3) * 1.15 + (s.hub ? 0.15 : 0))
      // on a first visit the doors light one at a time, as the opening words are read
      s.t0 = s.door ? (sky.first ? 1 + s.k * 1.4 : 0.3) : 1.3 + Math.min(s.k * 0.12, 3)
      s.ph = (s.h % 628) / 100
    })
    var lastSlug = sky.lastSlug || ""
    var fx = []
    var trailOn = false
    var trailIdx = list
      .filter(function (s) {
        return !s.absent
      })
      .sort(function (a, b) {
        return (a.at === undefined ? 0 : a.at) - (b.at === undefined ? 0 : b.at)
      })
    var erasedAt = null
    sky.L.figs.forEach(function (f) {
      if (f.k !== "erased") return
      var c = f.s.slice(0, 9)
      erasedAt = [
        c.reduce(function (a, q) {
          return a + q[0]
        }, 0) / c.length,
        c.reduce(function (a, q) {
          return a + q[1]
        }, 0) / c.length,
      ]
    })
    var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    var wx = { comet: null, aurora: null, lone: null, nc: 24, na: 80, nl: 55 }
    var live = 0
    var CRATER = { slug: "", p: [1090, 450], s: 14, B: 1.45, c: "255,214,150", lf: 1.15, h: 7, door: false, e: 0, k: 0, t0: 0.4, ph: 1.3, absent: false, crater: true }
    function clamp01(x) {
      return Math.max(0, Math.min(1, x))
    }
    function size() {
      var w = Math.max(2, Math.round(stage.clientWidth * dpr))
      var h = Math.max(2, Math.round(stage.clientHeight * dpr))
      if (w > 2 && (cv.width !== w || cv.height !== h)) {
        cv.width = w
        cv.height = h
      }
      var fw = Math.max(2, Math.round(window.innerWidth * dpr))
      var fh = Math.max(2, Math.round(window.innerHeight * dpr))
      if (fw > 2 && (fl.width !== fw || fl.height !== fh)) {
        fl.width = fw
        fl.height = fh
      }
    }
    // Gradients are costly to make, so each is painted once per colour onto a small canvas and then only scaled and stamped.
    var sprites = {}
    function spriteOf(col, kind) {
      var key = col + kind
      var c = sprites[key]
      if (c) return c
      c = document.createElement("canvas")
      var g
      if (kind === "s") {
        c.width = 256
        c.height = 4
        var sc = c.getContext("2d")
        g = sc.createLinearGradient(0, 0, 256, 0)
        g.addColorStop(0, "rgba(" + col + ",0)")
        g.addColorStop(0.34, "rgba(" + col + ",0.1)")
        g.addColorStop(0.46, "rgba(" + col + ",0.5)")
        g.addColorStop(0.5, "rgba(" + col + ",1)")
        g.addColorStop(0.54, "rgba(" + col + ",0.5)")
        g.addColorStop(0.66, "rgba(" + col + ",0.1)")
        g.addColorStop(1, "rgba(" + col + ",0)")
        sc.fillStyle = g
        sc.fillRect(0, 0, 256, 4)
      } else {
        c.width = 128
        c.height = 128
        var gc = c.getContext("2d")
        g = gc.createRadialGradient(64, 64, 0, 64, 64, 64)
        g.addColorStop(0, "rgba(" + col + ",0.62)")
        g.addColorStop(0.18, "rgba(" + col + ",0.24)")
        g.addColorStop(0.5, "rgba(" + col + ",0.06)")
        g.addColorStop(1, "rgba(" + col + ",0)")
        gc.fillStyle = g
        gc.fillRect(0, 0, 128, 128)
      }
      sprites[key] = c
      return c
    }
    function spike(x, y, ang, L, w, col, al) {
      if (L < 2 || al < 0.012) return
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(ang)
      ctx.globalAlpha = al
      ctx.drawImage(spriteOf(col, "s"), -L, -w / 2, 2 * L, w)
      ctx.restore()
    }
    function draw(vx, vy, z, sx, sy, S) {
      if (vx !== undefined) last = { vx: vx, vy: vy, z: z, sx: sx, sy: sy, S: S }
      else if (last) {
        vx = last.vx
        vy = last.vy
        z = last.z
        sx = last.sx
        sy = last.sy
        S = last.S
      } else return
      size()
      var k = S * z
      var now = (performance.now() - t0) / 1000
      var rect = stage.getBoundingClientRect()
      var cw = cv.width / dpr
      var ch = cv.height / dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.globalCompositeOperation = "source-over"
      ctx.clearRect(0, 0, cw, ch)
      ctx.globalCompositeOperation = "lighter"
      // the middle of what the viewer is looking at, in the stage's own coordinates
      var ccx = window.innerWidth / 2 - rect.left
      var ccy = window.innerHeight / 2 - rect.top
      var half = Math.hypot(window.innerWidth, window.innerHeight) / 2
      var sources = []
      function star(s) {
        var px = (s.p[0] - vx) * k + sx * k
        var py = (s.p[1] - vy) * k + sy * k
        if (px < -160 || py < -160 || px > cw + 160 || py > ch + 160) return
        var app = clamp01((now - s.t0) / 1.2)
        if (app <= 0) return
        var hv = hov[s.slug] || 0
        var B = s.B
        var col = s.c
        var rCore = Math.max(0.85, s.s * k * 0.34) * (s.door ? 1.5 : 1) * (1 + 0.35 * hv)
        var scint = 0.9 + 0.1 * Math.sin(now * (2.3 + (s.h % 5) * 0.37) + s.ph)
        var pulse = s.door ? 0.9 + 0.1 * Math.sin(now * 1.1 + s.ph) : 1
        if (s.absent) {
          // a star the sky has lost: only its outline is left
          ctx.strokeStyle = "rgba(230,223,204," + (0.34 * app).toFixed(2) + ")"
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(px, py, rCore * 1.5, 0, 6.283)
          ctx.stroke()
          return
        }
        var dx = px - ccx
        var dy = py - ccy
        var rho = Math.min(1.2, Math.hypot(dx, dy) / half)
        var tang = Math.atan2(dy, dx) + Math.PI / 2
        // astigmatism: nothing at the middle of the view, a stretch along the circle about it toward the edges
        var astig = 1.5 * rho * rho
        var glowR = rCore * (4.5 + 6 * B) * pulse * (1 + 0.3 * hv)
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(tang)
        ctx.scale(1 + astig, 1)
        ctx.globalAlpha = Math.min(1, app * scint)
        ctx.drawImage(spriteOf(col, "g"), -glowR, -glowR, 2 * glowR, 2 * glowR)
        ctx.restore()
        // the diffraction spikes: the same angles for every star; the reach differs
        var L = rCore * (8 + 17 * B) * s.lf * (1 + 0.6 * hv) * (0.92 + 0.08 * scint)
        var w = Math.max(0.7, rCore * 0.26)
        var al = Math.min(0.85, (0.3 + 0.5 * B) * app)
        var post = s.e === 1
        spike(px, py, THETA, L, w, col, al)
        spike(px, py, THETA + Math.PI / 2, L * (post ? 0.34 : 0.86), w, col, al * (post ? 0.55 : 1))
        // the fainter pair, a quarter-turn off, on the brightest stars
        if (B > 0.75) {
          spike(px, py, THETA + Math.PI / 4, L * 0.3, w * 0.7, col, al * 0.45)
          spike(px, py, THETA - Math.PI / 4, L * 0.3, w * 0.7, col, al * 0.45)
        }
        ctx.globalAlpha = 1
        if (lastSlug && s.slug === lastSlug && !calm) {
          // the page the reader last left: a slow ring from it, now and then
          var lp2 = (now % 4.5) / 4.5
          ctx.strokeStyle = "rgba(255,226,160," + ((1 - lp2) * 0.5).toFixed(3) + ")"
          ctx.lineWidth = 1.1
          ctx.beginPath()
          ctx.arc(px, py, rCore * (2 + 7 * lp2), 0, 6.283)
          ctx.stroke()
        }
        // the bright point itself
        ctx.fillStyle = "rgba(255,252,240," + (0.95 * app).toFixed(3) + ")"
        ctx.beginPath()
        ctx.arc(px, py, Math.max(0.6, rCore * 0.5), 0, 6.283)
        ctx.fill()
        if (s.crater || s.door || (s.hub && s.s >= 10) || B >= 1.0) sources.push({ x: px + rect.left, y: py + rect.top, B: B * app, c: col, crater: s.crater })
      }
      list.forEach(star)
      star(CRATER)
      extras(now, k, vx, vy, sx, sy, cw, ch)

      // ---- the lens flare, in the viewer's own frame ----
      var W = window.innerWidth
      var H = window.innerHeight
      var fc = fl.width / dpr
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      fctx.globalCompositeOperation = "source-over"
      fctx.clearRect(0, 0, fl.width, fl.height)
      fctx.globalCompositeOperation = "lighter"
      var Cx = W / 2
      var Cy = H / 2
      var minD = Math.min(W, H)
      var near = sources
        .filter(function (so) {
          return so.x > -40 && so.x < W + 40 && so.y > -40 && so.y < H + 40
        })
        .sort(function (a, b) {
          return Math.hypot(a.x - Cx, a.y - Cy) - Math.hypot(b.x - Cx, b.y - Cy)
        })
        .slice(0, 5)
      var fk = Math.min(1, 0.2 + k * 1.1)
      near.forEach(function (so) {
        var vdx = Cx - so.x
        var vdy = Cy - so.y
        var dist = Math.hypot(vdx, vdy)
        var inten = Math.min(1.2, so.B) * (0.3 + 0.7 * Math.min(1, dist / (0.55 * minD))) * fk * (so.crater ? 1.2 : 0.8)
        // a long, soft horizontal streak, as through an anamorphic lens
        var Lh = minD * 0.34 * Math.min(1, so.B) * fk
        if (Lh > 6) {
          var sg = fctx.createLinearGradient(so.x - Lh, 0, so.x + Lh, 0)
          sg.addColorStop(0, "rgba(140,185,255,0)")
          sg.addColorStop(0.5, "rgba(170,205,255," + (0.17 * inten).toFixed(3) + ")")
          sg.addColorStop(1, "rgba(140,185,255,0)")
          fctx.fillStyle = sg
          fctx.fillRect(so.x - Lh, so.y - 1.1, 2 * Lh, 2.2)
        }
        // a veil of glare around it
        var vr = minD * 0.3 * Math.min(1.2, so.B)
        var vg = fctx.createRadialGradient(so.x, so.y, 0, so.x, so.y, vr)
        vg.addColorStop(0, "rgba(" + so.c + "," + (0.075 * inten).toFixed(3) + ")")
        vg.addColorStop(1, "rgba(" + so.c + ",0)")
        fctx.fillStyle = vg
        fctx.beginPath()
        fctx.arc(so.x, so.y, vr, 0, 6.283)
        fctx.fill()
      })
    }
    // ---- the extras: the path the reader has walked, a figure being completed, and the weather of the sky ----
    function toScreen(wxp, wyp, vx, vy, k, sx, sy) {
      return [(wxp - vx) * k + sx * k, (wyp - vy) * k + sy * k]
    }
    function sprite2(col, kind) {
      return spriteOf(col, kind)
    }
    function env(u, a, b) {
      // 0 at the start, 1 through the middle, 0 at the end
      return Math.max(0, Math.min(1, u / a, (1 - u) / b))
    }
    var auroraSprite = null
    function auroraTile(r, g, b) {
      var c = document.createElement("canvas")
      c.width = 4
      c.height = 128
      var x = c.getContext("2d")
      var gr = x.createLinearGradient(0, 0, 0, 128)
      gr.addColorStop(0, "rgba(" + r + "," + g + "," + b + ",0)")
      gr.addColorStop(0.55, "rgba(" + r + "," + g + "," + b + ",0.8)")
      gr.addColorStop(0.8, "rgba(" + r + "," + g + "," + b + ",0.25)")
      gr.addColorStop(1, "rgba(" + r + "," + g + "," + b + ",0)")
      x.fillStyle = gr
      x.fillRect(0, 0, 4, 128)
      return c
    }
    function extras(now, k, vx, vy, sx, sy, cw, ch) {
      var i
      // The path walked: one smooth, glowing thread through the stars in the order they were found, thin and faint where it began,
      // fuller where it ends, a small bead at each stop, a ring where it started and a pulsing one where it has got to.
      if (trailOn && trailIdx.length > 1) {
        var n = trailIdx.length
        var P2 = []
        for (i = 0; i < n; i++) P2.push(toScreen(trailIdx[i].p[0], trailIdx[i].p[1], vx, vy, k, sx, sy))
        function off(a2) {
          return a2[0] < -80 || a2[0] > cw + 80 || a2[1] < -80 || a2[1] > ch + 80
        }
        ctx.lineCap = "round"
        ctx.lineJoin = "round"
        var m0 = P2[0]
        for (i = 1; i < n; i++) {
          // through the stops by way of the middle of each pair, so the thread curves instead of turning corners
          var m1 = i < n - 1 ? [(P2[i][0] + P2[i + 1][0]) / 2, (P2[i][1] + P2[i + 1][1]) / 2] : P2[i]
          if (!(off(m0) && off(P2[i]) && off(m1))) {
            var f = i / n
            ctx.beginPath()
            ctx.moveTo(m0[0], m0[1])
            ctx.quadraticCurveTo(P2[i][0], P2[i][1], m1[0], m1[1])
            ctx.strokeStyle = "rgba(255,206,120," + (0.04 + 0.07 * f).toFixed(3) + ")"
            ctx.lineWidth = 4 + 3 * f
            ctx.stroke()
            ctx.strokeStyle = "rgba(255,232,176," + (0.22 + 0.55 * f).toFixed(3) + ")"
            ctx.lineWidth = 0.7 + 1.6 * f
            ctx.stroke()
          }
          m0 = m1
        }
        for (i = 0; i < n; i++) {
          if (off(P2[i])) continue
          var fb = i / n
          ctx.fillStyle = "rgba(255,240,200," + (0.35 + 0.55 * fb).toFixed(3) + ")"
          ctx.beginPath()
          ctx.arc(P2[i][0], P2[i][1], 1.6 + 1.4 * fb, 0, 6.283)
          ctx.fill()
        }
        // where it began, and where it has got to
        ctx.strokeStyle = "rgba(255,226,160,0.7)"
        ctx.lineWidth = 1.2
        if (!off(P2[0])) {
          ctx.beginPath()
          ctx.arc(P2[0][0], P2[0][1], 7, 0, 6.283)
          ctx.stroke()
        }
        var pe = P2[n - 1]
        if (!off(pe)) {
          var pu = (now % 3) / 3
          ctx.strokeStyle = "rgba(255,226,160," + (0.8 * (1 - pu)).toFixed(3) + ")"
          ctx.beginPath()
          ctx.arc(pe[0], pe[1], 6 + 16 * pu, 0, 6.283)
          ctx.stroke()
        }
      }
      // a figure completed: a wave of light runs along its stars, then a ring goes out from the whole figure
      for (i = fx.length - 1; i >= 0; i--) {
        var e = fx[i]
        var age = now - e.t0
        var st2 = e.stars
        var endWave = st2.length * 0.17 + 1.6
        if (age > endWave + 2.4) {
          fx.splice(i, 1)
          continue
        }
        for (var j = 0; j < st2.length; j++) {
          var ph = (age - j * 0.17) / 1.6
          if (ph <= 0 || ph >= 1) continue
          var c2 = toScreen(st2[j].p[0], st2[j].p[1], vx, vy, k, sx, sy)
          var rr = (12 + 70 * ph) * Math.max(0.6, k * 1.1)
          ctx.globalAlpha = (1 - ph) * 0.75
          ctx.drawImage(sprite2("255,226,160", "g"), c2[0] - rr, c2[1] - rr, rr * 2, rr * 2)
          ctx.strokeStyle = "rgba(255,226,160," + ((1 - ph) * 0.7).toFixed(3) + ")"
          ctx.lineWidth = 1.2
          ctx.globalAlpha = 1
          ctx.beginPath()
          ctx.arc(c2[0], c2[1], rr * 0.55, 0, 6.283)
          ctx.stroke()
        }
        var u = (age - st2.length * 0.17) / 2.4
        if (u > 0 && u < 1) {
          var mid = toScreen(e.c[0], e.c[1], vx, vy, k, sx, sy)
          ctx.strokeStyle = "rgba(255,226,160," + ((1 - u) * 0.5).toFixed(3) + ")"
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(mid[0], mid[1], (40 + 520 * u) * k, 0, 6.283)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
      if (calm) return
      // ---- weather: rare and slow. A comet, an aurora, and a star where there should be none ----
      if (!wx.comet && now > wx.nc) {
        var Wd2 = sky.L.world
        var fromLeft = Math.random() < 0.5
        var y0 = Wd2.minY + (Wd2.maxY - Wd2.minY) * (0.05 + Math.random() * 0.4)
        wx.comet = { t0: now, dur: 22 + Math.random() * 8, x0: fromLeft ? Wd2.minX - 200 : Wd2.maxX + 200, y0: y0, dx: (fromLeft ? 1 : -1) * (Wd2.maxX - Wd2.minX + 400), dy: (Wd2.maxY - Wd2.minY) * (0.15 + Math.random() * 0.3) }
        live++
      }
      if (wx.comet) {
        var cm = wx.comet
        var cu = (now - cm.t0) / cm.dur
        if (cu >= 1) {
          wx.comet = null
          wx.nc = now + 80 + Math.random() * 80
        } else {
          var hp = toScreen(cm.x0 + cm.dx * cu, cm.y0 + cm.dy * cu, vx, vy, k, sx, sy)
          var dl = Math.hypot(cm.dx, cm.dy)
          var ux = cm.dx / dl
          var uy = cm.dy / dl
          var al = env(cu, 0.12, 0.2)
          var ks = Math.max(0.55, k)
          var tl = 260 * ks
          var gs = sprite2("205,228,255", "g")
          // one tail, made of soft glows that shrink and fade away from the head, bending very slightly
          var N = 34
          for (var ti = N; ti >= 1; ti--) {
            var f2 = ti / N
            var bend = f2 * f2 * 16 * ks
            var tx2 = hp[0] - ux * tl * f2 - uy * bend
            var ty2 = hp[1] - uy * tl * f2 + ux * bend
            var rr2 = (13 * (1 - f2 * 0.8) + 1.5) * ks
            ctx.globalAlpha = al * 0.34 * Math.pow(1 - f2, 1.7)
            ctx.drawImage(gs, tx2 - rr2, ty2 - rr2, rr2 * 2, rr2 * 2)
          }
          // the head
          var hg = 24 * ks
          ctx.globalAlpha = al
          ctx.drawImage(sprite2("240,248,255", "g"), hp[0] - hg, hp[1] - hg, hg * 2, hg * 2)
          ctx.fillStyle = "rgba(255,255,255," + (0.95 * al).toFixed(3) + ")"
          ctx.beginPath()
          ctx.arc(hp[0], hp[1], 1.6 * ks + 0.6, 0, 6.283)
          ctx.fill()
          ctx.globalAlpha = 1
        }
      }
      if (!wx.aurora && now > wx.na) {
        wx.aurora = { t0: now, dur: 50 }
        live++
      }
      if (wx.aurora) {
        var au = wx.aurora
        var aU = (now - au.t0) / au.dur
        if (aU >= 1) {
          wx.aurora = null
          wx.na = now + 200 + Math.random() * 160
        } else {
          if (!auroraSprite) auroraSprite = [auroraTile(110, 240, 180), auroraTile(160, 120, 240)]
          var amp = env(aU, 0.14, 0.2)
          var n = 120
          var sw = cw / n + 3
          for (var ri = 0; ri < 2; ri++) {
            ctx.globalAlpha = amp * (ri ? 0.05 : 0.08)
            for (var si = 0; si < n; si++) {
              var h = (ch * 0.2 + ch * 0.12 * Math.sin(si * 0.11 + now * 0.35 + ri * 1.7) + ch * 0.05 * Math.sin(si * 0.3 - now * 0.6)) * (ri ? 0.8 : 1)
              var y = ch * (0.08 + ri * 0.05) + ch * 0.06 * Math.sin(si * 0.06 + now * 0.22) - vy * k * 0.03
              ctx.drawImage(auroraSprite[ri], si * sw - 8 * ri - vx * k * 0.03, y, sw, h)
            }
          }
          ctx.globalAlpha = 1
        }
      }
      if (erasedAt && !wx.lone && now > wx.nl) {
        wx.lone = { t0: now, dur: 6 }
        live++
      }
      if (wx.lone) {
        var ln = wx.lone
        var lu = (now - ln.t0) / ln.dur
        if (lu >= 1) {
          wx.lone = null
          wx.nl = now + 110 + Math.random() * 90
        } else {
          var lp = toScreen(erasedAt[0], erasedAt[1], vx, vy, k, sx, sy)
          var la = env(lu, 0.3, 0.45)
          var lr = 5 * Math.max(0.8, k * 1.2)
          ctx.globalAlpha = la
          ctx.drawImage(sprite2("190,205,255", "g"), lp[0] - lr * 5, lp[1] - lr * 5, lr * 10, lr * 10)
          spike(lp[0], lp[1], THETA, lr * 9, 1, "190,205,255", 0.55 * la)
          spike(lp[0], lp[1], THETA + Math.PI / 2, lr * 7, 1, "190,205,255", 0.45 * la)
          ctx.globalAlpha = 1
        }
      }
      var nowLive = !!(wx.comet || wx.aurora || wx.lone)
      if (nowLive && !live) live = 1
      if (!nowLive) live = 0
      if (nowLive || fx.length) kick()
    }
    // while something is moving of its own accord, the sky is drawn every frame; otherwise as seldom as it can be
    var loop = 0
    function kick() {
      if (loop) return
      loop = requestAnimationFrame(function again() {
        loop = 0
        if (document.hidden || !cv.isConnected) return
        // draw() asks for the next frame itself (through kick) while anything is still moving
        draw()
      })
    }
    function hover(slug, on) {
      hovT[slug] = on ? 1 : 0
      if (raf) return
      rafLast = performance.now()
      raf = requestAnimationFrame(function tick(now2) {
        var dt = Math.min(0.05, (now2 - rafLast) / 1000)
        rafLast = now2
        var more = false
        Object.keys(hovT).forEach(function (sl) {
          var cur = hov[sl] || 0
          var tg = hovT[sl]
          if (cur !== tg) {
            cur += Math.max(-1, Math.min(1, (tg - cur) * 7 * dt + (tg > cur ? 0.001 : -0.001)))
            if (Math.abs(tg - cur) < 0.02) cur = tg
            hov[sl] = cur
            more = true
          }
        })
        draw()
        raf = more ? requestAnimationFrame(tick) : 0
      })
    }
    return {
      starEl: cv,
      flareEl: fl,
      draw: draw,
      hover: hover,
      weather: function (kind) {
        var Wd3 = sky.L.world
        var nowS = (performance.now() - t0) / 1000
        if (kind === "comet") wx.nc = -1
        else if (kind === "aurora") wx.na = -1
        else if (kind === "lone") wx.nl = -1
        draw()
      },
      trail: function (on) {
        if (on !== undefined) trailOn = !!on
        draw()
        return trailOn
      },
      celebrate: function (fi) {
        var f = sky.L.figs[fi]
        var ss = list
          .filter(function (s) {
            return s.f === fi && !s.absent
          })
          .sort(function (a, b) {
            return a.sl - b.sl
          })
        if (!ss.length) return
        var cx0 = 0
        var cy0 = 0
        ss.forEach(function (s) {
          cx0 += s.p[0]
          cy0 += s.p[1]
        })
        fx.push({ t0: (performance.now() - t0) / 1000, stars: ss, c: [cx0 / ss.length, cy0 / ss.length], name: f && f.n })
        kick()
      }, resize: function () { dpr = Math.min(1.5, window.devicePixelRatio || 1); size(); draw() } }
  }

  // The graduated ring about the Crater, turning very slowly. It is a layer of its own, so turning it costs nothing.
  function ringSvg(sky) {
    var Wd = sky.L.world
    var s = svg("svg", { class: "sf-ringsvg", viewBox: "0 0 1520 1520", "aria-hidden": "true" })
    s.style.left = "calc(" + (1090 - 760 - Wd.minX) + " * 0.0625cqw)"
    s.style.top = "calc(" + (450 - 760 - Wd.minY) + " * 0.0625cqw)"
    s.style.width = "calc(1520 * 0.0625cqw)"
    s.style.height = "calc(1520 * 0.0625cqw)"
    ;[200, 400, 600].forEach(function (rad) {
      s.appendChild(svg("circle", { class: "sf-grat-c", cx: 760, cy: 760, r: rad }))
    })
    s.appendChild(svg("circle", { cx: 760, cy: 760, r: 720 }))
    s.appendChild(svg("circle", { cx: 760, cy: 760, r: 732 }))
    for (var d = 0; d < 360; d += 4) {
      var a = (d * Math.PI) / 180
      var r2 = d % 28 === 0 ? 760 : 745
      s.appendChild(svg("line", { x1: (760 + Math.cos(a) * 732).toFixed(1), y1: (760 + Math.sin(a) * 732).toFixed(1), x2: (760 + Math.cos(a) * r2).toFixed(1), y2: (760 + Math.sin(a) * r2).toFixed(1) }))
    }
    return s
  }

  function chartSvg(sky) {
    var Wd = sky.L.world
    var W = Wd.maxX - Wd.minX
    var H = Wd.maxY - Wd.minY
    var CX = 1090
    var CY = 450
    var s = svg("svg", { class: "sf-chart", viewBox: Wd.minX + " " + Wd.minY + " " + W + " " + H, "aria-hidden": "true" })

    var figs = sky.L.figs
    // The Erased is drawn first, as an absence: a patch of sky where the stars have been taken out, and the ghost of a ship's
    // outline left behind in it
    figs.forEach(function (f, fi) {
      if (f.k !== "erased") return
      var g = svg("g", { class: "sf-erased" })
      if (sky.count[fi]) {
        f.e.forEach(function (e) {
          lineParts("r", f.s[e[0]], f.s[e[1]], 0).forEach(function (pts) {
            g.appendChild(polyline(pts, "sf-ghost"))
            g.appendChild(
              polyline(
                pts.map(function (p) {
                  return [p[0] + 4, p[1] + 3]
                }),
                "sf-ghost sf-ghost2",
              ),
            )
          })
        })
        f.s.forEach(function (p, i) {
          var got = !!sky.at[fi][i]
          g.appendChild(svg("circle", { class: "sf-hollow" + (got ? " sf-hollow-on" : ""), cx: p[0], cy: p[1], r: 8 }))
          if (got) g.appendChild(svg("line", { class: "sf-strike", x1: p[0] - 7, y1: p[1] + 7, x2: p[0] + 7, y2: p[1] - 7 }))
        })
      }
      s.appendChild(g)
    })

    var order = 0
    figs.forEach(function (f, fi) {
      if (f.k === "erased") return
      var n = sky.count[fi]
      var seed = hash("fig:" + f.k)
      var g = svg("g", { class: "sf-fig", style: "--t:" + tint(f) })
      if (!n) {
        // unseen: only a very faint hint, a few specks of light where it would be
        ;[1, 4, 7].forEach(function (i) {
          g.appendChild(svg("circle", { class: "sf-hint", cx: f.s[i][0], cy: f.s[i][1], r: 1.1 }))
        })
        s.appendChild(g)
        return
      }
      var litAt = sky.at[fi]
      // a little dust round it
      var rd = rng(seed ^ 77)
      for (var di = 0; di < 22; di++) {
        var base = f.s[Math.floor(rd() * f.s.length)]
        g.appendChild(svg("circle", { class: "sf-dust", cx: (base[0] + (rd() - 0.5) * 120).toFixed(1), cy: (base[1] + (rd() - 0.5) * 120).toFixed(1), r: (0.5 + rd() * 0.8).toFixed(2) }))
      }
      // the faint outline of the whole figure, and an empty ring wherever a star is missing
      f.e.forEach(function (e, ei) {
        if (e[2] === "s") return // satellites show only once found, so nothing hints at how many there are
        if (!litAt[e[0]] && !litAt[e[1]]) return // only the lines that run out of a found star
        lineParts(e[2], f.s[e[0]], f.s[e[1]], seed + ei).forEach(function (pts) {
          g.appendChild(polyline(pts, "sf-ol sf-ol-" + e[2]))
        })
      })
      // ...and a faint point where the next star would be, but only next to a star already found
      var nextTo = {}
      f.e.forEach(function (e) {
        if (e[2] === "s") return
        if (litAt[e[0]] && !litAt[e[1]]) nextTo[e[1]] = 1
        if (litAt[e[1]] && !litAt[e[0]]) nextTo[e[0]] = 1
      })
      Object.keys(nextTo).forEach(function (i) {
        var p = f.s[i]
        g.appendChild(svg("circle", { class: "sf-slot", cx: p[0], cy: p[1], r: 2.4 }))
      })
      // a few shards where the break runs through it
      var rs = rng(seed)
      f.e.forEach(function (e) {
        if (e[2] !== "g") return
        var a = f.s[e[0]]
        var b = f.s[e[1]]
        for (var k = 0; k < 2; k++) {
          var t = 0.42 + rs() * 0.3
          g.appendChild(svg("circle", { class: "sf-shard", cx: (a[0] + (b[0] - a[0]) * t + (rs() - 0.5) * 16).toFixed(1), cy: (a[1] + (b[1] - a[1]) * t + (rs() - 0.5) * 16).toFixed(1), r: (0.7 + rs() * 0.5).toFixed(2) }))
        }
      })
      // the lines between stars that have been found
      f.e.forEach(function (e, ei) {
        if (!litAt[e[0]] || !litAt[e[1]]) return
        lineParts(e[2], f.s[e[0]], f.s[e[1]], seed + ei).forEach(function (pts) {
          g.appendChild(polyline(pts, "sf-el sf-el-" + e[2], "--k:" + order++))
        })
      })
      s.appendChild(g)
    })

    // faint bridges between constellations, where a page belongs to two
    var bg = svg("g", { class: "sf-bridges" })
    sky.L.bridges.forEach(function (b, bi) {
      var from = sky.found[b[0]]
      if (!from || !sky.count[b[1]]) return
      var A = figs[from.node.f].s[from.node.s]
      var B = figs[b[1]].s[b[2]]
      var dx = B[0] - A[0]
      var dy = B[1] - A[1]
      var len = Math.hypot(dx, dy)
      if (len < 40) return
      var ux = dx / len
      var uy = dy / len
      var cxp = (A[0] + B[0]) / 2 - uy * len * 0.16
      var cyp = (A[1] + B[1]) / 2 + ux * len * 0.16
      bg.appendChild(
        svg("path", {
          class: "sf-bridge",
          d: "M" + (A[0] + ux * 12).toFixed(1) + " " + (A[1] + uy * 12).toFixed(1) + " Q" + cxp.toFixed(1) + " " + cyp.toFixed(1) + " " + (B[0] - ux * 9).toFixed(1) + " " + (B[1] - uy * 9).toFixed(1),
          pathLength: "1",
          style: "--k:" + bi,
        }),
      )
    })
    s.appendChild(bg)
    return s
  }

  // the chart is rolled up as it is put away
  function furlChart(root) {
    root.classList.add("sf-furl")
    var b = document.getElementById("sf-bar")
    if (b) b.classList.remove("sf-bar-over")
    setTimeout(function () {
      root.remove()
      document.body.classList.remove("sf-landing-page")
    }, 700)
  }

  function renderLanding(st, opts) {
    var chartMode = !!(opts && opts.chart)
    var old = document.getElementById("sf-landing")
    if (old) old.remove()
    ensureLandingFont()
    var L = CFG.landing || {}
    var root = el("div", chartMode ? "sf-chartmode" : "")
    root.id = "sf-landing"

    var sky = skyFor(st)
    var Wd = sky.L.world
    var WW = Wd.maxX - Wd.minX
    var WH = Wd.maxY - Wd.minY
    var stage = el("div", "sf-stage")
    // the world: the whole sky, wider and taller than the screen; the stage is the window onto it
    var worldEl = el("div", "sf-world")
    worldEl.style.width = "calc(" + WW + " * 0.0625cqw)"
    worldEl.style.height = "calc(" + WH + " * 0.0625cqw)"
    var voidEl = voidCanvas(sky)
    if (voidEl) worldEl.appendChild(voidEl)
    sky.voidEl = voidEl
    var layer = el("div", "sf-figlayer")
    layer.appendChild(ringSvg(sky))
    layer.appendChild(chartSvg(sky))
    worldEl.appendChild(layer)
    stage.appendChild(worldEl)
    var backdrop = makeBackdrop(sky, stage)
    stage.insertBefore(backdrop.el, worldEl)
    sky.backdrop = backdrop
    sky.swayEls = [layer, voidEl]
    window.__sfSky = sky

    function place(a, p) {
      a.style.left = (((p[0] - Wd.minX) / WW) * 100).toFixed(3) + "%"
      a.style.top = (((p[1] - Wd.minY) / WH) * 100).toFixed(3) + "%"
    }

    // the stars the reader has found, in the order they were found
    var list = Object.keys(sky.found)
      .map(function (h) {
        return sky.found[h]
      })
      .sort(function (a, b) {
        return a.at - b.at
      })
    sky.starList = []
    sky.first = !DEV && !Object.keys(st.pages).length
    list.forEach(function (it, i) {
      var n = it.node
      var fig = sky.L.figs[n.f]
      var a
      if (it.door) {
        a = el("a", "sf-door internal")
        a.style.setProperty("--d", (sky.first ? 1 + i * 1.4 : i * 0.9) + "s")
        a.style.setProperty("--rot", (hash(it.slug) % 60) + 10 + "deg")
        a.appendChild(el("span", "sf-door-label", it.title || it.hint || ""))
      } else {
        a = el("a", "sf-node internal" + (n.n ? " sf-hub" : "") + (n.z >= 10 ? " sf-big" : ""))
        a.style.setProperty("--s", n.z.toFixed(1))
        a.appendChild(el("span", "sf-node-dot", ""))
        a.appendChild(el("span", "sf-node-name", it.title || ""))
        if (!n.n) {
          // On touch screens there is no hover: the first tap names the star, a second tap opens the page.
          a.addEventListener(
            "click",
            function (ev) {
              if (!window.matchMedia("(hover: none)").matches || a.classList.contains("sf-peek")) return
              ev.preventDefault()
              ev.stopPropagation()
              worldEl.querySelectorAll(".sf-peek").forEach(function (o) {
                o.classList.remove("sf-peek")
              })
              a.classList.add("sf-peek")
            },
            true,
          )
        }
      }
      // after the Starfall: broken off; on it: cracked; before: whole
      a.classList.add(n.e === 0 ? "sf-pre" : n.e === 2 ? "sf-span" : "sf-post")
      if (fig.k === "erased") a.classList.add("sf-absent")
      a.href = hrefFor(it.slug)
      a.dataset.slug = it.slug
      a.style.setProperty("--k", String(i))
      if (hash(it.slug) % 100 < 40) a.classList.add("sf-tk")
      if (!it.door) a.style.setProperty("--t", tint(fig))
      // every star is its own: its own angle, size, streaks and warmth
      var hh = hash(it.slug)
      a.style.setProperty("--sh", ((hh % 100) / 100).toFixed(2))
      a.style.setProperty("--rot", (hh % 180) + "deg")
      a.style.setProperty("--rot2", ((hh >>> 8) % 180) + "deg")
      a.style.setProperty("--k2", (0.8 + ((hh >>> 16) % 50) / 100).toFixed(2))
      a.style.setProperty("--ln", (3.4 + ((hh >>> 4) % 30) / 10).toFixed(1))
      a.style.setProperty("--c", n.e === 2 ? "255,224,165" : ["255,244,215", "255,244,215", "206,222,255", "255,230,184", "232,236,255"][hh % 5])
      place(a, fig.s[n.s])
      layer.appendChild(a)
      var colors = ["255,244,215", "255,244,215", "206,222,255", "255,230,184", "232,236,255"]
      sky.starList.push({ slug: it.slug, p: fig.s[n.s], s: it.door ? 12 : n.z, door: !!it.door, hub: !!n.n, e: n.e, k: i, h: hh, f: n.f, sl: n.s, at: it.door ? -1 : it.at, absent: fig.k === "erased", c: it.door ? "255,214,140" : n.e === 2 ? "255,224,165" : colors[hh % 5] })
      var hs = it.slug
      a.addEventListener("pointerenter", function () {
        if (sky.stars) sky.stars.hover(hs, true)
      })
      a.addEventListener("pointerleave", function () {
        if (sky.stars) sky.stars.hover(hs, false)
      })
      a.addEventListener("focus", function () {
        if (sky.stars) sky.stars.hover(hs, true)
      })
      a.addEventListener("blur", function () {
        if (sky.stars) sky.stars.hover(hs, false)
      })
    })

    // each figure's name once two of its stars are found, and what it means once three are
    sky.L.figs.forEach(function (f, fi) {
      if (f.k === "erased" || sky.count[fi] < 2) return
      var d = el("div", "sf-fname" + (sky.count[fi] >= sky.total[fi] ? " sf-complete" : ""))
      d.dataset.fi = String(fi)
      d.style.setProperty("--t", tint(f))
      d.appendChild(el("span", "sf-fname-name", f.n))
      if (sky.count[fi] >= 3) {
        d.appendChild(el("span", "sf-fname-meaning", f.m))
      }
      place(d, f.l)
      layer.appendChild(d)
    })
    root.appendChild(stage)
    // the stars themselves are drawn on a canvas, as a lens would see them (see makeStars)
    sky.lastSlug = st.last || ""
    var starsObj = makeStars(sky, stage)
    stage.insertBefore(starsObj.starEl, worldEl)
    root.appendChild(starsObj.flareEl)
    sky.stars = starsObj
    // a figure whose last star has just been found: its light runs along it and its name writes itself out, once
    if (!DEV) {
      var doneMap = st.done || {}
      var fresh = []
      sky.L.figs.forEach(function (f, fi) {
        if (f.k !== "erased" && sky.total[fi] > 0 && sky.count[fi] >= sky.total[fi] && !doneMap[f.k]) fresh.push(fi)
      })
      if (fresh.length) {
        fresh.forEach(function (fi) {
          doneMap[sky.L.figs[fi].k] = 1
        })
        st.done = doneMap
        save(st)
        setTimeout(function () {
          fresh.forEach(function (fi, n) {
            setTimeout(function () {
              if (!root.isConnected) return
              starsObj.celebrate(fi)
              var nm = worldEl.querySelector('.sf-fname[data-fi="' + fi + '"]')
              if (nm) nm.classList.add("sf-wow")
            }, n * 2600)
          })
        }, 2600)
      }
    }
    if (!window.matchMedia("(max-aspect-ratio: 1/1)").matches) root.classList.add("sf-gl")

    var copy = el("div", "sf-copy")
    if (L.kicker) copy.appendChild(el("p", "sf-kicker", L.kicker))
    copy.appendChild(el("h1", "sf-landing-title", L.title || "The Starfall Universe"))
    ;(L.lines || []).forEach(function (line) {
      copy.appendChild(el("p", "sf-landing-line", line))
    })
    // On phones the chart is small, so the doors are also offered as a plain list.
    var doors = el("ul", "sf-doorlist")
    CFG.entries.forEach(function (e) {
      var li = el("li", "")
      var a = el("a", "internal", (st.pages[e.slug] && st.pages[e.slug].t) || e.hint || "")
      a.href = hrefFor(e.slug)
      a.dataset.slug = e.slug
      li.appendChild(a)
      doors.appendChild(li)
    })
    copy.appendChild(doors)
    var n = discoveredCount(st)
    if (n) {
      var foot = el("p", "sf-landing-foot")
      if (st.last && st.pages[st.last]) {
        var c = el("a", "sf-foot-link internal", "Return to " + (st.pages[st.last].t || "where you were"))
        c.href = hrefFor(st.last)
        c.dataset.slug = st.last
        foot.appendChild(c)
      }
      var j = el("a", "sf-foot-link", "Journal (" + n + ")")
      j.href = hrefFor(CFG.journalSlug)
      foot.appendChild(j)
      copy.appendChild(foot)
    }
    if (!chartMode) root.appendChild(copy)

    document.body.appendChild(root)
    document.body.classList.add("sf-landing-page")
    if (chartMode) {
      var closeBtn = el("button", "sf-close", "Fold the chart away")
      closeBtn.type = "button"
      closeBtn.addEventListener("click", function () {
        furlChart(root)
      })
      root.appendChild(closeBtn)
      var b2 = document.getElementById("sf-bar")
      if (b2) b2.classList.add("sf-bar-over")
    }
    enablePan(root, stage, worldEl, sky)
    cleanup(function () {
      root.remove()
      document.body.classList.remove("sf-landing-page")
    })
  }

  // Moving across the sky: lean the mouse on an edge, drag, scroll, or use the arrow keys. Soft glimmers on an edge say
  // that stars the reader has already found lie that way.
  // ---------- a picture of the sky the reader has found, to keep or share ----------
  function shareCard(sky, withPath) {
    var fonts = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('italic 26px "IM Fell English"'), document.fonts.load('26px "IM Fell English SC"'), document.fonts.load('26px "IM Fell English"')]) : Promise.resolve()
    var go = function () {
      drawCard(sky, withPath)
    }
    fonts.then(go, go)
  }
  function drawCard(sky, withPath) {
    var W = 1080
    var H = 1350
    var cv = document.createElement("canvas")
    cv.width = W
    cv.height = H
    var c = cv.getContext("2d")
    var SERIF = '"IM Fell English", Georgia, serif'
    var SC = '"IM Fell English SC", "IM Fell English", Georgia, serif'
    // ---- the night
    var bg = c.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, "#07080e")
    bg.addColorStop(0.55, "#110d19")
    bg.addColorStop(1, "#08080c")
    c.fillStyle = bg
    c.fillRect(0, 0, W, H)
    var rnd = rng(77)
    ;[
      [230, 380, 480, "112,84,170", 0.26],
      [900, 560, 520, "56,122,140", 0.2],
      [520, 980, 560, "176,98,60", 0.2],
      [170, 1060, 420, "84,98,184", 0.2],
      [880, 1120, 360, "150,80,120", 0.16],
      [520, 190, 360, "90,70,150", 0.14],
    ].forEach(function (b) {
      var g = c.createRadialGradient(b[0], b[1], 0, b[0], b[1], b[2])
      g.addColorStop(0, "rgba(" + b[3] + "," + b[4] + ")")
      g.addColorStop(1, "rgba(" + b[3] + ",0)")
      c.fillStyle = g
      c.fillRect(0, 0, W, H)
    })
    for (var i = 0; i < 700; i++) {
      var sz = rnd()
      var x = rnd() * W
      var y = rnd() * H
      c.fillStyle = "rgba(" + (rnd() < 0.2 ? "206,222,255" : rnd() < 0.3 ? "255,228,184" : "238,232,216") + "," + (0.12 + sz * 0.5).toFixed(2) + ")"
      c.beginPath()
      c.arc(x, y, sz > 0.97 ? 1.7 : sz > 0.8 ? 1.1 : 0.7, 0, 6.283)
      c.fill()
    }
    function spaced(text, x, y, gap) {
      var w = 0
      var ws = []
      for (var q = 0; q < text.length; q++) {
        var cw = c.measureText(text[q]).width
        ws.push(cw)
        w += cw + gap
      }
      w -= gap
      var cx = x - w / 2
      c.textAlign = "left"
      for (q = 0; q < text.length; q++) {
        c.fillText(text[q], cx, y)
        cx += ws[q] + gap
      }
      c.textAlign = "center"
    }
    // ---- the sky, scaled into the middle of the picture
    var Wd = sky.L.world
    var top = 330
    var bot = 300
    var mx = 120
    var sc = Math.min((W - 2 * mx) / (Wd.maxX - Wd.minX), (H - top - bot) / (Wd.maxY - Wd.minY))
    var ox = (W - sc * (Wd.maxX - Wd.minX)) / 2 - sc * Wd.minX
    var oy = top + (H - top - bot - sc * (Wd.maxY - Wd.minY)) / 2 - sc * Wd.minY
    function P(p) {
      return [ox + p[0] * sc, oy + p[1] * sc]
    }
    var cr = P([1090, 450])
    // the graduated ring about the Crater
    var cg = c.createRadialGradient(cr[0], cr[1], 0, cr[0], cr[1], 360 * sc + 120)
    cg.addColorStop(0, "rgba(243,193,122,0.34)")
    cg.addColorStop(0.4, "rgba(226,162,85,0.1)")
    cg.addColorStop(1, "rgba(226,162,85,0)")
    c.fillStyle = cg
    c.fillRect(0, 0, W, H)
    c.strokeStyle = "rgba(190,200,190,0.16)"
    c.lineWidth = 1
    ;[200, 400, 600].forEach(function (rad) {
      c.beginPath()
      c.arc(cr[0], cr[1], rad * sc, 0, 6.283)
      c.stroke()
    })
    for (var d = 0; d < 360; d += 5) {
      var an = (d * Math.PI) / 180
      var r1 = 600 * sc
      var r2 = r1 + (d % 30 === 0 ? 12 : 6)
      c.beginPath()
      c.moveTo(cr[0] + Math.cos(an) * r1, cr[1] + Math.sin(an) * r1)
      c.lineTo(cr[0] + Math.cos(an) * r2, cr[1] + Math.sin(an) * r2)
      c.stroke()
    }
    var foundSlot = sky.L.figs.map(function () {
      return {}
    })
    var order = []
    Object.keys(sky.found).forEach(function (h) {
      var f = sky.found[h]
      foundSlot[f.node.f][f.node.s] = f
      order.push(f)
    })
    // the path the reader walked
    order.sort(function (a, b) {
      return a.at - b.at
    })
    var pts = order
      .filter(function (f) {
        return sky.L.figs[f.node.f].k !== "erased"
      })
      .map(function (f) {
        return P(sky.L.figs[f.node.f].s[f.node.s])
      })
    // only on the picture of the path, not of the sky
    if (withPath && pts.length > 2) {
      c.strokeStyle = "rgba(240,200,130,0.5)"
      c.lineWidth = 1.8
      c.lineCap = "round"
      c.beginPath()
      c.moveTo(pts[0][0], pts[0][1])
      for (i = 1; i < pts.length - 1; i++) c.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2)
      c.stroke()
    }
    // the lines of each figure
    var stars = 0
    var named = 0
    var whole = 0
    sky.L.figs.forEach(function (f, fi) {
      if (f.k === "erased") return
      c.strokeStyle = "rgba(232,196,128,0.55)"
      c.lineWidth = 1.5
      f.e.forEach(function (e) {
        if (!foundSlot[fi][e[0]] || !foundSlot[fi][e[1]]) return
        var a = P(f.s[e[0]])
        var b = P(f.s[e[1]])
        c.beginPath()
        c.moveTo(a[0], a[1])
        c.lineTo(b[0], b[1])
        c.stroke()
      })
    })
    // stars: a glow, two spikes at the same angles on all of them, a bright point
    function glint(x, y, rad, col, len) {
      var g = c.createRadialGradient(x, y, 0, x, y, rad * 6)
      g.addColorStop(0, "rgba(" + col + ",0.8)")
      g.addColorStop(0.22, "rgba(" + col + ",0.22)")
      g.addColorStop(1, "rgba(" + col + ",0)")
      c.fillStyle = g
      c.fillRect(x - rad * 6, y - rad * 6, rad * 12, rad * 12)
      ;[0.49, 0.49 + Math.PI / 2].forEach(function (ang, ai) {
        var L = len * (ai ? 0.75 : 1)
        c.save()
        c.translate(x, y)
        c.rotate(ang)
        var lg = c.createLinearGradient(-L, 0, L, 0)
        lg.addColorStop(0, "rgba(" + col + ",0)")
        lg.addColorStop(0.5, "rgba(" + col + ",0.75)")
        lg.addColorStop(1, "rgba(" + col + ",0)")
        c.fillStyle = lg
        c.fillRect(-L, -0.6, 2 * L, 1.2)
        c.restore()
      })
      c.fillStyle = "#fffbe8"
      c.beginPath()
      c.arc(x, y, Math.max(1.1, rad * 0.5), 0, 6.283)
      c.fill()
    }
    glint(cr[0], cr[1], 7, "255,214,150", 46)
    Object.keys(sky.found).forEach(function (h) {
      var f = sky.found[h]
      var n = f.node
      var fig = sky.L.figs[n.f]
      if (fig.k === "erased") return
      var q = P(fig.s[n.s])
      stars++
      glint(q[0], q[1], 2.2 + Math.min(4, n.z / 3), n.e === 2 ? "255,224,165" : "255,244,215", 12 + n.z * 1.6 + ((hash(f.slug) % 100) / 100) * 12)
    })
    // the names
    sky.L.figs.forEach(function (f, fi) {
      if (f.k === "erased" || sky.count[fi] < 2) return
      named++
      var done = sky.count[fi] >= sky.total[fi]
      if (done) whole++
      var xs = f.s.slice(0, 9).map(P)
      var cx = xs.reduce(function (a, q) {
        return a + q[0]
      }, 0) / xs.length
      var by =
        Math.max.apply(
          null,
          xs.map(function (q) {
            return q[1]
          }),
        ) + 34
      c.font = "19px " + SC
      c.fillStyle = done ? "rgba(244,204,124,0.96)" : "rgba(230,224,206,0.72)"
      spaced(f.n.toUpperCase(), cx, by, 3.2)
    })
    // ---- the frame
    c.strokeStyle = "rgba(226,190,120,0.6)"
    c.lineWidth = 1.6
    c.strokeRect(34, 34, W - 68, H - 68)
    c.strokeStyle = "rgba(226,190,120,0.26)"
    c.lineWidth = 1
    c.strokeRect(48, 48, W - 96, H - 96)
    ;[
      [34, 34, 1, 1],
      [W - 34, 34, -1, 1],
      [34, H - 34, 1, -1],
      [W - 34, H - 34, -1, -1],
    ].forEach(function (k) {
      c.fillStyle = "#e8c882"
      c.save()
      c.translate(k[0], k[1])
      c.rotate(Math.PI / 4)
      c.fillRect(-4, -4, 8, 8)
      c.restore()
    })
    function rule(y, w) {
      var g = c.createLinearGradient(W / 2 - w, 0, W / 2 + w, 0)
      g.addColorStop(0, "rgba(226,190,120,0)")
      g.addColorStop(0.5, "rgba(226,190,120,0.7)")
      g.addColorStop(1, "rgba(226,190,120,0)")
      c.fillStyle = g
      c.fillRect(W / 2 - w, y, 2 * w, 1.2)
      c.fillStyle = "#e8c882"
      c.save()
      c.translate(W / 2, y + 0.6)
      c.rotate(Math.PI / 4)
      c.fillRect(-3.5, -3.5, 7, 7)
      c.restore()
    }
    // ---- the heading
    c.textAlign = "center"
    c.font = "17px " + SC
    c.fillStyle = "rgba(210,196,160,0.78)"
    spaced("THE STARFALL UNIVERSE", W / 2, 118, 6)
    c.font = "400 78px " + SERIF
    c.fillStyle = "#f1e8d0"
    c.shadowColor = "rgba(244,204,124,0.35)"
    c.shadowBlur = 24
    c.fillText(withPath ? "My Path" : "My Sky", W / 2, 210)
    c.shadowBlur = 0
    c.font = "italic 26px " + SERIF
    c.fillStyle = "rgba(226,216,190,0.82)"
    c.fillText(withPath ? "the way I walked through it" : "a chart of what I have found", W / 2, 258)
    rule(288, 250)
    // ---- the tally
    rule(H - 262, 250)
    var cols = [
      [stars, stars === 1 ? "STAR FOUND" : "STARS FOUND"],
      [named, named === 1 ? "CONSTELLATION NAMED" : "CONSTELLATIONS NAMED"],
      [whole, whole === 1 ? "CONSTELLATION COMPLETE" : "CONSTELLATIONS COMPLETE"],
    ]
    cols.forEach(function (cl, ci) {
      var x = W / 2 + (ci - 1) * 345
      c.font = "400 66px " + SERIF
      c.fillStyle = "#f1e8d0"
      c.fillText(String(cl[0]), x, H - 168)
      c.font = "14px " + SC
      c.fillStyle = "rgba(210,196,160,0.78)"
      spaced(cl[1], x, H - 132, 2.4)
    })
    var when = ""
    try {
      when = new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
    } catch (e) {}
    c.font = "italic 19px " + SERIF
    c.fillStyle = "rgba(196,186,160,0.7)"
    c.fillText(when, W / 2, H - 92)
    c.font = "15px " + SERIF
    c.fillStyle = "rgba(160,152,132,0.66)"
    c.fillText(location.host + rootPath(), W / 2, H - 70)
    // a darker edge, to finish it
    var vg = c.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.78)
    vg.addColorStop(0, "rgba(0,0,0,0)")
    vg.addColorStop(1, "rgba(0,0,0,0.5)")
    c.fillStyle = vg
    c.fillRect(0, 0, W, H)
    cv.toBlob(function (blob) {
      if (!blob) return
      var url = URL.createObjectURL(blob)
      var a = document.createElement("a")
      a.href = url
      a.download = withPath ? "my-starfall-path.png" : "my-starfall.png"
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(function () {
        URL.revokeObjectURL(url)
      }, 4000)
    }, "image/png")
  }

  function enablePan(root, stage, worldEl, sky) {
    var Wd = sky.L.world
    var VW = 1600
    var VH = 900
    var vx = Wd.view[0]
    var vy = Wd.view[1]
    var tx = vx
    var ty = vy
    var vel = { x: 0, y: 0 }
    var drag = null
    var raf = 0
    var last = 0
    var moved = false
    var swayX = 0
    var swayY = 0
    var z = 1 // how far out the sky is seen: 1 is the opening view, less shows more of it
    var zt = 1
    var zan = null
    var WW = Wd.maxX - Wd.minX
    var WH = Wd.maxY - Wd.minY
    function sPx() {
      return stage.clientWidth / VW
    }
    // the farthest out: the whole sky fits in the window
    function zMin() {
      var s = sPx()
      var fit = Math.min(window.innerWidth / (s * WW), window.innerHeight / (s * WH))
      // the night goes on for a long way past the edge of the sky, but not for ever
      var cover = Math.max(window.innerWidth / (s * (WW + 3400)), window.innerHeight / (s * (WH + 3400)))
      return Math.max(0.12, Math.min(1, Math.max(fit, cover)))
    }
    var tall = function () {
      return window.matchMedia("(max-aspect-ratio: 1/1)").matches
    }
    var stars = Object.keys(sky.found).map(function (h) {
      var it = sky.found[h]
      return sky.L.figs[it.node.f].s[it.node.s]
    })
    var glow = { l: el("div", "sf-glow sf-glow-l"), r: el("div", "sf-glow sf-glow-r"), t: el("div", "sf-glow sf-glow-t"), b: el("div", "sf-glow sf-glow-b") }
    for (var k in glow) root.appendChild(glow[k])
    var hint = el("p", "sf-panhint", "The sky is wider than the window. I lean toward its edge, I drag it. It goes further than I thought. Ctrl and the wheel, or the buttons, take me out to see it all.")
    root.appendChild(hint)
    var hintTimer = setTimeout(function () {
      hint.classList.add("gone")
    }, 16000)

    function viewW() {
      return VW / z
    }
    function viewH() {
      return stage.clientHeight / sPx() / z
    }
    function clamp() {
      var vw = viewW()
      var vh = viewH()
      tx = vw >= WW ? (Wd.minX + Wd.maxX - vw) / 2 : Math.max(Wd.minX, Math.min(Wd.maxX - vw, tx))
      ty = vh >= WH ? (Wd.minY + Wd.maxY - vh) / 2 : Math.max(Wd.minY, Math.min(Wd.maxY - vh, ty))
    }
    function apply() {
      if (sky.backdrop) sky.backdrop.draw(vx, vy, z, swayX, swayY, sPx())
      if (sky.stars) sky.stars.draw(vx, vy, z, swayX, swayY, sPx())
      // names grow a little as the sky is taken further out, so they stay readable (not in step with the zoom)
      var nzq = Math.round(Math.min(4, Math.pow(1 / z, 0.8)) * 20) / 20
      if (nzq !== sky.nzq) {
        sky.nzq = nzq
        worldEl.style.setProperty("--nz", nzq)
      }
      worldEl.style.transformOrigin = "0 0"
      worldEl.style.transform = "translate(" + ((Wd.minX - vx) * z * 0.0625).toFixed(3) + "cqw," + ((Wd.minY - vy) * z * 0.0625).toFixed(3) + "cqw) scale(" + z.toFixed(4) + ")"
      var on = { l: false, r: false, t: false, b: false }
      var vw = viewW()
      var vh = viewH()
      stars.forEach(function (p) {
        if (p[0] < vx - 30) on.l = true
        if (p[0] > vx + vw + 30) on.r = true
        if (p[1] < vy - 30) on.t = true
        if (p[1] > vy + vh + 30) on.b = true
      })
      for (var k in glow) glow[k].classList.toggle("on", on[k])
    }
    function scale() {
      return sPx() * z
    }
    // While the sky is being moved, the small endless animations (swaying lines, flickers, motes) are held still: they repaint the
    // whole chart every frame, which is what makes dragging and zooming clunky. They pick up again where they stopped.
    var calmT = 0
    function moving(on) {
      if (on) {
        clearTimeout(calmT)
        calmT = 0
        if (!root.classList.contains("sf-moving")) {
          root.classList.add("sf-moving")
          clearTimeout(refineT)
          if (sky.voidEl && sky.voidEl.cancel) sky.voidEl.cancel()
        }
      } else if (!calmT) {
        calmT = setTimeout(function () {
          calmT = 0
          root.classList.remove("sf-moving")
        }, 180)
      }
    }
    function tick(now) {
      moving(true)
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016
      last = now
      if (Math.abs(zt - z) > 0.0004) {
        z += (zt - z) * (1 - Math.exp(-dt * 8))
        if (zan) {
          // keep the point under the cursor (or the middle of the window) where it is while the sky comes in or goes out
          var s0 = sPx() * z
          tx = zan.wx - zan.px / s0
          ty = zan.wy - zan.py / s0
          clamp()
          vx = tx
          vy = ty
        }
      } else if (z !== zt) {
        z = zt
        clamp()
        vx = tx
        vy = ty
      }
      if (vel.x || vel.y) {
        tx += (vel.x * dt) / z
        ty += (vel.y * dt) / z
        clamp()
      }
      if (fling) {
        tx += fling.x * dt
        ty += fling.y * dt
        clamp()
        var decay = Math.exp(-dt * 3.4)
        fling.x *= decay
        fling.y *= decay
        if (Math.hypot(fling.x, fling.y) < 10) fling = null
      }
      var ox = vx
      var oy = vy
      var ease = 1 - Math.exp(-dt * 7)
      vx += (tx - vx) * ease
      vy += (ty - vy) * ease
      if (Math.abs(tx - vx) < 0.2) vx = tx
      if (Math.abs(ty - vy) < 0.2) vy = ty
      // the figures drift a little behind the camera, each at its own depth, then settle: they sway, they do not change shape
      var lim = function (n) {
        return Math.max(-26, Math.min(26, n))
      }
      var se = 1 - Math.exp(-dt * 6)
      swayX += (lim((vx - ox) * 4) - swayX) * se
      swayY += (lim((vy - oy) * 4) - swayY) * se
      if (Math.abs(swayX) < 0.02) swayX = 0
      if (Math.abs(swayY) < 0.02) swayY = 0
      var swp = (swayX * sPx()).toFixed(2) + "px " + (swayY * sPx()).toFixed(2) + "px"
      ;(sky.swayEls || []).forEach(function (e2) {
        if (e2) e2.style.translate = swp
      })
      apply()
      if (vel.x || vel.y || fling || vx !== tx || vy !== ty || drag || swayX || swayY || Math.abs(zt - z) > 0.0004) raf = requestAnimationFrame(tick)
      else {
        raf = 0
        last = 0
        moving(false)
        refineVoid()
      }
    }
    var refineT = 0
    function refineVoid() {
      clearTimeout(refineT)
      refineT = setTimeout(function () {
        if (sky.voidEl && sky.voidEl.refine) sky.voidEl.refine(vx, vy, viewW(), viewH(), sPx() * z)
      }, 260)
    }
    function wake() {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    function nudged() {
      if (moved) return
      moved = true
      hint.classList.add("gone")
      root.classList.add("sf-moved")
    }

    var ptrs = {}
    var pinch = null
    var fling = null
    var samples = []
    function pinchNow() {
      var ids = Object.keys(ptrs)
      if (ids.length < 2) return null
      var a = ptrs[ids[0]]
      var b = ptrs[ids[1]]
      return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }
    function down(ev) {
      if (ev.button !== 0 || ev.target.closest("a, button") || (tall() && !stage.contains(ev.target))) return
      ptrs[ev.pointerId] = { x: ev.clientX, y: ev.clientY }
      var pn = pinchNow()
      if (pn) {
        // two fingers: closer or further, about the point between them
        pinch = { d: pn.d, z: zt }
        drag = null
        fling = null
        return
      }
      fling = null
      samples = []
      drag = { x: ev.clientX, y: ev.clientY, tx: tx, ty: ty }
      root.classList.add("sf-dragging")
      try {
        root.setPointerCapture(ev.pointerId)
      } catch (e) {}
      wake()
    }
    function move(ev) {
      if (ptrs[ev.pointerId]) {
        ptrs[ev.pointerId].x = ev.clientX
        ptrs[ev.pointerId].y = ev.clientY
      }
      if (pinch) {
        var pn = pinchNow()
        if (pn) zoomTo((pinch.z * pn.d) / pinch.d, pn.x, pn.y)
        return
      }
      if (drag) {
        var s = scale()
        tx = drag.tx - (ev.clientX - drag.x) / s
        ty = drag.ty - (ev.clientY - drag.y) / s
        clamp()
        samples.push({ t: performance.now(), x: tx, y: ty })
        if (samples.length > 6) samples.shift()
        nudged()
        wake()
        return
      }
      if (ev.pointerType !== "mouse" || tall()) return
      // resting on a link or the words is not leaning on the edge
      if (ev.target.closest && ev.target.closest("a, .sf-copy")) {
        vel.x = 0
        vel.y = 0
        return
      }
      // lean on an edge of the window and the sky drifts that way; the nearer the edge, the faster
      var m = Math.max(44, window.innerWidth * 0.04)
      var near = function (d) {
        return d < m ? 1 - Math.max(0, d) / m : 0
      }
      vel.x = (near(window.innerWidth - ev.clientX) - near(ev.clientX)) * 720
      vel.y = (near(window.innerHeight - ev.clientY) - near(ev.clientY)) * 720
      if (vel.x || vel.y) {
        nudged()
        wake()
      }
    }
    function up(ev) {
      if (ev && ev.pointerId !== undefined) delete ptrs[ev.pointerId]
      if (pinch) {
        if (Object.keys(ptrs).length < 2) pinch = null
        drag = null
        root.classList.remove("sf-dragging")
        return
      }
      // let go while moving and the sky carries on a little, slowing as it goes
      if (drag && samples.length >= 2) {
        var f0 = samples[0]
        var f1 = samples[samples.length - 1]
        var dtm = (f1.t - f0.t) / 1000
        if (dtm > 0.01 && performance.now() - f1.t < 90) {
          var fvx = (f1.x - f0.x) / dtm
          var fvy = (f1.y - f0.y) / dtm
          if (Math.hypot(fvx, fvy) > 160 && !REDUCED) {
            fling = { x: Math.max(-2600, Math.min(2600, fvx)), y: Math.max(-2600, Math.min(2600, fvy)) }
            wake()
          }
        }
      }
      samples = []
      drag = null
      root.classList.remove("sf-dragging")
    }
    function stop() {
      vel.x = 0
      vel.y = 0
    }
    function zoomTo(nz, cx, cy) {
      nz = Math.max(zMin(), Math.min(1.6, nz))
      if (Math.abs(nz - zt) < 0.0001) return
      var rect = stage.getBoundingClientRect()
      var s = sPx() * z
      var px = cx - rect.left
      var py = cy - rect.top
      zan = { px: px, py: py, wx: vx + px / s, wy: vy + py / s }
      zt = nz
      nudged()
      wake()
    }
    function zoomBy(f, cx, cy) {
      zoomTo(zt * f, cx == null ? window.innerWidth / 2 : cx, cy == null ? window.innerHeight / 2 : cy)
    }
    function wheel(ev) {
      if (tall()) return
      ev.preventDefault()
      if (ev.ctrlKey || ev.metaKey) {
        // a pinch on a trackpad, or ctrl and the wheel: closer or further
        zoomBy(Math.exp(-ev.deltaY * 0.01), ev.clientX, ev.clientY)
        return
      }
      var u = ev.deltaMode === 1 ? 16 : 1
      var s = scale()
      tx += (ev.deltaX * u * 0.8) / s
      ty += (ev.deltaY * u * 0.8) / s
      clamp()
      nudged()
      wake()
    }
    function key(ev) {
      if (ev.target.closest && ev.target.closest("input, textarea")) return
      if (ev.key === "+" || ev.key === "=") {
        ev.preventDefault()
        zoomBy(1.3)
        return
      }
      if (ev.key === "-" || ev.key === "_") {
        ev.preventDefault()
        zoomBy(1 / 1.3)
        return
      }
      if (ev.key === "0") {
        ev.preventDefault()
        zoomTo(zMin(), window.innerWidth / 2, window.innerHeight / 2)
        return
      }
      if (ev.key === "f" || ev.key === "F") {
        ev.preventDefault()
        toggleFull()
        return
      }
      var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key]
      if (!d) return
      ev.preventDefault()
      tx += (d[0] * 200) / z
      ty += (d[1] * 200) / z
      clamp()
      nudged()
      wake()
    }
    // fullscreen, and the zoom controls
    var fullBtn = null
    function toggleFull() {
      if (!root.requestFullscreen) return
      if (document.fullscreenElement) document.exitFullscreen()
      else root.requestFullscreen().catch(function () {})
    }
    var ctl = el("div", "sf-zoomctl")
    function mkBtn(label, title, fn) {
      var b = el("button", "sf-zbtn", label)
      b.type = "button"
      b.title = title
      b.setAttribute("aria-label", title)
      b.addEventListener("click", function (ev) {
        ev.stopPropagation()
        fn()
      })
      ctl.appendChild(b)
      return b
    }
    mkBtn("+", "Closer", function () {
      zoomBy(1.4)
    })
    mkBtn("\u2212", "Further out", function () {
      zoomBy(1 / 1.4)
    })
    mkBtn("The whole sky", "See all of it at once", function () {
      zoomTo(zMin(), window.innerWidth / 2, window.innerHeight / 2)
    })
    var pathOn = false
    try {
      pathOn = localStorage.getItem("sf.trail") === "1"
    } catch (e) {}
    var pathBtn = mkBtn(pathOn ? "Hide my path" : "My path", "A thread through the stars in the order you found them", function () {
      pathOn = !pathOn
      try {
        localStorage.setItem("sf.trail", pathOn ? "1" : "0")
      } catch (e) {}
      pathBtn.textContent = pathOn ? "Hide my path" : "My path"
      if (sky.stars) sky.stars.trail(pathOn)
    })
    if (sky.stars) sky.stars.trail(pathOn)
    mkBtn("Save my sky", "Make a picture of the sky you have found", function () {
      shareCard(sky, false)
    })
    mkBtn("Save my path", "Make a picture of the sky with the way you walked through it", function () {
      shareCard(sky, true)
    })
    if (root.requestFullscreen) {
      fullBtn = mkBtn("Full screen", "Fill the whole screen", toggleFull)
    }
    root.appendChild(ctl)
    var diving = false
    root.addEventListener(
      "click",
      function (ev) {
        var a = ev.target.closest && ev.target.closest("a.sf-node, a.sf-door")
        if (!a || diving || a.__go || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey || REDUCED || tall()) return
        if (window.matchMedia("(hover: none)").matches) return
        var r = a.getBoundingClientRect()
        var cx = r.left + r.width / 2
        var cy = r.top + r.height / 2
        ev.preventDefault()
        ev.stopPropagation()
        diving = true
        root.classList.add("sf-diving")
        // the sky comes in toward the star, and a light opens from it
        zoomTo(Math.min(1.6, zt * 1.8), cx, cy)
        // the sky draws in toward the star while everything else dims; then the page rises into place
        var fl = el("div", "sf-veil")
        root.appendChild(fl)
        window.__sfArrive = { t: Date.now() }
        setTimeout(function () {
          a.__go = true
          a.click()
          // if the page did not take over (a blocked link), put things back
          setTimeout(function () {
            diving = false
            root.classList.remove("sf-diving")
            if (fl.parentNode) fl.remove()
          }, 1500)
        }, 560)
      },
      true,
    )
    function onFull() {
      if (fullBtn) fullBtn.textContent = document.fullscreenElement ? "Leave full screen" : "Full screen"
      if (sky.backdrop) window.setTimeout(sky.backdrop.resize, 160)
      if (sky.stars) window.setTimeout(sky.stars.resize, 160)
      window.setTimeout(function () {
        clamp()
        vx = tx
        vy = ty
        apply()
      }, 120)
    }
    function onResize() {
      root.classList.toggle("sf-gl", !tall())
      if (sky.backdrop) sky.backdrop.resize()
      if (sky.stars) sky.stars.resize()
      zt = Math.max(zMin(), Math.min(1.6, zt))
      z = Math.max(zMin(), Math.min(1.6, z))
      clamp()
      vx = tx
      vy = ty
      apply()
    }
    var twinkle = setInterval(function () {
      if (document.hidden || !root.isConnected) return
      if (sky.backdrop) sky.backdrop.draw()
      if (sky.stars) sky.stars.draw()
    }, 160)
    document.addEventListener("fullscreenchange", onFull)
    // keep the figures' names clear of each other and of the star names, as they are when seen from furthest out
    function declutter() {
      if (tall()) return
      var fns = [].slice.call(worldEl.querySelectorAll(".sf-fname"))
      if (!fns.length) return
      var saveT = worldEl.style.transform
      var nmax = Math.min(4, Math.pow(1 / zMin(), 0.8))
      worldEl.style.transform = "none"
      worldEl.style.setProperty("--nz", nmax)
      var u = stage.clientWidth * 0.000625 // px in one chart unit
      var others = [].slice.call(worldEl.querySelectorAll(".sf-hub .sf-node-name, .sf-door-label"))
      function box(e) {
        var r = e.getBoundingClientRect()
        return r.width ? r : null
      }
      for (var pass = 0; pass < 4; pass++) {
        fns.forEach(function (d) {
          var a = box(d)
          if (!a) return
          var push = 0
          fns.concat(others).forEach(function (o) {
            if (o === d) return
            var b = box(o)
            if (!b) return
            var ox = Math.min(a.right, b.right) - Math.max(a.left, b.left)
            var oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
            if (ox > -3 && oy > -3) push += (a.top + a.bottom) / 2 < (b.top + b.bottom) / 2 ? -(oy + 6) : oy + 6
          })
          if (push) {
            var cur = parseFloat(d.dataset.dy || "0") + push / u
            d.dataset.dy = cur
            d.style.marginTop = (cur * 0.0625).toFixed(3) + "cqw"
          }
        })
      }
      worldEl.style.transform = saveT
      worldEl.style.setProperty("--nz", sky.nzq || 1)
    }
    window.setTimeout(declutter, 900)
    window.addEventListener("resize", onResize)
    var meteorTimer = 0
    var eggEl = null
    var eggTimer = 0
    function showEgg(text, isNew) {
      if (eggEl) eggEl.remove()
      clearTimeout(eggTimer)
      eggEl = el("div", "sf-egg")
      eggEl.appendChild(el("p", "sf-egg-text", text))
      eggEl.appendChild(el("p", "sf-egg-note", isNew ? "It fell into my hands. I had already written it down." : "I have caught this one before. It remembers me."))
      root.appendChild(eggEl)
      eggTimer = setTimeout(function () {
        if (eggEl) eggEl.classList.add("sf-egg-out")
        setTimeout(function () {
          if (eggEl) eggEl.remove()
          eggEl = null
        }, 1600)
      }, 9000)
    }
    function catchMeteor(m) {
      if (m.classList.contains("sf-caught")) return
      m.classList.add("sf-caught")
      var eggs = CFG.eggs || []
      if (!eggs.length) return
      var st2 = load()
      st2.eggs = st2.eggs || []
      var fresh = eggs.filter(function (e) {
        return st2.eggs.indexOf(hash(e)) === -1
      })
      var pool = fresh.length ? fresh : eggs
      var text = pool[Math.floor(Math.random() * pool.length)]
      var isNew = st2.eggs.indexOf(hash(text)) === -1
      if (isNew) {
        st2.eggs.push(hash(text))
        save(st2)
      }
      showEgg(text, isNew)
    }
    function meteor() {
      var w = window.innerWidth
      var h = window.innerHeight
      var side = Math.floor(Math.random() * 3)
      var sx, sy, ex, ey
      if (side === 0) {
        sx = w * (0.1 + Math.random() * 0.8)
        sy = -50
        ex = sx + (Math.random() - 0.3) * w * 0.7
        ey = h * (0.6 + Math.random() * 0.5)
      } else if (side === 1) {
        sx = -60
        sy = h * (0.05 + Math.random() * 0.45)
        ex = w + 60
        ey = sy + h * (0.15 + Math.random() * 0.5)
      } else {
        sx = w + 60
        sy = h * (0.05 + Math.random() * 0.45)
        ex = -60
        ey = sy + h * (0.15 + Math.random() * 0.5)
      }
      var dist = Math.hypot(ex - sx, ey - sy)
      // a shooting star keeps its proportion to the sky: smaller when the sky is seen from far off or on a small window
      var kk = Math.max(0.35, Math.min(1.6, (sPx() * z) / 0.85))
      var speed = (460 + Math.random() * 340) * (0.55 + 0.45 * kk)
      var dur = dist / speed
      var bend = (Math.random() - 0.5) * dist * 0.1
      var nx = -(ey - sy) / dist
      var ny = (ex - sx) / dist
      var path = "M" + sx.toFixed(0) + " " + sy.toFixed(0) + " Q" + ((sx + ex) / 2 + nx * bend).toFixed(0) + " " + ((sy + ey) / 2 + ny * bend).toFixed(0) + " " + ex.toFixed(0) + " " + ey.toFixed(0)
      var m = el("div", "sf-meteor")
      m.style.offsetPath = 'path("' + path + '")'
      m.style.setProperty("--tl", ((90 + Math.random() * 90) * kk).toFixed(0) + "px")
      m.style.setProperty("--mk", kk.toFixed(2))
      m.style.setProperty("--dur", dur.toFixed(2) + "s")
      if ((CFG.eggs || []).length) {
        // quick fingers can catch it
        var hit = el("span", "sf-meteor-hit")
        m.appendChild(hit)
        m.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation()
          ev.preventDefault()
          // hold it exactly where it is, then let it flare and fade
          var at = getComputedStyle(m).offsetDistance
          m.style.animation = "none"
          m.style.offsetDistance = at
          m.style.pointerEvents = "none"
          void m.offsetWidth
          m.style.animation = "sf-mcatch 1s ease-out forwards"
          catchMeteor(m)
        })
      }
      // fixed to the window itself, outside the sky's own layers, so it never moves with the camera (in full screen only the
      // full-screen element is drawn, so it goes in there)
      ;(document.fullscreenElement || document.body).appendChild(m)
      setTimeout(function () {
        m.remove()
      }, dur * 1000 + 600)
      if (Math.random() < 0.2) setTimeout(meteor, 450 + Math.random() * 600)
    }
    function nextMeteor() {
      meteorTimer = setTimeout(function () {
        if (!document.hidden && !tall()) meteor()
        nextMeteor()
      }, 9000 + Math.random() * 10000)
    }
    nextMeteor()
    root.addEventListener("pointerdown", down)
    root.addEventListener("pointermove", move)
    root.addEventListener("pointerup", up)
    root.addEventListener("pointercancel", up)
    document.documentElement.addEventListener("pointerleave", stop)
    root.addEventListener("wheel", wheel, { passive: false })
    document.addEventListener("keydown", key)
    window.setTimeout(refineVoid, 3500)
    window.addEventListener("resize", refineVoid)
    document.addEventListener("fullscreenchange", refineVoid)
    cleanup(function () {
      window.removeEventListener("resize", refineVoid)
      document.removeEventListener("fullscreenchange", refineVoid)
      cancelAnimationFrame(raf)
      clearTimeout(hintTimer)
      clearTimeout(meteorTimer)
      clearTimeout(eggTimer)
      clearTimeout(refineT)
      document.querySelectorAll(".sf-meteor").forEach(function (m) {
        m.remove()
      })
      document.removeEventListener("keydown", key)
      document.removeEventListener("fullscreenchange", onFull)
      window.removeEventListener("resize", onResize)
      clearInterval(twinkle)
      document.documentElement.removeEventListener("pointerleave", stop)
      if (document.fullscreenElement === root) document.exitFullscreen()
    })
    apply()
  }

  // ---------- the satchel: keep, carry or forget your notes ----------
  function buildTools() {
    var tools = el("div", "sf-tools")
    var exp = el("button", "sf-btn", "Bind my memory into a sigil")
    var imp = el("button", "sf-btn", "Break a sigil to remember")
    var rst = el("button", "sf-btn sf-btn-danger", "Let it all go dark")
    exp.type = imp.type = rst.type = "button"
    var area = el("textarea", "sf-code")
    area.placeholder = "Lay the sigil here, then break it."
    area.style.display = "none"
    exp.addEventListener("click", function () {
      var code = btoa(unescape(encodeURIComponent(JSON.stringify(load()))))
      area.style.display = "block"
      area.value = code
      area.select()
      try {
        navigator.clipboard.writeText(code)
        exp.textContent = "Bound. Keep it safe."
        setTimeout(function () {
          exp.textContent = "Bind my memory into a sigil"
        }, 1500)
      } catch (e) {}
    })
    imp.addEventListener("click", function () {
      if (area.style.display === "none" || imp.textContent !== "Break it") {
        area.style.display = "block"
        area.value = ""
        area.focus()
        imp.textContent = "Break it"
        return
      }
      try {
        var parsed = JSON.parse(decodeURIComponent(escape(atob(area.value.trim()))))
        if (!parsed || !parsed.pages) throw new Error("bad")
        save(parsed)
        location.reload()
      } catch (e) {
        imp.textContent = "That sigil is not mine"
        setTimeout(function () {
          imp.textContent = "Break it"
        }, 1800)
      }
    })
    rst.addEventListener("click", function () {
      if (confirm("Let it all go dark? The pages will not be there when I look again.")) {
        try {
          localStorage.removeItem(KEY)
        } catch (e) {}
        location.reload()
      }
    })
    tools.appendChild(exp)
    tools.appendChild(imp)
    tools.appendChild(rst)
    tools.appendChild(area)
    return tools
  }

  // ---------- the explorer's bar: where to go from anywhere ----------
  function renderBar(st, slug) {
    var old = document.getElementById("sf-bar")
    if (old) old.remove()
    var onLanding = slug === CFG.landingSlug
    var bar = el("nav", "sf-bar" + (onLanding ? " sf-bar-landing" : ""))
    bar.id = "sf-bar"
    bar.setAttribute("aria-label", "Explorer")
    if (!onLanding) {
      var home = el("a", "sf-bar-btn", "The sky")
      home.href = rootPath() + "/"
      bar.appendChild(home)
      var back = el("button", "sf-bar-btn", "← Back")
      back.type = "button"
      back.addEventListener("click", function () {
        if (history.length > 1) history.back()
        else location.href = rootPath() + "/"
      })
      bar.appendChild(back)
      // the way you came, as a trail
      var came = (st.recent || [])
        .filter(function (s) {
          return s !== slug && st.pages[s]
        })
        .slice(-3)
      if (came.length) {
        var crumbs = el("span", "sf-crumbs")
        crumbs.appendChild(el("span", "sf-crumbs-lead", "you came by"))
        came.forEach(function (s) {
          var a = el("a", "sf-crumb internal", st.pages[s].t || s)
          a.href = hrefFor(s)
          a.dataset.slug = s
          crumbs.appendChild(a)
          crumbs.appendChild(el("span", "sf-crumb-sep", "›"))
        })
        crumbs.appendChild(el("span", "sf-crumb-here", slug === CFG.journalSlug ? "notes" : (st.pages[slug] && st.pages[slug].t) || ""))
        bar.appendChild(crumbs)
      }
    }
    bar.appendChild(el("span", "sf-bar-gap"))
    if (!onLanding) {
      var chart = el("button", "sf-bar-btn", "◌ Chart")
      chart.type = "button"
      chart.addEventListener("click", function () {
        var open = document.getElementById("sf-landing")
        if (open) furlChart(open)
        else renderLanding(load(), { chart: true })
      })
      bar.appendChild(chart)
    }
    var n = discoveredCount(st)
    var jn = el("a", "sf-bar-btn", "✎ Notes" + (n ? " (" + n + ")" : ""))
    jn.href = hrefFor(CFG.journalSlug)
    bar.appendChild(jn)
    var satchel = el("button", "sf-bar-btn", "Satchel")
    satchel.type = "button"
    var panel = el("div", "sf-satchel")
    panel.style.display = "none"
    panel.appendChild(el("p", "sf-satchel-text", "In case I stop knowing what I know. I keep it somewhere that is not me."))
    panel.appendChild(buildTools())
    satchel.addEventListener("click", function () {
      panel.style.display = panel.style.display === "none" ? "block" : "none"
    })
    bar.appendChild(satchel)
    bar.appendChild(panel)
    document.body.appendChild(bar)
    document.body.classList.add("sf-has-bar")
  }

  // ---------- the explorer's notes (the journal) ----------
  var OPEN_LINES = ["Started at {t}.", "First one: {t}.", "Went in through {t}."]
  var FROM_LINES = [
    "{f} led me to {t}.",
    "Followed a line in {f}. Ended up at {t}.",
    "From {f}, on to {t}.",
    "{t}, by way of {f}.",
    "Could not leave {f} alone. It took me to {t}.",
  ]
  var CHANCE_LINES = ["Ended up at {t}. Cannot say how.", "{t}. No idea how I got here.", "Somehow at {t}."]
  var ODD_MARGINS = ["the ink was still wet", "who else has been here?", "I wrote this twice", "it knew my name", "this was not here yesterday", "I am sure I have read this before"]
  // a plain ink dot to begin each entry
  function sparkleSvg(h) {
    var s = svg("svg", { viewBox: "0 0 20 20", class: "sf-doodle", "aria-hidden": "true" })
    s.appendChild(svg("circle", { cx: "10", cy: "10", r: (2.6 + (h % 3) * 0.25).toFixed(2) }))
    return s
  }
  function fillLine(p, template, parts) {
    template.split(/(\{[tf]\})/).forEach(function (bit) {
      if (bit === "{t}" || bit === "{f}") {
        var info = parts[bit === "{t}" ? "t" : "f"]
        var a = el("a", "sf-ink internal", info.title)
        a.href = hrefFor(info.slug)
        a.dataset.slug = info.slug
        p.appendChild(a)
      } else if (bit) p.appendChild(document.createTextNode(bit))
    })
  }
  function tallyEl(n) {
    var box = el("span", "sf-tally")
    box.title = "Went back " + n + (n === 1 ? " time" : " times")
    var full = Math.floor(n / 5)
    for (var i = 0; i < full; i++) box.appendChild(el("span", "sf-t5", "||||"))
    if (n % 5) box.appendChild(el("span", "sf-t1", new Array((n % 5) + 1).join("|")))
    return box
  }

  function renderJournal(st) {
    var art = document.querySelector("article")
    if (!art) return
    ensureLandingFont()
    art.innerHTML = ""
    var sky = skyFor(st)
    var n = discoveredCount(st)
    var book = el("div", "sf-notes")

    var head = el("header", "sf-notes-head")
    head.appendChild(el("p", "sf-notes-kick", "If found, put it back where it was."))
    head.appendChild(el("h1", "sf-notes-title", "Notes"))
    head.appendChild(
      el(
        "p",
        "sf-notes-sub",
        n
          ? (n === 1 ? "One so far" : n + " so far") + ". I keep a list so I do not read the same thing twice. I have anyway."
          : "Nothing yet. Nothing worth writing down.",
      ),
    )
    var row = el("p", "sf-notes-row")
    var chartBtn = el("button", "sf-ink-btn", "see the chart")
    chartBtn.type = "button"
    chartBtn.addEventListener("click", function () {
      renderLanding(load(), { chart: true })
    })
    var skyLink = el("a", "sf-ink-btn", "back to the sky")
    skyLink.href = rootPath() + "/"
    row.appendChild(chartBtn)
    row.appendChild(skyLink)
    head.appendChild(row)
    book.appendChild(head)

    // in my own hand
    var mine = el("section", "sf-day sf-mine")
    mine.appendChild(el("h2", "sf-day-title", "Things to remember"))
    mine.appendChild(el("p", "sf-keep-text", "Not from the pages. Mine."))
    var hand = el("textarea", "sf-hand")
    hand.rows = 5
    hand.placeholder = "Write it down before I forget."
    hand.value = st.draft || ""
    var draftTimer = 0
    hand.addEventListener("input", function () {
      clearTimeout(draftTimer)
      draftTimer = setTimeout(function () {
        var s3 = load()
        s3.draft = hand.value
        save(s3)
      }, 400)
    })
    var setDown = el("button", "sf-ink-btn", "write it in")
    setDown.type = "button"
    var written = el("div", "sf-written")
    function drawMine() {
      written.innerHTML = ""
      var s4 = load()
      ;(s4.mine || [])
        .slice()
        .reverse()
        .forEach(function (m, ri, arr) {
          var idx = arr.length - 1 - ri
          var box = el("div", "sf-mine-entry")
          var dt = ""
          try {
            dt = new Date(m.at).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
          } catch (e) {}
          box.appendChild(el("span", "sf-mine-date", dt))
          box.appendChild(el("p", "sf-mine-text", m.text))
          var tear = el("button", "sf-tear", "tear it out")
          tear.type = "button"
          tear.addEventListener("click", function () {
            var s5 = load()
            s5.mine = (s5.mine || []).filter(function (_, k) {
              return k !== idx
            })
            save(s5)
            drawMine()
          })
          box.appendChild(tear)
          written.appendChild(box)
        })
    }
    setDown.addEventListener("click", function () {
      var text = hand.value.trim()
      if (!text) return
      var s6 = load()
      s6.mine = s6.mine || []
      s6.mine.push({ at: Date.now(), text: text })
      s6.draft = ""
      save(s6)
      hand.value = ""
      drawMine()
    })
    mine.appendChild(hand)
    mine.appendChild(setDown)
    mine.appendChild(written)
    drawMine()
    book.appendChild(mine)

    // the entries, a day at a time
    var slugs = Object.keys(st.pages).sort(function (a, b) {
      return st.pages[b].at - st.pages[a].at
    })
    var lastDay = ""
    var sheet = null
    slugs.forEach(function (slug) {
      var rec = st.pages[slug]
      var dayKey = new Date(rec.at).toDateString()
      if (dayKey !== lastDay) {
        lastDay = dayKey
        sheet = el("section", "sf-day")
        var heading = ""
        try {
          heading = new Date(rec.at).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
        } catch (e) {}
        sheet.appendChild(el("h2", "sf-day-title", heading))
        book.appendChild(sheet)
      }
      var h = hash(slug)
      var entry = el("div", "sf-line")
      entry.appendChild(sparkleSvg(h))
      var p = el("p", "sf-entry-text")
      var me = { title: rec.t || prettySeg(slug.split("/").pop()), slug: slug }
      var template
      var parts = { t: me }
      if (rec.f && st.pages[rec.f]) {
        parts.f = { title: st.pages[rec.f].t || rec.f, slug: rec.f }
        template = FROM_LINES[h % FROM_LINES.length]
      } else if (entrySlugs[slug]) template = OPEN_LINES[h % OPEN_LINES.length]
      else template = CHANCE_LINES[h % CHANCE_LINES.length]
      fillLine(p, template, parts)
      if (rec.n > 1) {
        p.appendChild(document.createTextNode(" Back here again: "))
        p.appendChild(tallyEl(rec.n - 1))
        p.appendChild(document.createTextNode("."))
      }
      entry.appendChild(p)
      if (st.marg && st.marg[slug]) entry.appendChild(el("span", "sf-margin sf-margin-mine", "\u21b3 " + st.marg[slug]))
      // a note in the margin when the page belongs to a constellation the reader has named
      var found = sky.found[h]
      if (found) {
        var fi = found.node.f
        var fig = sky.L.figs[fi]
        if (fig && fig.k !== "erased" && sky.count[fi] >= 2) entry.appendChild(el("span", "sf-margin", "↳ under " + fig.n))
        else if (h % 9 === 0) entry.appendChild(el("span", "sf-margin sf-margin-odd", ODD_MARGINS[(h >>> 5) % ODD_MARGINS.length]))
      } else if (h % 9 === 0) entry.appendChild(el("span", "sf-margin sf-margin-odd", ODD_MARGINS[(h >>> 5) % ODD_MARGINS.length]))
      sheet.appendChild(entry)
    })

    // the figures the reader has put a name to
    var named = sky.L.figs.filter(function (f, fi) {
      return f.k !== "erased" && sky.count[fi] >= 2
    })
    if (named.length) {
      var cs = el("section", "sf-day sf-figs")
      cs.appendChild(el("h2", "sf-day-title", "Patterns"))
      named.forEach(function (f) {
        var fi = sky.L.figs.indexOf(f)
        var item = el("p", "sf-fig-note")
        item.appendChild(el("span", "sf-fig-name", f.n))
        if (sky.count[fi] >= 3) item.appendChild(el("span", "sf-fig-meaning", " — " + f.m))
        cs.appendChild(item)
      })
      book.appendChild(cs)
    }

    // words that fell from the sky into the reader's hands
    var eggs = (CFG.eggs || []).filter(function (e) {
      return (st.eggs || []).indexOf(hash(e)) !== -1
    })
    if (eggs.length) {
      var es = el("section", "sf-day sf-fallen")
      es.appendChild(el("h2", "sf-day-title", "Things I caught"))
      eggs.forEach(function (e) {
        es.appendChild(el("p", "sf-fallen-line", e))
      })
      book.appendChild(es)
    }

    var keep = el("section", "sf-day sf-keep")
    keep.appendChild(el("h2", "sf-day-title", "In case I lose this"))
    keep.appendChild(el("p", "sf-keep-text", "If I lose this I lose all of it. Copy it somewhere."))
    keep.appendChild(buildTools())
    book.appendChild(keep)
    art.appendChild(book)
  }

  // ---------- main ----------
  function onNav() {
    var slug = curSlug()
    var st = load()

    document.body.classList.remove("sf-sealed-page")
    document.body.classList.toggle("sf-journal-page", slug === CFG.journalSlug)
    var reading = slug !== CFG.landingSlug && slug !== CFG.journalSlug
    document.body.classList.toggle("sf-reading", reading)
    var navEl = document.querySelector(".sf-nav")
    if (reading) {
      var th = (navEl && navEl.dataset.theme) || "archive"
      document.body.setAttribute("data-sf-theme", th)
      document.body.classList.toggle("sf-flicker", ["archive", "scroll", "molten-imperium", "notebook", "scrap", "ashen", "chapbook", "archivist-binder"].indexOf(th) !== -1)
    }
    else document.body.removeAttribute("data-sf-theme")
    if (reading) ensureLandingFont()
    // arriving from a star: the page rises into place out of the dark
    var arr = window.__sfArrive
    window.__sfArrive = null
    if (reading && arr && Date.now() - arr.t < 5000 && !REDUCED) {
      document.body.classList.add("sf-arrive")
      setTimeout(function () {
        document.body.classList.remove("sf-arrive")
      }, 1500)
    }
    if (slug === CFG.landingSlug) {
      renderLanding(st)
      renderBar(st, slug)
      updateNav(st)
      return
    }
    if (slug === CFG.journalSlug) {
      renderJournal(st)
      renderBar(st, slug)
      updateNav(st)
      return
    }

    var allowed = DEV || !!st.pages[slug] || !!entrySlugs[slug] || !!isFrontier(st, slug)
    if (!allowed) {
      sealPage()
      renderBar(st, slug)
      updateNav(st)
      return
    }
    track(st, slug)
    buildFront()
    veilLinks(st, slug)
    showTrail(st, slug)
    buildMargin(st, slug)
    buildRibbon(st, slug)
    buildDeco()
    if (document.body.getAttribute("data-sf-theme") === "scrap") roughUp(slug)
    renderBar(st, slug)
    updateNav(st)
  }

  document.addEventListener("nav", onNav)
})()
