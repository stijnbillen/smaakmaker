import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';

/** Convenience only: the database refuses the invite functions to non-administrators anyway. */
export function RequireAdmin() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/profiel" replace />;
  return <Outlet />;
}
