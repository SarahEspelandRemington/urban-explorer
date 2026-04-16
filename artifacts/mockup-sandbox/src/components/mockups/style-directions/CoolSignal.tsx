import React from "react";
import { ChevronRight, MapPin, Building2, Coffee, Music, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function CoolSignal() {
  return (
    <div className="flex justify-center items-center min-h-screen bg-[#050505] font-sans text-slate-300 p-4">
      {/* Mobile Device Container */}
      <div className="w-[390px] h-[844px] bg-black rounded-[40px] overflow-hidden shadow-2xl relative border border-slate-800/50 flex flex-col">
        {/* Status Bar Area (Mock) */}
        <div className="h-12 w-full flex justify-between items-end px-8 pb-2 text-[11px] font-medium tracking-wider text-slate-500">
          <span>09:41</span>
          <div className="flex gap-1.5 items-center">
            <div className="w-4 h-2.5 border border-slate-500 rounded-[2px]" />
          </div>
        </div>

        {/* Header */}
        <div className="px-5 pt-4 pb-6 border-b border-slate-800/60 bg-black/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-[#60A5FA] font-semibold mb-1 flex items-center gap-1.5">
                <MapPin className="w-3 h-3" />
                Current Zone
              </div>
              <h1 className="text-xl font-medium text-slate-100 tracking-tight">Lower East Side</h1>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
              <Search className="w-4 h-4" />
            </div>
          </div>
          <div className="text-[11px] font-mono text-slate-500 uppercase tracking-wider flex justify-between items-center">
            <span>Discovering...</span>
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#60A5FA] animate-pulse"></span>
              Live
            </span>
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24 no-scrollbar">
          
          {/* Card 1 */}
          <div className="group bg-[#0a0a0c] border border-slate-800/40 rounded-xl p-4 active:bg-slate-900/50 transition-colors cursor-pointer relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#60A5FA] opacity-0 group-hover:opacity-100 transition-opacity"></div>
            
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-[14px] h-[14px] text-slate-500" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Architecture</span>
              </div>
              <span className="text-[10px] font-mono text-[#60A5FA]">120m</span>
            </div>
            
            <h2 className="text-[15px] font-medium text-slate-100 mb-1.5 leading-snug">Forward Building</h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-4 line-clamp-2">
              Former headquarters of the Jewish Daily Forward. The facade features bas-relief portraits of Karl Marx and Friedrich Engels.
            </p>
            
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                <Badge variant="outline" className="text-[9px] font-mono rounded-sm px-1.5 py-0 h-4 border-slate-700/50 text-slate-400 bg-transparent">1912</Badge>
                <Badge variant="outline" className="text-[9px] font-mono rounded-sm px-1.5 py-0 h-4 border-slate-700/50 text-slate-400 bg-transparent">BEAUX-ARTS</Badge>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-600 group-active:text-[#60A5FA] transition-colors" />
            </div>
          </div>

          {/* Card 2 */}
          <div className="group bg-[#0a0a0c] border border-slate-800/40 rounded-xl p-4 active:bg-slate-900/50 transition-colors cursor-pointer relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#818CF8] opacity-0 group-hover:opacity-100 transition-opacity"></div>
            
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <Music className="w-[14px] h-[14px] text-slate-500" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Culture</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">350m</span>
            </div>
            
            <h2 className="text-[15px] font-medium text-slate-100 mb-1.5 leading-snug">CBGB Site</h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-4 line-clamp-2">
              The birthplace of punk. Though now a designer boutique, the original awning and some graffiti remain preserved inside.
            </p>
            
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                <Badge variant="outline" className="text-[9px] font-mono rounded-sm px-1.5 py-0 h-4 border-slate-700/50 text-slate-400 bg-transparent">1973</Badge>
                <Badge variant="outline" className="text-[9px] font-mono rounded-sm px-1.5 py-0 h-4 border-slate-700/50 text-slate-400 bg-transparent">PUNK ROCK</Badge>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-600 group-active:text-[#818CF8] transition-colors" />
            </div>
          </div>

          {/* Card 3 */}
          <div className="group bg-[#0a0a0c] border border-slate-800/40 rounded-xl p-4 active:bg-slate-900/50 transition-colors cursor-pointer relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#60A5FA] opacity-0 group-hover:opacity-100 transition-opacity"></div>
            
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <Coffee className="w-[14px] h-[14px] text-slate-500" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Commerce</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">420m</span>
            </div>
            
            <h2 className="text-[15px] font-medium text-slate-100 mb-1.5 leading-snug">Katz's Delicatessen</h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-4 line-clamp-2">
              Operating since the 19th century. Known for its pastrami and its neon sign marking "That's All!"
            </p>
            
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                <Badge variant="outline" className="text-[9px] font-mono rounded-sm px-1.5 py-0 h-4 border-slate-700/50 text-slate-400 bg-transparent">1888</Badge>
                <Badge variant="outline" className="text-[9px] font-mono rounded-sm px-1.5 py-0 h-4 border-slate-700/50 text-slate-400 bg-transparent">NEON SIGNAGE</Badge>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-600 group-active:text-[#60A5FA] transition-colors" />
            </div>
          </div>

        </div>

        {/* Bottom Fade */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
