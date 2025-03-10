'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Check, Loader } from 'lucide-react'

type ResearchStep = {
  id: string;
  title: string;
  description: string;
  status: 'waiting' | 'loading' | 'complete' | 'error';
}

interface ResearchStepsProps {
  steps: ResearchStep[];
}

export default function ResearchSteps({ steps }: ResearchStepsProps) {
  return (
    <motion.div 
      className="space-y-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ 
        opacity: 0,
        transition: { duration: 0.2 }
      }}
    >
      <AnimatePresence mode="sync">
        {steps.map((step, index) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ 
              opacity: 1, 
              x: 0,
              transition: { 
                delay: index * 0.15,
                duration: 0.3,
                ease: "easeOut"
              }
            }}
            exit={{ 
              opacity: 0,
              x: -20,
              transition: { 
                duration: 0.2,
                ease: "easeIn"
              }
            }}
            className={`
              flex items-center space-x-4 p-3 rounded-lg
              ${step.status === 'loading' ? 'bg-zinc-800/50 border border-zinc-700/50' : 
                step.status === 'complete' ? 'bg-green-500/10 border border-green-500/20' :
                step.status === 'error' ? 'bg-red-500/10 border border-red-500/20' :
                'bg-zinc-800/50 border border-zinc-700/50'}
            `}
          >
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-white text-sm">{step.title}</h3>
              <p className="text-xs text-zinc-400 mt-0.5">{step.description}</p>
            </div>
            <div className="flex-shrink-0">
              {step.status === 'loading' && (
                <Loader className="w-4 h-4 text-white animate-spin" />
              )}
              {step.status === 'complete' && (
                <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-black" />
                </div>
              )}
              {step.status === 'error' && (
                <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                  <span className="text-white text-xs">!</span>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  )
} 