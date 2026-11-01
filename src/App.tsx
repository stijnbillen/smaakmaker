import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { AuthProvider } from './components/AuthProvider';
import { ConnectionProvider } from './components/ConnectionProvider';
import { RequireAdmin } from './components/RequireAdmin';
import { RequireAuth } from './components/RequireAuth';
import { InvitesPage } from './pages/InvitesPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { NewRecipePage } from './pages/NewRecipePage';
import { ProfilePage } from './pages/ProfilePage';
import { RecipeListPage } from './pages/RecipeListPage';
import { SignInPage } from './pages/SignInPage';
import { WelcomePage } from './pages/WelcomePage';

export function App() {
  return (
    <ConnectionProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Without navigation bar: the user is not (fully) signed in here. */}
            <Route path="/aanmelden" element={<SignInPage />} />
            <Route path="/welkom" element={<WelcomePage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<RecipeListPage />} />
                <Route path="/favorieten" element={<FavoritesPage />} />
                <Route path="/nieuw" element={<NewRecipePage />} />
                <Route path="/profiel" element={<ProfilePage />} />
                <Route element={<RequireAdmin />}>
                  <Route path="/uitnodigingen" element={<InvitesPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ConnectionProvider>
  );
}
