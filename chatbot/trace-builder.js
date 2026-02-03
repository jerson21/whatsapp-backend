'use strict';

/**
 * trace-builder.js
 *
 * Sistema de tracing para el pipeline del chatbot.
 * Se activa SOLO en modo tester (channel='tester').
 * Zero overhead en producción.
 */

function createTrace(inputMessage, inputPhone) {
  return {
    traceId: `trc_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    timestamp: new Date().toISOString(),
    _startTime: Date.now(),
    totalDurationMs: 0,
    inputMessage,
    inputPhone,
    sessionId: null,
    sessionCreated: false,

    entry: null,
    modeCheck: null,
    globalKeyword: null,
    sessionState: null,
    classification: null,
    flowMatching: null,
    flowExecution: undefined,
    aiFallback: undefined,
    result: null
  };
}

function finalizeTrace(trace) {
  if (!trace) return null;
  trace.totalDurationMs = Date.now() - trace._startTime;
  delete trace._startTime;

  if (!trace.result) {
    trace.result = {
      type: 'unknown',
      path: 'unknown',
      responseSent: false,
      responseTexts: [],
      messageDbIds: [],
      totalPipelineMs: trace.totalDurationMs
    };
  }
  trace.result.totalPipelineMs = trace.totalDurationMs;
  return trace;
}

/** Helper: captura timing de una operación async */
async function traceStep(fn) {
  const start = Date.now();
  try {
    const result = await fn();
    return { result, durationMs: Date.now() - start, error: null };
  } catch (err) {
    return { result: null, durationMs: Date.now() - start, error: err.message || String(err) };
  }
}

module.exports = { createTrace, finalizeTrace, traceStep };
