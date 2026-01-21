// ============================================================================
// JAVASCRIPT PARA CONFIGURACIÓN DE FLUJOS CONVERSACIONALES
// ============================================================================
// Maneja la interface visual para crear y editar flujos conversacionales
// ============================================================================

class ConversationFlowsConfig {
    constructor() {
        this.currentTemplate = null;
        this.currentFlows = [];
        this.apiBaseUrl = 'https://whatsapp.respaldoschile.cl/api/conversation-flows';
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadTemplates();
    }

    bindEvents() {
        // Template selection
        document.getElementById('templateSelect').addEventListener('change', (e) => {
            this.currentTemplate = e.target.value;
            if (this.currentTemplate) {
                this.loadFlowTree();
                this.loadAnalytics();
            } else {
                this.clearFlowTree();
                this.clearAnalytics();
            }
        });

        // Add root step
        document.getElementById('addRootStepBtn').addEventListener('click', () => {
            if (!this.currentTemplate) {
                this.showAlert('error', 'Selecciona un template primero');
                return;
            }
            this.showStepModal(null, null, true);
        });

        // Save step
        document.getElementById('saveStepBtn').addEventListener('click', () => {
            this.saveStep();
        });

        // Response type change
        document.getElementById('responseType').addEventListener('change', (e) => {
            const aiSection = document.getElementById('aiContextSection');
            aiSection.style.display = e.target.value === 'ai_assisted' ? 'block' : 'none';
        });

        // Quick actions
        document.getElementById('duplicateFlowBtn').addEventListener('click', () => {
            this.duplicateFlow();
        });

        document.getElementById('clearFlowBtn').addEventListener('click', () => {
            this.clearFlow();
        });

        document.getElementById('resetAnalyticsBtn').addEventListener('click', () => {
            this.resetAnalytics();
        });

        document.getElementById('testFlowBtn').addEventListener('click', () => {
            this.testFlow();
        });

        document.getElementById('exportFlowBtn').addEventListener('click', () => {
            this.exportFlow();
        });

        document.getElementById('importFlowBtn').addEventListener('click', () => {
            this.importFlow();
        });
    }

    async loadTemplates() {
        // En una implementación real, esto vendría de la API
        const templates = [
            { value: 'notificacion_entrega', text: '🚚 Notificación de Entrega' },
            { value: 'confirmacion_pago', text: '💳 Confirmación de Pago' },
            { value: 'recordatorio_pedido', text: '⏰ Recordatorio de Pedido' },
            { value: 'promocion_especial', text: '🎉 Promoción Especial' }
        ];

        // Templates ya están hardcodeados en el HTML por ahora
        console.log('Templates disponibles:', templates.length);
    }

    async loadFlowTree() {
        if (!this.currentTemplate) return;

        try {
            const response = await fetch(`${this.apiBaseUrl}/tree/${this.currentTemplate}`, {
                credentials: 'include'
            });
            
            if (!response.ok) throw new Error('Error cargando flujos');
            
            const data = await response.json();
            this.currentFlows = data.tree || [];
            this.renderFlowTree();
            
        } catch (error) {
            console.error('Error cargando flujo:', error);
            this.showAlert('error', 'Error cargando el flujo conversacional');
        }
    }

    renderFlowTree() {
        const container = document.getElementById('flowTreeContainer');
        
        if (this.currentFlows.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-sitemap"></i>
                    <h5>No hay pasos configurados</h5>
                    <p>Haz clic en "Agregar Paso Inicial" para comenzar</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.renderFlowNodes(this.currentFlows);
    }

    renderFlowNodes(nodes, level = 0) {
        return nodes.map(node => `
            <div class="step-node ${this.getStepNodeClass(node)}" style="margin-left: ${level * 20}px">
                <div class="step-header">
                    <div class="d-flex align-items-center">
                        <div class="step-number">${node.step_number}</div>
                        <div class="ms-2">
                            <strong>${node.step_name || 'Sin nombre'}</strong>
                            <div class="small text-muted">
                                ${this.getResponseTypeIcon(node.response_type)} ${this.getResponseTypeText(node.response_type)}
                            </div>
                        </div>
                    </div>
                    <div class="step-actions">
                        <button class="btn btn-sm btn-outline-primary" onclick="flowConfig.showStepModal(${node.id}, null, false)">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-success" onclick="flowConfig.showStepModal(null, ${node.id}, false)">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="flowConfig.deleteStep(${node.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                
                ${this.renderKeywords(node.trigger_keywords)}
                
                <div class="response-preview">
                    <i class="fas fa-comment-dots me-2"></i>
                    "${(node.response_text || '').substring(0, 100)}${node.response_text && node.response_text.length > 100 ? '...' : ''}"
                </div>
                
                ${node.step_description ? `
                    <div class="small text-muted mt-2">
                        <i class="fas fa-info-circle me-1"></i>
                        ${node.step_description}
                    </div>
                ` : ''}
                
                ${node.children && node.children.length > 0 ? `
                    <div class="step-children">
                        ${this.renderFlowNodes(node.children, level + 1)}
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    renderKeywords(keywords) {
        if (!keywords) return '';
        
        try {
            const keywordArray = typeof keywords === 'string' ? JSON.parse(keywords) : keywords;
            if (!Array.isArray(keywordArray) || keywordArray.length === 0) return '';
            
            return `
                <div class="keywords-tags">
                    ${keywordArray.map(keyword => `
                        <span class="keyword-tag">${keyword}</span>
                    `).join('')}
                </div>
            `;
        } catch (e) {
            return '';
        }
    }

    getStepNodeClass(node) {
        const classes = [];
        
        if (!node.parent_step_id) classes.push('root-step');
        if (node.response_type === 'ai_assisted') classes.push('ai-assisted');
        if (node.response_type === 'escalate_human') classes.push('escalate');
        
        return classes.join(' ');
    }

    getResponseTypeIcon(type) {
        switch (type) {
            case 'ai_assisted': return '🤖';
            case 'escalate_human': return '👨‍💼';
            default: return '📝';
        }
    }

    getResponseTypeText(type) {
        switch (type) {
            case 'ai_assisted': return 'IA Asistida';
            case 'escalate_human': return 'Escalar a Humano';
            default: return 'Respuesta Fija';
        }
    }

    showStepModal(stepId = null, parentStepId = null, isRoot = false) {
        const modal = new bootstrap.Modal(document.getElementById('stepConfigModal'));
        const form = document.getElementById('stepConfigForm');
        
        // Reset form
        form.reset();
        document.getElementById('stepId').value = stepId || '';
        document.getElementById('parentStepId').value = parentStepId || '';
        
        // Set modal title
        const title = stepId ? 'Editar Paso' : (isRoot ? 'Nuevo Paso Inicial' : 'Nuevo Paso');
        document.getElementById('modalTitle').textContent = title;
        
        // Load existing step data if editing
        if (stepId) {
            this.loadStepData(stepId);
        } else {
            // Set defaults for new step
            document.getElementById('triggerPriority').value = '1';
            document.getElementById('maxUses').value = '1';
            document.getElementById('timeoutHours').value = '72';
            document.getElementById('responseType').value = 'fixed';
        }
        
        modal.show();
    }

    async loadStepData(stepId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/${stepId}`, {
                credentials: 'include'
            });
            
            if (!response.ok) throw new Error('Error cargando paso');
            
            const data = await response.json();
            const step = data.flow;
            
            // Fill form with step data
            document.getElementById('stepName').value = step.step_name || '';
            document.getElementById('stepDescription').value = step.step_description || '';
            document.getElementById('responseType').value = step.response_type || 'fixed';
            document.getElementById('responseText').value = step.response_text || '';
            document.getElementById('aiContextPrompt').value = step.ai_context_prompt || '';
            document.getElementById('triggerPriority').value = step.trigger_priority || 1;
            document.getElementById('maxUses').value = step.max_uses_per_conversation || 1;
            document.getElementById('timeoutHours').value = step.timeout_hours || 72;
            document.getElementById('requiresHumanFallback').checked = !!step.requires_human_fallback;
            document.getElementById('triggerSentiment').value = step.trigger_sentiment || 'any';
            
            // Handle keywords
            if (step.trigger_keywords) {
                const keywords = typeof step.trigger_keywords === 'string' 
                    ? JSON.parse(step.trigger_keywords) 
                    : step.trigger_keywords;
                document.getElementById('triggerKeywords').value = Array.isArray(keywords) 
                    ? keywords.join(', ') 
                    : '';
            }
            
            // Show/hide AI context section
            const aiSection = document.getElementById('aiContextSection');
            aiSection.style.display = step.response_type === 'ai_assisted' ? 'block' : 'none';
            
        } catch (error) {
            console.error('Error cargando datos del paso:', error);
            this.showAlert('error', 'Error cargando los datos del paso');
        }
    }

    async saveStep() {
        const form = document.getElementById('stepConfigForm');
        const formData = new FormData(form);
        
        // Validations
        if (!formData.get('stepName').trim()) {
            this.showAlert('error', 'El nombre del paso es obligatorio');
            return;
        }
        
        if (!formData.get('responseText').trim()) {
            this.showAlert('error', 'El texto de respuesta es obligatorio');
            return;
        }

        // Prepare data
        const stepData = {
            template_name: this.currentTemplate,
            step_name: formData.get('stepName'),
            step_description: formData.get('stepDescription'),
            response_type: formData.get('responseType'),
            response_text: formData.get('responseText'),
            ai_context_prompt: formData.get('aiContextPrompt'),
            trigger_sentiment: formData.get('triggerSentiment'),
            trigger_priority: parseInt(formData.get('triggerPriority')),
            max_uses_per_conversation: parseInt(formData.get('maxUses')),
            timeout_hours: parseInt(formData.get('timeoutHours')),
            requires_human_fallback: formData.get('requiresHumanFallback') === 'on'
        };

        // Handle parent step
        const parentStepId = formData.get('parentStepId');
        if (parentStepId) {
            stepData.parent_step_id = parseInt(parentStepId);
        }

        // Handle keywords
        const keywordsString = formData.get('triggerKeywords').trim();
        if (keywordsString) {
            stepData.trigger_keywords = keywordsString.split(',').map(k => k.trim()).filter(k => k);
        }

        // Auto-assign step number
        stepData.step_number = this.getNextStepNumber(parentStepId);

        try {
            const stepId = formData.get('stepId');
            const method = stepId ? 'PUT' : 'POST';
            const url = stepId ? `${this.apiBaseUrl}/${stepId}` : this.apiBaseUrl;
            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(stepData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error guardando paso');
            }

            // Close modal and reload
            bootstrap.Modal.getInstance(document.getElementById('stepConfigModal')).hide();
            this.showAlert('success', stepId ? 'Paso actualizado exitosamente' : 'Paso creado exitosamente');
            this.loadFlowTree();

        } catch (error) {
            console.error('Error guardando paso:', error);
            this.showAlert('error', error.message);
        }
    }

    getNextStepNumber(parentStepId) {
        // Simple implementation - in a real app this might be more sophisticated
        const maxStep = Math.max(...this.currentFlows.map(f => f.step_number || 0));
        return maxStep + 1;
    }

    async deleteStep(stepId) {
        const result = await Swal.fire({
            title: '¿Eliminar paso?',
            text: 'Esta acción no se puede deshacer. También se eliminarán todos los pasos hijos.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc3545',
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        });

        if (!result.isConfirmed) return;

        try {
            const response = await fetch(`${this.apiBaseUrl}/${stepId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Error eliminando paso');

            this.showAlert('success', 'Paso eliminado exitosamente');
            this.loadFlowTree();

        } catch (error) {
            console.error('Error eliminando paso:', error);
            this.showAlert('error', 'Error eliminando el paso');
        }
    }

    async loadAnalytics() {
        if (!this.currentTemplate) return;

        try {
            const response = await fetch(`${this.apiBaseUrl}/analytics/${this.currentTemplate}`, {
                credentials: 'include'
            });
            
            if (!response.ok) throw new Error('Error cargando analytics');
            
            const data = await response.json();
            this.renderAnalytics(data);
            
        } catch (error) {
            console.error('Error cargando analytics:', error);
            this.clearAnalytics();
        }
    }

    renderAnalytics(data) {
        const summary = data.summary;
        
        document.getElementById('totalConversations').textContent = summary.total_conversations || 0;
        document.getElementById('avgMessages').textContent = Math.round(summary.avg_messages_per_conversation || 0);
        
        const completedRate = summary.total_conversations > 0 
            ? Math.round((summary.completed_count / summary.total_conversations) * 100)
            : 0;
        document.getElementById('completedRate').textContent = completedRate + '%';
        
        const escalatedRate = summary.total_conversations > 0 
            ? Math.round((summary.escalated_count / summary.total_conversations) * 100)
            : 0;
        document.getElementById('escalatedRate').textContent = escalatedRate + '%';

        // Popular steps
        const popularSteps = data.daily_analytics
            .reduce((acc, item) => {
                const existing = acc.find(x => x.step_name === item.step_name);
                if (existing) {
                    existing.total_triggered += item.times_triggered;
                } else {
                    acc.push({
                        step_name: item.step_name,
                        total_triggered: item.times_triggered
                    });
                }
                return acc;
            }, [])
            .sort((a, b) => b.total_triggered - a.total_triggered)
            .slice(0, 3);

        const popularStepsHtml = popularSteps.map(step => `
            <div class="d-flex justify-content-between small">
                <span>${step.step_name}</span>
                <span class="badge bg-primary">${step.total_triggered}</span>
            </div>
        `).join('');

        document.getElementById('popularSteps').innerHTML = popularStepsHtml || 
            '<div class="small text-muted">No hay datos disponibles</div>';
    }

    clearAnalytics() {
        document.getElementById('totalConversations').textContent = '-';
        document.getElementById('avgMessages').textContent = '-';
        document.getElementById('completedRate').textContent = '-';
        document.getElementById('escalatedRate').textContent = '-';
        document.getElementById('popularSteps').innerHTML = '<div class="small text-muted">Selecciona un template</div>';
    }

    clearFlowTree() {
        const container = document.getElementById('flowTreeContainer');
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-sitemap"></i>
                <h5>No hay flujo configurado</h5>
                <p>Selecciona un template y comienza a crear tu conversación</p>
            </div>
        `;
    }

    async duplicateFlow() {
        // Implementation for duplicating flow to another template
        this.showAlert('info', 'Función de duplicar flujo en desarrollo');
    }

    async clearFlow() {
        const result = await Swal.fire({
            title: '¿Limpiar todo el flujo?',
            text: 'Se eliminarán todos los pasos configurados para este template',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc3545',
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'Sí, limpiar',
            cancelButtonText: 'Cancelar'
        });

        if (result.isConfirmed) {
            // Implementation for clearing all flows
            this.showAlert('info', 'Función de limpiar flujo en desarrollo');
        }
    }

    async resetAnalytics() {
        this.showAlert('info', 'Función de reset analytics en desarrollo');
    }

    async testFlow() {
        this.showAlert('info', 'Simulador de flujo en desarrollo');
    }

    async exportFlow() {
        if (!this.currentTemplate || this.currentFlows.length === 0) {
            this.showAlert('error', 'No hay flujo para exportar');
            return;
        }

        const exportData = {
            template_name: this.currentTemplate,
            flows: this.currentFlows,
            exported_at: new Date().toISOString(),
            version: '1.0'
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `flow-${this.currentTemplate}-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        this.showAlert('success', 'Flujo exportado exitosamente');
    }

    async importFlow() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    // Implementation for importing flow
                    this.showAlert('info', 'Función de importar flujo en desarrollo');
                } catch (error) {
                    this.showAlert('error', 'Error leyendo archivo de flujo');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    showAlert(type, message) {
        const icon = type === 'error' ? 'error' : type === 'success' ? 'success' : 'info';
        Swal.fire({
            icon: icon,
            title: message,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.flowConfig = new ConversationFlowsConfig();
});