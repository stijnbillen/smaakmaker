import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ConnectionBanner } from './components/ConnectionBanner';
import { ConnectionProvider } from './components/ConnectionProvider';
import { NewRecipePage } from './pages/NewRecipePage';
import { RecipeListPage } from './pages/RecipeListPage';

export function App() {
  return (
    <ConnectionProvider>
      <BrowserRouter>
        <ConnectionBanner />
        <Routes>
          <Route path="/" element={<RecipeListPage />} />
          <Route path="/nieuw" element={<NewRecipePage />} />
        </Routes>
      </BrowserRouter>
    </ConnectionProvider>
  );
}
