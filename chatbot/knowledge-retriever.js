'use strict';

/**
 * knowledge-retriever.js
 *
 * Busqueda hibrida (vectorial + BM25) para inyectar conocimiento
 * aprendido en las respuestas del chatbot.
 *
 * - Busca en learned_qa_pairs por similitud coseno (embeddings)
 * - Busca en faq_entries por keywords (BM25 via faq-database.js)
 * - Consulta product_prices para precios vigentes
 * - Carga contexto conversacional (ultimos N mensajes agrupados)
 */

const LEARNING_MIN_QUALITY = () => Number(process.env.LEARNING_MIN_QUALITY || 50);
const CONTEXT_MESSAGES = () => Number(process.env.LEARNING_CONTEXT_MESSAGES || 30);
const SIMILARITY_THRESHOLD = 0.75;

// =============================================
// Similitud coseno entre dos vectores
// =============================================
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// =============================================
// Deteccion de consultas de precio
// =============================================
const PRICE_PATTERNS = [
  /cu[aá]nto\s*(vale|cuesta|sale|est[aá])/i,
  /precio/i,
  /valor/i,
  /\$\s*\d/,
  /cotiz/i,
  /cuotas/i
];

function isPriceQuery(text) {
  return PRICE_PATTERNS.some(p => p.test(text || ''));
}

// =============================================
// Factory function
// =============================================
function createKnowledgeRetriever({ pool, logger, openai, faqStore }) {

  /**
   * Busqueda vectorial en learned_qa_pairs
   * Genera embedding del mensaje y compara con pares aprobados
   */
  async function vectorSearch(message, topK = 3) {
    if (!openai) return [];

    try {
      const embeddingModel = process.env.OPENAI_EMBEDDINGS_MODEL || 'text-embedding-3-small';

      // Generar embedding del mensaje del cliente
      const response = await openai.embeddings.create({
        model: embeddingModel,
        input: message
      });
      const queryVector = response.data[0].embedding;

      // Buscar pares aprobados con embedding
      const [pairs] = await pool.query(
        `SELECT id, question, answer, quality_score, embedding
         FROM learned_qa_pairs
         WHERE status = 'approved'
           AND quality_score >= ?
           AND embedding IS NOT NULL`,
        [LEARNING_MIN_QUALITY()]
      );

      if (!pairs.length) return [];

      // Calcular similitud coseno con cada par
      const scored = pairs.map(p => {
        const embedding = typeof p.embedding === 'string' ? JSON.parse(p.embedding) : p.embedding;
        const similarity = cosineSimilarity(queryVector, embedding);
        return { ...p, similarity };
      });

      // Filtrar por umbral y ordenar por similitud
      return scored
        .filter(p => p.similarity >= SIMILARITY_THRESHOLD)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK)
        .map(p => ({
          source: 'learned',
          question: p.question,
          answer: p.answer,
          score: p.similarity,
          qualityScore: p.quality_score
        }));

    } catch (err) {
      logger.error({ err }, 'Knowledge retriever: error en busqueda vectorial');
      return [];
    }
  }

  /**
   * Busqueda BM25 en faq_entries via faq-database.js
   */
  function bm25Search(message, topK = 2) {
    if (!faqStore) return [];

    try {
      const results = faqStore.search(message, topK);
      return results.map(r => ({
        source: 'faq',
        question: r.q,
        answer: r.a,
        score: r.score,
        title: r.title
      }));
    } catch (err) {
      logger.error({ err }, 'Knowledge retriever: error en busqueda BM25');
      return [];
    }
  }

  /**
   * Busqueda hibrida: vectorial + BM25
   * Combina resultados de ambas fuentes
   */
  async function retrieve(message) {
    const [vectorResults, bm25Results] = await Promise.all([
      vectorSearch(message, 3),
      Promise.resolve(bm25Search(message, 2))
    ]);

    // Combinar, evitando duplicados (misma respuesta)
    const combined = [...vectorResults];
    for (const bm25 of bm25Results) {
      const isDuplicate = combined.some(v =>
        v.answer === bm25.answer || v.question === bm25.question
      );
      if (!isDuplicate) combined.push(bm25);
    }

    return combined;
  }

  /**
   * Buscar precios vigentes por producto y variante
   */
  async function findPrice(productName, variant) {
    if (!productName) return [];

    try {
      const [rows] = await pool.query(
        `SELECT product_name, variant, price, notes
         FROM product_prices
         WHERE is_active = TRUE
           AND (product_name LIKE ? OR product_name LIKE ?)
         ORDER BY
           CASE WHEN variant LIKE ? THEN 0 ELSE 1 END,
           price ASC
         LIMIT 5`,
        [`%${productName}%`, `%${variant || ''}%`, `%${variant || ''}%`]
      );
      return rows;
    } catch (err) {
      logger.error({ err }, 'Knowledge retriever: error buscando precios');
      return [];
    }
  }

  /**
   * Extraer producto/variante del texto del cliente
   * (heuristico basico — se puede mejorar con NLP)
   */
  function extractProductInfo(text) {
    const normalized = (text || '').toLowerCase();

    // Detectar variantes/medidas
    const variantPatterns = [
      { pattern: /super\s*king/i, variant: 'Super King' },
      { pattern: /king/i, variant: 'King' },
      { pattern: /queen/i, variant: 'Queen' },
      { pattern: /full/i, variant: 'Full' },
      { pattern: /2\s*plazas?|dos\s*plazas?|doble/i, variant: '2 Plazas' },
      { pattern: /plaza\s*y\s*media|1\.5\s*plazas?|1\s*1\/2/i, variant: 'Plaza y media' },
      { pattern: /1\s*plaza|una\s*plaza/i, variant: '1 Plaza' }
    ];

    let variant = null;
    for (const vp of variantPatterns) {
      if (vp.pattern.test(normalized)) {
        variant = vp.variant;
        break;
      }
    }

    // Extraer nombre de producto (simplificado — busca palabras clave)
    // En produccion esto se mejoraria con la lista real de productos
    const productName = normalized
      .replace(/cu[aá]nto|vale|cuesta|sale|precio|quiero|ver|el|la|un|una|en|de/gi, '')
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 2)
      .join(' ')
      .trim();

    return { productName: productName || null, variant };
  }

  /**
   * Cargar contexto conversacional reciente
   * Agrupa mensajes consecutivos del mismo remitente en turnos
   */
  async function getRecentContext(sessionId, rawLimit) {
    const limit = rawLimit || CONTEXT_MESSAGES();

    try {
      const [rows] = await pool.query(
        `SELECT direction, text, created_at FROM chat_messages
         WHERE session_id = ? AND text IS NOT NULL AND text != ''
         ORDER BY created_at DESC LIMIT ?`,
        [sessionId, limit]
      );

      const messages = rows.reverse(); // mas antiguo primero

      // Agrupar mensajes consecutivos del mismo remitente
      const grouped = [];
      let current = null;

      for (const msg of messages) {
        if (current && current.direction === msg.direction) {
          // Mismo remitente → concatenar
          current.text += '\n' + msg.text;
        } else {
          if (current) grouped.push(current);
          current = { direction: msg.direction, text: msg.text };
        }
      }
      if (current) grouped.push(current);

      return grouped;
    } catch (err) {
      logger.error({ err, sessionId }, 'Knowledge retriever: error cargando contexto');
      return [];
    }
  }

  return {
    retrieve,
    vectorSearch,
    bm25Search,
    findPrice,
    isPriceQuery,
    extractProductInfo,
    getRecentContext
  };
}

module.exports = { createKnowledgeRetriever };
