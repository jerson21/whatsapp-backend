// ============================================================================
// API CONFIGURATION V2 - ENDPOINTS PARA CONFIGURACIÓN DE FLUJOS
// ============================================================================
// Endpoints específicos para el editor/configurador de flujos V2
// ============================================================================

const express = require('express');
const router = express.Router();
const P = require('pino');

const logger = P({
  level: process.env.LOG_LEVEL || 'info'
});

module.exports = function createConversationFlowsConfigV2API(pool) {

  // Importar función para obtener plantillas reales de Meta
  const WABA_ID = process.env.WABA_ID || '';
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
  const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v22.0';

  // Función para obtener plantillas de Meta (reutilizando lógica de app-cloud.js)
  async function listWabaTemplates({ limit = 100, includeComponents = false } = {}) {
    if (!WABA_ID) throw new Error('Falta WABA_ID en variables de entorno');
    if (!META_ACCESS_TOKEN) throw new Error('Falta META_ACCESS_TOKEN en variables de entorno');

    const fields = includeComponents
      ? 'name,language,status,category,components'
      : 'name,language,status,category';

    const base =
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${WABA_ID}/message_templates` +
      `?fields=${encodeURIComponent(fields)}&limit=${limit}`;

    const items = [];
    let url = base;

    while (url) {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}` } });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error?.message || `Meta API error (${r.status})`);

      if (Array.isArray(json.data)) items.push(...json.data);
      if (items.length >= limit) break;
      url = json.paging?.next || null;
    }
    return items.slice(0, limit);
  }
  
  /**
   * GET /api/conversation-flows-config-v2/templates
   * Obtiene lista de templates disponibles (de Meta y configurados)
   */
  router.get('/templates', async (req, res) => {
    try {
      // Obtener plantillas reales de Meta
      const metaTemplates = await listWabaTemplates({ limit: 500, includeComponents: false });
      
      // Obtener templates configurados en la BD
      const [configuredTemplates] = await pool.query(`
        SELECT DISTINCT 
          template_name,
          COUNT(*) as flows_count,
          MAX(updated_at) as last_updated
        FROM conversation_flows
        WHERE is_active = TRUE
        GROUP BY template_name
        ORDER BY template_name
      `);

      // Crear mapa de templates configurados
      const configuredMap = {};
      configuredTemplates.forEach(ct => {
        configuredMap[ct.template_name] = ct;
      });

      // Procesar templates de Meta y combinar con configurados
      const allTemplates = [];
      
      // Agrupar templates de Meta por nombre (pueden tener múltiples idiomas)
      const metaByName = {};
      metaTemplates.forEach(template => {
        if (!metaByName[template.name]) {
          metaByName[template.name] = [];
        }
        metaByName[template.name].push(template);
      });

      // Crear lista final con templates de Meta
      Object.keys(metaByName).forEach(templateName => {
        const variants = metaByName[templateName];
        const firstVariant = variants[0];
        const configured = configuredMap[templateName];
        
        // Determinar estado global del template
        const hasApproved = variants.some(v => v.status === 'APPROVED');
        const allApproved = variants.every(v => v.status === 'APPROVED');
        
        allTemplates.push({
          name: templateName,
          display: getTemplateDisplayName(templateName, firstVariant.category),
          category: mapMetaCategory(firstVariant.category),
          configured: !!configured,
          flows_count: configured?.flows_count || 0,
          last_updated: configured?.last_updated || null,
          // Información adicional de Meta
          meta_status: allApproved ? 'APPROVED' : (hasApproved ? 'PARTIAL' : firstVariant.status),
          languages: variants.map(v => ({ lang: v.language, status: v.status })),
          variants_count: variants.length
        });
      });

      // Agregar templates configurados que ya no existen en Meta (desaprobados/eliminados)
      configuredTemplates.forEach(ct => {
        if (!metaByName[ct.template_name]) {
          allTemplates.push({
            name: ct.template_name,
            display: ct.template_name,
            category: 'legacy',
            configured: true,
            flows_count: ct.flows_count,
            last_updated: ct.last_updated,
            meta_status: 'NOT_FOUND',
            languages: [],
            variants_count: 0,
            deprecated: true
          });
        }
      });

      // Calcular estadísticas para el frontend
      const meta = {
        real_meta_templates: Object.keys(metaByName).length,
        configured: allTemplates.filter(t => t.configured).length,
        needs_configuration: allTemplates.filter(t => !t.configured && !t.deprecated).length,
        legacy_templates: allTemplates.filter(t => t.deprecated).length,
        approved_templates: allTemplates.filter(t => t.meta_status === 'APPROVED').length,
        total_variants: metaTemplates.length
      };

      res.json({
        ok: true,  // Frontend espera 'ok' en lugar de 'success'
        templates: allTemplates,
        meta
      });

    } catch (error) {
      logger.error({ error: error.message }, '❌ Error obteniendo templates');
      res.status(500).json({
        ok: false,  // ✅ Consistencia con frontend
        error: 'Error obteniendo templates'
      });
    }
  });

  /**
   * GET /api/conversation-flows-config-v2/template/:template_name/details
   * Obtiene detalles completos de una plantilla de Meta (estructura, componentes, etc.)
   */
  router.get('/template/:template_name/details', async (req, res) => {
    try {
      const { template_name } = req.params;
      
      // Obtener plantilla de Meta con componentes
      const metaTemplates = await listWabaTemplates({ limit: 500, includeComponents: true });
      
      // Filtrar por nombre de plantilla
      const templateVariants = metaTemplates.filter(t => t.name === template_name);
      
      if (templateVariants.length === 0) {
        return res.status(404).json({
          ok: false,
          error: `Plantilla '${template_name}' no encontrada en Meta`
        });
      }

      // Obtener flujos configurados para esta plantilla
      const [configuredFlows] = await pool.query(`
        SELECT COUNT(*) as flows_count, 
               MAX(updated_at) as last_updated,
               MIN(created_at) as first_created
        FROM conversation_flows
        WHERE template_name = ? AND is_active = TRUE
      `, [template_name]);

      // Procesar variantes de la plantilla
      const variants = templateVariants.map(variant => ({
        language: variant.language,
        status: variant.status,
        category: variant.category,
        components: variant.components || [],
        // Análisis de componentes
        has_header: variant.components?.some(c => c.type === 'HEADER') || false,
        has_body: variant.components?.some(c => c.type === 'BODY') || false,
        has_footer: variant.components?.some(c => c.type === 'FOOTER') || false,
        has_buttons: variant.components?.some(c => c.type === 'BUTTONS') || false,
        // Variables disponibles
        variables: extractTemplateVariables(variant.components || [])
      }));

      // Plantilla principal (primera variante aprobada o primera disponible)
      const mainVariant = variants.find(v => v.status === 'APPROVED') || variants[0];

      const templateDetails = {
        name: template_name,
        display: getTemplateDisplayName(template_name, mainVariant.category),
        category: mapMetaCategory(mainVariant.category),
        
        // Estados de Meta
        variants,
        total_variants: variants.length,
        approved_variants: variants.filter(v => v.status === 'APPROVED').length,
        languages: variants.map(v => v.language),
        
        // Estructura de la plantilla
        structure: {
          has_header: mainVariant.has_header,
          has_body: mainVariant.has_body,
          has_footer: mainVariant.has_footer,
          has_buttons: mainVariant.has_buttons,
          components: mainVariant.components
        },
        
        // Variables disponibles
        variables: mainVariant.variables,
        
        // Estado de configuración
        configured: configuredFlows[0].flows_count > 0,
        flows_count: configuredFlows[0].flows_count,
        last_updated: configuredFlows[0].last_updated,
        first_created: configuredFlows[0].first_created
      };

      res.json({
        ok: true,
        template: templateDetails
      });

    } catch (error) {
      logger.error({ 
        error: error.message, 
        template_name: req.params.template_name 
      }, '❌ Error obteniendo detalles de plantilla');
      res.status(500).json({
        ok: false,
        error: 'Error obteniendo detalles de plantilla'
      });
    }
  });

  /**
   * GET /api/conversation-flows-config-v2/tree/:template_name
   * Obtiene el árbol de flujos para un template específico
   */
  router.get('/tree/:template_name', async (req, res) => {
    try {
      const { template_name } = req.params;
      
      // Obtener todos los flujos del template
      const [flows] = await pool.query(`
        SELECT 
          id, parent_step_id, step_number, step_name, step_description,
          trigger_keywords, trigger_sentiment, trigger_exact_match, trigger_priority,
          response_text, response_type, response_variables,
          next_steps, max_uses_per_conversation, timeout_hours,
          requires_human_fallback, ai_context_prompt, metadata,
          is_active, created_at, updated_at
        FROM conversation_flows
        WHERE template_name = ? AND is_active = TRUE
        ORDER BY step_number, trigger_priority DESC
      `, [template_name]);

      // Construir árbol jerárquico
      const tree = buildFlowTree(flows);

      res.json({
        ok: true,  // ✅ Cambiado para consistencia con frontend
        template_name,
        flows_count: flows.length,
        tree
      });

    } catch (error) {
      logger.error({ 
        error: error.message, 
        template_name: req.params.template_name 
      }, '❌ Error obteniendo árbol de flujo');
      res.status(500).json({
        ok: false,  // ✅ Consistencia en errores también
        error: 'Error obteniendo árbol de flujo'
      });
    }
  });

  /**
   * POST /api/conversation-flows-config-v2/flow
   * Crea un nuevo flujo (con validación de plantilla Meta)
   */
  router.post('/flow', async (req, res) => {
    try {
      const {
        template_name,
        parent_step_id,
        step_name,
        step_description,
        trigger_keywords,
        response_text,
        response_type = 'fixed',
        requires_human_fallback = false
      } = req.body;

      if (!template_name || !response_text) {
        return res.status(400).json({
          success: false,
          error: 'template_name y response_text son obligatorios'
        });
      }

      // VALIDACIÓN: Verificar que la plantilla existe en Meta y está aprobada
      try {
        const metaTemplates = await listWabaTemplates({ limit: 500, includeComponents: false });
        const templateExists = metaTemplates.some(t => 
          t.name === template_name && t.status === 'APPROVED'
        );
        
        if (!templateExists) {
          return res.status(400).json({
            success: false,
            error: `Plantilla '${template_name}' no encontrada o no aprobada en Meta`
          });
        }
      } catch (metaError) {
        logger.warn({ 
          error: metaError.message, 
          template_name 
        }, '⚠️ No se pudo validar plantilla en Meta, continuando...');
      }

      // Determinar step_number
      const [maxStep] = await pool.query(`
        SELECT MAX(step_number) as max_step 
        FROM conversation_flows 
        WHERE template_name = ?
      `, [template_name]);
      
      const step_number = parent_step_id ? (maxStep[0].max_step || 0) + 1 : 1;

      // Insertar nuevo flujo
      const [result] = await pool.query(`
        INSERT INTO conversation_flows (
          template_name, step_number, parent_step_id, step_name, step_description,
          trigger_keywords, response_text, response_type, requires_human_fallback,
          trigger_priority, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, TRUE)
      `, [
        template_name, step_number, parent_step_id, step_name, step_description,
        JSON.stringify(trigger_keywords || ['*']), response_text, response_type, 
        requires_human_fallback
      ]);

      res.json({
        success: true,
        flow_id: result.insertId,
        message: 'Flujo creado exitosamente'
      });

    } catch (error) {
      logger.error({ error: error.message }, '❌ Error creando flujo');
      res.status(500).json({
        success: false,
        error: 'Error creando flujo'
      });
    }
  });

  /**
   * PUT /api/conversation-flows-config-v2/flow/:id
   * Actualiza un flujo existente
   */
  router.put('/flow/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Construir query dinámico
      const fields = [];
      const values = [];
      
      Object.keys(updates).forEach(key => {
        if (key !== 'id' && updates[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(
            key === 'trigger_keywords' || key === 'response_variables' || key === 'metadata' 
              ? JSON.stringify(updates[key]) 
              : updates[key]
          );
        }
      });

      if (fields.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No hay campos para actualizar'
        });
      }

      values.push(id);
      
      await pool.query(
        `UPDATE conversation_flows SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      res.json({
        success: true,
        message: 'Flujo actualizado exitosamente'
      });

    } catch (error) {
      logger.error({ error: error.message, flow_id: req.params.id }, '❌ Error actualizando flujo');
      res.status(500).json({
        success: false,
        error: 'Error actualizando flujo'
      });
    }
  });

  /**
   * DELETE /api/conversation-flows-config-v2/flow/:id
   * Elimina un flujo (soft delete)
   */
  router.delete('/flow/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      await pool.query(
        `UPDATE conversation_flows SET is_active = FALSE WHERE id = ?`,
        [id]
      );

      res.json({
        success: true,
        message: 'Flujo eliminado exitosamente'
      });

    } catch (error) {
      logger.error({ error: error.message, flow_id: req.params.id }, '❌ Error eliminando flujo');
      res.status(500).json({
        success: false,
        error: 'Error eliminando flujo'
      });
    }
  });

  /**
   * POST /api/conversation-flows-config-v2/sync-templates
   * Sincroniza plantillas de Meta con la base de datos local
   */
  router.post('/sync-templates', async (req, res) => {
    try {
      const startTime = Date.now();
      
      // Obtener plantillas actuales de Meta
      const metaTemplates = await listWabaTemplates({ limit: 500, includeComponents: false });
      
      // Agrupar por nombre
      const metaByName = {};
      metaTemplates.forEach(template => {
        if (!metaByName[template.name]) {
          metaByName[template.name] = [];
        }
        metaByName[template.name].push(template);
      });

      // Obtener plantillas configuradas en BD
      const [configuredTemplates] = await pool.query(`
        SELECT DISTINCT template_name, COUNT(*) as flows_count
        FROM conversation_flows 
        WHERE is_active = TRUE 
        GROUP BY template_name
      `);

      const syncResults = {
        checked: Object.keys(metaByName).length,
        approved: 0,
        deprecated: 0,
        new_found: 0,
        with_flows: configuredTemplates.length
      };

      // Verificar estado de cada plantilla configurada
      const statusUpdates = [];
      
      for (const configured of configuredTemplates) {
        const metaVariants = metaByName[configured.template_name];
        
        if (!metaVariants) {
          // Plantilla ya no existe en Meta
          syncResults.deprecated++;
          statusUpdates.push({
            template_name: configured.template_name,
            status: 'deprecated',
            reason: 'No encontrada en Meta',
            flows_count: configured.flows_count
          });
        } else {
          const hasApproved = metaVariants.some(v => v.status === 'APPROVED');
          if (hasApproved) {
            syncResults.approved++;
            statusUpdates.push({
              template_name: configured.template_name,
              status: 'approved',
              variants: metaVariants.length,
              flows_count: configured.flows_count
            });
          } else {
            syncResults.deprecated++;
            statusUpdates.push({
              template_name: configured.template_name,
              status: 'not_approved',
              reason: 'Sin variantes aprobadas',
              variants: metaVariants.map(v => ({ lang: v.language, status: v.status })),
              flows_count: configured.flows_count
            });
          }
        }
      }

      // Plantillas nuevas disponibles en Meta
      const configuredNames = configuredTemplates.map(ct => ct.template_name);
      const newTemplates = [];
      
      Object.keys(metaByName).forEach(templateName => {
        if (!configuredNames.includes(templateName)) {
          const variants = metaByName[templateName];
          const hasApproved = variants.some(v => v.status === 'APPROVED');
          
          if (hasApproved) {
            syncResults.new_found++;
            newTemplates.push({
              name: templateName,
              display: getTemplateDisplayName(templateName, variants[0].category),
              category: mapMetaCategory(variants[0].category),
              variants: variants.length,
              approved_variants: variants.filter(v => v.status === 'APPROVED').length
            });
          }
        }
      });

      const syncTime = Date.now() - startTime;

      res.json({
        ok: true,
        sync_completed_at: new Date().toISOString(),
        sync_time_ms: syncTime,
        results: syncResults,
        configured_templates: statusUpdates,
        new_templates_available: newTemplates,
        recommendations: generateSyncRecommendations(syncResults, statusUpdates, newTemplates)
      });

    } catch (error) {
      logger.error({ error: error.message }, '❌ Error en sincronización de plantillas');
      res.status(500).json({
        ok: false,
        error: 'Error en sincronización de plantillas'
      });
    }
  });

  /**
   * POST /api/conversation-flows-config-v2/test
   * Prueba un flujo con un mensaje simulado
   */
  router.post('/test', async (req, res) => {
    try {
      const { template_name, client_message, session_id } = req.body;

      if (!template_name || !client_message) {
        return res.status(400).json({
          success: false,
          error: 'template_name y client_message son requeridos'
        });
      }

      // Simular procesamiento del flujo
      const testSessionId = session_id || Math.floor(Math.random() * 100000);
      
      // Buscar flujo que coincida
      const [flows] = await pool.query(`
        SELECT * FROM conversation_flows
        WHERE template_name = ? AND is_active = TRUE
        ORDER BY step_number, trigger_priority DESC
      `, [template_name]);

      let matchedFlow = null;
      const messageLower = client_message.toLowerCase();
      
      // USAR MISMA LÓGICA QUE PRODUCCIÓN (app-cloud.js)
      let bestMatch = null;
      let bestMatchScore = 0;
      
      for (const flow of flows) {
        try {
          // Manejar keywords corruptos (doble escape)
          let keywordsStr = flow.trigger_keywords || '[]';
          
          // Si está doblemente escaped, parsearlo dos veces
          if (keywordsStr.startsWith('"[') && keywordsStr.endsWith(']"')) {
            keywordsStr = JSON.parse(keywordsStr);
          }
          
          const keywords = JSON.parse(keywordsStr);
          let matchScore = 0;
          let hasMatch = false;
          
          console.log(`🔍 Flow ${flow.id}: "${flow.step_name}"`);
          console.log(`   Keywords: ${JSON.stringify(keywords)}`);
          console.log(`   Testing against: "${client_message}"`);
          
          for (const keyword of keywords) {
            if (keyword === client_message) {
              console.log(`   ✅ MATCH EXACTO: "${keyword}" === "${client_message}"`);
              matchScore = 100;
              hasMatch = true;
              break;
            } else if (keyword.toLowerCase() === messageLower) {
              console.log(`   ✅ MATCH LOWER: "${keyword.toLowerCase()}" === "${messageLower}"`);
              matchScore = 90;
              hasMatch = true;
            } else if (messageLower.includes(keyword.toLowerCase()) && keyword.length > 3) {
              console.log(`   ✅ MATCH PARTIAL: "${messageLower}" includes "${keyword.toLowerCase()}"`);
              matchScore = Math.max(matchScore, 70);
              hasMatch = true;
            } else if (keyword === '*') {
              console.log(`   ✅ MATCH WILDCARD: "*"`);
              matchScore = Math.max(matchScore, 10);
              hasMatch = true;
            } else {
              console.log(`   ❌ NO MATCH: "${keyword}" vs "${client_message}"`);
            }
          }
          
          // Seleccionar el mejor match
          if (hasMatch && matchScore > bestMatchScore) {
            console.log(`   🏆 NUEVO MEJOR MATCH: score ${matchScore} para flow ${flow.id}`);
            bestMatchScore = matchScore;
            bestMatch = flow;
          }
          
        } catch (e) {
          continue;
        }
      }
      
      matchedFlow = bestMatch;

      if (!matchedFlow) {
        return res.json({
          success: true,
          matched: false,
          response: 'No se encontró flujo coincidente',
          debug: {
            template_name,
            client_message,
            flows_checked: flows.length
          }
        });
      }

      res.json({
        success: true,
        matched: true,
        flow: {
          id: matchedFlow.id,
          step_name: matchedFlow.step_name,
          response_type: matchedFlow.response_type,
          response_text: matchedFlow.response_text
        },
        response: matchedFlow.response_text,
        debug: {
          template_name,
          client_message,
          matched_keywords: JSON.parse(matchedFlow.trigger_keywords || '[]'),
          session_id: testSessionId
        }
      });

    } catch (error) {
      logger.error({ error: error.message }, '❌ Error en test de flujo');
      res.status(500).json({
        success: false,
        error: 'Error en test de flujo'
      });
    }
  });

  // ============================================================================
  // ENDPOINTS FALTANTES PARA CONVERSATION-FLOWS-SIMPLE.PHP
  // ============================================================================

  /**
   * GET /api/conversation-flows-config-v2/tree/:template
   * Obtiene árbol de flujos para visualización simple
   */
  router.get('/tree/:template', async (req, res) => {
    try {
      const { template } = req.params;
      
      // Obtener todos los pasos del template
      const [steps] = await pool.query(`
        SELECT * FROM conversation_flows 
        WHERE template_name = ? AND is_active = TRUE
        ORDER BY step_number ASC, trigger_priority DESC
      `, [template]);
      
      // Construir árbol simple (sin jerarquía, solo lista)
      res.json({
        ok: true,
        template,
        tree: steps,
        total_steps: steps.length
      });
      
    } catch (error) {
      logger.error({ error: error.message }, 'Error obteniendo árbol de flujos');
      res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/conversation-flows-config-v2/debug/:template
   * Debug endpoint para ver exactamente qué flujos están guardados
   */
  router.get('/debug/:template', async (req, res) => {
    try {
      const { template } = req.params;
      
      // Obtener TODOS los flujos sin filtro
      const [allFlows] = await pool.query(`
        SELECT 
          id, 
          template_name,
          step_name,
          trigger_keywords,
          response_text,
          response_type,
          is_active,
          step_number,
          trigger_priority,
          created_at
        FROM conversation_flows 
        WHERE template_name = ?
        ORDER BY created_at DESC
      `, [template]);
      
      // Parsear keywords para mostrar claramente
      const debugFlows = allFlows.map(flow => {
        let parsedKeywords = [];
        try {
          // Manejar doble escape JSON
          let keywordsStr = flow.trigger_keywords || '[]';
          
          // Si está doblemente escaped, parsearlo dos veces
          if (keywordsStr.startsWith('"[') && keywordsStr.endsWith(']"')) {
            keywordsStr = JSON.parse(keywordsStr);
          }
          
          parsedKeywords = JSON.parse(keywordsStr);
        } catch (e) {
          parsedKeywords = ['ERROR PARSING: ' + flow.trigger_keywords];
        }
        
        return {
          ...flow,
          trigger_keywords_parsed: parsedKeywords,
          trigger_keywords_raw: flow.trigger_keywords
        };
      });
      
      res.json({
        success: true,
        template,
        total_flows: allFlows.length,
        flows: debugFlows,
        debug_info: {
          active_flows: allFlows.filter(f => f.is_active).length,
          inactive_flows: allFlows.filter(f => !f.is_active).length
        }
      });
      
    } catch (error) {
      logger.error({ error: error.message }, 'Error en debug de flujos');
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
};

/**
 * Funciones helper
 */

// Generar nombre display amigable para templates
function getTemplateDisplayName(templateName, category) {
  // Mapeo manual para nombres comunes
  const displayNames = {
    'notificacion_entrega': '🚚 Notificación de Entrega',
    'confirmacion_entrega': '✅ Confirmación de Entrega', 
    'recordatorio_pago': '💳 Recordatorio de Pago',
    'confirmacion_pedido': '📦 Confirmación de Pedido',
    'actualizacion_envio': '📍 Actualización de Envío',
    'encuesta_satisfaccion': '⭐ Encuesta de Satisfacción',
    'oferta_especial': '🎉 Oferta Especial',
    'bienvenida': '👋 Bienvenida',
    'despedida': '👋 Despedida'
  };

  if (displayNames[templateName]) {
    return displayNames[templateName];
  }

  // Generar nombre basado en categoría y template name
  const categoryEmojis = {
    'MARKETING': '📢',
    'UTILITY': '🔧', 
    'AUTHENTICATION': '🔐'
  };

  const emoji = categoryEmojis[category] || '📄';
  const humanName = templateName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  return `${emoji} ${humanName}`;
}

// Mapear categorías de Meta a categorías internas
function mapMetaCategory(metaCategory) {
  const categoryMap = {
    'MARKETING': 'marketing',
    'UTILITY': 'utility', 
    'AUTHENTICATION': 'auth'
  };
  
  return categoryMap[metaCategory] || 'other';
}

// Extraer variables de los componentes de una plantilla
function extractTemplateVariables(components) {
  const variables = [];
  
  components.forEach(component => {
    if (component.type === 'HEADER' && component.format === 'TEXT') {
      // Variables en header
      const headerVars = extractVariablesFromText(component.text);
      headerVars.forEach(v => variables.push({ ...v, component: 'header' }));
    }
    
    if (component.type === 'BODY') {
      // Variables en body
      const bodyVars = extractVariablesFromText(component.text);
      bodyVars.forEach(v => variables.push({ ...v, component: 'body' }));
    }
    
    if (component.type === 'BUTTONS') {
      // Variables en botones (menos común)
      component.buttons?.forEach((button, index) => {
        if (button.type === 'URL' && button.url) {
          const urlVars = extractVariablesFromText(button.url);
          urlVars.forEach(v => variables.push({ 
            ...v, 
            component: 'button', 
            button_index: index,
            button_type: 'url'
          }));
        }
      });
    }
  });
  
  return variables;
}

// Extraer variables {{N}} de un texto
function extractVariablesFromText(text) {
  if (!text) return [];
  
  const variableRegex = /\{\{(\d+)\}\}/g;
  const variables = [];
  let match;
  
  while ((match = variableRegex.exec(text)) !== null) {
    const index = parseInt(match[1]);
    if (!variables.find(v => v.index === index)) {
      variables.push({
        index,
        placeholder: match[0], // {{1}}, {{2}}, etc.
        required: true
      });
    }
  }
  
  return variables.sort((a, b) => a.index - b.index);
}

// Generar recomendaciones después de la sincronización
function generateSyncRecommendations(results, statusUpdates, newTemplates) {
  const recommendations = [];

  // Plantillas deprecadas
  const deprecatedWithFlows = statusUpdates.filter(s => 
    (s.status === 'deprecated' || s.status === 'not_approved') && s.flows_count > 0
  );
  
  if (deprecatedWithFlows.length > 0) {
    recommendations.push({
      type: 'warning',
      priority: 'high',
      title: 'Plantillas con problemas que tienen flujos configurados',
      description: `${deprecatedWithFlows.length} plantillas con flujos configurados ya no están disponibles o aprobadas en Meta`,
      action: 'Revisar y actualizar o deshabilitar estos flujos',
      affected_templates: deprecatedWithFlows.map(t => t.template_name)
    });
  }

  // Nuevas plantillas disponibles
  if (newTemplates.length > 0) {
    recommendations.push({
      type: 'info',
      priority: 'medium',
      title: 'Nuevas plantillas disponibles',
      description: `${newTemplates.length} plantillas aprobadas encontradas que aún no tienen flujos configurados`,
      action: 'Considerar configurar flujos conversacionales para estas plantillas',
      new_templates: newTemplates.slice(0, 5) // Mostrar solo las primeras 5
    });
  }

  // Estado general
  if (results.approved > 0) {
    recommendations.push({
      type: 'success',
      priority: 'low',
      title: 'Configuración saludable',
      description: `${results.approved} plantillas configuradas están funcionando correctamente`,
      action: null
    });
  }

  return recommendations;
}

/**
 * Construye árbol jerárquico desde array plano de flujos
 */
function buildFlowTree(flows) {
  const map = {};
  const tree = [];

  // Crear mapa de flujos por ID
  flows.forEach(flow => {
    map[flow.id] = { ...flow, children: [] };
  });

  // Construir árbol
  flows.forEach(flow => {
    if (flow.parent_step_id && map[flow.parent_step_id]) {
      map[flow.parent_step_id].children.push(map[flow.id]);
    } else if (!flow.parent_step_id) {
      tree.push(map[flow.id]);
    }
  });

  return tree;
}