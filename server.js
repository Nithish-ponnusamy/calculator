// PrismTape backend (Node.js, no dependencies)
// - Serves static files (index.html, styles.css, app.js, ...)
// - POST /api/eval {"expr":"12*(3+4)"}
// Safe parsing only (+ - * / % and parentheses). No eval().

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8000);

function isOperator(ch) {
  return ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "%";
}

function tokenize(expr) {
  /** @type {{t:'num'|'op'|'lparen'|'rparen', v:string}[]} */
  const tokens = [];

  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
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
      const start = i;
      i++;
      while (i < expr.length) {
        const d = expr[i];
        if (d === "." || (d >= "0" && d <= "9")) i++;
        else break;
      }
      tokens.push({ t: "num", v: expr.slice(start, i) });
      continue;
    }

    return null;
  }

  // Convert unary minus to 0 - x
  /** @type {{t:'num'|'op'|'lparen'|'rparen', v:string}[]} */
  const out = [];
  for (const tok of tokens) {
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
  /** @type {{t:'num'|'op', v:string}[]} */
  const output = [];
  /** @type {{t:'op'|'lparen', v:string}[]} */
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
        if (prec(top.v) >= prec(tok.v)) output.push(stack.pop());
        else break;
      }
      stack.push(tok);
      continue;
    }

    if (tok.t === "lparen") {
      stack.push(tok);
      continue;
    }

    if (tok.t === "rparen") {
      let matched = false;
      while (stack.length > 0) {
        const top = stack.pop();
        if (top.t === "lparen") {
          matched = true;
          break;
        }
        output.push(top);
      }
      if (!matched) return null;
      continue;
    }
  }

  while (stack.length > 0) {
    const top = stack.pop();
    if (top.t === "lparen") return null;
    output.push(top);
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

function formatNumber(n) {
  if (!Number.isFinite(n)) return "Error";
  if (Object.is(n, -0)) n = 0;

  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e12 || abs < 1e-9)) {
    return n.toExponential(10).replace(/\.0+e/, "e").replace(/e\+?/, "e");
  }

  return String(Number(n.toPrecision(14)));
}

function sendJson(res, code, body) {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

function readBody(req, limitBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(Object.assign(new Error("body too large"), { code: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mime[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`,
    );

    if (u.pathname === "/api/health" && req.method === "GET") {
      sendJson(res, 200, { ok: true, ts: Math.floor(Date.now() / 1000) });
      return;
    }

    if (u.pathname === "/api/eval" && req.method === "POST") {
      const bodyText = await readBody(req, 32 * 1024);
      let body;
      try {
        body = JSON.parse(bodyText || "{}");
      } catch {
        sendJson(res, 400, { ok: false, error: "invalid json" });
        return;
      }

      const expr =
        body && typeof body.expr === "string" ? body.expr.trim() : "";
      if (!expr) {
        sendJson(res, 400, { ok: false, error: "empty expression" });
        return;
      }
      if (expr.length > 240) {
        sendJson(res, 413, { ok: false, error: "expression too long" });
        return;
      }

      for (const ch of expr) {
        if (
          (ch >= "0" && ch <= "9") ||
          ch === "." ||
          ch === " " ||
          ch === "\t" ||
          ch === "\n" ||
          ch === "\r"
        )
          continue;
        if (ch === "(" || ch === ")" || isOperator(ch)) continue;
        sendJson(res, 400, { ok: false, error: "invalid character" });
        return;
      }

      const value = safeEvaluate(expr);
      const result = value === null ? "Error" : formatNumber(value);
      sendJson(res, 200, { ok: true, result });
      return;
    }

    // Static
    let pathname = u.pathname === "/" ? "/index.html" : u.pathname;
    pathname = decodeURIComponent(pathname);

    // Prevent path traversal
    const root = path.resolve(process.cwd());
    const abs = path.resolve(root, "." + pathname);
    if (
      !abs.startsWith(root + path.sep) &&
      abs !== path.join(root, "index.html")
    ) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    serveStatic(res, abs);
  } catch (err) {
    const code = err && typeof err.code === "number" ? err.code : 500;
    if (code === 413) {
      sendJson(res, 413, { ok: false, error: "body too large" });
      return;
    }
    sendJson(res, 500, { ok: false, error: "server error" });
  }
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`PrismTape server running: http://${HOST}:${PORT}`);
});
