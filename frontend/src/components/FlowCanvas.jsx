import { useCallback, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useFlowStore } from '../store/flowStore'
import BaseNode from './nodes/BaseNode'

// Register custom node types
const nodeTypes = {
  trigger: (props) => <BaseNode {...props} type="trigger" />,
  message: (props) => <BaseNode {...props} type="message" />,
  question: (props) => <BaseNode {...props} type="question" />,
  condition: (props) => <BaseNode {...props} type="condition" />,
  action: (props) => <BaseNode {...props} type="action" />,
  transfer: (props) => <BaseNode {...props} type="transfer" />,
  end: (props) => <BaseNode {...props} type="end" />
}

export default function FlowCanvas() {
  const reactFlowWrapper = useRef(null)
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    setSelectedNode
  } = useFlowStore()

  const onDragOver = useCallback((event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event) => {
      event.preventDefault()

      const type = event.dataTransfer.getData('application/reactflow')
      if (!type) return

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect()
      const position = {
        x: event.clientX - reactFlowBounds.left - 90,
        y: event.clientY - reactFlowBounds.top - 25
      }

      addNode(type, position)
    },
    [addNode]
  )

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node)
  }, [setSelectedNode])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [setSelectedNode])

  return (
    <div ref={reactFlowWrapper} style={{ flex: 1, height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#25D366', strokeWidth: 2 }
        }}
      >
        <Background color="#e5e7eb" gap={20} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const colors = {
              trigger: '#667eea',
              message: '#25D366',
              question: '#34B7F1',
              condition: '#f59e0b',
              action: '#6366f1',
              transfer: '#ec4899',
              end: '#ef4444'
            }
            return colors[node.type] || '#6b7280'
          }}
          maskColor="rgba(255, 255, 255, 0.8)"
        />
      </ReactFlow>
    </div>
  )
}
