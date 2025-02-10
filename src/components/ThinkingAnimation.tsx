import { motion } from 'framer-motion';

export default function ThinkingAnimation() {
  return (
    <div className="flex items-center gap-2 text-zinc-400 py-2">
      <span className="text-sm">Thinking</span>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1 h-1 bg-zinc-400 rounded-full"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.5, 1, 0.5]
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.2
            }}
          />
        ))}
      </div>
    </div>
  );
} 