import { create } from 'zustand'
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react'

const initialNodes = [
  {
    id: 'trigger-1',
    type: 'trigger',
    position: { x: 250, y: 50 },
    data: {
      label: 'Inicio',
      config: {
        type: 'classification',
        conditions: { intent: ['sales'] }
      }
    }
  }
]

const initialEdges = []

export const useFlowStore = create((set, get) => ({
  // Flow metadata
  flowId: null,
  flowName: 'Nuevo Flujo',
  flowSlug: null,
  isActive: false,
  isSaved: true,

  // Nodes and edges
  nodes: initialNodes,
  edges: initialEdges,

  // Selected element
  selectedNode: null,
  selectedEdge: null,

  // UI state
  isSidebarOpen: true,
  isPropertiesOpen: false,

  // Actions: Node changes
  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
      isSaved: false
    })
  },

  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
      isSaved: false
    })
  },

  onConnect: (connection) => {
    set({
      edges: addEdge({
        ...connection,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#25D366', strokeWidth: 2 }
      }, get().edges),
      isSaved: false
    })
  },

  // Add new node
  addNode: (type, position) => {
    const id = `${type}-${Date.now()}`
    const nodeDefaults = {
      trigger: { label: 'Trigger', config: { type: 'classification', conditions: {} } },
      message: { label: 'Mensaje', content: 'Escribe tu mensaje aquí...' },
      question: { label: 'Pregunta', content: '¿Cuál es tu opción?', variable: 'respuesta', options: [] },
      condition: { label: 'Condición', conditions: [] },
      action: { label: 'Acción', action: '', payload: {} },
      transfer: { label: 'Transferir', content: 'Transfiriendo a un agente...' },
      end: { label: 'Fin' }
    }

    const newNode = {
      id,
      type,
      position,
      data: nodeDefaults[type] || { label: type }
    }

    set({
      nodes: [...get().nodes, newNode],
      isSaved: false
    })

    return id
  },

  // Update node data
  updateNodeData: (nodeId, newData) => {
    set({
      nodes: get().nodes.map(node =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...newData } }
          : node
      ),
      isSaved: false
    })
  },

  // Delete node
  deleteNode: (nodeId) => {
    set({
      nodes: get().nodes.filter(n => n.id !== nodeId),
      edges: get().edges.filter(e => e.source !== nodeId && e.target !== nodeId),
      selectedNode: null,
      isSaved: false
    })
  },

  // Selection
  setSelectedNode: (node) => set({ selectedNode: node, isPropertiesOpen: !!node }),
  setSelectedEdge: (edge) => set({ selectedEdge: edge }),
  clearSelection: () => set({ selectedNode: null, selectedEdge: null }),

  // UI
  toggleSidebar: () => set({ isSidebarOpen: !get().isSidebarOpen }),
  toggleProperties: () => set({ isPropertiesOpen: !get().isPropertiesOpen }),

  // Flow management
  setFlowMeta: (meta) => set({
    flowId: meta.id,
    flowName: meta.name,
    flowSlug: meta.slug,
    isActive: meta.is_active
  }),

  loadFlow: (flow) => {
    // Default labels by node type
    const defaultLabels = {
      trigger: 'Inicio',
      message: 'Mensaje',
      question: 'Pregunta',
      condition: 'Condición',
      action: 'Acción',
      transfer: 'Transferir',
      end: 'Fin'
    }

    // Transform nodes from backend format to ReactFlow format
    const transformedNodes = (flow.nodes || []).map(n => {
      // Generate a descriptive label based on content
      let label = defaultLabels[n.type] || n.type
      if (n.content && n.content.length > 0) {
        label = n.content.substring(0, 25) + (n.content.length > 25 ? '...' : '')
      }
      if (n.action) {
        label = `Acción: ${n.action}`
      }

      return {
        id: n.id,
        type: n.type,
        position: n.position || { x: 250, y: 50 },
        data: {
          label,
          content: n.content,
          variable: n.variable,
          options: n.options,
          conditions: n.conditions,
          action: n.action,
          payload: n.payload,
          config: n.config || (n.type === 'trigger' ? flow.trigger_config : undefined)
        }
      }
    })

    set({
      flowId: flow.id,
      flowName: flow.name,
      flowSlug: flow.slug,
      isActive: flow.is_active,
      nodes: transformedNodes.length > 0 ? transformedNodes : initialNodes,
      edges: flow.connections?.map(c => ({
        id: `${c.from}-${c.to}`,
        source: c.from,
        target: c.to,
        type: 'smoothstep',
        animated: true,
        label: c.label,
        style: { stroke: '#25D366', strokeWidth: 2 }
      })) || [],
      isSaved: true
    })
  },

  resetFlow: () => set({
    flowId: null,
    flowName: 'Nuevo Flujo',
    flowSlug: null,
    isActive: false,
    nodes: initialNodes,
    edges: [],
    selectedNode: null,
    isSaved: true
  }),

  markSaved: () => set({ isSaved: true }),

  // Export flow for API
  exportFlow: () => {
    const state = get()
    return {
      name: state.flowName,
      trigger_config: state.nodes.find(n => n.type === 'trigger')?.data.config || {},
      nodes: state.nodes.map(n => ({
        id: n.id,
        type: n.type,
        content: n.data.content,
        variable: n.data.variable,
        options: n.data.options,
        conditions: n.data.conditions,
        action: n.data.action,
        payload: n.data.payload,
        position: n.position
      })),
      connections: state.edges.map(e => ({
        from: e.source,
        to: e.target,
        label: e.label
      }))
    }
  }
}))
