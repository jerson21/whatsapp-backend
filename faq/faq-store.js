"use strict";

const fs = require('fs');
const path = require('path');

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9áéíóúñü\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function createFAQStore({ dataPath, logger }) {
  const filePath = dataPath || path.join(process.cwd(), 'faq-data.json');
  let docs = []; // {id,title,q,a,tags, tokens}
  let index = null; // BM25 structures

  function ensureDir(p) {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  function load() {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const json = JSON.parse(raw || '[]');
        docs = json.map((d, i) => ({ id: d.id ?? i + 1, title: d.title || null, q: d.q, a: d.a, tags: d.tags || [], tokens: tokenize((d.title || '') + ' ' + d.q + ' ' + (d.a || '')) }));
      } else {
        docs = [];
      }
      buildIndex();
      logger?.info({ count: docs.length }, 'FAQ store cargado');
    } catch (e) {
      logger?.error({ e }, 'FAQ store load error');
      docs = []; index = null;
    }
  }

  function persist() {
    try {
      ensureDir(filePath);
      const payload = docs.map(({ id, title, q, a, tags }) => ({ id, title: title || null, q, a, tags }));
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (e) {
      logger?.error({ e }, 'FAQ store persist error');
    }
  }

  // BM25 index
  function buildIndex() {
    const N = docs.length;
    const k1 = 1.5, b = 0.75;
    const avgdl = N ? (docs.reduce((s, d) => s + d.tokens.length, 0) / N) : 0;
    const df = new Map(); // term -> doc freq
    const tf = new Map(); // docId -> Map(term -> freq)

    for (const d of docs) {
      const tfDoc = new Map();
      for (const t of d.tokens) tfDoc.set(t, (tfDoc.get(t) || 0) + 1);
      tf.set(d.id, tfDoc);
      for (const term of new Set(d.tokens)) df.set(term, (df.get(term) || 0) + 1);
    }

    index = { N, k1, b, avgdl, df, tf };
  }

  function add({ title, q, a, tags }) {
    const id = (docs.at(-1)?.id || 0) + 1;
    const entry = { id, title: title ? String(title) : null, q: String(q || ''), a: String(a || ''), tags: Array.isArray(tags) ? tags : [], tokens: tokenize((title ? String(title) + ' ' : '') + String(q || '') + ' ' + String(a || '')) };
    docs.push(entry);
    buildIndex();
    persist();
    return { id };
  }

  function search(query, k = 5) {
    if (!index || !query) return [];
    const qTokens = Array.from(new Set(tokenize(String(query))));
    const scores = new Map();
    for (const d of docs) {
      let score = 0;
      const tfDoc = index.tf.get(d.id) || new Map();
      const dl = d.tokens.length || 1;
      for (const term of qTokens) {
        const n_qi = index.df.get(term) || 0;
        if (n_qi === 0) continue;
        const idf = Math.log(1 + (index.N - n_qi + 0.5) / (n_qi + 0.5));
        const f_qi = tfDoc.get(term) || 0;
        const denom = f_qi + index.k1 * (1 - index.b + index.b * (dl / (index.avgdl || 1)));
        const termScore = idf * ((f_qi * (index.k1 + 1)) / (denom || 1));
        score += termScore;
      }
      if (score > 0) scores.set(d.id, score);
    }
    const results = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([id, score]) => {
        const doc = docs.find(x => x.id === id);
        return { id, score, title: doc.title || null, q: doc.q, a: doc.a, tags: doc.tags };
      });
    return results;
  }

  load();
  return { add, search, load };
}

module.exports = { createFAQStore };


