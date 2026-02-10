// server.js
require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const fetch = require('node-fetch'); // for AI call (node 18+ has fetch built in; using node-fetch for compatibility)
const app = express();

const OFFICIAL_EMAIL = process.env.OFFICIAL_EMAIL || 'jaspinder0781.be23@chitkara.edu.in';
const PORT = process.env.PORT || 3000;
const AI_PROVIDER = process.env.AI_PROVIDER || 'openai'; // support openai for now
const OPENAI_KEY = process.env.OPENAI_KEY || '';

app.use(bodyParser.json());

// basic rate limiter (guardrail)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // reasonably permissive but prevents abuse
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// helper: consistent error response
function sendError(res, statusCode, message, error_code) {
  const body = {
    is_success: false,
    official_email: OFFICIAL_EMAIL,
    error: message,
  };
  if (error_code) body.error_code = error_code;
  res.status(statusCode).json(body);
}

// validation helpers
function isInteger(n) {
  return Number.isInteger(n);
}
function isSafeNumber(n) {
  // limit absolute value to avoid overflow in LCM/HCF, fibonacci index cap separately
  return typeof n === 'number' && isFinite(n) && Math.abs(n) <= 1e9;
}

// GCD and LCM
function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  if (b === 0) return a;
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}
function lcm_two(a, b) {
  if (a === 0 || b === 0) return 0;
  return Math.abs(Math.round((a / gcd(a, b)) * b));
}

// primes
function isPrime(n) {
  if (!isInteger(n) || n <= 1) return false;
  if (n <= 3) return true;
  if (n % 2 === 0) return false;
  const limit = Math.floor(Math.sqrt(n));
  for (let i = 3; i <= limit; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

// fibonacci
const FIB_MAX_N = 100; // safe cap
function fibonacciArray(n) {
  if (n === 0) return [0];
  if (n === 1) return [0,1];
  const arr = [0,1];
  for (let i = 2; i <= n; i++) {
    const next = arr[i-1] + arr[i-2];
    arr.push(next);
  }
  return arr;
}

async function askAI_singleWord(question) {
  const APP_ID = process.env.WOLFRAM_APP_ID;
  if (!APP_ID) throw new Error("No Wolfram App ID configured");

  let q = String(question || "").replace(/[\u0000-\u001F]+/g, " ").trim();
  if (!q) throw new Error("Empty question");

  const response = await fetch(
    `https://api.wolframalpha.com/v1/result?i=${encodeURIComponent(q)}&appid=${APP_ID}`
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error("Wolfram error: " + text);
  }

  const text = await response.text();

  let word = text.trim().split(/\s+/)[0];
  word = word.replace(/^[^\w]+|[^\w]+$/g, "");

  return word;
}




// /health endpoint
app.get('/health', (req, res) => {
  res.json({
    is_success: true,
    official_email: OFFICIAL_EMAIL,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString()
    }
  });
});

// /bfhl endpoint
app.post('/bfhl', async (req, res) => {
  try {
    if (!req.is('application/json')) {
      return sendError(res, 400, 'Content-Type must be application/json', 'invalid_content_type');
    }

    const keys = Object.keys(req.body || {});
    if (keys.length !== 1) {
      return sendError(res, 400, 'Request body must contain exactly one key.', 'bad_key_count');
    }
    const key = keys[0];

    if (key === 'fibonacci') {
      const n = req.body.fibonacci;
      if (!isInteger(n) || n < 0) return sendError(res, 422, 'fibonacci must be a non-negative integer', 'invalid_fibonacci');
      if (n > FIB_MAX_N) return sendError(res, 413, `fibonacci n too large; max ${FIB_MAX_N}`, 'fibonacci_too_large');
      const arr = fibonacciArray(n);
      return res.json({ is_success: true, official_email: OFFICIAL_EMAIL, data: arr.join(",") });
    }

    if (key === 'prime') {
      const arr = req.body.prime;
      if (!Array.isArray(arr) || arr.length === 0) return sendError(res, 422, 'prime must be a non-empty integer array', 'invalid_prime');
      if (arr.length > 500) return sendError(res, 413, 'prime array too large', 'prime_too_large');
      const out = [];
      for (let x of arr) {
        if (typeof x !== 'number' || !isInteger(x) || !isSafeNumber(x)) return sendError(res, 422, 'prime array must contain safe integers', 'prime_bad_value');
        if (isPrime(x)) out.push(x);
      }
      return res.json({ is_success: true, official_email: OFFICIAL_EMAIL, data: out.join(",") });
    }

    if (key === 'hcf') {
      const arr = req.body.hcf;
      if (!Array.isArray(arr) || arr.length === 0) return sendError(res, 422, 'hcf must be a non-empty integer array', 'invalid_hcf');
      if (arr.length > 500) return sendError(res, 413, 'hcf array too large', 'hcf_too_large');
      let g = Math.abs(Number(arr[0]));
      if (!isInteger(g) || !isSafeNumber(g)) return sendError(res, 422, 'hcf array must contain safe integers', 'hcf_bad_value');
      for (let i = 1; i < arr.length; i++) {
        const v = arr[i];
        if (!isInteger(v) || !isSafeNumber(v)) return sendError(res, 422, 'hcf array must contain safe integers', 'hcf_bad_value');
        g = gcd(g, v);
      }
      return res.json({ is_success: true, official_email: OFFICIAL_EMAIL, data: g.join(",") });
    }

    if (key === 'lcm') {
      const arr = req.body.lcm;
      if (!Array.isArray(arr) || arr.length === 0) return sendError(res, 422, 'lcm must be a non-empty integer array', 'invalid_lcm');
      if (arr.length > 200) return sendError(res, 413, 'lcm array too large', 'lcm_too_large');
      let current = Math.abs(Number(arr[0]));
      if (!isInteger(current) || !isSafeNumber(current)) return sendError(res, 422, 'lcm array must contain safe integers', 'lcm_bad_value');
      for (let i = 1; i < arr.length; i++) {
        const v = arr[i];
        if (!isInteger(v) || !isSafeNumber(v)) return sendError(res, 422, 'lcm array must contain safe integers', 'lcm_bad_value');
        // guard intermediate growth
        current = lcm_two(current, v);
        if (!isSafeNumber(current) || !isFinite(current)) return sendError(res, 422, 'lcm overflow or too large', 'lcm_overflow');
      }
      return res.json({ is_success: true, official_email: OFFICIAL_EMAIL, data: current.join(",") });
    }

    if (key === 'AI') {
      const q = req.body.AI;
      if (typeof q !== 'string' || q.trim().length === 0) return sendError(res, 422, 'AI must be a non-empty string', 'invalid_ai');
      try {
        const word = await askAI_singleWord(q);
        if (!word) return sendError(res, 500, 'AI provider returned no answer', 'ai_no_answer');
        // final guard: ensure single token
        const token = String(word).trim().split(/\s+/)[0];
        return res.json({ is_success: true, official_email: OFFICIAL_EMAIL, data: token });
      } catch (err) {
        console.error('AI error:', err?.message || err);
        return sendError(res, 502, 'AI provider error', 'ai_provider_error');
      }
    }

    // unknown key
    return sendError(res, 404, 'Unknown key in request body', 'unknown_key');

  } catch (err) {
    console.error('unexpected error:', err);
    return sendError(res, 500, 'Internal server error', 'internal_error');
  }
});

// 405 for other methods on /bfhl
app.all('/bfhl', (req, res) => {
  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method Not Allowed: use POST', 'method_not_allowed');
  }
  res.status(405).end();
});

app.use((req, res) => {
  sendError(res, 404, 'Not Found', 'not_found');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
