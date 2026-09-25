'use strict';

class ApiError extends Error {
  constructor(message, code = 400) {
    super(message);
    this.code = code;
  }
}

const ok = (res, data) => res.json({ ok: true, data });
const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
const bad = (msg, code = 400) => { throw new ApiError(msg, code); };

const round = (n) => Math.round(Number(n) || 0);
const num = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) bad('Số không hợp lệ');
  return x;
};
const int = (n) => {
  const x = round(n);
  if (!Number.isFinite(x)) bad('Số không hợp lệ');
  return x;
};
const str = (v, max = 500) => (v == null ? '' : String(v).trim().slice(0, max));
const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);

// Bọc handler bất đồng bộ, đẩy lỗi về error middleware của Express 5.
const wrap = (fn) => (req, res, next) => {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.then === 'function') r.catch(next);
  } catch (e) {
    next(e);
  }
};

const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

const paginate = (query) => {
  const limit = Math.min(1000, Math.max(1, Number(query.limit) || 200));
  const offset = Math.max(0, Number(query.offset) || 0);
  return { limit, offset };
};

module.exports = { ApiError, ok, fail, bad, round, num, int, str, bool, wrap, nowIso, today, paginate };
