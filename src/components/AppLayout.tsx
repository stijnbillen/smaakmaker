import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { ConnectionBanner } from './ConnectionBanner';

/** Shell around all routes. T-003 can hide the navigation on the sign-in screen by using a second layout. */
export function AppLayout() {
  return (
    <>
      <ConnectionBanner />
      <Outlet />
      <BottomNav />
    </>
  );
}
