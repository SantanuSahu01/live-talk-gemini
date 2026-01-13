import { Routes, Route, Navigate } from 'react-router-dom'
import { InterviewProvider } from '@/context/InterviewContext'
import Layout from '@/components/layout/Layout'
import AgreementPage from '@/pages/AgreementPage'
import InterviewPage from '@/pages/InterviewPage'
import CompletedPage from '@/pages/CompletedPage'
import NotFoundPage from '@/pages/NotFoundPage'

function App() {
  return (
    <Routes>
      {/* Interview routes with unique ID */}
      <Route path="/interview/:interviewId/*" element={
        <InterviewProvider>
          <Layout>
            <Routes>
              <Route index element={<AgreementPage />} />
              <Route path="session" element={<InterviewPage />} />
              <Route path="completed" element={<CompletedPage />} />
            </Routes>
          </Layout>
        </InterviewProvider>
      } />
      
      {/* Redirect root to a new interview */}
      <Route path="/" element={<Navigate to={`/interview/${crypto.randomUUID()}`} replace />} />
      
      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
