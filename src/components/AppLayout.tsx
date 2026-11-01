import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { ConnectionBanner } from './ConnectionBanner';

/** Shell around the signed-in screens; sign-in and welcome sit outside it, so they have no navigation. */
export function AppLayout() {
  return (
    <>
      <ConnectionBanner />
      <Outlet />
      <BottomNav />
    </>
  );
}
