import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ConnectionProvider } from './components/ConnectionProvider';
import { FavoritesPage } from './pages/FavoritesPage';
import { NewRecipePage } from './pages/NewRecipePage';
import { ProfilePage } from './pages/ProfilePage';
import { RecipeListPage } from './pages/RecipeListPage';

export function App() {
  return (
    <ConnectionProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<RecipeListPage />} />
            <Route path="/favorieten" element={<FavoritesPage />} />
            <Route path="/nieuw" element={<NewRecipePage />} />
            <Route path="/profiel" element={<ProfilePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConnectionProvider>
  );
}
