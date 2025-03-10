'use client'

import { useState, useEffect, FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Check, Pencil, ExternalLink, Twitter, Youtube, Instagram, Linkedin, Facebook, TrendingUp, LucideProps } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { createResearch } from '@/lib/db'

// Import components directly instead of using dynamic imports
import Editor from '@/components/Editor'
import ResearchSteps from '@/components/ResearchSteps'
import Cipher from '@/components/Cipher'

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

const IconWrapper = ({ icon: Icon, className }: { icon: React.ComponentType<LucideProps>; className: string }) => {
  return <Icon size={24} className={className} />;
};

const FaviconImage = ({ source }: { source: any }) => {
  const [faviconUrl, setFaviconUrl] = useState<string | undefined>(undefined);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Reset states when source changes
    setIsLoading(true);
    setHasError(false);

    const loadFavicon = async () => {
      try {
        // Try the provided favicon first
        if (source.favicon) {
          setFaviconUrl(source.favicon);
          return;
        }

        // If no favicon provided, try to generate one
        const domain = getHostname(source.url);
        if (domain !== 'Invalid URL' && domain !== 'No URL available') {
          setFaviconUrl(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
        } else {
          setHasError(true);
        }
      } catch {
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadFavicon();
  }, [source.favicon, source.url]);

  const handleFaviconError = () => {
    if (!hasError) {
      setHasError(true);
      setFaviconUrl(undefined);
    }
  };

  if (isLoading || !faviconUrl) {
    return <div className="w-4 h-4 rounded-sm bg-zinc-700" />;
  }

  return (
    <img 
      src={faviconUrl} 
      alt="" 
      className="w-4 h-4 rounded-sm"
      onError={handleFaviconError}
      loading="lazy"
    />
  );
};

export default function Home() {
  const [mounted, setMounted] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
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
  const [isSourcesPanelOpen, setIsSourcesPanelOpen] = useState(false)
  const router = useRouter()
  const [isCipherVisible, setIsCipherVisible] = useState(false)

  useEffect(() => {
    console.log('Cipher visibility state:', {
      isCipherVisible,
      hasContent: Boolean(content),
      isResearching
    })
  }, [isCipherVisible, content, isResearching])

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
    
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!query.trim()) return

    setIsResearching(true)
    setHasStarted(true)
    setContent('')
    setSources([])
    setCurrentQuery(query)
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
        
        setContent(data.content)
        setMetadata({
          sourceCount: data.metadata?.sourceCount || 0,
          citationsUsed: data.metadata?.citationsUsed || 0,
          sourceUsagePercent: data.metadata?.sourceUsagePercent || 0,
          wordCount: data.metadata?.wordCount || 0
        })
        setWordCount(data.metadata?.wordCount || 0)
        setEditedContent(data.content)

        // Save to database if user is authenticated
        if (session?.user?.id) {
          console.log('Saving research to database...');
          try {
            const research = await createResearch(
              session.user.id,
              query,
              data.content,
              data.metadata.wordCount,
              data.sources,
              {
                sourceCount: data.metadata.sourceCount,
                citationsUsed: data.metadata.citationsUsed,
                sourceUsagePercent: data.metadata.sourceUsagePercent
              }
            );
            console.log('Research saved successfully:', research);
          } catch (error) {
            console.error('Error saving research:', error);
          }
        } else {
          console.log('User not authenticated, skipping database save');
        }
        
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

  const handleContentChange = (html: string) => {
    console.log('Content changing to:', html ? html.substring(0, 100) + '...' : 'empty')
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

  const handleCipherEdit = (newContent: string, newMetadata?: { citationsUsed: number; sourceUsagePercent: number }) => {
    setContent(newContent)
    setEditedContent(newContent)
    // Calculate word count from text content
    const text = newContent.replace(/<[^>]*>/g, ' ')
    const words = text.trim().split(/\s+/).filter(word => word.length > 0)
    setWordCount(words.length)

    // Update metadata if provided
    if (newMetadata && metadata) {
      setMetadata({
        ...metadata,
        citationsUsed: newMetadata.citationsUsed,
        sourceUsagePercent: newMetadata.sourceUsagePercent
      })
    }
  }

  return (
    <main className="min-h-screen flex flex-col bg-black relative overflow-hidden">
      {/* Ambient background effect */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_0%,transparent_100%)] pointer-events-none" />
      
      {/* Header with Logo and Auth buttons */}
      {!hasStarted && (
        <div className="absolute top-0 left-0 right-0 flex justify-between items-center px-4 py-4">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <Image 
              src="/images/logo.svg" 
              alt="Noobox Logo" 
              width={128}
              height={32}
              className="object-contain w-auto h-[32px]"
              priority
            />
          </motion.div>
          
          <div className="flex items-center gap-3">
            {session ? (
              <button 
                onClick={async () => {
                  await supabase.auth.signOut()
                  router.push('/')
                }}
                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
              >
                Sign out
              </button>
            ) : (
              <>
                <button 
                  onClick={() => router.push('/auth')}
                  className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                >
                  Login
                </button>
                <button 
                  onClick={() => router.push('/auth')}
                  className="px-4 py-2 text-sm font-medium bg-white/10 rounded-lg text-white hover:bg-white/20 transition-colors"
                >
                  Sign up
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {!hasStarted ? (
          /* Initial Search View */
          <div className="flex-1 w-full h-screen flex flex-col justify-center">
            <div className="w-full max-w-2xl mx-auto px-4 text-center relative">
              <motion.div 
                className="space-y-6 md:space-y-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <h1 className="text-[32px] md:text-[50px] font-normal text-white tracking-tight leading-tight">
                  Research Like a Pro
                </h1>
                
                <form onSubmit={handleSubmit}>
                  <div className="relative">
                    <div className="relative flex flex-col gap-2 rounded-2xl bg-zinc-900 p-2">
                      <textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Ask anything..."
                        className="min-h-[60px] md:min-h-[80px] w-full resize-none bg-transparent px-4 py-3 text-lg outline-none placeholder:text-zinc-400"
                        style={{ height: 'auto' }}
                      />
                      <div className="flex items-center justify-end px-4 py-2">
                        <button
                          type="submit"
                          disabled={!query.trim() || isResearching}
                          className="flex items-center justify-center rounded-full w-10 h-10 bg-white/10 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ArrowRight className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </form>

                {/* Trending Researches */}
                <motion.div 
                  className="mt-6 md:mt-12 relative"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                >
                  <div className="flex items-center justify-center space-x-2 text-gray-400 mb-4 md:mb-6">
                    <IconWrapper icon={TrendingUp} className="w-4 h-4" />
                    <span className="text-sm font-medium">Trending Researches</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 max-w-3xl mx-auto">
                    {randomTrendingQueries.slice(0, 4).map((trendingQuery, index) => (
                      <motion.button
                        key={index}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: index * 0.1 }}
                        onClick={() => {
                          setQuery(trendingQuery)
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                        className={`trending-card text-sm md:text-base ${index >= 2 ? 'hidden md:block' : ''}`}
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
            <header className="fixed top-0 left-0 right-0 h-14 md:h-16 bg-black border-b border-white/10 z-10 flex items-center px-3 md:px-4 md:justify-center">
              <div className="w-24 md:w-32 relative">
                <Image
                  src="/images/logo.svg"
                  alt="Noobox Logo"
                  width={128}
                  height={32}
                  priority
                  className="object-contain scale-75 md:scale-100"
                />
              </div>
              {/* Mobile Sources Toggle */}
              {!isResearching && content && (
                <button
                  onClick={() => setIsSourcesPanelOpen(!isSourcesPanelOpen)}
                  className="md:hidden flex items-center space-x-2 px-2.5 py-1.5 ml-auto rounded-lg bg-zinc-900/50 border border-white/10 text-sm"
                >
                  <span className="text-sm text-gray-400">Sources</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-xs text-gray-400">{sources.length}</span>
                </button>
              )}
            </header>
            
            {/* Add padding-top to the content to account for fixed header */}
            <div className="pt-14 md:pt-16">
              <div className="flex-1 w-full">
                <div className="flex h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] relative">
                  <motion.div 
                    className="flex-1 overflow-y-auto hide-scrollbar p-3 md:p-6 md:ml-[350px]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="w-full md:pr-[31%] md:pl-[3%]">
                      {currentQuery && (
                        <motion.div 
                          className="mb-8 mt-2"
                          initial={{ opacity: 0, y: -20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.5 }}
                        >
                          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-400">
                            <span>Researching</span>
                            <div className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white max-w-full overflow-hidden">
                              <span className="block truncate">{currentQuery}</span>
                            </div>
                          </div>
                        </motion.div>
                      )}

                      <div className="mt-4 md:mt-8">
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
                                <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
                                    <div className="px-2 py-1 md:px-3 md:py-1.5 rounded-lg bg-zinc-900">
                                      <span className="text-gray-400">Sources: </span>
                                      <span className="text-white">{metadata?.sourceCount}</span>
                                    </div>
                                    <div className="px-2 py-1 md:px-3 md:py-1.5 rounded-lg bg-zinc-900">
                                      <span className="text-gray-400">Citations: </span>
                                      <span className="text-white">{metadata?.citationsUsed}</span>
                                      <span className="text-gray-500 text-xs ml-1">({metadata?.sourceUsagePercent}%)</span>
                                    </div>
                                    <div className="px-2 py-1 md:px-3 md:py-1.5 rounded-lg bg-zinc-900">
                                      <span className="text-gray-400">Words: </span>
                                      <span className="text-white word-count">{wordCount}</span>
                                    </div>
                                    <div className="px-2 py-1 md:px-3 md:py-1.5 rounded-lg bg-zinc-900">
                                      <span className="text-gray-400">Normal</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 md:gap-3">
                                    <AnimatePresence mode="sync">
                                      {showSaveNotification && (
                                        <motion.div
                                          initial={{ opacity: 0, x: 20 }}
                                          animate={{ opacity: 1, x: 0 }}
                                          exit={{ opacity: 0, x: 20 }}
                                          className="px-2 py-1 md:px-3 md:py-1.5 rounded-lg bg-green-500/20 border border-green-500/30"
                                        >
                                          <span className="text-green-300 text-xs md:text-sm">Changes saved</span>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                    {isEditing && (
                                      <div className="px-2 py-1 md:px-3 md:py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30">
                                        <span className="text-purple-300 text-xs md:text-sm">Edit Mode</span>
                                      </div>
                                    )}
                                    <button
                                      onClick={handleEditToggle}
                                      className={`p-1.5 md:p-2 rounded-lg transition-colors ${
                                        isEditing 
                                          ? 'bg-purple-500/20 hover:bg-purple-500/30' 
                                          : 'hover:bg-zinc-800'
                                      }`}
                                      title={isEditing ? "Save changes" : "Edit"}
                                    >
                                      {isEditing ? (
                                        <IconWrapper icon={Check} className="w-3.5 h-3.5 md:w-4 md:h-4 text-purple-500" />
                                      ) : (
                                        <IconWrapper icon={Pencil} className="w-3.5 h-3.5 md:w-4 md:h-4 text-zinc-400" />
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

                  {/* Sources panel - Desktop */}
                  {!isResearching && content && (
                    <motion.div 
                      className="hidden md:flex fixed left-4 top-24 bottom-8 bg-zinc-900 backdrop-blur-sm rounded-xl border border-white/10 shadow-2xl flex-col w-[340px]"
                      initial={{ opacity: 0, x: -20 }}
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
                                        <FaviconImage source={source} />
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
                                            <IconWrapper icon={ExternalLink} className="w-3 h-3 mr-1" />
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

                  {/* Sources panel - Mobile Bottom Sheet */}
                  {!isResearching && content && (
                    <div className="block md:hidden">
                      <AnimatePresence>
                        {isSourcesPanelOpen && (
                          <>
                            {/* Backdrop */}
                            <motion.div
                              className="fixed inset-0 bg-black/60 z-40"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              onClick={() => setIsSourcesPanelOpen(false)}
                            />
                            
                            {/* Bottom Sheet */}
                            <motion.div 
                              className="fixed inset-x-0 bottom-0 bg-zinc-900 rounded-t-xl border-t border-white/10 shadow-2xl flex flex-col z-50"
                              initial={{ y: "100%" }}
                              animate={{ y: 0 }}
                              exit={{ y: "100%" }}
                              transition={{ type: "spring", damping: 25, stiffness: 200 }}
                              style={{ maxHeight: "85vh" }}
                            >
                              {/* Handle */}
                              <div className="flex justify-center p-2">
                                <div className="w-12 h-1 rounded-full bg-white/20" />
                              </div>
                              
                              <div className="flex items-center justify-between px-3 py-3 border-b border-white/10">
                                <div className="flex items-center space-x-2">
                                  <h2 className="text-base font-medium text-white">Sources</h2>
                                  <span className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-xs text-gray-400">{sources.length}</span>
                                </div>
                                <button
                                  onClick={() => setIsSourcesPanelOpen(false)}
                                  className="p-1.5 rounded-lg hover:bg-zinc-800/50"
                                >
                                  <span className="text-sm text-gray-400">Close</span>
                                </button>
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
                                                <FaviconImage source={source} />
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
                                                    <IconWrapper icon={ExternalLink} className="w-3 h-3 mr-1" />
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
                          </>
                        )}
                      </AnimatePresence>

                      {/* Mobile Sources Toggle Button - Fixed at bottom */}
                      {!isSourcesPanelOpen && (
                        <motion.button
                          className="fixed bottom-4 right-4 flex items-center space-x-2 px-3 py-2 rounded-full bg-zinc-900/90 border border-white/10 shadow-lg z-40"
                          onClick={() => setIsSourcesPanelOpen(true)}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 20 }}
                        >
                          <span className="text-sm text-gray-200">View Sources</span>
                          <span className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-xs text-gray-400">{sources.length}</span>
                        </motion.button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Cipher component after research content is loaded */}
      {!isResearching && content && (
        <Cipher
          content={content}
          onEdit={(newContent, newMetadata) => handleCipherEdit(newContent, newMetadata)}
        />
      )}

      {/* Footer - only show on initial page */}
      {!hasStarted && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="fixed bottom-0 left-0 right-0 text-center py-4 text-zinc-500 text-xs bg-black/80 backdrop-blur-sm border-t border-white/5 z-40"
        >
          <div className="flex flex-col items-center space-y-2 md:space-y-4">
            <div className="flex justify-center space-x-4 md:space-x-8">
              <a href="#" className="text-gray-400 hover:text-white transition-all duration-300 transform hover:-translate-y-0.5">
                <IconWrapper icon={Twitter} className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-all duration-300 transform hover:-translate-y-0.5">
                <IconWrapper icon={Youtube} className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-all duration-300 transform hover:-translate-y-0.5">
                <IconWrapper icon={Instagram} className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-all duration-300 transform hover:-translate-y-0.5">
                <IconWrapper icon={Linkedin} className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-all duration-300 transform hover:-translate-y-0.5">
                <IconWrapper icon={Facebook} className="w-5 h-5" />
              </a>
            </div>
            <div className="text-gray-500 hover:text-gray-400 transition-colors duration-300">© Noboox 2025</div>
          </div>
        </motion.div>
      )}
    </main>
  )
}
