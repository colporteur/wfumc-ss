import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import VersionStamp from './VersionStamp.jsx';
import { CLASS_SHORT_NAME } from '../lib/config';

// Admin shell. Public-facing routes (Phase C) use a different layout
// that renders no nav bar.
export default function Layout() {
  const { profile, signOut, session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // Highlight the active nav link based on the URL pathname prefix.
  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const navLink = (to, label) => (
    <Link
      to={to}
      className={
        'text-sm whitespace-nowrap ' +
        (isActive(to)
          ? 'text-white underline underline-offset-4'
          : 'text-umc-100 hover:text-white')
      }
    >
      {label}
    </Link>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-umc-900 text-white px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <Link to="/" className="font-serif text-lg leading-tight">
            {CLASS_SHORT_NAME}
          </Link>
          {session && (
            <div className="flex items-center gap-3 sm:gap-4">
              {navLink('/roster', 'Roster')}
              {navLink('/attendance', 'Attendance')}
              {navLink('/topics', 'Topics')}
              <span className="text-umc-100 hidden sm:inline text-sm">
                {profile?.full_name}
              </span>
              <button
                onClick={handleSignOut}
                className="text-umc-100 hover:text-white underline text-sm"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        <Outlet />
        <VersionStamp />
      </main>
    </div>
  );
}
