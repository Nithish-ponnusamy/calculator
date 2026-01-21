/* PrismTape Calculator
   - Expression input + safe parser (no eval)
   - Tape (history) with click-to-reuse
   - Memory keys (MC/MR/M+)
   - Keyboard support + copy-to-clipboard
*/

(() => {
  const exprEl = document.getElementById("expr");
  const valueEl = document.getElementById("value");
  const tapeEl = document.getElementById("tape");
  const tapeListEl = document.getElementById("tapeList");

  const displayEl = document.querySelector(".display");
  const calcEl = document.getElementById("calc");
  const tapeLabelEl = document.getElementById("tapeLabel");
  const themeIconEl = document.getElementById("themeIcon");
  const themeLabelEl = document.getElementById("themeLabel");

  const toggleTapeBtn = document.getElementById("toggleTape");
  const toggleThemeBtn = document.getElementById("toggleTheme");
  const copyResultBtn = document.getElementById("copyResult");
  const backspaceBtn = document.getElementById("backspace");
  const clearTapeBtn = document.getElementById("clearTape");
  const exportTapeBtn = document.getElementById("exportTape");

  /** @type {string} */
  let expression = "";
  /** @type {string} */
  let lastValueText = "0";
  /** @type {number} */
  let memory = 0;
  /** @type {{expr:string,result:string,ts:number}[]} */
  let tape = [];

  const storageKey = "prismtape:v1";

  function applyTheme(theme) {
    const t = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    toggleThemeBtn.setAttribute(
      "aria-pressed",
      t === "light" ? "true" : "false",
    );
    if (themeIconEl) themeIconEl.textContent = t === "light" ? "☀" : "☾";
    if (themeLabelEl)
      themeLabelEl.textContent = t === "light" ? "Light" : "Dark";
  }

  function applyTapeVisibility(visible) {
    const isVisible = !!visible;
    if (!isVisible) tapeEl.setAttribute("hidden", "");
    else tapeEl.removeAttribute("hidden");
    toggleTapeBtn.setAttribute("aria-pressed", isVisible.toString());
    if (tapeLabelEl) tapeLabelEl.textContent = isVisible ? "Tape" : "Tape off";
  }

  function pulseDisplay(isError) {
    if (!displayEl) return;
    displayEl.classList.remove("pulse", "pulse--error");
    // restart animation
    void displayEl.offsetWidth;
    displayEl.classList.add("pulse");
    if (isError) displayEl.classList.add("pulse--error");
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.expression === "string")
        expression = parsed.expression;
      if (typeof parsed?.lastValueText === "string")
        lastValueText = parsed.lastValueText;
      if (typeof parsed?.memory === "number" && Number.isFinite(parsed.memory))
        memory = parsed.memory;
      if (Array.isArray(parsed?.tape)) {
        tape = parsed.tape
          .filter(
            (x) =>
              x &&
              typeof x.expr === "string" &&
              typeof x.result === "string" &&
              typeof x.ts === "number",
          )
          .slice(0, 200);
      }

      if (parsed?.theme === "light" || parsed?.theme === "dark") {
        applyTheme(parsed.theme);
      } else {
        applyTheme("dark");
      }

      if (typeof parsed?.tapeVisible === "boolean") {
        applyTapeVisibility(parsed.tapeVisible);
      } else {
        applyTapeVisibility(true);
      }
    } catch {
      // ignore
    }
  }

  function saveState() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          expression,
          lastValueText,
          memory,
          tape,
          theme: getTheme(),
          tapeVisible: !tapeEl.hasAttribute("hidden"),
        }),
      );
    } catch {
      // ignore
    }
  }

  function getTheme() {
    return document.documentElement.dataset.theme || "dark";
  }

  function setTheme(theme) {
    applyTheme(theme);
    saveState();
  }

  function formatNumber(n) {
    if (!Number.isFinite(n)) return "Error";

    // Avoid -0
    if (Object.is(n, -0)) n = 0;

    // Prefer a compact representation without trailing .0
    const abs = Math.abs(n);
    if (abs !== 0 && (abs >= 1e12 || abs < 1e-9)) {
      return n.toExponential(10).replace(/\.0+e/, "e").replace(/e\+?/, "e");
    }

    const s = String(Number(n.toPrecision(14)));
    return s;
  }

  function render() {
    exprEl.textContent = expression;
    valueEl.textContent = lastValueText || "0";
    renderTape();
  }

  function renderTape() {
    tapeListEl.innerHTML = "";

    if (tape.length === 0) {
      const li = document.createElement("li");
      li.className = "tape-item";
      li.innerHTML =
        '<div class="tape-expr">No entries yet.</div><div class="tape-result"><span>Try: <strong>12*(3+4)</strong></span><span class="tape-time">—</span></div>';
      tapeListEl.appendChild(li);
      return;
    }

    for (const item of tape) {
      const li = document.createElement("li");
      li.className = "tape-item";

      const exprDiv = document.createElement("div");
      exprDiv.className = "tape-expr";
      exprDiv.textContent = item.expr;

      const resultDiv = document.createElement("div");
      resultDiv.className = "tape-result";

      const resultBtn = document.createElement("button");
      resultBtn.type = "button";
      resultBtn.textContent = item.result;
      resultBtn.title = "Click to reuse this result";
      resultBtn.addEventListener("click", () => {
        insertText(item.result);
      });

      const timeSpan = document.createElement("span");
      timeSpan.className = "tape-time";
      timeSpan.textContent = new Date(item.ts).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      resultDiv.appendChild(resultBtn);
      resultDiv.appendChild(timeSpan);

      li.appendChild(exprDiv);
      li.appendChild(resultDiv);
      tapeListEl.appendChild(li);
    }
  }

  function isOperator(ch) {
    return ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "%";
  }

  function lastNonSpaceChar(str) {
    for (let i = str.length - 1; i >= 0; i--) {
      const c = str[i];
      if (c !== " ") return c;
    }
    return "";
  }

  function canInsertOperator() {
    const last = lastNonSpaceChar(expression);
    if (!last) return false;
    if (last === "(") return false;
    if (isOperator(last)) return false;
    return true;
  }

  function insertText(text) {
    if (text === ".") {
      // Don't allow multiple dots in the current number
      const m = expression.match(/(\d+)(\.\d*)?$/);
      if (m && m[2]) return;
      if (!m) expression += "0";
    }

    if (isOperator(text)) {
      if (!canInsertOperator()) {
        // Allow unary minus at start or after operator/(
        if (text === "-") {
          const last = lastNonSpaceChar(expression);
          if (!last || last === "(" || isOperator(last)) {
            expression += "-";
            render();
            saveState();
          }
        }
        return;
      }
    }

    // If previous result is shown and expression is empty, typing a digit starts fresh
    if (expression === "" && /\d|\./.test(text) && lastValueText !== "0") {
      lastValueText = "0";
    }

    expression += text;
    render();
    saveState();
  }

  function backspace() {
    if (expression.length > 0) {
      expression = expression.slice(0, -1);
      render();
      saveState();
      return;
    }
  }

  function allClear() {
    expression = "";
    lastValueText = "0";
    render();
    saveState();
  }

  function clearEntry() {
    expression = "";
    render();
    saveState();
  }

  function smartParen() {
    const last = lastNonSpaceChar(expression);
    if (!last || last === "(" || isOperator(last)) {
      expression += "(";
    } else {
      // If more opens than closes, close; else open
      const opens = (expression.match(/\(/g) || []).length;
      const closes = (expression.match(/\)/g) || []).length;
      expression += opens > closes ? ")" : "*(";
    }
    render();
    saveState();
  }

  function toggleSign() {
    // Toggle sign of the last number in the expression
    if (!expression) {
      if (lastValueText && lastValueText !== "0" && lastValueText !== "Error") {
        if (lastValueText.startsWith("-"))
          lastValueText = lastValueText.slice(1);
        else lastValueText = "-" + lastValueText;
        render();
        saveState();
      }
      return;
    }

    const match = expression.match(/(.*?)(-?\d+(?:\.\d*)?)$/);
    if (!match) return;

    const head = match[1];
    const num = match[2];

    if (num.startsWith("-")) expression = head + num.slice(1);
    else {
      const prev = lastNonSpaceChar(head);
      if (!prev || prev === "(" || isOperator(prev))
        expression = head + "-" + num;
      else expression = head + "(-" + num + ")";
    }

    render();
    saveState();
  }

  function memClear() {
    memory = 0;
    flashValue("MC");
    saveState();
  }

  function memRecall() {
    const s = formatNumber(memory);
    insertText(s);
    flashValue("MR");
  }

  function memPlus() {
    const n = parseFloat(lastValueText);
    if (Number.isFinite(n)) {
      memory += n;
      flashValue("M+");
      saveState();
    }
  }

  function flashValue(label) {
    const prev = valueEl.textContent;
    valueEl.textContent = label;
    setTimeout(() => {
      valueEl.textContent = prev;
    }, 260);
  }

  function tokenize(input) {
    /** @type {{t:'num'|'op'|'lparen'|'rparen',v:string}[]} */
    const tokens = [];

    let i = 0;
    while (i < input.length) {
      const c = input[i];
      if (c === " ") {
        i++;
        continue;
      }
      if (c === "(") {
        tokens.push({ t: "lparen", v: c });
        i++;
        continue;
      }
      if (c === ")") {
        tokens.push({ t: "rparen", v: c });
        i++;
        continue;
      }
      if (isOperator(c)) {
        tokens.push({ t: "op", v: c });
        i++;
        continue;
      }

      if (c === "." || (c >= "0" && c <= "9")) {
        let start = i;
        i++;
        while (i < input.length) {
          const d = input[i];
          if (d === "." || (d >= "0" && d <= "9")) i++;
          else break;
        }
        tokens.push({ t: "num", v: input.slice(start, i) });
        continue;
      }

      // Unknown character
      return null;
    }

    // Handle unary minus by converting to (0 - x) when needed
    /** @type {{t:'num'|'op'|'lparen'|'rparen',v:string}[]} */
    const out = [];
    for (let idx = 0; idx < tokens.length; idx++) {
      const tok = tokens[idx];
      if (tok.t === "op" && tok.v === "-") {
        const prev = out[out.length - 1];
        const isUnary = !prev || prev.t === "op" || prev.t === "lparen";
        if (isUnary) {
          out.push({ t: "num", v: "0" });
          out.push({ t: "op", v: "-" });
          continue;
        }
      }
      out.push(tok);
    }

    return out;
  }

  function toRpn(tokens) {
    /** @type {{t:'num'|'op',v:string}[]} */
    const output = [];
    /** @type {{t:'op'|'lparen',v:string}[]} */
    const stack = [];

    const prec = (op) => {
      if (op === "+" || op === "-") return 1;
      if (op === "*" || op === "/" || op === "%") return 2;
      return 0;
    };

    for (const tok of tokens) {
      if (tok.t === "num") {
        output.push(tok);
        continue;
      }

      if (tok.t === "op") {
        while (stack.length > 0) {
          const top = stack[stack.length - 1];
          if (top.t === "lparen") break;
          if (prec(top.v) >= prec(tok.v))
            output.push(/** @type any */ (stack.pop()));
          else break;
        }
        stack.push(tok);
        continue;
      }

      if (tok.t === "lparen") {
        stack.push({ t: "lparen", v: "(" });
        continue;
      }

      if (tok.t === "rparen") {
        let matched = false;
        while (stack.length > 0) {
          const top = stack.pop();
          if (!top) break;
          if (top.t === "lparen") {
            matched = true;
            break;
          }
          output.push(/** @type any */ (top));
        }
        if (!matched) return null;
        continue;
      }
    }

    while (stack.length > 0) {
      const top = stack.pop();
      if (!top) break;
      if (top.t === "lparen") return null;
      output.push(/** @type any */ (top));
    }

    return output;
  }

  function evalRpn(rpn) {
    /** @type {number[]} */
    const stack = [];

    for (const tok of rpn) {
      if (tok.t === "num") {
        const n = Number(tok.v);
        if (!Number.isFinite(n)) return null;
        stack.push(n);
        continue;
      }

      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) return null;

      let r;
      switch (tok.v) {
        case "+":
          r = a + b;
          break;
        case "-":
          r = a - b;
          break;
        case "*":
          r = a * b;
          break;
        case "/":
          r = b === 0 ? NaN : a / b;
          break;
        case "%":
          r = b === 0 ? NaN : a % b;
          break;
        default:
          return null;
      }

      stack.push(r);
    }

    if (stack.length !== 1) return null;
    return stack[0];
  }

  function safeEvaluate(expr) {
    const tokens = tokenize(expr);
    if (!tokens) return null;
    const rpn = toRpn(tokens);
    if (!rpn) return null;
    return evalRpn(rpn);
  }

  function equals() {
    const input = expression.trim();
    if (!input) {
      // If expression empty, keep showing last value
      render();
      return;
    }

    const result = safeEvaluate(input);
    const formatted = result === null ? "Error" : formatNumber(result);

    tape.unshift({ expr: input, result: formatted, ts: Date.now() });
    tape = tape.slice(0, 200);

    expression = "";
    lastValueText = formatted;

    render();
    saveState();

    pulseDisplay(formatted === "Error");
  }

  function copyResult() {
    const txt = lastValueText || "0";
    if (!navigator.clipboard) {
      // best-effort fallback
      const ta = document.createElement("textarea");
      ta.value = txt;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
      flashValue("Copied");
      pulseDisplay(false);
      return;
    }

    navigator.clipboard.writeText(txt).then(
      () => {
        flashValue("Copied");
        pulseDisplay(false);
      },
      () => {
        flashValue("Nope");
        pulseDisplay(true);
      },
    );
  }

  function exportTape() {
    if (tape.length === 0) {
      flashValue("Empty");
      return;
    }

    const lines = tape
      .slice()
      .reverse()
      .map(
        (x) => `${new Date(x.ts).toLocaleString()}  ${x.expr} = ${x.result}`,
      );

    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "prismtape-history.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function clearTape() {
    tape = [];
    render();
    saveState();
  }

  function toggleTape() {
    const visible = tapeEl.hasAttribute("hidden");
    applyTapeVisibility(visible);
    saveState();
  }

  function addRipple(btn, clientX, clientY) {
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const x = Number.isFinite(clientX) ? clientX - rect.left : rect.width / 2;
    const y = Number.isFinite(clientY) ? clientY - rect.top : rect.height / 2;
    const size = Math.max(rect.width, rect.height) * 1.9;

    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    btn.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  }

  function setupTilt(el) {
    if (!el) return;
    let leaveTimer = 0;

    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const clampedX = Math.min(1, Math.max(0, px));
      const clampedY = Math.min(1, Math.max(0, py));

      const mx = `${(clampedX * 100).toFixed(2)}%`;
      const my = `${(clampedY * 100).toFixed(2)}%`;
      el.style.setProperty("--mx", mx);
      el.style.setProperty("--my", my);

      const tiltX = (0.5 - clampedY) * 7;
      const tiltY = (clampedX - 0.5) * 9;
      el.style.setProperty("--tiltX", `${tiltX.toFixed(2)}deg`);
      el.style.setProperty("--tiltY", `${tiltY.toFixed(2)}deg`);
      el.classList.add("is-tilting");

      window.clearTimeout(leaveTimer);
      leaveTimer = window.setTimeout(
        () => el.classList.remove("is-tilting"),
        60,
      );
    };

    const onLeave = () => {
      el.style.setProperty("--mx", "50%");
      el.style.setProperty("--my", "40%");
      el.style.setProperty("--tiltX", "0deg");
      el.style.setProperty("--tiltY", "0deg");
      el.classList.remove("is-tilting");
    };

    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave, { passive: true });
  }

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const k = e.key;

    if (k === "Enter" || k === "=") {
      e.preventDefault();
      equals();
      return;
    }
    if (k === "Backspace") {
      e.preventDefault();
      backspace();
      return;
    }
    if (k === "Escape") {
      e.preventDefault();
      allClear();
      return;
    }

    if (k === "(" || k === ")") {
      e.preventDefault();
      insertText(k);
      return;
    }

    if (k === "." || (k >= "0" && k <= "9")) {
      e.preventDefault();
      insertText(k);
      return;
    }

    if (k === "+" || k === "-" || k === "*" || k === "/" || k === "%") {
      e.preventDefault();
      insertText(k);
      return;
    }
  }

  function onClickKey(e) {
    const btn = e.target.closest("button");
    if (!btn) return;

    addRipple(btn, e.clientX, e.clientY);

    const insert = btn.getAttribute("data-insert");
    const action = btn.getAttribute("data-action");

    if (insert) {
      insertText(insert);
      return;
    }

    switch (action) {
      case "equals":
        equals();
        break;
      case "allClear":
        allClear();
        break;
      case "clearEntry":
        clearEntry();
        break;
      case "paren":
        smartParen();
        break;
      case "sign":
        toggleSign();
        break;
      case "memClear":
        memClear();
        break;
      case "memRecall":
        memRecall();
        break;
      case "memPlus":
        memPlus();
        break;
      default:
        break;
    }
  }

  // Wire up
  document.querySelector(".keys")?.addEventListener("click", onClickKey);
  backspaceBtn.addEventListener("click", backspace);
  copyResultBtn.addEventListener("click", copyResult);
  clearTapeBtn.addEventListener("click", clearTape);
  exportTapeBtn.addEventListener("click", exportTape);

  toggleTapeBtn.addEventListener("click", () => {
    toggleTape();
  });

  toggleThemeBtn.addEventListener("click", () => {
    const next = getTheme() === "light" ? "dark" : "light";
    setTheme(next);
  });

  window.addEventListener("keydown", onKeyDown);

  // Restore
  loadState();

  setupTilt(calcEl);
  setupTilt(tapeEl);

  // initial render
  render();
})();
