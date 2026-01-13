import { Link } from 'react-router-dom'
import { Layers } from 'lucide-react'

export default function Header() {
  return (
    <header className="relative z-10 border-b border-border/60 backdrop-blur-xl bg-white/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center group-hover:scale-105 transition-transform shadow-md">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-semibold gradient-text">AI Interview</span>
        </Link>
      </div>
    </header>
  )
}
