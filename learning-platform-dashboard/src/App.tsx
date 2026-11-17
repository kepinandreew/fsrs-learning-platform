import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AiGeneratorPage } from './pages/AiGeneratorPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AppsPage } from './pages/AppsPage';
import { LoginPage } from './pages/LoginPage';
import { QuestionBankPage } from './pages/QuestionBankPage';

// =============================================================================
// Komponen Proteksi Route — Hanya mengizinkan developer yang sudah login JWT
// =============================================================================

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { developer, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        Memverifikasi sesi developer...
      </div>
    );
  }
  if (!developer) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/apps" replace />} />
            <Route path="apps" element={<AppsPage />} />
            <Route path="question-bank" element={<QuestionBankPage />} />
            <Route path="ai-generator" element={<AiGeneratorPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/apps" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};
