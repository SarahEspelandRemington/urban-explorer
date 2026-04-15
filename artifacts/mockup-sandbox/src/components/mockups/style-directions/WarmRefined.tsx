import React from "react";
import { MapPin, Building2, Monument, TreePine, Bookmark, Compass, Search, ChevronRight } from "lucide-react";

export function WarmRefined() {
  return (
    <div className="w-[390px] h-[844px] mx-auto overflow-hidden relative flex flex-col bg-[#fdfbf7] text-[#1c1917] font-sans border border-[#e6e2d6] shadow-sm rounded-[32px] md:my-8 md:h-[844px]">
      {/* Status Bar Area (Simulated) */}
      <div className="h-12 w-full flex items-end justify-between px-6 pb-2 text-xs font-medium">
        <span>9:41</span>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-3 rounded-sm border border-current" />
          <div className="w-3 h-3 rounded-full bg-current" />
        </div>
      </div>

      {/* Header */}
      <div className="px-5 pt-4 pb-6 bg-[#fdfbf7] z-10 sticky top-0 border-b border-[#f0ede4]">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-serif tracking-tight font-semibold text-[#2c2822]">Urban Explorer</h1>
          <button className="w-10 h-10 rounded-full flex items-center justify-center bg-[#f5f1e6] text-[#92700c] transition-colors hover:bg-[#ebe5d5]">
            <Search size={18} />
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm text-[#5c554b]">
          <MapPin size={14} className="text-[#92700c]" />
          <span>Near Times Square, NYC</span>
        </div>
      </div>

      {/* Content Feed */}
      <div className="flex-1 overflow-y-auto px-5 pb-28 pt-6 space-y-6">
        {/* Card 1 */}
        <div className="bg-white rounded-xl border border-[#e6e2d6] shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#fcfaf5] border border-[#f5f1e6] flex items-center justify-center text-[#92700c] shrink-0">
                  <Building2 size={18} />
                </div>
                <div>
                  <div className="text-[10px] tracking-widest uppercase font-bold text-[#92700c] mb-1">Building · 1931</div>
                  <h2 className="text-xl font-serif font-semibold leading-tight text-[#2c2822]">Empire State Building</h2>
                </div>
              </div>
              <button className="text-[#a8a296] hover:text-[#92700c] transition-colors mt-1">
                <Bookmark size={20} strokeWidth={1.5} />
              </button>
            </div>

            <p className="text-sm text-[#5c554b] leading-relaxed">
              An iconic 102-story Art Deco skyscraper in Midtown Manhattan, once the tallest building in the world.
            </p>

            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-[#7a7265] bg-[#f5f1e6] px-2.5 py-1 rounded-md font-medium">#ArtDeco</span>
              <span className="text-xs text-[#7a7265] bg-[#f5f1e6] px-2.5 py-1 rounded-md font-medium">#Landmark</span>
              <span className="text-xs text-[#7a7265] bg-[#f5f1e6] px-2.5 py-1 rounded-md font-medium">#Skyscraper</span>
            </div>

            <div className="bg-[#fcfaf5] border border-[#f5f1e6] rounded-lg p-4 mt-2 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#92700c]" />
              <p className="text-sm text-[#3d3831] italic">
                <span className="font-semibold not-italic text-[#92700c] block mb-1">Did you know?</span>
                The building has its own ZIP code, 10118, and gets struck by lightning an average of 25 times a year.
              </p>
            </div>

            <div className="flex items-center justify-between mt-2 text-xs text-[#7a7265] font-medium border-t border-[#f5f1e6] pt-4">
              <span>320m away</span>
              <button className="text-[#92700c] flex items-center gap-1 hover:underline">
                Read full story <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-white rounded-xl border border-[#e6e2d6] shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#fcfaf5] border border-[#f5f1e6] flex items-center justify-center text-[#92700c] shrink-0">
                  <TreePine size={18} />
                </div>
                <div>
                  <div className="text-[10px] tracking-widest uppercase font-bold text-[#92700c] mb-1">Park · 1847</div>
                  <h2 className="text-xl font-serif font-semibold leading-tight text-[#2c2822]">Bryant Park</h2>
                </div>
              </div>
              <button className="text-[#a8a296] hover:text-[#92700c] transition-colors mt-1">
                <Bookmark size={20} strokeWidth={1.5} />
              </button>
            </div>

            <p className="text-sm text-[#5c554b] leading-relaxed">
              A beloved 9.6-acre public park known for its lush lawn, seasonal gardens, and the adjacent New York Public Library.
            </p>

            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-[#7a7265] bg-[#f5f1e6] px-2.5 py-1 rounded-md font-medium">#PublicSpace</span>
              <span className="text-xs text-[#7a7265] bg-[#f5f1e6] px-2.5 py-1 rounded-md font-medium">#Midtown</span>
            </div>

            <div className="bg-[#fcfaf5] border border-[#f5f1e6] rounded-lg p-4 mt-2 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#92700c]" />
              <p className="text-sm text-[#3d3831] italic">
                <span className="font-semibold not-italic text-[#92700c] block mb-1">Did you know?</span>
                During the Civil War, the site was used as a military encampment for Union troops.
              </p>
            </div>

            <div className="flex items-center justify-between mt-2 text-xs text-[#7a7265] font-medium border-t border-[#f5f1e6] pt-4">
              <span>650m away</span>
              <button className="text-[#92700c] flex items-center gap-1 hover:underline">
                Read full story <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white rounded-xl border border-[#e6e2d6] shadow-sm overflow-hidden flex flex-col mb-4">
          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#fcfaf5] border border-[#f5f1e6] flex items-center justify-center text-[#92700c] shrink-0">
                  <Monument size={18} />
                </div>
                <div>
                  <div className="text-[10px] tracking-widest uppercase font-bold text-[#92700c] mb-1">Church · 1878</div>
                  <h2 className="text-xl font-serif font-semibold leading-tight text-[#2c2822]">St. Patrick's Cathedral</h2>
                </div>
              </div>
              <button className="text-[#a8a296] hover:text-[#92700c] transition-colors mt-1">
                <Bookmark size={20} strokeWidth={1.5} />
              </button>
            </div>

            <p className="text-sm text-[#5c554b] leading-relaxed">
              A decorated Neo-Gothic-style Roman Catholic cathedral church prominently located across from Rockefeller Center.
            </p>

            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-[#7a7265] bg-[#f5f1e6] px-2.5 py-1 rounded-md font-medium">#NeoGothic</span>
              <span className="text-xs text-[#7a7265] bg-[#f5f1e6] px-2.5 py-1 rounded-md font-medium">#Architecture</span>
            </div>

            <div className="flex items-center justify-between mt-2 text-xs text-[#7a7265] font-medium border-t border-[#f5f1e6] pt-4">
              <span>850m away</span>
              <button className="text-[#92700c] flex items-center gap-1 hover:underline">
                Read full story <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Tab Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[88px] bg-[#fdfbf7] border-t border-[#f0ede4] flex items-center justify-around px-8 pb-6 pt-2 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
        <button className="flex flex-col items-center gap-1.5 text-[#92700c]">
          <Compass size={24} strokeWidth={2} />
          <span className="text-[10px] font-bold tracking-wide">Explore</span>
        </button>
        <button className="flex flex-col items-center gap-1.5 text-[#a8a296] hover:text-[#7a7265] transition-colors">
          <Bookmark size={24} strokeWidth={1.5} />
          <span className="text-[10px] font-medium tracking-wide">Saved</span>
        </button>
      </div>
    </div>
  );
}
