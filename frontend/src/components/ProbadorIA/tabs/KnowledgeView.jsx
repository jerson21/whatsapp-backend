import { BookOpen, DollarSign, Shield, AlertCircle, Check, Search } from 'lucide-react'

export default function KnowledgeView({ trace, sessionCorrections }) {
  const ai = trace?.aiFallback || {}
  const knowledge = ai.knowledge || {}
  const vectorResults = knowledge.vectorSearch?.results || []
  const bm25Results = knowledge.bm25Search?.results || []
  const allPairs = [...vectorResults, ...bm25Results]

  const priceQuery = ai.priceQuery || {}
  const prices = priceQuery.pricesFound || []

  const hasCorrections = sessionCorrections && sessionCorrections.length > 0
  const hasPairs = allPairs.length > 0
  const hasPrices = prices.length > 0

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      {/* Session corrections */}
      {hasCorrections && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Correcciones de esta sesion
          </h4>
          <div className="space-y-2">
            {sessionCorrections.map((correction, idx) => (
              <div
                key={idx}
                className={`rounded-lg p-3 border text-[11px] ${
                  correction.type === 'factual'
                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                    : 'bg-purple-50 border-purple-200 text-purple-800'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {correction.type === 'factual' ? (
                    <>
                      <Check className="w-3 h-3" />
                      <span className="font-semibold">Respuesta corregida</span>
                    </>
                  ) : (
                    <>
                      <Shield className="w-3 h-3" />
                      <span className="font-semibold">Regla agregada</span>
                    </>
                  )}
                </div>
                {correction.type === 'factual' ? (
                  <>
                    {correction.question && (
                      <p className="text-[10px] opacity-70 mb-0.5">P: {correction.question}</p>
                    )}
                    <p>R: {correction.correctedAnswer}</p>
                  </>
                ) : (
                  <p>{correction.rule}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Knowledge retrieval summary */}
      {knowledge.retrieverAvailable !== undefined && (
        <div className="flex flex-wrap gap-2 mb-2">
          <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${
            knowledge.retrieverAvailable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            Retriever: {knowledge.retrieverAvailable ? 'Disponible' : 'No disponible'}
          </span>
          {knowledge.vectorSearch?.durationMs && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
              Busqueda: {knowledge.vectorSearch.durationMs}ms
            </span>
          )}
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-medium">
            {knowledge.combinedCount || 0} resultados combinados
          </span>
        </div>
      )}

      {/* Vector search results */}
      {vectorResults.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 mb-2 flex items-center gap-1">
            <Search className="w-3 h-3" />
            Busqueda vectorial ({vectorResults.length})
          </h4>
          <div className="space-y-2">
            {vectorResults.map((pair, idx) => (
              <div key={`v-${idx}`} className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                    {pair.source === 'learned' ? 'Aprendido' : pair.source || 'Vector'}
                  </span>
                  {pair.similarityScore != null && (
                    <span className="text-[9px] font-mono text-gray-400">
                      {Math.round((pair.similarityScore || 0) * 100)}% similitud
                    </span>
                  )}
                  {pair.qualityScore != null && (
                    <span className="text-[9px] font-mono text-amber-500">
                      Q:{pair.qualityScore}
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-medium text-gray-700 mb-0.5">
                  P: {pair.question}
                </p>
                <p className="text-[11px] text-gray-500">
                  R: {pair.answerPreview}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BM25 results */}
      {bm25Results.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-teal-600 mb-2 flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            Busqueda BM25 / FAQ ({bm25Results.length})
          </h4>
          <div className="space-y-2">
            {bm25Results.map((pair, idx) => (
              <div key={`b-${idx}`} className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-600">
                  {pair.source === 'faq' ? 'FAQ' : pair.source || 'BM25'}
                </span>
                <p className="text-[11px] font-medium text-gray-700 mt-1.5 mb-0.5">
                  P: {pair.question}
                </p>
                <p className="text-[11px] text-gray-500">
                  R: {pair.answerPreview}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prices */}
      {hasPrices && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-green-600 mb-2 flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            Precios encontrados ({prices.length})
          </h4>
          {priceQuery.extractedProduct && (
            <p className="text-[10px] text-gray-500 mb-2">
              Producto detectado: <span className="font-medium text-gray-700">{priceQuery.extractedProduct}</span>
              {priceQuery.extractedVariant && <> · Variante: <span className="font-medium text-gray-700">{priceQuery.extractedVariant}</span></>}
            </p>
          )}
          <div className="bg-green-50 rounded-lg border border-green-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-green-200">
                  <th className="text-left px-3 py-1.5 text-[9px] font-semibold text-green-700 uppercase">Producto</th>
                  <th className="text-left px-3 py-1.5 text-[9px] font-semibold text-green-700 uppercase">Variante</th>
                  <th className="text-right px-3 py-1.5 text-[9px] font-semibold text-green-700 uppercase">Precio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-green-100">
                {prices.map((price, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-1.5 text-[11px] text-gray-700 font-medium">
                      {price.productName || '-'}
                    </td>
                    <td className="px-3 py-1.5 text-[11px] text-gray-500">
                      {price.variant || '-'}
                    </td>
                    <td className="px-3 py-1.5 text-[11px] text-gray-700 font-mono text-right font-medium">
                      ${Number(price.price || 0).toLocaleString('es-CL')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Price query info (even if no prices found) */}
      {priceQuery.isPriceQuery && !hasPrices && (
        <div className="rounded-lg p-3 bg-yellow-50 border border-yellow-200 text-[11px] text-yellow-800">
          <DollarSign className="w-3.5 h-3.5 inline mr-1" />
          Se detecto consulta de precio pero no se encontraron resultados
          {priceQuery.extractedProduct && <> para "{priceQuery.extractedProduct}"</>}
        </div>
      )}

      {/* Empty state */}
      {!hasPairs && !hasPrices && !hasCorrections && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BookOpen className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400 font-medium">No se inyecto conocimiento en esta respuesta</p>
          <p className="text-xs text-gray-300 mt-1">El bot puede haber respondido solo con el prompt base</p>
        </div>
      )}
    </div>
  )
}
