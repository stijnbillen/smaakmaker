import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { AuthProvider } from './components/AuthProvider';
import { ConnectionProvider } from './components/ConnectionProvider';
import { RequireAuth } from './components/RequireAuth';
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
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ConnectionProvider>
  );
}
