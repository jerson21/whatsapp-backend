import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Conversations from './pages/Conversations'
import FlowsManager from './pages/FlowsManager'
import FlowBuilder from './pages/FlowBuilder'
import FlowLogs from './pages/FlowLogs'
import Leads from './pages/Leads'
import Analytics from './pages/Analytics'
import FlowMonitor from './pages/FlowMonitor'
import AgentManagement from './pages/AgentManagement'
import DepartmentManagement from './pages/DepartmentManagement'
import LearningPage from './pages/LearningPage'

function PrivateRoute({ children }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

function SupervisorRoute({ children }) {
  const agent = useAuthStore((state) => state.agent)
  if (agent?.role !== 'supervisor') return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* Private */}
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="conversations" element={<Conversations />} />
        <Route path="agents" element={<SupervisorRoute><AgentManagement /></SupervisorRoute>} />
        <Route path="departments" element={<SupervisorRoute><DepartmentManagement /></SupervisorRoute>} />
        <Route path="flows" element={<SupervisorRoute><FlowsManager /></SupervisorRoute>} />
        <Route path="flows/builder/:id?" element={<SupervisorRoute><FlowBuilder /></SupervisorRoute>} />
        <Route path="logs" element={<SupervisorRoute><FlowLogs /></SupervisorRoute>} />
        <Route path="leads" element={<SupervisorRoute><Leads /></SupervisorRoute>} />
        <Route path="analytics" element={<SupervisorRoute><Analytics /></SupervisorRoute>} />
        <Route path="monitor" element={<SupervisorRoute><FlowMonitor /></SupervisorRoute>} />
        <Route path="learning" element={<SupervisorRoute><LearningPage /></SupervisorRoute>} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
