import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { AuthProvider } from './components/AuthProvider';
import { ConnectionProvider } from './components/ConnectionProvider';
import { RequireAdmin } from './components/RequireAdmin';
import { RequireAuth } from './components/RequireAuth';
import { CatalogAdminPage } from './pages/CatalogAdminPage';
import { EditRecipePage } from './pages/EditRecipePage';
import { InvitesPage } from './pages/InvitesPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { NewRecipePage } from './pages/NewRecipePage';
import { NewVariantPage } from './pages/NewVariantPage';
import { ProfilePage } from './pages/ProfilePage';
import { RecipeDetailPage } from './pages/RecipeDetailPage';
import { RecipeListPage } from './pages/RecipeListPage';
import { SignInPage } from './pages/SignInPage';
import { WelcomePage } from './pages/WelcomePage';

// A data router (not BrowserRouter): useBlocker, which asks before a form with changes is left, needs one.
const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      {/* Without navigation bar: the user is not (fully) signed in here. */}
      <Route path="/aanmelden" element={<SignInPage />} />
      <Route path="/welkom" element={<WelcomePage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<RecipeListPage />} />
          <Route path="/favorieten" element={<FavoritesPage />} />
          <Route path="/nieuw" element={<NewRecipePage />} />
          <Route path="/recept/:id" element={<RecipeDetailPage />} />
          <Route path="/recept/:id/bewerken" element={<EditRecipePage />} />
          <Route path="/recept/:id/variant" element={<NewVariantPage />} />
          <Route path="/profiel" element={<ProfilePage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/uitnodigingen" element={<InvitesPage />} />
            <Route path="/databank" element={<CatalogAdminPage />} />
          </Route>
        </Route>
      </Route>
    </>,
  ),
);

export function App() {
  return (
    <ConnectionProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ConnectionProvider>
  );
}
