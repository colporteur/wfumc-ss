import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Roster from './pages/Roster.jsx';
import Attendance from './pages/Attendance.jsx';
import Topics from './pages/Topics.jsx';
import LessonWorkspace from './pages/LessonWorkspace.jsx';
import BulkImportLessons from './pages/BulkImportLessons.jsx';
import PublicLayout from './components/PublicLayout.jsx';
import PublicActive from './pages/PublicActive.jsx';
import PublicTopics from './pages/PublicTopics.jsx';
import PublicRoster from './pages/PublicRoster.jsx';
import PublicSuggest from './pages/PublicSuggest.jsx';
import PublicLesson from './pages/PublicLesson.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Public-facing — no auth, no admin chrome. */}
      <Route element={<PublicLayout />}>
        <Route path="/public" element={<PublicActive />} />
        <Route path="/public/topics" element={<PublicTopics />} />
        <Route path="/public/lesson/:topicId" element={<PublicLesson />} />
        <Route path="/public/roster" element={<PublicRoster />} />
        <Route path="/public/suggest" element={<PublicSuggest />} />
      </Route>

      {/* Admin — pastor only. */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/roster" element={<Roster />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/topics" element={<Topics />} />
        <Route path="/lesson/:topicId" element={<LessonWorkspace />} />
        <Route path="/import-lessons" element={<BulkImportLessons />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <h1 className="font-serif text-3xl text-umc-900">Page not found</h1>
        <a href="/" className="btn-primary inline-block">
          Back to dashboard
        </a>
      </div>
    </div>
  );
}
