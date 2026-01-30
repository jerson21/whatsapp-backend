"use strict";

// =============================================
// Stopwords en español (palabras sin valor semantico para busqueda)
// =============================================
const STOPWORDS = new Set([
  'de', 'la', 'el', 'en', 'un', 'una', 'los', 'las', 'del', 'al',
  'que', 'es', 'se', 'no', 'lo', 'por', 'con', 'para', 'su', 'sus',
  'me', 'te', 'le', 'nos', 'les', 'mi', 'tu', 'si', 'ya', 'mas',
  'pero', 'como', 'este', 'esta', 'esto', 'ese', 'esa', 'eso',
  'son', 'ser', 'fue', 'hay', 'han', 'muy', 'bien', 'tambien',
  'otro', 'otra', 'otros', 'otras', 'todo', 'toda', 'todos', 'todas',
  'tiene', 'tienen', 'puede', 'pueden', 'hacer', 'hola', 'buenas',
  'buenos', 'dias', 'tardes', 'noches', 'gracias', 'favor',
  'donde', 'cuando', 'cual', 'quien', 'porque', 'sobre', 'entre',
  'sin', 'hasta', 'desde', 'ante', 'bajo', 'hacia', 'segun'
]);

// =============================================
// Stemming basico español (reducir plurales y sufijos comunes)
// =============================================
function stem(word) {
  if (word.length < 4) return word;

  // Plurales: -es, -s
  if (word.endsWith('eses')) return word.slice(0, -2); // meses → mes + es? no, keep simple
  if (word.endsWith('ces')) return word.slice(0, -3) + 'z'; // luces → luz
  if (word.endsWith('iones')) return word.slice(0, -5) + 'ion'; // fabricaciones → fabricacion
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);

  return word;
}

// =============================================
// Tokenizacion con stopwords + stemming
// =============================================
function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .replace(/[^a-z0-9\s]/g, ' ')                     // solo alfanumerico
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t))   // quitar stopwords y 1-char
    .map(stem);                                         // aplicar stemming
}

// =============================================
// FAQ Database con BM25 mejorado
// =============================================
function createFAQDatabase({ pool, logger }) {
  let docs = [];          // Cache en memoria
  let docMap = new Map();  // id → doc (lookup O(1))
  let index = null;        // BM25 structures

  // Umbral minimo de score BM25 para considerar un resultado relevante
  const MIN_SCORE_THRESHOLD = 0.1;

  // ---- BM25 index ----
  function buildIndex() {
    const N = docs.length;
    const k1 = 1.5, b = 0.75;
    const avgdl = N ? (docs.reduce((s, d) => s + d.tokens.length, 0) / N) : 0;
    const df = new Map(); // term → doc freq
    const tf = new Map(); // docId → Map(term → freq)

    for (const d of docs) {
      const tfDoc = new Map();
      for (const t of d.tokens) tfDoc.set(t, (tfDoc.get(t) || 0) + 1);
      tf.set(d.id, tfDoc);
      for (const term of new Set(d.tokens)) df.set(term, (df.get(term) || 0) + 1);
    }

    index = { N, k1, b, avgdl, df, tf };
  }

  // ---- Rebuild docMap from docs array ----
  function rebuildDocMap() {
    docMap = new Map(docs.map(d => [d.id, d]));
  }

  // ---- Load from MySQL ----
  async function loadFromDatabase() {
    try {
      const [rows] = await pool.query(`
        SELECT id, title, question, answer, tags, active, created_at, updated_at
        FROM faq_entries
        WHERE active = TRUE
        ORDER BY id ASC
      `);

      docs = rows.map(row => ({
        id: row.id,
        title: row.title,
        q: row.question,
        a: row.answer,
        tags: row.tags ? JSON.parse(row.tags) : [],
        active: row.active,
        created_at: row.created_at,
        updated_at: row.updated_at,
        tokens: tokenize((row.title || '') + ' ' + row.question + ' ' + (row.answer || ''))
      }));

      rebuildDocMap();
      buildIndex();
      logger?.info({ count: docs.length }, 'FAQ database cargado');
    } catch (e) {
      logger?.error({ e }, 'FAQ database load error');
      docs = [];
      docMap = new Map();
      index = null;
    }
  }

  // ---- CRUD ----
  async function add({ title, q, a, tags, active = true }) {
    try {
      const [result] = await pool.query(`
        INSERT INTO faq_entries (title, question, answer, tags, active)
        VALUES (?, ?, ?, ?, ?)
      `, [title, q, a, JSON.stringify(tags || []), active]);

      const id = result.insertId;
      const entry = {
        id,
        title,
        q,
        a,
        tags: tags || [],
        active,
        created_at: new Date(),
        updated_at: new Date(),
        tokens: tokenize((title ? String(title) + ' ' : '') + String(q || '') + ' ' + String(a || ''))
      };

      docs.push(entry);
      docMap.set(id, entry);
      buildIndex();

      logger?.info({ id }, 'FAQ agregada a database');
      return { id };
    } catch (e) {
      logger?.error({ e }, 'FAQ database add error');
      throw e;
    }
  }

  async function update(id, { title, q, a, tags, active }) {
    try {
      await pool.query(`
        UPDATE faq_entries
        SET title = ?, question = ?, answer = ?, tags = ?, active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [title, q, a, JSON.stringify(tags || []), active, id]);

      const docIndex = docs.findIndex(d => d.id === id);
      if (docIndex !== -1) {
        const updated = {
          ...docs[docIndex],
          title,
          q,
          a,
          tags: tags || [],
          active,
          updated_at: new Date(),
          tokens: tokenize((title ? String(title) + ' ' : '') + String(q || '') + ' ' + String(a || ''))
        };
        docs[docIndex] = updated;
        docMap.set(id, updated);
        buildIndex();
      }

      logger?.info({ id }, 'FAQ actualizada en database');
      return { id };
    } catch (e) {
      logger?.error({ e }, 'FAQ database update error');
      throw e;
    }
  }

  async function remove(id) {
    try {
      await pool.query('DELETE FROM faq_entries WHERE id = ?', [id]);

      const docIndex = docs.findIndex(d => d.id === id);
      if (docIndex !== -1) {
        docs.splice(docIndex, 1);
        docMap.delete(id);
        buildIndex();
      }

      logger?.info({ id }, 'FAQ eliminada de database');
      return { id };
    } catch (e) {
      logger?.error({ e }, 'FAQ database remove error');
      throw e;
    }
  }

  async function getAll() {
    try {
      const [rows] = await pool.query(`
        SELECT id, title, question, answer, tags, active, created_at, updated_at
        FROM faq_entries
        ORDER BY id ASC
      `);

      return rows.map(row => ({
        id: row.id,
        title: row.title,
        q: row.question,
        a: row.answer,
        tags: row.tags ? JSON.parse(row.tags) : [],
        active: row.active,
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
    } catch (e) {
      logger?.error({ e }, 'FAQ database getAll error');
      throw e;
    }
  }

  // ---- BM25 Search (mejorado) ----
  function search(query, k = 5) {
    if (!index || !query) return [];
    const qTokens = Array.from(new Set(tokenize(String(query))));
    if (qTokens.length === 0) return [];

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
      if (score > MIN_SCORE_THRESHOLD) scores.set(d.id, score);
    }

    const results = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([id, score]) => {
        const doc = docMap.get(id); // O(1) lookup
        return { id, score, title: doc.title || null, q: doc.q, a: doc.a, tags: doc.tags };
      });
    return results;
  }

  // ---- Stats ----
  async function getStats() {
    try {
      const [totalResult] = await pool.query('SELECT COUNT(*) as total FROM faq_entries');
      const [activeResult] = await pool.query('SELECT COUNT(*) as active FROM faq_entries WHERE active = TRUE');
      const [tagsResult] = await pool.query('SELECT tags FROM faq_entries WHERE tags IS NOT NULL AND tags != "[]"');

      const allTags = [];
      tagsResult.forEach(row => {
        if (row.tags) {
          try {
            const tags = JSON.parse(row.tags);
            if (Array.isArray(tags)) allTags.push(...tags);
          } catch (e) { /* ignorar tags mal formateados */ }
        }
      });
      const totalCategorias = new Set(allTags).size;

      return {
        totalPreguntas: totalResult[0].total,
        totalActivas: activeResult[0].active,
        totalCategorias,
        ultimaActualizacion: new Date().toISOString(),
        sugerenciasHoy: 0
      };
    } catch (e) {
      logger?.error({ e }, 'FAQ database stats error');
      throw e;
    }
  }

  // Cargar datos iniciales
  loadFromDatabase();

  return {
    add,
    update,
    remove,
    getAll,
    search,
    getStats,
    loadFromDatabase,
    docs: () => docs,
    tokenize
  };
}

module.exports = { createFAQDatabase };
