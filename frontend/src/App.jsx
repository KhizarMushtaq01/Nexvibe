import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SocketProvider } from './context/SocketContext';
import { DialogProvider } from './context/DialogContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import MainLayout from './components/layout/MainLayout';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import OTPPage from './pages/auth/OTPPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import VerifyEmailPage from './pages/auth/VerifyEmailPage';
import FeedPage from './pages/main/FeedPage';
import ExplorePage from './pages/main/ExplorePage';
import ProfilePage from './pages/main/ProfilePage';
import PostDetailPage from './pages/main/PostDetailPage';
import ReelsPage from './pages/main/ReelsPage';
import MessagesPage from './pages/main/MessagesPage';
import NotificationsPage from './pages/main/NotificationsPage';
import SearchPage from './pages/main/SearchPage';
import StoriesPage from './pages/main/StoriesPage';
import HashtagPage from './pages/main/HashtagPage';
import SavedPage from './pages/main/SavedPage';
import ArchivedPage from './pages/main/ArchivedPage';
import SettingsPage from './pages/main/SettingsPage';
import CreatePage from './pages/main/CreatePage';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminTeam from './pages/admin/AdminTeam';
import AdminPosts from './pages/admin/AdminPosts';
import AdminUserDetail from './pages/admin/AdminUserDetail';
import AdminReports from './pages/admin/AdminReports';
import AdminReviews from './pages/admin/AdminReviews';
import TermsPage from './pages/Terms';
import PrivacyPage from './pages/Privacy';
import CookiesPage from './pages/Cookies';
import HelpPage from './pages/Help';
import Blog from './pages/Blog';
import BlogPostDetails from './pages/BlogPostDetails';
import Community from './pages/Community';
import Security from './pages/Security';
import Download from './pages/Download';
import NotFoundPage from './pages/NotFoundPage';
import BlockedPage from './pages/BlockedPage';
import LoadingScreen from './components/common/LoadingScreen';
import './styles/index.css';

const queryClient = new QueryClient({ 
  defaultOptions: { 
    queries: { 
      retry: 1, 
      staleTime: 30000 
    } 
  } 
});

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!['admin', 'moderator', 'superadmin'].includes(user.role)) return <Navigate to="/feed" replace />;
  return children;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/feed" replace />;
  return children;
};

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={user ? <Navigate to="/feed" replace /> : <LandingPage />} />
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/otp" element={<OTPPage />} />
      <Route path="/blog" element={<Blog />} />
      <Route path="/blog/:id" element={<BlogPostDetails />} />
      <Route path="/community" element={<Community />} />
      <Route path="/security" element={<Security />} />
      <Route path="/download" element={<Download />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      
      {/* Legal & Help Pages (Public) */}
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/cookies" element={<CookiesPage />} />
      <Route path="/help" element={<HelpPage />} />
      
      {/* Protected Main App Routes */}
      <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route path="/feed" element={<FeedPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/reels" element={<ReelsPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/messages/:conversationId" element={<MessagesPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/saved" element={<SavedPage />} />
        <Route path="/archived" element={<ArchivedPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/:section" element={<SettingsPage />} />
        <Route path="/stories/:userId" element={<StoriesPage />} />
        <Route path="/p/:postId" element={<PostDetailPage />} />
        <Route path="/hashtag/:tag" element={<HashtagPage />} />
        <Route path="/:username" element={<ProfilePage />} />
      </Route>
      
      {/* Admin Routes */}
      <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="users/:id" element={<AdminUserDetail />} />
        <Route path="team" element={<AdminTeam />} />
        <Route path="posts" element={<AdminPosts />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="reviews" element={<AdminReviews />} />
      </Route>
      
      {/* Shown when the geo-restriction middleware returns 403 REGION_BLOCKED
          (see services/api.js's response interceptor) */}
      <Route path="/blocked" element={<BlockedPage />} />

      {/* 404 Not Found */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <SocketProvider>
              <BrowserRouter>
                <DialogProvider>
                  <AppRoutes />
                  <Toaster
                    position="top-center"
                    toastOptions={{
                      duration: 3000,
                      style: {
                        borderRadius: '12px',
                        fontSize: '14px',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border)'
                      }
                    }}
                  />
                </DialogProvider>
              </BrowserRouter>
            </SocketProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}