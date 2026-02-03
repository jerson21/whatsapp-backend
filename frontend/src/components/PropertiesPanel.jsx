import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useFlowStore } from '../store/flowStore'
import { useAuthStore } from '../store/authStore'

const INTENT_OPTIONS = [
  { value: 'sales', labelKey: 'properties.intentsOptions.sales', color: '#10b981' },
  { value: 'support', labelKey: 'properties.intentsOptions.support', color: '#3b82f6' },
  { value: 'complaint', labelKey: 'properties.intentsOptions.complaints', color: '#ef4444' },
  { value: 'info', labelKey: 'properties.intentsOptions.info', color: '#8b5cf6' },
  { value: 'greeting', labelKey: 'properties.intentsOptions.greeting', color: '#f59e0b' }
]

const URGENCY_OPTIONS = [
  { value: 'low', labelKey: 'properties.urgencyOptions.low' },
  { value: 'medium', labelKey: 'properties.urgencyOptions.medium' },
  { value: 'high', labelKey: 'properties.urgencyOptions.high' },
  { value: 'critical', labelKey: 'properties.urgencyOptions.critical' }
]

export default function PropertiesPanel() {
  const { t } = useTranslation('flowBuilder')
  const { selectedNode, updateNodeData, deleteNode, isPropertiesOpen, toggleProperties } = useFlowStore()
  const [localData, setLocalData] = useState({})
  const [triggerConfig, setTriggerConfig] = useState({ type: 'keyword', keywords: [], conditions: {} })
  const [departments, setDepartments] = useState([])
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (selectedNode) {
      setLocalData(selectedNode.data || {})
      // Load trigger config if it's a trigger node
      if (selectedNode.type === 'trigger' && selectedNode.data?.config) {
        setTriggerConfig(selectedNode.data.config)
      }
    }
  }, [selectedNode])

  // Cargar departamentos cuando se selecciona un nodo transfer
  useEffect(() => {
    if (selectedNode?.type === 'transfer' && departments.length === 0 && token) {
      fetch('/api/departments', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(data => setDepartments(data.departments || []))
        .catch(() => {})
    }
  }, [selectedNode?.type, token])

  const handleChange = (field, value) => {
    const newData = { ...localData, [field]: value }
    setLocalData(newData)
    updateNodeData(selectedNode.id, { [field]: value })
  }

  const handleOptionChange = (index, field, value) => {
    const options = [...(localData.options || [])]
    options[index] = { ...options[index], [field]: value }
    handleChange('options', options)
  }

  const addOption = () => {
    const options = [...(localData.options || []), { label: t('properties.newOption'), value: '' }]
    handleChange('options', options)
  }

  const removeOption = (index) => {
    const options = localData.options.filter((_, i) => i !== index)
    handleChange('options', options)
  }

  // Trigger config handlers
  const handleTriggerTypeChange = (type) => {
    const newConfig = { type, keywords: [], conditions: {} }
    setTriggerConfig(newConfig)
    updateNodeData(selectedNode.id, { config: newConfig })
  }

  const handleKeywordsChange = (keywordsStr) => {
    const keywords = keywordsStr.split(',').map(k => k.trim()).filter(k => k)
    const newConfig = { ...triggerConfig, keywords }
    setTriggerConfig(newConfig)
    updateNodeData(selectedNode.id, { config: newConfig })
  }

  const handleIntentToggle = (intent) => {
    const currentIntents = triggerConfig.conditions?.intent || []
    let newIntents
    if (currentIntents.includes(intent)) {
      newIntents = currentIntents.filter(i => i !== intent)
    } else {
      newIntents = [...currentIntents, intent]
    }
    const newConfig = {
      ...triggerConfig,
      conditions: { ...triggerConfig.conditions, intent: newIntents }
    }
    setTriggerConfig(newConfig)
    updateNodeData(selectedNode.id, { config: newConfig })
  }

  const handleUrgencyChange = (urgency) => {
    const newConfig = {
      ...triggerConfig,
      conditions: { ...triggerConfig.conditions, urgency }
    }
    setTriggerConfig(newConfig)
    updateNodeData(selectedNode.id, { config: newConfig })
  }

  const handleMinLeadScoreChange = (score) => {
    const newConfig = {
      ...triggerConfig,
      conditions: { ...triggerConfig.conditions, min_lead_score: parseInt(score) || 0 }
    }
    setTriggerConfig(newConfig)
    updateNodeData(selectedNode.id, { config: newConfig })
  }

  if (!isPropertiesOpen || !selectedNode) {
    return null
  }

  return (
    <div style={{
      width: '300px',
      background: 'white',
      borderLeft: '1px solid #e5e7eb',
      padding: '16px',
      height: '100%',
      overflow: 'auto'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
      }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
          {t('properties.title')}
        </h3>
        <button
          onClick={toggleProperties}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '18px',
            color: '#6b7280'
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '16px' }}>
        Tipo: <strong>{selectedNode.type}</strong>
      </div>

      {/* Label */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
          {t('properties.label')}
        </label>
        <input
          type="text"
          value={localData.label || ''}
          onChange={(e) => handleChange('label', e.target.value)}
          style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '13px'
          }}
        />
      </div>

      {/* Trigger Configuration */}
      {selectedNode.type === 'trigger' && (
        <div style={{
          marginBottom: '16px',
          padding: '12px',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0'
        }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '12px', color: '#475569' }}>
            {t('properties.triggerConfig')}
          </label>

          {/* Trigger Type */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '6px', color: '#64748b' }}>
              {t('properties.triggerType')}
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[
                { value: 'keyword', labelKey: 'properties.keywords' },
                { value: 'classification', labelKey: 'properties.classification' },
                { value: 'always', labelKey: 'properties.always' }
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleTriggerTypeChange(opt.value)}
                  style={{
                    flex: 1,
                    padding: '8px 4px',
                    fontSize: '11px',
                    border: triggerConfig.type === opt.value ? '2px solid #25D366' : '1px solid #d1d5db',
                    borderRadius: '6px',
                    background: triggerConfig.type === opt.value ? '#dcfce7' : 'white',
                    color: triggerConfig.type === opt.value ? '#166534' : '#6b7280',
                    cursor: 'pointer',
                    fontWeight: triggerConfig.type === opt.value ? 600 : 400
                  }}
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Keywords input */}
          {triggerConfig.type === 'keyword' && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px', color: '#64748b' }}>
                {t('properties.keywordsLabel')}
              </label>
              <input
                type="text"
                value={(triggerConfig.keywords || []).join(', ')}
                onChange={(e) => handleKeywordsChange(e.target.value)}
                placeholder={t('properties.keywordsPlaceholder')}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
              <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                {t('properties.keywordsHelp')}
              </p>
            </div>
          )}

          {/* Classification options */}
          {triggerConfig.type === 'classification' && (
            <>
              {/* Intents */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '6px', color: '#64748b' }}>
                  {t('properties.intents')}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {INTENT_OPTIONS.map(intent => {
                    const isSelected = (triggerConfig.conditions?.intent || []).includes(intent.value)
                    return (
                      <button
                        key={intent.value}
                        onClick={() => handleIntentToggle(intent.value)}
                        style={{
                          padding: '6px 10px',
                          fontSize: '11px',
                          border: isSelected ? `2px solid ${intent.color}` : '1px solid #d1d5db',
                          borderRadius: '16px',
                          background: isSelected ? `${intent.color}20` : 'white',
                          color: isSelected ? intent.color : '#6b7280',
                          cursor: 'pointer',
                          fontWeight: isSelected ? 600 : 400
                        }}
                      >
                        {isSelected && '✓ '}{t(intent.labelKey)}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Urgency */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px', color: '#64748b' }}>
                  {t('properties.minUrgency')}
                </label>
                <select
                  value={triggerConfig.conditions?.urgency || ''}
                  onChange={(e) => handleUrgencyChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '12px'
                  }}
                >
                  <option value="">{t('properties.anyUrgency')}</option>
                  {URGENCY_OPTIONS.map(u => (
                    <option key={u.value} value={u.value}>{t(u.labelKey)}</option>
                  ))}
                </select>
              </div>

              {/* Lead Score */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px', color: '#64748b' }}>
                  {t('properties.minLeadScore')}
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={triggerConfig.conditions?.min_lead_score || 0}
                  onChange={(e) => handleMinLeadScoreChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '12px'
                  }}
                />
                <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                  {t('properties.leadScoreHelp')}
                </p>
              </div>
            </>
          )}

          {/* Always trigger info */}
          {triggerConfig.type === 'always' && (
            <div style={{
              padding: '12px',
              background: '#fef3c7',
              borderRadius: '6px',
              border: '1px solid #fcd34d'
            }}>
              <p style={{ fontSize: '11px', color: '#92400e', margin: 0 }}>
                ⚠️ {t('properties.alwaysWarning')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Content (for message, question, transfer) */}
      {['message', 'question', 'transfer'].includes(selectedNode.type) && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
            {t('properties.messageContent')}
          </label>
          <textarea
            value={localData.content || ''}
            onChange={(e) => handleChange('content', e.target.value)}
            rows={4}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px',
              resize: 'vertical'
            }}
            placeholder={t('properties.messagePlaceholder')}
          />
          <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
            {t('properties.variableHelp')}
          </p>
        </div>
      )}

      {/* Department selector (for transfer nodes) */}
      {selectedNode.type === 'transfer' && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
            {t('properties.targetDepartment')}
          </label>
          <select
            value={localData.targetDepartmentId || ''}
            onChange={(e) => handleChange('targetDepartmentId', e.target.value ? Number(e.target.value) : null)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px'
            }}
          >
            <option value="">{t('properties.autoDepartment')}</option>
            {departments.filter(d => d.active).map(d => (
              <option key={d.id} value={d.id}>
                {d.display_name || d.name}
              </option>
            ))}
          </select>
          <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
            {t('properties.departmentHelp')}
          </p>
        </div>
      )}

      {/* Variable (for question) */}
      {selectedNode.type === 'question' && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
            {t('properties.saveVariable')}
          </label>
          <input
            type="text"
            value={localData.variable || ''}
            onChange={(e) => handleChange('variable', e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px'
            }}
            placeholder="nombre_variable"
          />
        </div>
      )}

      {/* Options (for question) */}
      {selectedNode.type === 'question' && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '8px' }}>
            {t('properties.responseOptions')}
          </label>
          {(localData.options || []).map((opt, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="text"
                value={opt.label}
                onChange={(e) => handleOptionChange(idx, 'label', e.target.value)}
                placeholder={t('properties.optionText')}
                style={{
                  flex: 1,
                  padding: '6px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}
              />
              <input
                type="text"
                value={opt.value}
                onChange={(e) => handleOptionChange(idx, 'value', e.target.value)}
                placeholder={t('properties.optionValue')}
                style={{
                  width: '80px',
                  padding: '6px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}
              />
              <button
                onClick={() => removeOption(idx)}
                style={{
                  background: '#fee2e2',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0 8px',
                  cursor: 'pointer',
                  color: '#ef4444'
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={addOption}
            style={{
              background: '#f3f4f6',
              border: '1px dashed #d1d5db',
              borderRadius: '6px',
              padding: '8px',
              width: '100%',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            {t('properties.addOption')}
          </button>
        </div>
      )}

      {/* Action type (for action node) */}
      {selectedNode.type === 'action' && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
            {t('properties.actionType')}
          </label>
          <select
            value={localData.action || ''}
            onChange={(e) => handleChange('action', e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px'
            }}
          >
            <option value="">{t('properties.selectAction')}</option>
            <option value="notify_sales">{t('properties.notifySales')}</option>
            <option value="create_ticket">{t('properties.createTicket')}</option>
            <option value="save_lead">{t('properties.saveLead')}</option>
            <option value="send_email">{t('properties.sendEmail')}</option>
            <option value="webhook">{t('properties.callWebhook')}</option>
            <option value="search_faq">{t('properties.searchFaq')}</option>
          </select>
        </div>
      )}

      {/* AI Response node configuration */}
      {selectedNode.type === 'ai_response' && (
        <div style={{
          marginBottom: '16px',
          padding: '12px',
          background: '#f5f3ff',
          borderRadius: '8px',
          border: '1px solid #c4b5fd'
        }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '12px', color: '#5b21b6' }}>
            🧠 {t('properties.aiConfig')}
          </label>

          {/* System prompt */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px', color: '#6b7280' }}>
              {t('properties.systemPrompt')}
            </label>
            <textarea
              value={localData.system_prompt || ''}
              onChange={(e) => handleChange('system_prompt', e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '12px',
                resize: 'vertical'
              }}
              placeholder={t('properties.systemPromptPlaceholder')}
            />
          </div>

          {/* User prompt */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px', color: '#6b7280' }}>
              {t('properties.userPrompt')}
            </label>
            <textarea
              value={localData.user_prompt || ''}
              onChange={(e) => handleChange('user_prompt', e.target.value)}
              rows={2}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '12px',
                resize: 'vertical'
              }}
              placeholder={t('properties.userPromptPlaceholder')}
            />
            <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
              {t('properties.dynamicVariableHelp')}
            </p>
          </div>

          {/* Model selection */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px', color: '#6b7280' }}>
              {t('properties.model')}
            </label>
            <select
              value={localData.model || 'gpt-4o-mini'}
              onChange={(e) => handleChange('model', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '12px'
              }}
            >
              <option value="gpt-4o-mini">{t('properties.modelMini')}</option>
              <option value="gpt-4o">{t('properties.modelGpt4o')}</option>
              <option value="gpt-4-turbo">{t('properties.modelGpt4Turbo')}</option>
            </select>
          </div>

          {/* Temperature and max tokens */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px', color: '#6b7280' }}>
                {t('properties.temperature')}
              </label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={localData.temperature || 0.7}
                onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px', color: '#6b7280' }}>
                {t('properties.maxTokens')}
              </label>
              <input
                type="number"
                min="50"
                max="2000"
                step="50"
                value={localData.max_tokens || 200}
                onChange={(e) => handleChange('max_tokens', parseInt(e.target.value))}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
            </div>
          </div>

          {/* Variable to save response */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px', color: '#6b7280' }}>
              {t('properties.saveResponseVariable')}
            </label>
            <input
              type="text"
              value={localData.variable || ''}
              onChange={(e) => handleChange('variable', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '12px'
              }}
              placeholder="ai_response"
            />
          </div>
        </div>
      )}

      {/* Webhook node configuration */}
      {selectedNode.type === 'webhook' && (
        <div style={{
          marginBottom: '16px',
          padding: '12px',
          background: '#fff7ed',
          borderRadius: '8px',
          border: '1px solid #fed7aa'
        }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '12px', color: '#c2410c' }}>
            🌐 {t('properties.webhookConfig')}
          </label>

          {/* URL */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px', color: '#6b7280' }}>
              {t('properties.endpointUrl')}
            </label>
            <input
              type="text"
              value={localData.url || ''}
              onChange={(e) => handleChange('url', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '12px'
              }}
              placeholder={t('properties.endpointPlaceholder')}
            />
          </div>

          {/* Method */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px', color: '#6b7280' }}>
              {t('properties.httpMethod')}
            </label>
            <select
              value={localData.method || 'POST'}
              onChange={(e) => handleChange('method', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '12px'
              }}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>

          {/* Headers */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px', color: '#6b7280' }}>
              {t('properties.headers')}
            </label>
            <textarea
              value={localData.headers || '{\n  "Content-Type": "application/json"\n}'}
              onChange={(e) => handleChange('headers', e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '11px',
                fontFamily: 'monospace',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Body */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px', color: '#6b7280' }}>
              {t('properties.body')}
            </label>
            <textarea
              value={localData.body || '{\n  "phone": "{{phone}}",\n  "message": "{{initial_message}}"\n}'}
              onChange={(e) => handleChange('body', e.target.value)}
              rows={4}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '11px',
                fontFamily: 'monospace',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Timeout */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px', color: '#6b7280' }}>
              {t('properties.timeout')}
            </label>
            <input
              type="number"
              min="1000"
              max="30000"
              step="1000"
              value={localData.timeout || 5000}
              onChange={(e) => handleChange('timeout', parseInt(e.target.value))}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '12px'
              }}
            />
          </div>

          {/* Variable to save response */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px', color: '#6b7280' }}>
              {t('properties.webhookSaveVariable')}
            </label>
            <input
              type="text"
              value={localData.variable || ''}
              onChange={(e) => handleChange('variable', e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '12px'
              }}
              placeholder="api_response"
            />
          </div>
        </div>
      )}

      {/* Delay node configuration */}
      {selectedNode.type === 'delay' && (
        <div style={{
          marginBottom: '16px',
          padding: '12px',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #cbd5e1'
        }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '12px', color: '#475569' }}>
            ⏱️ {t('properties.delayConfig')}
          </label>

          {/* Seconds */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, marginBottom: '4px', color: '#6b7280' }}>
              {t('properties.delaySeconds')}
            </label>
            <input
              type="number"
              min="1"
              max="60"
              step="1"
              value={localData.seconds || 2}
              onChange={(e) => handleChange('seconds', parseInt(e.target.value))}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '13px'
              }}
            />
            <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
              {t('properties.delayHelp')}
            </p>
          </div>

          {/* Typing indicator */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={localData.typing_indicator !== false}
                onChange={(e) => handleChange('typing_indicator', e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '12px', color: '#374151' }}>
                {t('properties.showTyping')}
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Delete button */}
      <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
        <button
          onClick={() => deleteNode(selectedNode.id)}
          style={{
            width: '100%',
            padding: '10px',
            background: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#dc2626',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '13px'
          }}
        >
          🗑️ {t('properties.deleteNode')}
        </button>
      </div>
    </div>
  )
}
