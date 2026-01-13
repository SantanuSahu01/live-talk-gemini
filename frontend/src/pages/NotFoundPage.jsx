import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Home } from 'lucide-react'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      <div className="fixed inset-0 bg-gradient-radial pointer-events-none" />
      <div className="fixed inset-0 bg-grid pointer-events-none" />
      
      <Card className="glass relative z-10 text-center max-w-md w-full">
        <CardContent className="pt-10 pb-8 px-8">
          <div className="text-8xl font-bold gradient-text mb-4">404</div>
          <h1 className="text-2xl font-semibold mb-2">Page Not Found</h1>
          <p className="text-muted-foreground mb-6">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Button variant="gradient" onClick={() => navigate('/')}>
            <Home className="w-4 h-4 mr-2" />
            Start New Interview
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
