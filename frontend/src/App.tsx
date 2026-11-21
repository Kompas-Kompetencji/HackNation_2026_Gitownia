import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { NewEmployeePage } from './pages/wizard/NewEmployeePage'
import { EmployeePage } from './pages/EmployeePage'
import { AuthProvider, homePathFor, useAuth } from './auth/AuthContext'
import { RequireRole } from './auth/RequireRole'
import { FullPageStatus } from './components/FullPageStatus'
import { texts } from './lib/texts'
import { LoginPage } from './pages/LoginPage'
import { SupervisorHomePage } from './pages/SupervisorHomePage'
import { HrHomePage } from './pages/HrHomePage'
import { NotFoundPage } from './pages/NotFoundPage'

function RootRedirect() {
  const { user, restoring } = useAuth()
  if (restoring) return <FullPageStatus message={texts.common.loading} />
  return <Navigate to={user ? homePathFor(user.role) : '/logowanie'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/logowanie" element={<LoginPage />} />
          <Route
            path="/przelozony"
            element={
              <RequireRole role="supervisor">
                <Outlet />
              </RequireRole>
            }
          >
            <Route index element={<SupervisorHomePage />} />
            <Route path="pracownicy/nowy" element={<NewEmployeePage />} />
            <Route path="pracownicy/:employeeId" element={<EmployeePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route
            path="/kadry/*"
            element={
              <RequireRole role="hr">
                <HrHomePage />
              </RequireRole>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
