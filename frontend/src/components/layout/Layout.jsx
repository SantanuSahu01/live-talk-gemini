import Header from './Header'
import Footer from './Footer'

export default function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      {/* Background effects */}
      <div className="fixed inset-0 bg-gradient-radial pointer-events-none" />
      <div className="fixed inset-0 bg-grid pointer-events-none" />
      
      {/* Content */}
      <Header />
      <main className="flex-1 flex flex-col relative z-10">
        {children}
      </main>
      <Footer />
    </div>
  )
}
