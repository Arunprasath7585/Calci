/* =====================================================================
   SCIENTIFIC CALCULATOR: LOGIC
   No libraries. The expression parser is written by hand (no eval).
   Sections: formatting, math helpers, tokenizer, parser, display,
             editing, keypad definitions, keyboard, start-up.
   ===================================================================== */
(function () {
  "use strict";

  var MAXDIGITS = 12;   // digit count that lights the whole rev bar
  var $ = function (id) { return document.getElementById(id); };

  var inp = $("expr"), resEl = $("result"), revEl = $("rev");
  var chipAngle = $("chipAngle"), chip2nd = $("chip2nd"), chipMem = $("chipMem");
  for (var ti = 0; ti < 14; ti++) { var tk = document.createElement("i"); tk.style.height = (7 + ti * 1.1) + "px"; revEl.appendChild(tk); }   // digit-scale ticks


  var mode = "deg";     // "deg" or "rad"
  var second = false;   // 2nd function layer on or off
  var done = false;     // true while a finished result is on screen
  var ans = 0;          // last answer (the Ans key)
  var mem = 0;          // memory register


  /* ---------- number formatting ---------- */

  // Round away floating point noise, switch to E notation for huge/tiny values.
  function toStr(x) {
    var c = parseFloat(x.toPrecision(12));
    if (c === 0) return "0";
    var a = Math.abs(c);
    if (a >= 1e15 || a < 1e-7) {
      return c.toExponential(8).replace(/\.?0+e/, "e").replace("e+", "E").replace("e", "E");
    }
    return String(c);
  }

  // Add thousands separators for display only.
  function fmtDisp(s) {
    if (/E/.test(s)) return s;
    var neg = s.charAt(0) === "-";
    var body = neg ? s.slice(1) : s;
    var p = body.split(".");
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-" : "") + p.join(".");
  }


  /* ---------- math helpers ---------- */

  function fail(msg) { throw new Error(msg); }
  function angIn(x)  { return mode === "deg" ? x * Math.PI / 180 : x; }
  function angOut(x) { return mode === "deg" ? x * 180 / Math.PI : x; }
  function snap(x)   { return Math.abs(x) < 1e-15 ? 0 : x; }   // sin(180 deg) = 0, not 1.2e-16

  function tan(x) {
    var a = angIn(x);
    if (Math.abs(Math.cos(a)) < 1e-15) fail("Math error");
    return snap(Math.tan(a));
  }

  // Lanczos approximation, so factorial also works for non-whole numbers.
  var G = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
           -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function gamma(z) {
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    z -= 1;
    var x = G[0];
    for (var i = 1; i < 9; i++) x += G[i] / (z + i);
    var t = z + 7.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }
  function fact(n) {
    if (n < 0 && Math.floor(n) === n) fail("Math error");
    if (Math.floor(n) === n) {
      if (n > 170) fail("Overflow");
      var r = 1;
      for (var i = 2; i <= n; i++) r *= i;
      return r;
    }
    return gamma(n + 1);
  }
  function needInts(n, k) {
    if (Math.floor(n) !== n || Math.floor(k) !== k || n < 0 || k < 0 || k > n) fail("Math error");
  }

  // One-argument functions
  var F1 = {
    sin:  function (x) { return snap(Math.sin(angIn(x))); },
    cos:  function (x) { return snap(Math.cos(angIn(x))); },
    tan:  tan,
    asin: function (x) { if (Math.abs(x) > 1) fail("Math error"); return angOut(Math.asin(x)); },
    acos: function (x) { if (Math.abs(x) > 1) fail("Math error"); return angOut(Math.acos(x)); },
    atan: function (x) { return angOut(Math.atan(x)); },
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh,
    acosh: function (x) { if (x < 1) fail("Math error"); return Math.acosh(x); },
    atanh: function (x) { if (Math.abs(x) >= 1) fail("Math error"); return Math.atanh(x); },
    ln:   function (x) { if (x <= 0) fail("Math error"); return Math.log(x); },
    log:  function (x) { if (x <= 0) fail("Math error"); return Math.log10(x); },
    sqrt: function (x) { if (x < 0) fail("Math error"); return Math.sqrt(x); },
    cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp,
    floor: Math.floor, ceil: Math.ceil, round: Math.round
  };

  // Two-argument functions, written comb(n,k) and perm(n,k)
  var F2 = {
    comb: function (n, k) {
      needInts(n, k);
      var r = 1;
      for (var i = 1; i <= k; i++) r = r * (n - k + i) / i;
      return Math.round(r);
    },
    perm: function (n, k) {
      needInts(n, k);
      var r = 1;
      for (var i = 0; i < k; i++) r *= (n - i);
      return r;
    }
  };


  /* ---------- tokenizer ---------- */

  function tokenize(src) {
    var s = src.replace(/\s+/g, ""), i = 0, out = [], m, c;
    var opMap = { "−": "-", "×": "*", "÷": "/" };
    while (i < s.length) {
      c = s.charAt(i);
      if (/[0-9.]/.test(c)) {
        m = /^(?:\d+\.?\d*|\.\d+)(?:E[+\-−]?\d+)?/.exec(s.slice(i));
        if (!m || s.charAt(i + m[0].length) === ".") fail("Syntax error");
        out.push({ k: "n", v: parseFloat(m[0].replace("−", "-")) });
        i += m[0].length;
      } else if (/[A-Za-z]/.test(c)) {
        m = /^[A-Za-z]+/.exec(s.slice(i));
        out.push({ k: "id", v: m[0] });
        i += m[0].length;
      } else if (c === "π") { out.push({ k: "id", v: "pi" });   i++; }
      else if (c === "√")   { out.push({ k: "id", v: "sqrt" }); i++; }
      else if (c === "∛")   { out.push({ k: "id", v: "cbrt" }); i++; }
      else if ("+-−×*÷/^!%(),".indexOf(c) >= 0) {
        out.push({ k: "op", v: opMap[c] || c });
        i++;
      } else fail("Syntax error");
    }
    return out;
  }


  /* ---------- parser and evaluator ----------
     expr    = term   (("+" | "-") term)*
     term    = unary  (("*" | "/" | "mod" | implicit multiply) unary)*
     unary   = ("-" | "+") unary | power
     power   = postfix ("^" unary)?
     postfix = primary ("!" | "%")*
     primary = number | constant | function(args) | "(" expr ")"            */

  function evaluate(src) {
    var t = tokenize(src), p = 0;
    if (!t.length) fail("Syntax error");

    function isOp(v) { var x = t[p]; return !!x && x.k === "op" && x.v === v; }
    function isMod() { var x = t[p]; return !!x && x.k === "id" && x.v === "mod"; }
    function startsOperand() {
      var x = t[p];
      return !!x && !isMod() && (x.k === "n" || x.k === "id" || (x.k === "op" && x.v === "("));
    }
    function closeParen() { if (isOp(")")) p++; }   // missing ")" at the end is forgiven

    function expr() {
      var l = term();
      while (isOp("+") || isOp("-")) {
        var o = t[p++].v, r = term();
        l = o === "+" ? l + r : l - r;
      }
      return l;
    }
    function term() {
      var l = unary();
      for (;;) {
        if (isOp("*") || isOp("/")) {
          var o = t[p++].v, r = unary();
          if (o === "/") { if (r === 0) fail("Cannot divide by zero"); l = l / r; }
          else l = l * r;
        } else if (isMod()) {
          p++;
          var d = unary();
          if (d === 0) fail("Cannot divide by zero");
          l = l - d * Math.floor(l / d);
        } else if (startsOperand()) {
          l = l * unary();        // 2(3+4), 2pi, 3sin(30)
        } else break;
      }
      return l;
    }
    function unary() {
      if (isOp("-")) { p++; return -unary(); }
      if (isOp("+")) { p++; return unary(); }
      return power();
    }
    function power() {
      var b = postfix();
      if (isOp("^")) { p++; return Math.pow(b, unary()); }
      return b;
    }
    function postfix() {
      var v = primary();
      for (;;) {
        if (isOp("!")) { p++; v = fact(v); }
        else if (isOp("%")) { p++; v = v / 100; }
        else break;
      }
      return v;
    }
    function primary() {
      var x = t[p];
      if (!x) fail("Syntax error");
      if (x.k === "n") { p++; return x.v; }
      if (x.k === "op" && x.v === "(") { p++; var v = expr(); closeParen(); return v; }
      if (x.k === "id") {
        p++;
        var n = x.v;
        if (n === "pi")  return Math.PI;
        if (n === "e")   return Math.E;
        if (n === "Ans") return ans;
        if (F1[n]) {
          var a;
          if (isOp("(")) { p++; a = expr(); closeParen(); } else a = postfix();
          return F1[n](a);
        }
        if (F2[n]) {
          if (!isOp("(")) fail("Syntax error");
          p++;
          var a1 = expr();
          if (!isOp(",")) fail("Syntax error");
          p++;
          var a2 = expr();
          closeParen();
          return F2[n](a1, a2);
        }
      }
      fail("Syntax error");
    }

    var result = expr();
    if (p < t.length) fail("Syntax error");
    if (isNaN(result)) fail("Math error");
    if (!isFinite(result)) fail("Overflow");
    return result;
  }


  /* ---------- display ---------- */

  function setRev(str) {
    var digits = (str || "").split("E")[0].replace(/[^0-9]/g, "").length;
    var lit = Math.min(14, Math.round(digits / MAXDIGITS * 14));
    for (var i = 0; i < 14; i++) {
      revEl.children[i].className = i < lit ? "on" + (i >= 9 ? " hot" : "") + (i >= 12 ? " red" : "") : "";
    }
  }
  function showResult(str, cls) {
    var d = fmtDisp(str);
    resEl.textContent = d;
    resEl.className = "result" + (cls ? " " + cls : "") + (d.length > 13 ? " long" : "");
    setRev(str);
  }
  function showError(msg) {
    resEl.textContent = msg;
    resEl.className = "result err";
    setRev("");
  }

  // Returns the number currently shown (finished result or live preview), or null.
  function shownValue() {
    if (done) return ans;
    var s = inp.value.trim();
    if (!s) return 0;
    try { return evaluate(s); } catch (e) { return null; }
  }

  function update() {
    chipAngle.textContent = mode === "deg" ? "Deg" : "Rad";
    chip2nd.classList.toggle("on", second);
    chipMem.classList.toggle("on", mem !== 0);
    if (done) { showResult(toStr(ans), ""); return; }
    var s = inp.value.trim();
    if (!s) { showResult("0", "preview"); return; }
    try { showResult(toStr(evaluate(s)), "preview"); }
    catch (e) { resEl.textContent = " "; resEl.className = "result preview"; setRev(""); }
  }


  /* ---------- editing ---------- */

  var OPSTART = "+−×÷^!%";                       // keys that continue from Ans
  var KEYMAP  = { "*": "×", "/": "÷", "-": "−" };  // typed symbol -> display symbol
  function setCaret(p) { try { inp.setSelectionRange(p, p); } catch (e) {} }

  function insert(text) {
    if (done) {
      // after "=": an operator continues from the answer, anything else starts fresh
      done = false;
      var continues = OPSTART.indexOf(text.charAt(0)) >= 0 || /^\s*mod/.test(text);
      inp.value = continues ? "Ans" + text : text;
      setCaret(inp.value.length);
    } else {
      var v = inp.value;
      var s = typeof inp.selectionStart === "number" ? inp.selectionStart : v.length;
      var e = typeof inp.selectionEnd === "number" ? inp.selectionEnd : s;
      inp.value = v.slice(0, s) + text + v.slice(e);
      setCaret(s + text.length);
    }
    inp.focus();
    update();
  }

  function back() {
    done = false;
    var v = inp.value, s = inp.selectionStart, e = inp.selectionEnd;
    if (s === e) {
      if (s === 0) { update(); return; }
      inp.value = v.slice(0, s - 1) + v.slice(e);
      setCaret(s - 1);
    } else {
      inp.value = v.slice(0, s) + v.slice(e);
      setCaret(s);
    }
    inp.focus();
    update();
  }

  function moveCaret(delta) {
    var p = Math.max(0, Math.min(inp.value.length, inp.selectionStart + delta));
    setCaret(p);
    inp.focus();
  }

  function clearAll() { done = false; inp.value = ""; inp.focus(); update(); }

  function equals() {
    var src = inp.value.trim();
    if (!src) return;
    var v;
    try { v = evaluate(src); } catch (e) { showError(e.message); return; }
    ans = parseFloat(toStr(v));
    done = true;
    setCaret(inp.value.length);
    update();
  }

  // Memory keys
  function memOp(kind) {
    if (kind === "MC") { mem = 0; update(); return; }
    if (kind === "MR") { insert(toStr(mem)); return; }
    var cv = shownValue();
    if (cv === null) { showError("Syntax error"); return; }
    if (kind === "MS") mem = cv;
    else if (kind === "M+") mem += cv;
    else if (kind === "M−") mem -= cv;
    mem = parseFloat(toStr(mem));
    update();
  }

  // Copy button
  var copyTimer;
  function flashCopy(label) {
    var b = $("btnCopy");
    b.textContent = label;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(function () { b.textContent = "Copy"; }, 1200);
  }
  function copyResult() {
    var v = shownValue();
    if (v === null) { flashCopy("No result"); return; }
    var text = toStr(v);
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      flashCopy(ok ? "Copied" : "Press Ctrl+C");
      inp.focus();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flashCopy("Copied"); }, fallback);
    } else fallback();
  }


  /* ---------- keypad definitions ----------
     t = label, ins = text inserted, t2/ins2 = label/text when 2nd is on,
     cls = style class, kind/mem = special action                          */

  var SCI = [
    { t: "2nd", kind: "second", cls: "tog" },
    { t: "DEG", kind: "angle", cls: "tog" },
    { t: "π", ins: "π" },
    { t: "e", ins: "e" },
    { t: "Rand", kind: "rand", cls: "dim" },

    { t: "sin", ins: "sin(", t2: "sin⁻¹", ins2: "asin(" },
    { t: "cos", ins: "cos(", t2: "cos⁻¹", ins2: "acos(" },
    { t: "tan", ins: "tan(", t2: "tan⁻¹", ins2: "atan(" },
    { t: "ln",  ins: "ln(",  t2: "eˣ",  ins2: "exp(" },
    { t: "log", ins: "log(", t2: "10ˣ", ins2: "10^(" },

    { t: "sinh", ins: "sinh(", t2: "sinh⁻¹", ins2: "asinh(" },
    { t: "cosh", ins: "cosh(", t2: "cosh⁻¹", ins2: "acosh(" },
    { t: "tanh", ins: "tanh(", t2: "tanh⁻¹", ins2: "atanh(" },
    { t: "x³", ins: "^3" },
    { t: "∛x", ins: "∛(" },

    { t: "x²", ins: "^2" },
    { t: "√x", ins: "√(" },
    { t: "xʸ", ins: "^" },
    { t: "1/x", ins: "^(−1)" },
    { t: "n!", ins: "!" },

    { t: "|x|", ins: "abs(", cls: "dim" },
    { t: "nCr", ins: "comb(", cls: "dim" },
    { t: "nPr", ins: "perm(", cls: "dim" },
    { t: "EE", ins: "E", cls: "dim" },
    { t: "Ans", ins: "Ans", cls: "dim" },

    { t: "MC", mem: "MC", cls: "mem" },
    { t: "MR", mem: "MR", cls: "mem" },
    { t: "M+", mem: "M+", cls: "mem" },
    { t: "M−", mem: "M−", cls: "mem" },
    { t: "MS", mem: "MS", cls: "mem" },

    { t: "mod", ins: " mod ", cls: "dim" },
    { t: "ʸ√x", ins: "^(1/", cls: "dim" },
    { t: "⌊x⌋", ins: "floor(", cls: "dim" },
    { t: "⌈x⌉", ins: "ceil(", cls: "dim" },
    { t: "rnd", ins: "round(", cls: "dim" }
  ];

  var NUM = [
    { t: "AC", kind: "clear", cls: "fn", label: "All clear" },
    { t: "⌫", kind: "back", cls: "fn", label: "Delete" },
    { t: "(", ins: "(", cls: "fn" },
    { t: ")", ins: ")", cls: "fn" },

    { t: "7", ins: "7", cls: "digit" }, { t: "8", ins: "8", cls: "digit" }, { t: "9", ins: "9", cls: "digit" },
    { t: "÷", ins: "÷", cls: "op", label: "Divide" },

    { t: "4", ins: "4", cls: "digit" }, { t: "5", ins: "5", cls: "digit" }, { t: "6", ins: "6", cls: "digit" },
    { t: "×", ins: "×", cls: "op", label: "Multiply" },

    { t: "1", ins: "1", cls: "digit" }, { t: "2", ins: "2", cls: "digit" }, { t: "3", ins: "3", cls: "digit" },
    { t: "−", ins: "−", cls: "op", label: "Subtract" },

    { t: "0", ins: "0", cls: "digit" },
    { t: ".", ins: ".", cls: "digit", label: "Decimal point" },
    { t: "%", ins: "%", cls: "fn", label: "Percent" },
    { t: "+", ins: "+", cls: "op", label: "Add" },

    { t: ",", ins: ",", cls: "fn", label: "Comma" },
    { t: "=", kind: "eq", cls: "eq", label: "Equals" }
  ];

  var secondBtns = [];
  function build(host, list) {
    list.forEach(function (d) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = d.t;
      if (d.cls) b.className = d.cls;
      if (d.label) b.setAttribute("aria-label", d.label);
      b._d = d;
      if (d.t2) secondBtns.push(b);
      host.appendChild(b);
    });
  }
  build($("sci"), SCI);
  build($("num"), NUM);

  function press(d, b) {
    if (d.kind === "second") {
      second = !second;
      b.classList.toggle("on", second);
      secondBtns.forEach(function (x) { x.textContent = second ? x._d.t2 : x._d.t; });
      update();
    } else if (d.kind === "angle") {
      mode = mode === "deg" ? "rad" : "deg";
      b.textContent = mode === "deg" ? "DEG" : "RAD";
      b.classList.toggle("on", mode === "rad");
      update();
    } else if (d.kind === "rand") {
      insert(String(Math.round(Math.random() * 1e6) / 1e6));
    } else if (d.kind === "clear") clearAll();
    else if (d.kind === "back") back();
    else if (d.kind === "eq") equals();
    else if (d.mem) memOp(d.mem);
    else if (second && d.ins2) insert(d.ins2);
    else if (d.ins) insert(d.ins);
  }

  // Keep the cursor in the display when a key is pressed with the mouse.
  [$("sci"), $("num"), document.querySelector(".tools")].forEach(function (host) {
    host.addEventListener("mousedown", function (e) { if (e.target.closest("button")) e.preventDefault(); });
  });
  [$("sci"), $("num")].forEach(function (host) {
    host.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (b && b._d) press(b._d, b);
    });
  });
  $("btnLeft").addEventListener("click", function () { moveCaret(-1); });
  $("btnRight").addEventListener("click", function () { moveCaret(1); });
  $("btnCopy").addEventListener("click", copyResult);


  /* ---------- keyboard ---------- */

  // Typing into the display: turn * / - into the display symbols.
  inp.addEventListener("input", function () {
    var v = inp.value, n = v.replace(/[*\/-]/g, function (c) { return KEYMAP[c]; });
    if (n !== v) {
      var s = inp.selectionStart, e = inp.selectionEnd;
      inp.value = n;
      try { inp.setSelectionRange(s, e); } catch (x) {}
    }
    update();
  });

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key, inField = e.target === inp;
    if (e.target.tagName === "BUTTON" && (k === "Enter" || k === " ")) return;   // let focused buttons work
    if (k === "Enter" || k === "=") { e.preventDefault(); equals(); return; }
    if (k === "Escape")            { e.preventDefault(); clearAll(); return; }
    if (k === "Backspace" || k === "Delete") {
      if (!inField) { e.preventDefault(); back(); }
      else if (done) { done = false; update(); }
      return;
    }
    if (k.length === 1 && k !== " ") {
      if (done || !inField) { e.preventDefault(); insert(KEYMAP[k] || k); }
    }
  });


  /* ---------- start on a worked example ---------- */
  inp.value = "sin(30)+√(144)";
  ans = evaluate(inp.value);
  done = true;      // the first key you press replaces the example
  update();
})();

