import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme'
import { motion } from 'framer-motion'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <motion.button
      onClick={toggleTheme}
      className={`fixed top-6 right-[420px] p-2 rounded-lg transition-colors
        ${theme === 'dark' 
          ? 'bg-zinc-800 hover:bg-zinc-700 text-white' 
          : 'bg-gray-200 hover:bg-gray-300 text-gray-900'}`}
      whileTap={{ scale: 0.95 }}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <Sun className="w-5 h-5" />
      ) : (
        <Moon className="w-5 h-5" />
      )}
    </motion.button>
  )
} 