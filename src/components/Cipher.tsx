'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react'

interface CipherProps {
  onEdit: (newContent: string, metadata?: { citationsUsed: number; sourceUsagePercent: number }) => void
  content: string
  isVisible: boolean
  onToggle: () => void
}

export default function Cipher({ onEdit, content }: Omit<CipherProps, 'isVisible' | 'onToggle'>) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userRequest = input.trim()
    setInput('')
    setIsLoading(true)
    setIsEditing(true)
    setError(null)

    try {
      console.log('Cipher: Processing instruction:', userRequest)
      const response = await fetch('/api/cipher', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request: userRequest,
          currentContent: content
        })
      })

      const data = await response.json()
      console.log('Cipher: Server response:', data)
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to process your request')
      }

      if (data.editedContent) {
        // Add a small delay for smooth transition
        await new Promise(resolve => setTimeout(resolve, 300))
        console.log('Cipher: Applying changes...')
        onEdit(data.editedContent, data.metadata)
        setIsEditing(false)
      } else {
        throw new Error('Could not apply the requested changes. Please try rephrasing your instruction.')
      }
    } catch (error) {
      console.error('Cipher Error:', error)
      setError(error instanceof Error ? error.message : 'An unexpected error occurred')
      setIsEditing(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  // Add cleanup effect
  useEffect(() => {
    return () => {
      setIsEditing(false)
      setError(null)
      setIsLoading(false)
    }
  }, [])

  return (
    <>
      <div className="fixed right-4 bottom-8 bg-zinc-900 backdrop-blur-sm rounded-xl border border-white/10 shadow-2xl flex-col w-[380px] overflow-hidden z-50">
        <form onSubmit={handleSubmit} className="p-2">
          <div className="relative flex flex-col gap-2 rounded-2xl bg-zinc-900 p-2">
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-4 py-2 mb-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg whitespace-pre-line"
              >
                {error}
              </motion.div>
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Give clear instructions for editing (e.g., 'Add a paragraph about X to section Y')"
              className="min-h-[60px] w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-zinc-400"
              style={{
                height: 'auto',
                minHeight: '60px',
                maxHeight: '120px'
              }}
            />
            <div className="flex items-center justify-between px-4 py-2">
              <div className="text-sm text-zinc-400">
                Press <kbd className="px-2 py-1 rounded-lg bg-zinc-800 text-xs">Enter ↵</kbd> to edit
              </div>
              {isLoading ? (
                <div className="p-1.5">
                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="flex items-center justify-center rounded-full w-10 h-10 bg-white/10 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* Editing overlay */}
      <AnimatePresence>
        {isEditing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>
    </>
  )
} 