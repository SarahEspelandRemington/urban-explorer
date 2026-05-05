import React from "react";
import { MapPin, Search, ChevronRight, Clock, Star } from "lucide-react";

export function CuriousNight() {
  return (
    <div className="w-full h-[844px] max-w-[390px] bg-[#0A0A0B] text-slate-300 font-sans overflow-hidden relative shadow-2xl rounded-[40px] border border-[#1C1D1F] ring-8 ring-black/20 mx-auto">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-[#1C130D] to-transparent pointer-events-none opacity-80" />
      <div className="absolute top-0 right-0 w-64 h-64 bg-[#B5651D] opacity-[0.03] blur-[100px] pointer-events-none" />

      {/* Header */}
      <div className="pt-14 pb-4 px-6 relative z-10 flex justify-between items-center bg-gradient-to-b from-[#0A0A0B] via-[#0A0A0B]/90 to-transparent">
        <div>
          <p className="text-[#A3876A] text-xs font-semibold tracking-widest uppercase mb-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E5993A] animate-pulse shadow-[0_0_8px_#E5993A]" />
            Current Location
          </p>
          <h1 className="text-white text-2xl font-light tracking-tight">
            Beacon Hill
          </h1>
        </div>
        <button className="w-10 h-10 rounded-full bg-[#161618] border border-[#2A2623] flex items-center justify-center text-[#E5993A] transition-colors hover:bg-[#1D1B1A]">
          <Search size={18} />
        </button>
      </div>

      <div className="px-6 pb-2 relative z-10">
        <h2 className="text-[#6C665F] text-sm font-medium mb-4 flex justify-between items-center">
          <span>3 Discoveries Nearby</span>
          <span className="text-[#8B7355] text-xs">Updated 2m ago</span>
        </h2>
      </div>

      {/* Main Content Scroll */}
      <div className="h-full overflow-y-auto pb-40 px-5 space-y-4 [&::-webkit-scrollbar]:hidden relative z-10">
        {/* Card 1 */}
        <div className="group relative bg-[#121214] rounded-2xl p-1.5 transition-all duration-300 hover:bg-[#161618] border border-[#222120] overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#E5993A]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-3">
            <img
              src="/__mockup/images/curious-night-building.jpg"
              alt="The Blackwood Apothecary"
              className="w-full h-full object-cover mix-blend-luminosity opacity-80 group-hover:mix-blend-normal group-hover:opacity-100 transition-all duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#121214] via-[#121214]/20 to-transparent" />
            <div className="absolute top-3 left-3 bg-[#0A0A0B]/80 backdrop-blur-md border border-[#E5993A]/20 text-[#E5993A] text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full">
              Commercial
            </div>
            <div className="absolute bottom-3 right-3 text-[#A3876A] flex items-center gap-1 text-xs bg-[#0A0A0B]/60 backdrop-blur-sm px-2 py-1 rounded-md">
              <MapPin size={10} /> 120ft
            </div>
          </div>
          <div className="px-3 pb-3">
            <h3 className="text-white text-lg font-medium mb-1 leading-tight group-hover:text-[#E5993A] transition-colors">
              The Blackwood Apothecary
            </h3>
            <p className="text-[#84807C] text-sm leading-relaxed line-clamp-2 mb-4 font-light">
              Hidden beneath the modern street level, this former 19th-century
              pharmacy still contains sealed glass bottles of tonics that were
              forgotten during the Great Fire.
            </p>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <span className="text-[#5D5954] text-[11px] uppercase tracking-wider font-medium bg-[#1C1C1E] px-2 py-0.5 rounded flex items-center gap-1">
                  <Clock size={10} /> 1884
                </span>
                <span className="text-[#5D5954] text-[11px] uppercase tracking-wider font-medium bg-[#1C1C1E] px-2 py-0.5 rounded flex items-center gap-1">
                  <Star size={10} /> Rare
                </span>
              </div>
              <button className="text-[#E5993A] opacity-70 group-hover:opacity-100 transition-opacity">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Card 2 */}
        <div className="group relative bg-[#121214] rounded-2xl p-1.5 transition-all duration-300 hover:bg-[#161618] border border-[#222120] overflow-hidden">
          <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-3">
            <img
              src="/__mockup/images/curious-night-alley.jpg"
              alt="Smuggler's Passage"
              className="w-full h-full object-cover mix-blend-luminosity opacity-80 group-hover:mix-blend-normal group-hover:opacity-100 transition-all duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#121214] via-[#121214]/20 to-transparent" />
            <div className="absolute top-3 left-3 bg-[#0A0A0B]/80 backdrop-blur-md border border-[#E5993A]/20 text-[#E5993A] text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full">
              Infrastructure
            </div>
            <div className="absolute bottom-3 right-3 text-[#A3876A] flex items-center gap-1 text-xs bg-[#0A0A0B]/60 backdrop-blur-sm px-2 py-1 rounded-md">
              <MapPin size={10} /> 300ft
            </div>
          </div>
          <div className="px-3 pb-3">
            <h3 className="text-white text-lg font-medium mb-1 leading-tight group-hover:text-[#E5993A] transition-colors">
              Smuggler's Passage
            </h3>
            <p className="text-[#84807C] text-sm leading-relaxed line-clamp-2 mb-4 font-light">
              What looks like a dead-end brick alley was once a crucial artery
              for prohibition-era rum runners. Notice the bricked-over archway
              on the left wall.
            </p>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <span className="text-[#5D5954] text-[11px] uppercase tracking-wider font-medium bg-[#1C1C1E] px-2 py-0.5 rounded flex items-center gap-1">
                  <Clock size={10} /> 1922
                </span>
              </div>
              <button className="text-[#E5993A] opacity-70 group-hover:opacity-100 transition-opacity">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="group relative bg-[#121214] rounded-2xl p-1.5 transition-all duration-300 hover:bg-[#161618] border border-[#222120] overflow-hidden">
          <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-3">
            <img
              src="/__mockup/images/curious-night-church.jpg"
              alt="Trinity Spire"
              className="w-full h-full object-cover mix-blend-luminosity opacity-80 group-hover:mix-blend-normal group-hover:opacity-100 transition-all duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#121214] via-[#121214]/20 to-transparent" />
            <div className="absolute top-3 left-3 bg-[#0A0A0B]/80 backdrop-blur-md border border-[#E5993A]/20 text-[#E5993A] text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full">
              Monument
            </div>
            <div className="absolute bottom-3 right-3 text-[#A3876A] flex items-center gap-1 text-xs bg-[#0A0A0B]/60 backdrop-blur-sm px-2 py-1 rounded-md">
              <MapPin size={10} /> 0.2mi
            </div>
          </div>
          <div className="px-3 pb-3">
            <h3 className="text-white text-lg font-medium mb-1 leading-tight group-hover:text-[#E5993A] transition-colors">
              Trinity Spire Sanctuary
            </h3>
            <p className="text-[#84807C] text-sm leading-relaxed line-clamp-2 mb-4 font-light">
              The only surviving structure of the original parish. The crypt
              below allegedly holds untouched archives from the city's founding
              families.
            </p>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <span className="text-[#5D5954] text-[11px] uppercase tracking-wider font-medium bg-[#1C1C1E] px-2 py-0.5 rounded flex items-center gap-1">
                  <Clock size={10} /> 1745
                </span>
              </div>
              <button className="text-[#E5993A] opacity-70 group-hover:opacity-100 transition-opacity">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action / Navigation Area */}
      <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-[#0A0A0B] via-[#0A0A0B]/90 to-transparent pointer-events-none z-20" />
      <div className="absolute bottom-8 left-0 w-full px-6 z-30 flex justify-center">
        <button className="bg-[#E5993A] text-[#0A0A0B] font-medium py-3.5 px-8 rounded-full shadow-[0_4px_20px_rgba(229,153,58,0.3)] hover:bg-[#F0A950] transition-colors flex items-center gap-2">
          <span>Continue Walk</span>
          <MapPin size={16} />
        </button>
      </div>
    </div>
  );
}
