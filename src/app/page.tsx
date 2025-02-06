'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, ExternalLink, ArrowRight, Check, X, Pencil } from 'lucide-react'
import { ResearchDepth, ModelType } from '@/types'
import Image from 'next/image'
import dynamic from 'next/dynamic'

// Import Editor and ResearchSteps dynamically to avoid SSR issues
const Editor = dynamic(() => import('@/components/Editor'), { ssr: false })
const ResearchSteps = dynamic(() => import('@/components/ResearchSteps'), { ssr: false })

function getHostname(url: string): string {
  try {
    if (url === '#') return 'No URL available'
    const hostname = new URL(url).hostname
    return hostname
  } catch {
    return 'Invalid URL'
  }
}

// Research steps type
type ResearchStep = {
  id: string;
  title: string;
  description: string;
  status: 'waiting' | 'loading' | 'complete' | 'error';
}

export default function Home() {
  const [mounted, setMounted] = useState(false)
  const [content, setContent] = useState('')
  const [isResearching, setIsResearching] = useState(false)
  const [researchDepth, setResearchDepth] = useState<ResearchDepth>('low')
  const [selectedModel, setSelectedModel] = useState<ModelType>('gemini-1.5-pro')
  const [isThinking, setIsThinking] = useState(false)
  const [sources, setSources] = useState<Array<{
    id: string;
    title: string;
    url: string;
    snippet?: string;
    favicon?: string;
  }>>([])
  const [query, setQuery] = useState('')
  const [hasStarted, setHasStarted] = useState(false)
  const [currentQuery, setCurrentQuery] = useState('')
  const [researchSteps, setResearchSteps] = useState<ResearchStep[]>(() => [
    {
      id: 'search',
      title: 'Finding Sources',
      description: 'Searching for relevant research papers and articles...',
      status: 'waiting'
    },
    {
      id: 'extract',
      title: 'Analyzing Content',
      description: 'Reading and analyzing source materials...',
      status: 'waiting'
    },
    {
      id: 'synthesize',
      title: 'Processing Research',
      description: 'Organizing and structuring findings...',
      status: 'waiting'
    },
    {
      id: 'generate',
      title: 'Generating Insights',
      description: 'Creating comprehensive analysis with AI...',
      status: 'waiting'
    }
  ])
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState('')
  const [metadata, setMetadata] = useState<{
    sourceCount: number
    citationsUsed: number
    sourceUsagePercent: number
    wordCount: number
    charCount: number
  } | null>(null)
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [showSaveNotification, setShowSaveNotification] = useState(false)

  // Handle client-side mounting
  useEffect(() => {
    setMounted(true)
  }, [])

  // Don't render anything until mounted
  if (!mounted) {
    return null
  }

  const updateStepStatus = (stepId: string, status: ResearchStep['status']) => {
    setResearchSteps(steps => 
      steps.map(step => 
        step.id === stepId ? { ...step, status } : step
      )
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setIsResearching(true)
    setHasStarted(true)
    setContent('')
    setSources([])
    setCurrentQuery(query)
    setIsThinking(false)
    setIsEditing(false)

    // Reset research steps
    setResearchSteps(steps => steps.map(step => ({ ...step, status: 'waiting' })))

    try {
      // Update steps as research progresses
      updateStepStatus('search', 'loading')
      
      // Show loading state
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: query }],
          researchDepth,
          model: researchDepth === 'high' ? selectedModel : 'gemini-2.0-flash'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: 'An unexpected error occurred',
          details: 'Please try again later'
        }));
        
        throw new Error(errorData.error || 'An unexpected error occurred');
      }

      updateStepStatus('search', 'complete')
      updateStepStatus('extract', 'loading')

      const data = await response.json();
      
      if (data?.sources) {
        setSources(data.sources)
        updateStepStatus('extract', 'complete')
        updateStepStatus('synthesize', 'loading')
      }

      if (data.content) {
        updateStepStatus('synthesize', 'complete')
        updateStepStatus('generate', 'loading')
        
        // Check if content seems truncated
        if (data.content.length < 100 || !data.content.includes('</div>')) {
          throw new Error('The generated content appears to be incomplete. Please try again.');
        }
        
        setContent(data.content)
        setMetadata({
          sourceCount: data.metadata?.sourceCount || 0,
          citationsUsed: data.metadata?.citationsUsed || 0,
          sourceUsagePercent: data.metadata?.sourceUsagePercent || 0,
          wordCount: data.metadata?.wordCount || 0,
          charCount: data.metadata?.charCount || 0
        })
        setWordCount(data.metadata?.wordCount || 0)
        setCharCount(data.metadata?.charCount || 0)
        setEditedContent(data.content)
        
        // Short delay before marking generate as complete
        setTimeout(() => {
          updateStepStatus('generate', 'complete')
        }, 500)
      } else {
        throw new Error('No content in response')
      }
    } catch (error) {
      console.error('Error during research:', error)
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      
      // Mark all incomplete steps as error
      setResearchSteps(steps => 
        steps.map(step => 
          step.status === 'waiting' || step.status === 'loading' 
            ? { ...step, status: 'error' } 
            : step
        )
      )
      
      setContent(`<div class="text-red-400 text-center py-8">
        <p class="mb-4">Sorry, something went wrong while processing your request.</p>
        <div class="text-sm bg-red-900/20 rounded-lg p-4 mb-4">${errorMessage}</div>
        <p class="text-sm">Please try again or try a different query.</p>
      </div>`)
    } finally {
      // Don't immediately hide steps
      setTimeout(() => {
        setIsResearching(false)
        setIsThinking(false)
      }, 1000)
    }
  }

  // Add this helper function to convert HTML to Markdown
  const htmlToMarkdown = (html: string): string => {
    return html
      // Convert headings back to markdown
      .replace(/<h1[^>]*>(.*?)<\/h1>/g, '# $1')
      .replace(/<h2[^>]*>(.*?)<\/h2>/g, '## $1')
      .replace(/<h3[^>]*>(.*?)<\/h3>/g, '### $1')
      // Convert formatting back to markdown
      .replace(/<strong[^>]*>(.*?)<\/strong>/g, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/g, '*$1*')
      // Convert lists back to markdown
      .replace(/<ul[^>]*>(.*?)<\/ul>/g, '$1')
      .replace(/<li[^>]*>(.*?)<\/li>/g, '- $1')
      // Convert paragraphs back to plain text
      .replace(/<p[^>]*>(.*?)<\/p>/g, '$1')
      // Remove any remaining HTML tags
      .replace(/<[^>]+>/g, '')
      // Fix double spaces and clean up
      .replace(/\s+/g, ' ')
      .trim();
  };

  const handleContentChange = (html: string) => {
    setContent(html)
    // Calculate word count from text content
    const text = html.replace(/<[^>]*>/g, ' ')
    const words = text.trim().split(/\s+/).filter(word => word.length > 0)
    setWordCount(words.length)
    setEditedContent(html)
  }

  const handleEditToggle = () => {
    if (isEditing) {
      // Save changes
      setContent(editedContent)
      setShowSaveNotification(true)
      setTimeout(() => setShowSaveNotification(false), 2000)
    }
    setIsEditing(!isEditing)
  }

  const renderMarkdown = (content: string) => {
    // First convert markdown to HTML
    const html = content
      // Format headings
      .replace(/^# (.*$)/gm, '<h1 class="text-4xl font-bold my-4">$1</h1>')
      .replace(/^## (.*$)/gm, '<h2 class="text-2xl font-bold my-3">$1</h2>')
      .replace(/^### (.*$)/gm, '<h3 class="text-xl font-bold my-2">$1</h3>')
      // Format bold and italic
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      // Format lists
      .replace(/^- (.*$)/gm, '<li class="ml-4">$1</li>')
      .replace(/(<li.*\n*)+/g, '<ul class="list-disc my-2">$&</ul>')
      // Format paragraphs
      .replace(/^(?!<h[1-6]|<ul|<ol|<li|<blockquote|<pre|<p).*$/gm, '<p class="my-2">$&</p>');

    return (
      <div className="markdown-content prose prose-invert max-w-none">
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    );
  };

  return (
    <main className="flex min-h-screen bg-black text-white overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {!hasStarted ? (
          <motion.div 
            className="flex flex-col min-h-screen relative overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {/* Header with Logo */}
            <motion.div 
              className="w-full flex justify-center pt-12"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              {mounted && (
                <Image 
                  src="/images/logo.svg" 
                  alt="Noobox Logo" 
                  width={200} 
                  height={200}
                  className="w-32 h-32"
                  priority
                />
              )}
            </motion.div>

            {/* Centered Content */}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div 
                className="w-full max-w-2xl px-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                <div className="bg-zinc-900/50 backdrop-blur-lg rounded-3xl p-8 border border-zinc-800/50 shadow-2xl">
                  <h2 className="text-2xl font-medium text-zinc-100 mb-8">How can I help you today?</h2>
                  
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="flex flex-col space-y-4">
                      {/* Research Type & Model Selection */}
                      <div className="flex items-center gap-3">
                        <div className="flex p-1 gap-1 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
                          <button
                            type="button"
                            onClick={() => setResearchDepth('low')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                              researchDepth === 'low'
                                ? 'bg-white text-black shadow-lg'
                                : 'text-zinc-400 hover:text-white hover:bg-zinc-700/50'
                            }`}
                          >
                            Quick Research
                          </button>
                          <button
                            type="button"
                            onClick={() => setResearchDepth('high')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                              researchDepth === 'high'
                                ? 'bg-white text-black shadow-lg'
                                : 'text-zinc-400 hover:text-white hover:bg-zinc-700/50'
                            }`}
                          >
                            Deep Research
                          </button>
                        </div>
                        {researchDepth === 'high' && (
                          <div className="relative flex-1">
                            <select
                              value={selectedModel}
                              onChange={(e) => setSelectedModel(e.target.value as ModelType)}
                              className="w-full appearance-none bg-zinc-800/50 border border-zinc-700/50 text-zinc-100 rounded-xl px-4 py-2.5 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/10 focus:border-transparent transition-all hover:bg-zinc-700/50"
                            >
                              <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                              <option value="o3-mini">O3 Mini</option>
                              <option value="deepseek-r1">DeepSeek Reasoner</option>
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                              <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Search Input */}
                      <div className="relative">
                        <input
                          type="text"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Enter your research query..."
                          className="w-full bg-zinc-800/50 border border-zinc-700/50 text-zinc-100 rounded-xl pl-12 pr-12 py-3 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10 focus:border-transparent transition-all"
                        />
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                        <button
                          type="submit"
                          disabled={isResearching || !query.trim()}
                          className="absolute right-3 top-1/2 -translate-y-1/2 bg-white hover:bg-zinc-200 disabled:bg-zinc-600 disabled:cursor-not-allowed rounded-lg p-2 transition-all"
                        >
                          <ArrowRight className="w-4 h-4 text-black" />
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </motion.div>
            </div>
            
            {/* Copyright text */}
            <div className="absolute bottom-6 text-center text-zinc-500 text-sm w-full">
              © Noboox 2025
            </div>
          </motion.div>
        ) : (
          <div className="flex h-screen">
            <motion.div 
              className="flex-1 overflow-auto p-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <div className="max-w-3xl mx-auto">
                {currentQuery && (
                  <motion.div 
                    className="mb-8"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <div className="flex items-center space-x-3 text-sm text-gray-400">
                      <span>Researching</span>
                      <div className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white">
                        {currentQuery}
                      </div>
                    </div>
                  </motion.div>
                )}

                <div className="mt-8">
                  <AnimatePresence mode="sync">
                    {isResearching && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <ResearchSteps 
                          steps={researchSteps}
                          isResearching={isResearching}
                        />
                      </motion.div>
                    )}
                    {!isResearching && content && (
                      <motion.div
                        key="content"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        className="relative"
                      >
                        {metadata && (
                          <div className="mb-6 flex items-center justify-between">
                            <div className="flex items-center space-x-4 text-sm">
                              <div className="px-3 py-1.5 rounded-lg bg-zinc-900">
                                <span className="text-gray-400">Sources: </span>
                                <span className="text-white">{metadata?.sourceCount}</span>
                              </div>
                              <div className="px-3 py-1.5 rounded-lg bg-zinc-900">
                                <span className="text-gray-400">Citations: </span>
                                <span className="text-white">{metadata?.citationsUsed}</span>
                                <span className="text-gray-500 text-xs ml-1">({metadata?.sourceUsagePercent}%)</span>
                              </div>
                              <div className="px-3 py-1.5 rounded-lg bg-zinc-900">
                                <span className="text-gray-400">Words: </span>
                                <span className="text-white word-count">{wordCount}</span>
                              </div>
                            </div>
                            <div className="flex items-center space-x-3">
                              <AnimatePresence mode="sync">
                                {showSaveNotification && (
                                  <motion.div
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className="px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30"
                                  >
                                    <span className="text-green-300 text-sm">Changes saved</span>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                              {isEditing && (
                                <div className="px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30">
                                  <span className="text-purple-300 text-sm">Edit Mode</span>
                                </div>
                              )}
                              <button
                                onClick={handleEditToggle}
                                className={`p-2 rounded-lg transition-colors ${
                                  isEditing 
                                    ? 'bg-purple-500/20 hover:bg-purple-500/30' 
                                    : 'hover:bg-zinc-800'
                                }`}
                                title={isEditing ? "Save changes" : "Edit"}
                              >
                                {isEditing ? (
                                  <Check className="w-4 h-4 text-purple-500" />
                                ) : (
                                  <Pencil className="w-4 h-4 text-zinc-400" />
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                        
                        <Editor
                          content={content}
                          onChange={handleContentChange}
                          editable={isEditing}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>

            <motion.div 
              className="w-[400px] border-l border-white/10 overflow-auto"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="p-6">
                <h2 className="text-lg font-medium text-white mb-4">Sources</h2>
                <div className="space-y-4">
                  <AnimatePresence mode="sync">
                    {sources.map((source, i) => (
                      <motion.div
                        key={`${source.id}-${i}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ 
                          duration: 0.3,
                          delay: i * 0.1
                        }}
                        exit={{ 
                          opacity: 0,
                          y: -10,
                          transition: {
                            duration: 0.2,
                            delay: (sources.length - 1 - i) * 0.05
                          }
                        }}
                        className="group"
                      >
                        <a 
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block p-3 -mx-3 rounded-lg hover:bg-zinc-900 transition-colors"
                        >
                          <div className="flex items-start space-x-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-medium text-gray-400 group-hover:text-white">
                                  [{source.id}]
                                </span>
                                <h3 className="text-sm font-medium text-gray-200 group-hover:text-white truncate">
                                  {source.title}
                                </h3>
                              </div>
                              {source.snippet && (
                                <p className="mt-1 text-sm text-gray-400 line-clamp-2">
                                  {source.snippet}
                                </p>
                              )}
                              <div className="mt-2 flex items-center space-x-2">
                                <div className="text-xs text-gray-500 flex items-center">
                                  <ExternalLink className="w-3 h-3 mr-1" />
                                  {getHostname(source.url)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </a>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </main>
  )
}
