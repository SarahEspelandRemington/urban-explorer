import React from "react";
import { 
  MapPin, 
  ChevronRight, 
  Clock, 
  Search, 
  Building2, 
  Utensils, 
  Music 
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function WarmEmber() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-stone-950 p-4 font-sans selection:bg-orange-900/50">
      {/* Mobile Device Container */}
      <div className="relative w-[390px] h-[844px] bg-stone-900 rounded-[3rem] shadow-2xl overflow-hidden border-[8px] border-stone-950 ring-1 ring-white/5 flex flex-col">
        
        {/* Status Bar Area (Mock) */}
        <div className="h-12 w-full flex items-center justify-between px-6 text-stone-400 text-xs font-medium tracking-wide">
          <span>9:41</span>
          <div className="flex gap-1.5 items-center">
            <div className="w-4 h-3 bg-stone-400 rounded-sm"></div>
            <div className="w-3 h-3 bg-stone-400 rounded-full"></div>
            <div className="w-5 h-2.5 bg-stone-400 rounded-sm"></div>
          </div>
        </div>

        {/* Header */}
        <header className="px-6 pt-4 pb-6 shrink-0">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-stone-400">
              <MapPin className="w-4 h-4 text-orange-600" />
              <span className="text-sm font-medium tracking-wider uppercase">Lower East Side</span>
            </div>
            <Button variant="ghost" size="icon" className="text-stone-400 hover:text-stone-200 hover:bg-stone-800/50 rounded-full">
              <Search className="w-5 h-5" />
            </Button>
          </div>
          <h1 className="text-3xl font-semibold text-stone-100 tracking-tight">
            Discover
          </h1>
          <p className="text-stone-400 mt-2 text-sm leading-relaxed">
            3 hidden stories nearby
          </p>
        </header>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto px-6 pb-24 flex flex-col gap-4 no-scrollbar">
          
          {/* Card 1 */}
          <button className="w-full text-left group outline-none">
            <div className="p-5 rounded-2xl bg-stone-800/40 border border-stone-700/50 backdrop-blur-md transition-all duration-300 group-hover:bg-stone-800/60 group-hover:border-orange-900/50 group-hover:shadow-[0_0_20px_rgba(194,65,12,0.15)] group-active:scale-[0.98]">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2 text-orange-600/90">
                  <Building2 className="w-4 h-4" />
                  <span className="text-xs font-bold tracking-widest uppercase">Tenement</span>
                </div>
                <div className="flex items-center gap-1 text-stone-500 font-mono text-xs">
                  <MapPin className="w-3 h-3" />
                  <span>120ft</span>
                </div>
              </div>
              
              <h3 className="text-xl font-medium text-stone-100 mb-2 group-hover:text-orange-50 transition-colors">
                The Orchard Street Secret
              </h3>
              
              <p className="text-sm text-stone-400 leading-relaxed mb-4 line-clamp-2">
                Behind this unassuming brick facade lies one of the city's earliest operational speakeasies, completely preserved.
              </p>
              
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <Badge variant="outline" className="bg-stone-900/50 text-stone-300 border-stone-700/50 font-medium">
                    1922
                  </Badge>
                  <Badge variant="outline" className="bg-stone-900/50 text-stone-300 border-stone-700/50 font-medium">
                    Prohibition
                  </Badge>
                </div>
                <div className="w-8 h-8 rounded-full bg-stone-800/80 flex items-center justify-center text-stone-400 group-hover:bg-orange-900/30 group-hover:text-orange-500 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          </button>

          {/* Card 2 */}
          <button className="w-full text-left group outline-none">
            <div className="p-5 rounded-2xl bg-stone-800/40 border border-stone-700/50 backdrop-blur-md transition-all duration-300 group-hover:bg-stone-800/60 group-hover:border-orange-900/50 group-hover:shadow-[0_0_20px_rgba(194,65,12,0.15)] group-active:scale-[0.98]">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2 text-orange-600/90">
                  <Music className="w-4 h-4" />
                  <span className="text-xs font-bold tracking-widest uppercase">Venue</span>
                </div>
                <div className="flex items-center gap-1 text-stone-500 font-mono text-xs">
                  <MapPin className="w-3 h-3" />
                  <span>340ft</span>
                </div>
              </div>
              
              <h3 className="text-xl font-medium text-stone-100 mb-2 group-hover:text-orange-50 transition-colors">
                CBGB's Ghost
              </h3>
              
              <p className="text-sm text-stone-400 leading-relaxed mb-4 line-clamp-2">
                Look closely at the sidewalk—you can still see the embedded brass markers where the legendary punk club's entrance once stood.
              </p>
              
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <Badge variant="outline" className="bg-stone-900/50 text-stone-300 border-stone-700/50 font-medium">
                    1973
                  </Badge>
                  <Badge variant="outline" className="bg-stone-900/50 text-stone-300 border-stone-700/50 font-medium">
                    Punk Rock
                  </Badge>
                </div>
                <div className="w-8 h-8 rounded-full bg-stone-800/80 flex items-center justify-center text-stone-400 group-hover:bg-orange-900/30 group-hover:text-orange-500 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          </button>

          {/* Card 3 */}
          <button className="w-full text-left group outline-none">
            <div className="p-5 rounded-2xl bg-stone-800/40 border border-stone-700/50 backdrop-blur-md transition-all duration-300 group-hover:bg-stone-800/60 group-hover:border-orange-900/50 group-hover:shadow-[0_0_20px_rgba(194,65,12,0.15)] group-active:scale-[0.98]">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2 text-orange-600/90">
                  <Utensils className="w-4 h-4" />
                  <span className="text-xs font-bold tracking-widest uppercase">Culinary</span>
                </div>
                <div className="flex items-center gap-1 text-stone-500 font-mono text-xs">
                  <MapPin className="w-3 h-3" />
                  <span>0.2mi</span>
                </div>
              </div>
              
              <h3 className="text-xl font-medium text-stone-100 mb-2 group-hover:text-orange-50 transition-colors">
                Katz's Original Sign
              </h3>
              
              <p className="text-sm text-stone-400 leading-relaxed mb-4 line-clamp-2">
                Before the famous neon, a hand-painted wooden sign hung here. The faded letters are still visible when the light hits just right.
              </p>
              
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <Badge variant="outline" className="bg-stone-900/50 text-stone-300 border-stone-700/50 font-medium">
                    1888
                  </Badge>
                  <Badge variant="outline" className="bg-stone-900/50 text-stone-300 border-stone-700/50 font-medium">
                    Deli
                  </Badge>
                </div>
                <div className="w-8 h-8 rounded-full bg-stone-800/80 flex items-center justify-center text-stone-400 group-hover:bg-orange-900/30 group-hover:text-orange-500 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          </button>

        </div>

        {/* Bottom Navigation (Mock) */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-stone-950 via-stone-900/95 to-transparent pointer-events-none">
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 px-6 py-3 rounded-full bg-stone-800/90 border border-stone-700/50 backdrop-blur-xl pointer-events-auto shadow-2xl">
            <button className="flex flex-col items-center gap-1 text-orange-500">
              <MapPin className="w-5 h-5" />
            </button>
            <button className="flex flex-col items-center gap-1 text-stone-500 hover:text-stone-300 transition-colors">
              <Clock className="w-5 h-5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
