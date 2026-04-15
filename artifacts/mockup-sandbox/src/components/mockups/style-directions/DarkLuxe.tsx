import React from "react";
import { 
  Building, 
  MapPin, 
  Search, 
  Bookmark, 
  Compass, 
  Landmark, 
  Info,
  Clock,
  Sparkles
} from "lucide-react";

export function DarkLuxe() {
  return (
    <div className="w-[390px] h-[844px] mx-auto overflow-hidden bg-[#0f0f14] text-[#f0eeeb] flex flex-col font-sans relative selection:bg-[#d4a24c] selection:text-[#0f0f14]">
      {/* Background ambient glow */}
      <div className="absolute top-[-10%] left-[-20%] w-[150%] h-[50%] bg-[#d4a24c] opacity-[0.03] blur-[120px] pointer-events-none" />
      
      {/* Header */}
      <header className="px-6 pt-14 pb-4 flex justify-between items-center z-10 sticky top-0 bg-[#0f0f14]/80 backdrop-blur-md border-b border-white/5">
        <div className="flex flex-col">
          <h1 className="font-['Playfair_Display'] text-2xl font-bold tracking-wide">Urban Explorer</h1>
          <div className="flex items-center text-[#d4a24c]/80 text-xs mt-1 font-medium tracking-widest uppercase">
            <MapPin className="w-3 h-3 mr-1" />
            Near Times Square, NYC
          </div>
        </div>
        <button className="w-10 h-10 rounded-full bg-[#1a1a22] border border-white/5 flex items-center justify-center text-[#f0eeeb] hover:bg-[#d4a24c] hover:text-[#0f0f14] transition-colors duration-300">
          <Search className="w-4 h-4" />
        </button>
      </header>

      {/* Feed */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide pb-24 z-10">
        <div className="p-6 flex flex-col gap-8">
          
          {/* Place Card 1 */}
          <article className="flex flex-col relative group">
            {/* Image Header */}
            <div className="w-full h-48 rounded-2xl overflow-hidden relative mb-4">
              <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a22] via-transparent to-transparent z-10" />
              <img 
                src="/__mockup/images/empire-state-dark.png" 
                alt="Empire State Building"
                className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700 ease-out"
              />
              <div className="absolute top-3 right-3 z-20">
                <div className="bg-[#0f0f14]/60 backdrop-blur-md rounded-full px-3 py-1.5 flex items-center text-xs font-semibold text-[#f0eeeb] border border-white/10">
                  <Compass className="w-3 h-3 mr-1 text-[#d4a24c]" />
                  320m away
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="bg-[#1a1a22] rounded-2xl p-5 -mt-12 relative z-20 mx-2 border border-white/5 shadow-2xl shadow-black/50">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="flex items-center text-[10px] font-bold tracking-[0.2em] text-[#d4a24c] uppercase mb-2">
                    <Building className="w-3 h-3 mr-1.5" />
                    Building <span className="mx-1.5 text-white/20">•</span> 1931
                  </div>
                  <h2 className="font-['Playfair_Display'] text-2xl font-bold leading-tight mb-2">
                    Empire State Building
                  </h2>
                </div>
                <button className="text-white/40 hover:text-[#d4a24c] transition-colors mt-1">
                  <Bookmark className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-white/70 leading-relaxed mb-4">
                A 102-story Art Deco skyscraper in Midtown Manhattan, standing as a testament to American ambition and architectural elegance.
              </p>

              {/* Fact Box */}
              <div className="bg-[#0f0f14] rounded-xl p-4 mb-4 border border-[#d4a24c]/10 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-[#d4a24c]" />
                <div className="flex items-start">
                  <Sparkles className="w-4 h-4 text-[#d4a24c] mt-0.5 mr-3 shrink-0" />
                  <p className="text-xs text-white/80 leading-relaxed italic">
                    It was built in just 410 days during the Great Depression, averaging a staggering 4.5 floors per week.
                  </p>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2">
                <span className="text-[11px] font-medium text-white/50 hover:text-[#d4a24c] transition-colors cursor-pointer">#ArtDeco</span>
                <span className="text-[11px] font-medium text-white/50 hover:text-[#d4a24c] transition-colors cursor-pointer">#Landmark</span>
                <span className="text-[11px] font-medium text-white/50 hover:text-[#d4a24c] transition-colors cursor-pointer">#Skyscraper</span>
              </div>
            </div>
          </article>

          {/* Place Card 2 */}
          <article className="flex flex-col relative group">
            {/* Image Header */}
            <div className="w-full h-48 rounded-2xl overflow-hidden relative mb-4">
              <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a22] via-transparent to-transparent z-10" />
              <img 
                src="/__mockup/images/st-patricks-dark.png" 
                alt="St. Patrick's Cathedral"
                className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700 ease-out"
              />
              <div className="absolute top-3 right-3 z-20">
                <div className="bg-[#0f0f14]/60 backdrop-blur-md rounded-full px-3 py-1.5 flex items-center text-xs font-semibold text-[#f0eeeb] border border-white/10">
                  <Compass className="w-3 h-3 mr-1 text-[#d4a24c]" />
                  850m away
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="bg-[#1a1a22] rounded-2xl p-5 -mt-12 relative z-20 mx-2 border border-white/5 shadow-2xl shadow-black/50">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="flex items-center text-[10px] font-bold tracking-[0.2em] text-[#d4a24c] uppercase mb-2">
                    <Landmark className="w-3 h-3 mr-1.5" />
                    Church <span className="mx-1.5 text-white/20">•</span> 1878
                  </div>
                  <h2 className="font-['Playfair_Display'] text-2xl font-bold leading-tight mb-2">
                    St. Patrick's Cathedral
                  </h2>
                </div>
                <button className="text-white/40 hover:text-[#d4a24c] transition-colors mt-1">
                  <Bookmark className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-white/70 leading-relaxed mb-4">
                A decorated Neo-Gothic-style Roman Catholic cathedral church serving as a prominent landmark on Fifth Avenue.
              </p>

              {/* Fact Box */}
              <div className="bg-[#0f0f14] rounded-xl p-4 mb-4 border border-[#d4a24c]/10 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-[#d4a24c]" />
                <div className="flex items-start">
                  <Sparkles className="w-4 h-4 text-[#d4a24c] mt-0.5 mr-3 shrink-0" />
                  <p className="text-xs text-white/80 leading-relaxed italic">
                    The cathedral's massive bronze doors weigh 9,200 pounds each and were designed to be opened with just one hand.
                  </p>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2">
                <span className="text-[11px] font-medium text-white/50 hover:text-[#d4a24c] transition-colors cursor-pointer">#NeoGothic</span>
                <span className="text-[11px] font-medium text-white/50 hover:text-[#d4a24c] transition-colors cursor-pointer">#Architecture</span>
                <span className="text-[11px] font-medium text-white/50 hover:text-[#d4a24c] transition-colors cursor-pointer">#Historic</span>
              </div>
            </div>
          </article>
          
        </div>
      </main>

      {/* Bottom Tab Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#0f0f14] via-[#0f0f14]/95 to-transparent z-20 flex items-end pb-8 px-12">
        <div className="w-full flex justify-between items-center">
          <button className="flex flex-col items-center gap-1.5 text-[#d4a24c]">
            <Compass className="w-6 h-6" strokeWidth={2} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Explore</span>
          </button>
          
          <button className="w-12 h-12 rounded-full bg-[#d4a24c] text-[#0f0f14] flex items-center justify-center shadow-[0_0_20px_rgba(212,162,76,0.3)] transform -translate-y-4 hover:scale-105 transition-transform">
            <Scan className="w-5 h-5" />
          </button>
          
          <button className="flex flex-col items-center gap-1.5 text-white/40 hover:text-white/80 transition-colors">
            <Bookmark className="w-6 h-6" strokeWidth={1.5} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Saved</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Extra icon needed for the center fab
function Scan(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      {...props}
    >
      <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
      <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
      <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
      <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  );
}
