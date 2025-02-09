'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Check, Pencil, ExternalLink, Twitter, Youtube, Instagram, Linkedin, Facebook, TrendingUp } from 'lucide-react'
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
  } | null>(null)
  const [wordCount, setWordCount] = useState(0)
  const [showSaveNotification, setShowSaveNotification] = useState(false)
  const [researchPlan, setResearchPlan] = useState<{
    query: string;
    suggestedDirections: string[];
    explanation: string;
  } | null>(null)
  const [isConfirmingResearch, setIsConfirmingResearch] = useState(false)

  const trendingQueries = [
    "What are the long-term psychological effects of social media usage on adolescent development and mental well-being?",
    "How do emerging quantum computing technologies impact current cryptographic security systems and future cybersecurity frameworks?",
    "What are the environmental and socioeconomic implications of transitioning to renewable energy sources in developing nations?",
    "How does artificial intelligence influence decision-making processes in modern healthcare diagnostics and treatment planning?",
    "What are the neurobiological mechanisms underlying memory formation and their implications for treating neurodegenerative diseases?",
    "How do microplastics in oceans affect marine ecosystems and what are the potential impacts on human health?",
    "What role does epigenetics play in the inheritance of trauma across generations and its impact on mental health?",
    "How can sustainable urban planning mitigate the effects of climate change in metropolitan areas?",
    "What are the implications of space debris on future space exploration and satellite communications?",
    "How does chronic stress affect immune system function and overall physical health outcomes?",
    "What are the sociological impacts of remote work on organizational culture and employee well-being?",
    "How do different teaching methodologies affect cognitive development and learning outcomes in early childhood education?",
    "What are the potential applications of CRISPR gene editing in treating genetic disorders?",
    "How does blockchain technology influence financial inclusion and economic development in underserved communities?",
    "What are the psychological and social implications of virtual reality adoption in educational settings?",
    "How do dietary patterns influence gut microbiome composition and its effect on mental health?",
    "What are the long-term effects of air pollution on cardiovascular health in urban populations?",
    "How does artificial intelligence bias affect decision-making in criminal justice systems?",
    "What role do sleep patterns play in cognitive performance and memory consolidation?",
    "How do cultural differences impact the effectiveness of global public health interventions?"
  ]

  const [randomTrendingQueries] = useState(() => {
    // Get 4 random queries from the list
    return [...trendingQueries]
      .sort(() => Math.random() - 0.5)
      .slice(0, 4)
  })

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
    setIsEditing(false)
    setResearchPlan(null)

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
          messages: [{ role: 'user', content: query }]
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
          wordCount: data.metadata?.wordCount || 0
        })
        setWordCount(data.metadata?.wordCount || 0)
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
      }, 1000)
    }
  }

  const handleConfirmResearch = async (modifiedDirections?: string[]) => {
    if (!researchPlan) return;

    setIsConfirmingResearch(false);
    setIsResearching(true);
    updateStepStatus('search', 'loading');

    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: query }],
          researchDepth: 'deep',
          confirmedDirection: {
            query: researchPlan.query,
            context: '',
            goals: modifiedDirections || researchPlan.suggestedDirections
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to confirm research');
      }

      const data = await response.json();
      
      if (data.content) {
        setContent(data.content);
        setMetadata({
          sourceCount: data.metadata?.sourceCount || 0,
          citationsUsed: data.metadata?.citationsUsed || 0,
          sourceUsagePercent: data.metadata?.sourceUsagePercent || 0,
          wordCount: data.metadata?.wordCount || 0
        });
        setWordCount(data.metadata?.wordCount || 0);
        setEditedContent(data.content);
        
        setTimeout(() => {
          updateStepStatus('generate', 'complete');
        }, 500);
      } else {
        throw new Error('No content in response');
      }
    } catch (error) {
      console.error('Error confirming research:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      
      setResearchSteps(steps => 
        steps.map(step => 
          step.status === 'waiting' || step.status === 'loading' 
            ? { ...step, status: 'error' } 
            : step
        )
      );
      
      setContent(`<div class="text-red-400 text-center py-8">
        <p class="mb-4">Sorry, something went wrong while confirming your research.</p>
        <div class="text-sm bg-red-900/20 rounded-lg p-4 mb-4">${errorMessage}</div>
        <p class="text-sm">Please try again or try a different query.</p>
      </div>`);
    } finally {
      setTimeout(() => {
        setIsResearching(false);
      }, 1000);
    }
  }

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

  return (
    <main className="min-h-screen flex flex-col bg-black relative overflow-hidden">
      {/* Ambient background effect */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_0%,transparent_100%)] pointer-events-none" />
      
      {/* Logo - only show on initial page */}
      {!hasStarted && (
        <div className="logo-container">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <Image 
              src="/images/logo.svg" 
              alt="Noobox Logo" 
              width={168}
              height={168}
              className="logo"
              priority
            />
          </motion.div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {!hasStarted ? (
          /* Initial Search View */
          <div className="flex-1 w-full">
            <div className="w-full max-w-2xl mx-auto px-4 text-center relative mt-20">
              <motion.div 
                className="space-y-12"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <h1 className="text-[50px] font-normal text-white tracking-tight leading-tight mt-20">
                  Research Like a Pro
                </h1>
                
                <form onSubmit={handleSubmit} className="space-y-8">
                  {/* Input Box */}
                  <div className="relative group">
                    <div className="absolute -inset-1 bg-white/5 rounded-full blur-xl group-hover:blur-2xl transition-all duration-300 group-hover:opacity-100 opacity-0" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="What do you want to know?"
                      className="search-input"
                      disabled={isResearching}
                    />
                    <button
                      type="submit"
                      disabled={isResearching || !query.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-zinc-800 text-white rounded-full hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg"
                    >
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                </form>

                {/* Trending Researches */}
                <motion.div 
                  className="mt-12 relative"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                >
                  <div className="flex items-center justify-center space-x-2 text-gray-400 mb-6">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-sm font-medium">Trending Researches</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto px-4">
                    {randomTrendingQueries.map((trendingQuery, index) => (
                      <motion.button
                        key={index}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: index * 0.1 }}
                        onClick={() => setQuery(trendingQuery)}
                        className="trending-card"
                      >
                        {trendingQuery}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full"
          >
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 h-16 bg-black border-b border-white/10 z-10 flex items-center justify-center">
              <div className="w-32 relative">
                <Image
                  src="/images/logo.svg"
                  alt="Noobox Logo"
                  width={128}
                  height={32}
                  priority
                  className="object-contain"
                />
              </div>
            </header>
            
            {/* Add padding-top to the content to account for fixed header */}
            <div className="pt-16">
              <div className="flex-1 w-full">
                <div className="flex h-screen relative">
                  <motion.div 
                    className="flex-1 overflow-y-auto hide-scrollbar p-6 mr-[380px]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="w-full pl-[22%] pr-[5%]">
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

                  {/* Sources panel - only show when content exists and not researching */}
                  {!isResearching && content && (
                    <motion.div 
                      className="fixed right-6 top-24 bottom-8 bg-zinc-900 backdrop-blur-sm rounded-xl border border-white/10 shadow-2xl flex flex-col w-[380px]"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="flex items-center justify-between p-4 border-b border-white/10">
                        <div className="flex items-center space-x-2">
                          <h2 className="text-lg font-medium text-white">Sources</h2>
                          <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-xs text-gray-400">{sources.length}</span>
                        </div>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <div className="h-full overflow-y-auto hide-scrollbar">
                          <div className="p-4 space-y-3">
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
                                    className="block p-3 rounded-lg hover:bg-zinc-800/50 transition-colors border border-white/5 hover:border-white/10"
                                  >
                                    <div className="flex items-start space-x-3">
                                      <div className="flex-shrink-0 w-4 h-4 mt-0.5">
                                        {source.favicon ? (
                                          <img 
                                            src={source.favicon} 
                                            alt="" 
                                            className="w-4 h-4 rounded-sm"
                                            onError={(e) => {
                                              const target = e.target as HTMLImageElement;
                                              target.src = `https://www.google.com/s2/favicons?domain=${getHostname(source.url)}`;
                                            }}
                                          />
                                        ) : (
                                          <img 
                                            src={`https://www.google.com/s2/favicons?domain=${getHostname(source.url)}`}
                                            alt=""
                                            className="w-4 h-4 rounded-sm"
                                          />
                                        )}
                                      </div>
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
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer - only show on initial page */}
      {!hasStarted && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="fixed bottom-0 left-0 right-0 text-center py-4 text-zinc-500 text-xs bg-black/80 backdrop-blur-sm border-t border-white/5 z-50"
        >
          <div className="flex flex-col items-center space-y-4">
            <div className="flex justify-center space-x-8">
              <a href="#" className="text-gray-400 hover:text-white transition-all duration-300 transform hover:-translate-y-0.5">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-all duration-300 transform hover:-translate-y-0.5">
                <Youtube className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-all duration-300 transform hover:-translate-y-0.5">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-all duration-300 transform hover:-translate-y-0.5">
                <Linkedin className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-all duration-300 transform hover:-translate-y-0.5">
                <Facebook className="w-5 h-5" />
              </a>
            </div>
            <div className="text-gray-500 hover:text-gray-400 transition-colors duration-300">© Noboox 2025</div>
          </div>
        </motion.div>
      )}

      {isConfirmingResearch && researchPlan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 rounded-lg p-6 max-w-2xl w-full space-y-4">
            <h2 className="text-xl font-semibold">Confirm Research Plan</h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-400">Reformulated Query</h3>
                <p className="mt-1">{researchPlan.query}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-400">Research Directions</h3>
                <ul className="mt-2 space-y-2">
                  {researchPlan.suggestedDirections.map((direction, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-gray-500">{index + 1}.</span>
                      <span>{direction}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-400">Research Approach</h3>
                <p className="mt-1 text-sm">{researchPlan.explanation}</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setIsConfirmingResearch(false);
                  setIsResearching(false);
                  setResearchPlan(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmResearch()}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Start Research
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
