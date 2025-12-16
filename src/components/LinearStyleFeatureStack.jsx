import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function LinearStyleFeatureStack({
  features = [],
  heading = "Built for power users",
}) {
  const [active, setActive] = useState(0);

  // Remove this entire useEffect block to stop auto-scrolling
  // useEffect(() => {
  //   if (!features.length) return;
  //   const id = setInterval(
  //     () => setActive((a) => (a + 1) % features.length),
  //     4000
  //   );
  //   return () => clearInterval(id);
  // }, [features.length]);

  return (
    <section className="relative bg-black text-white py-16 overflow-hidden w-full">
      <div className="w-full px-6">
        <div className="mb-12 text-center">
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-4">
            {heading}
          </h2>
          <p className="text-lg md:text-xl max-w-3xl mx-auto text-white/80">
            {features[active] ? features[active].desc : ''}
          </p>
        </div>

        <div className="relative h-[500px] flex items-center justify-center">
          {features.map((f, i) => {
            // Static positioning - cards don't move based on active state
            const baseX = (i - 1) * 120; // Left, center, right positions
            const baseY = i * 30; // Slight vertical offset for stacking
            const baseRotX = 15; // Tilt forward/backward (overhead view)
            const baseRotY = -40; // Tilt away from viewer (3D pitch)
            const baseRotZ = 0; // Slight rotation for fan effect
            const baseZ = i * 50; // Depth stacking - positive values go forward

            // Color scheme for each card
            const cardColors = [
              { primary: '#3B82F6', secondary: '#1E40AF' }, // Blue
              { primary: '#10B981', secondary: '#059669' }, // Green  
              { primary: '#F59E0B', secondary: '#D97706' }, // Amber
              { primary: '#EF4444', secondary: '#DC2626' }, // Red
            ];

            const isActive = active === i;
            const colors = cardColors[i % cardColors.length];

            return (
              <motion.div
                key={i}
                className="absolute cursor-pointer"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(i)}
                initial={false}
                animate={{
                  x: baseX,
                  y: baseY + (isActive ? -30 : 0), // Slide up 400px (2x card height) when active
                  rotateX: baseRotX,
                  rotateY: baseRotY,
                  rotateZ: baseRotZ,
                  translateZ: baseZ,
                  scale: isActive ? 1.05 : 0.95,
                  zIndex: 10 + i, // Keep consistent z-index, no more front/back switching
                }}
                transition={{ type: "spring", stiffness: 200, damping: 25 }}
                style={{ 
                  transformStyle: "preserve-3d",
                  isolation: "isolate"
                }}
              >
                {/* Spotlight effect for active card */}
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute -inset-8 rounded-3xl bg-gradient-to-b from-white/20 via-white/10 to-transparent blur-2xl pointer-events-none"
                    style={{
                      background: `radial-gradient(circle at center, ${colors.primary}40 0%, transparent 70%)`
                    }}
                  />
                )}

                {/* Dull overlay for inactive cards */}
                <motion.div
                  className="absolute inset-0 rounded-2xl pointer-events-none"
                  animate={{
                    backgroundColor: isActive ? 'transparent' : 'rgba(75, 85, 99, 0.3)'
                  }}
                  transition={{ duration: 0.2 }}
                />

                {/* screenshot */}
                <div className="relative rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl bg-zinc-900">
                  <img
                    src={f.img}
                    alt={f.title}
                    className="w-[400px] h-[250px] md:w-[500px] md:h-[300px] object-cover object-top"
                    draggable={false}
                  />

                  {/* Title pill with color-coded text */}
                  <div className="absolute left-3 top-3 rounded-full bg-black/80 px-3 py-1 text-sm font-medium ring-1 ring-white/20">
                    <motion.span
                      animate={{
                        color: isActive ? colors.primary : 'white'
                      }}
                      transition={{ duration: 0.2 }}
                      className="font-semibold"
                    >
                      {f.title}
                    </motion.span>
                  </div>

                  {/* Description overlay for active */}
                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 to-transparent"
                      >
                        <p className="text-sm text-white/90 pr-20">
                          {f.desc}
                        </p>
                        {f.href && (
                          <a
                            href={f.href}
                            className="absolute right-3 bottom-3 inline-flex items-center gap-2 text-xs font-medium text-white bg-white/20 hover:bg-white/30 transition rounded-lg px-3 py-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Learn more
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M7 17L17 7M17 7H9M17 7v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </a>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
