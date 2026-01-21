import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Conversations from './pages/Conversations'
import FlowBuilder from './pages/FlowBuilder'
import FlowLogs from './pages/FlowLogs'
import Leads from './pages/Leads'
import Analytics from './pages/Analytics'
import FlowMonitor from './pages/FlowMonitor'

function PrivateRoute({ children }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  return isAuthenticated ? children : <Navigate to="/login" replace />
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
        <Route path="flows" element={<FlowBuilder />} />
        <Route path="logs" element={<FlowLogs />} />
        <Route path="leads" element={<Leads />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="monitor" element={<FlowMonitor />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
