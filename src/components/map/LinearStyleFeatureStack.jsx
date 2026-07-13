import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "../../pages/landingPages/hooks/useMarketing";
import "./LinearStyleFeatureStack.css";

export default function LinearStyleFeatureStack({
  features = [],
  heading = "Built for power users",
  subtitle = "",
  layerCatalog = [],
  detailCatalog = [],
}) {
  const [active, setActive] = useState(0);
  const isMobile = useIsMobile();
  const activeFeature = features[active];
  const activeLayers = new Set(activeFeature?.layers || []);
  const activeDetails = new Set(activeFeature?.details || []);

  if (isMobile) {
    return (
      <section className="lfs-mobile" aria-label={heading}>
        <div className="lfs-mobile__header">
          <h2 className="lfs-mobile__heading">{heading}</h2>
          {subtitle ? <p className="lfs-mobile__subtitle">{subtitle}</p> : null}
        </div>

        <div className="lfs-mobile__tabs" role="tablist" aria-label="Research topics">
          {features.map((f, i) => (
            <button
              key={f.title || i}
              type="button"
              role="tab"
              aria-selected={active === i}
              className={`lfs-mobile__tab${active === i ? " is-active" : ""}`}
              onClick={() => setActive(i)}
            >
              {f.title}
            </button>
          ))}
        </div>

        {activeFeature && (
          <article className="lfs-mobile__card">
            <img src={activeFeature.img} alt={activeFeature.title} loading="lazy" />
            <div className="lfs-mobile__card-body">
              <h3 className="lfs-mobile__card-title">{activeFeature.title}</h3>
              <p className="lfs-mobile__card-desc">{activeFeature.desc}</p>
            </div>
          </article>
        )}

        {(layerCatalog.length > 0 || detailCatalog.length > 0) && (
          <div className="lfs-mobile__catalogs">
            {layerCatalog.length > 0 && (
              <div className="lfs-mobile__catalog">
                <h3>Map layers</h3>
                <ul className="lfs-mobile__pills">
                  {layerCatalog.map((layer) => (
                    <li
                      key={layer}
                      className={`lfs-mobile__pill${activeLayers.has(layer) ? " is-highlighted" : ""}`}
                    >
                      {layer}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {detailCatalog.length > 0 && (
              <div className="lfs-mobile__catalog">
                <h3>Property details</h3>
                <ul className="lfs-mobile__pills">
                  {detailCatalog.map((detail) => (
                    <li
                      key={detail}
                      className={`lfs-mobile__pill${activeDetails.has(detail) ? " is-highlighted" : ""}`}
                    >
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  const cardSpread = features.length > 1 ? 100 : 0;
  const cardCenter = (features.length - 1) / 2;

  return (
    <section className="relative bg-black text-white py-16 overflow-hidden w-full">
      <div className="w-full px-6">
        <div className="mb-12 text-center">
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-4">
            {heading}
          </h2>
          {subtitle ? (
            <p className="text-lg md:text-xl max-w-3xl mx-auto text-white/70 mb-4">
              {subtitle}
            </p>
          ) : null}
          {activeFeature ? (
            <p className="text-lg md:text-xl max-w-3xl mx-auto text-white/80">
              {activeFeature.desc}
            </p>
          ) : null}
        </div>

        <div className="relative h-[500px] flex items-center justify-center">
          {features.map((f, i) => {
            const baseX = (i - cardCenter) * cardSpread;
            const baseY = i * 30;
            const baseRotX = 15;
            const baseRotY = -40;
            const baseRotZ = 0;
            const baseZ = i * 50;

            const cardColors = [
              { primary: "#3B82F6", secondary: "#1E40AF" },
              { primary: "#10B981", secondary: "#059669" },
              { primary: "#F59E0B", secondary: "#D97706" },
              { primary: "#EF4444", secondary: "#DC2626" },
            ];

            const isActive = active === i;
            const colors = cardColors[i % cardColors.length];

            return (
              <motion.div
                key={f.title || i}
                className="absolute cursor-pointer"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                tabIndex={0}
                role="button"
                aria-pressed={isActive}
                initial={false}
                animate={{
                  x: baseX,
                  y: baseY + (isActive ? -30 : 0),
                  rotateX: baseRotX,
                  rotateY: baseRotY,
                  rotateZ: baseRotZ,
                  translateZ: baseZ,
                  scale: isActive ? 1.05 : 0.95,
                  zIndex: 10 + i,
                }}
                transition={{ type: "spring", stiffness: 200, damping: 25 }}
                style={{
                  transformStyle: "preserve-3d",
                  isolation: "isolate",
                }}
              >
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute -inset-8 rounded-3xl bg-gradient-to-b from-white/20 via-white/10 to-transparent blur-2xl pointer-events-none"
                    style={{
                      background: `radial-gradient(circle at center, ${colors.primary}40 0%, transparent 70%)`,
                    }}
                  />
                )}

                <motion.div
                  className="absolute inset-0 rounded-2xl pointer-events-none"
                  animate={{
                    backgroundColor: isActive ? "transparent" : "rgba(75, 85, 99, 0.3)",
                  }}
                  transition={{ duration: 0.2 }}
                />

                <div className="relative rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl bg-zinc-900">
                  <img
                    src={f.img}
                    alt={f.title}
                    className="w-[400px] h-[250px] md:w-[500px] md:h-[300px] object-cover object-left-top"
                    draggable={false}
                    loading="lazy"
                  />

                  <div className="absolute left-3 top-3 rounded-full bg-black/80 px-3 py-1 text-sm font-medium ring-1 ring-white/20">
                    <motion.span
                      animate={{
                        color: isActive ? colors.primary : "white",
                      }}
                      transition={{ duration: 0.2 }}
                      className="font-semibold"
                    >
                      {f.title}
                    </motion.span>
                  </div>

                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 to-transparent"
                      >
                        <p className="text-sm text-white/90 pr-20">{f.desc}</p>
                        {f.href && (
                          <a
                            href={f.href}
                            className="absolute right-3 bottom-3 inline-flex items-center gap-2 text-xs font-medium text-white bg-white/20 hover:bg-white/30 transition rounded-lg px-3 py-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Learn more
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path
                                d="M7 17L17 7M17 7H9M17 7v8"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
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

        {(layerCatalog.length > 0 || detailCatalog.length > 0) && (
          <div className="mt-10 max-w-5xl mx-auto grid gap-8 md:grid-cols-2">
            {layerCatalog.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-400 mb-4">
                  Map layers
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {layerCatalog.map((layer) => {
                    const highlighted = activeLayers.has(layer);
                    return (
                      <li
                        key={layer}
                        className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                          highlighted
                            ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40"
                            : "bg-white/5 text-white/60"
                        }`}
                      >
                        {layer}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {detailCatalog.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-400 mb-4">
                  Property details
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {detailCatalog.map((detail) => {
                    const highlighted = activeDetails.has(detail);
                    return (
                      <li
                        key={detail}
                        className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                          highlighted
                            ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40"
                            : "bg-white/5 text-white/60"
                        }`}
                      >
                        {detail}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
