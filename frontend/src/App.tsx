import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ProtectedRoute, RoleGate } from './components/auth/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { AdminLayout } from './components/admin/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MyWorkPage } from './pages/MyWorkPage';
import { ContractsPage } from './pages/ContractsPage';
import { ContractCreatePage } from './pages/ContractCreatePage';
import { ContractWorkspacePage } from './pages/ContractWorkspacePage';
import { ContractorsPage } from './pages/ContractorsPage';
import { ContractorDetailPage } from './pages/ContractorDetailPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminMastersPage } from './pages/admin/AdminMastersPage';
import { AdminAuditPage } from './pages/admin/AdminAuditPage';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { NotFoundPage } from './pages/NotFoundPage';

function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);
  return null;
}

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="my-work" element={<MyWorkPage />} />
            <Route path="contracts" element={<ContractsPage />} />
            <Route
              path="contracts/new"
              element={
                <RoleGate roles={['PC_MANAGER', 'ADMIN']}>
                  <ContractCreatePage />
                </RoleGate>
              }
            />
            <Route path="contracts/:id" element={<ContractWorkspacePage />} />
            <Route path="contractors" element={<ContractorsPage />} />
            <Route path="contractors/:id" element={<ContractorDetailPage />} />

            <Route
              path="admin"
              element={
                <RoleGate roles={['ADMIN']}>
                  <AdminLayout />
                </RoleGate>
              }
            >
              <Route index element={<Navigate to="users" replace />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="masters" element={<AdminMastersPage />} />
              <Route path="audit" element={<AdminAuditPage />} />
            </Route>

            <Route path="403" element={<ForbiddenPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </>
  );
}
