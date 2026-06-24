import { Outlet, Link, useLocation } from 'react-router-dom';
import { CLASS_NAME } from '../lib/config';

// Public-facing layout — no auth, no nav clutter, mobile-first.
// Class members visit /public/* and don't see any admin chrome.
//
// Different visual identity from the admin Layout to make it
// instantly obvious "you're on the public side".
export default function PublicLayout() {
  const location = useLocation();

  const isActive = (path) =>
    location.pathname === path ||
    (path !== '/public' && location.pathname.startsWith(path));

  const navLink = (to, label) => (
    <Link
      to={to}
      className={
        'text-sm px-3 py-1 rounded ' +
        (isActive(to)
          ? 'bg-umc-900 text-white'
          : 'text-umc-900 hover:bg-umc-50')
      }
    >
      {label}
    </Link>
  );

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="bg-umc-50 border-b border-umc-200 px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <Link to="/public" className="block">
            <h1 className="font-serif text-lg sm:text-xl text-umc-900 leading-tight">
              {CLASS_NAME}
            </h1>
          </Link>
          <nav className="mt-2 flex gap-1 flex-wrap">
            {navLink('/public', 'This Sunday')}
            {navLink('/public/topics', 'Past & Future')}
            {navLink('/public/roster', 'Roster')}
            {navLink('/public/suggest', '+ Suggest a question')}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
      <footer className="text-center text-[10px] text-gray-400 py-4">
        Tap "Add to Home Screen" on your phone to install this as an app.
      </footer>
    </div>
  );
}
