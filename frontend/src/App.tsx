import { Navigate, Outlet, Route, RouterProvider, createBrowserRouter, createRoutesFromElements } from 'react-router-dom'
import { lazy, Suspense, type ReactNode } from 'react'
import { AuthProvider, homePathFor, useAuth } from './auth/AuthContext'
import { RequireRole } from './auth/RequireRole'
import { FullPageStatus } from './components/FullPageStatus'
import { texts } from './lib/texts'
import { LoginPage } from './pages/LoginPage'
import { SupervisorHomePage } from './pages/SupervisorHomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { DesktopOnly } from './components/DesktopOnly'

// Większe ekrany ładowane na żądanie (mniejsza paczka startowa, szybsze pierwsze wyświetlenie).
const NewEmployeePage = lazy(() => import('./pages/wizard/NewEmployeePage').then((m) => ({ default: m.NewEmployeePage })))
const EmployeePage = lazy(() => import('./pages/employee/EmployeePage').then((m) => ({ default: m.EmployeePage })))
const AssessmentPage = lazy(() => import('./pages/assessment/AssessmentPage').then((m) => ({ default: m.AssessmentPage })))
const AiQualityPage = lazy(() => import('./pages/hr/AiQualityPage').then((m) => ({ default: m.AiQualityPage })))
const AuditLogPage = lazy(() => import('./pages/hr/AuditLogPage').then((m) => ({ default: m.AuditLogPage })))
const InterviewPage = lazy(() => import('./pages/interview/InterviewPage').then((m) => ({ default: m.InterviewPage })))
const HrHomePage = lazy(() => import('./pages/HrHomePage').then((m) => ({ default: m.HrHomePage })))

const Lazy = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<FullPageStatus message={texts.common.loading} />}>{children}</Suspense>
)

function RootRedirect() {
  const { user, restoring } = useAuth()
  if (restoring) return <FullPageStatus message={texts.common.loading} />
  return <Navigate to={user ? homePathFor(user.role) : '/logowanie'} replace />
}

// Router z danymi (createBrowserRouter), żeby formularz oceny mógł ostrzegać przed wyjściem (useBlocker).
const router = createBrowserRouter(
  createRoutesFromElements(
    <>
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
        <Route path="pracownicy/nowy" element={<Lazy><NewEmployeePage /></Lazy>} />
        <Route path="pracownicy/:employeeId" element={<Lazy><EmployeePage /></Lazy>} />
        <Route path="oceny/:assessmentId" element={<Lazy><AssessmentPage /></Lazy>} />
        <Route path="oceny/:assessmentId/rozmowa" element={<Lazy><InterviewPage /></Lazy>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route
        path="/kadry"
        element={
          <RequireRole role="hr">
            <Lazy>
              <Outlet />
            </Lazy>
          </RequireRole>
        }
      >
        <Route index element={<HrHomePage />} />
        <Route path="jakosc-ai" element={<AiQualityPage />} />
        <Route path="dziennik" element={<AuditLogPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </>,
  ),
)

export default function App() {
  return (
    <DesktopOnly>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </DesktopOnly>
  )
}
