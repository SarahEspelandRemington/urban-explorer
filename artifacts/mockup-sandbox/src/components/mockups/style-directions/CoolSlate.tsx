import React from "react";
import { MapPin, Building, Landmark, Bookmark, Search, BookmarkCheck, ChevronRight, Info } from "lucide-react";

export function CoolSlate() {
  return (
    <div className="w-[390px] h-[844px] mx-auto overflow-hidden bg-[#f8f9fa] text-[#1e293b] font-sans flex flex-col relative shadow-xl border border-slate-200 sm:rounded-[40px]">
      {/* Header */}
      <header className="px-6 pt-14 pb-4 bg-white/80 backdrop-blur-md sticky top-0 z-10 border-b border-slate-100 flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-[#0f172a]">Urban Explorer</h1>
        <div className="flex items-center gap-1.5 text-[#4a6fa5] text-sm font-medium">
          <MapPin className="w-4 h-4" />
          <span>Near Times Square, NYC</span>
        </div>
      </header>

      {/* Feed */}
      <main className="flex-1 overflow-y-auto pb-24 px-4 pt-4 flex flex-col gap-4">
        {/* Card 1 */}
        <div className="bg-white rounded-lg p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] flex flex-col gap-4 relative">
          <div className="flex justify-between items-start gap-4">
            <div className="flex gap-3 items-start">
              <div className="w-10 h-10 rounded-lg bg-[#f1f5f9] flex items-center justify-center text-[#4a6fa5] shrink-0">
                <Building className="w-5 h-5" />
              </div>
              <div className="flex flex-col gap-0.5">
                <h2 className="text-lg font-semibold text-[#0f172a] leading-tight">Empire State Building</h2>
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <span>Building</span>
                  <span>·</span>
                  <span>1931</span>
                </div>
              </div>
            </div>
            <button className="text-slate-400 hover:text-[#4a6fa5] transition-colors mt-1 shrink-0">
              <Bookmark className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            The defining Art Deco skyscraper of New York City, standing as the world's tallest building for nearly 40 years.
          </p>

          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-md">#ArtDeco</span>
            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-md">#Landmark</span>
            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-md">#Skyscraper</span>
          </div>

          <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-3 flex gap-3">
            <Info className="w-4 h-4 text-[#4a6fa5] shrink-0 mt-0.5" />
            <p className="text-sm text-[#334155] leading-snug">
              It was built in just 1 year and 45 days, rising at an astonishing rate of 4.5 floors per week.
            </p>
          </div>

          <div className="flex justify-between items-center mt-1">
            <span className="text-xs font-medium text-slate-500">320m away</span>
            <button className="text-[#4a6fa5] text-sm font-medium flex items-center gap-1 hover:underline">
              View details <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-white rounded-lg p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] flex flex-col gap-4 relative">
          <div className="flex justify-between items-start gap-4">
            <div className="flex gap-3 items-start">
              <div className="w-10 h-10 rounded-lg bg-[#f1f5f9] flex items-center justify-center text-[#4a6fa5] shrink-0">
                <Landmark className="w-5 h-5" />
              </div>
              <div className="flex flex-col gap-0.5">
                <h2 className="text-lg font-semibold text-[#0f172a] leading-tight">New York Public Library</h2>
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <span>Library</span>
                  <span>·</span>
                  <span>1911</span>
                </div>
              </div>
            </div>
            <button className="text-slate-400 hover:text-[#4a6fa5] transition-colors mt-1 shrink-0">
              <Bookmark className="w-5 h-5" />
            </button>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            A Beaux-Arts masterpiece and the second largest public library in the United States, guarded by the famous marble lions.
          </p>

          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-md">#BeauxArts</span>
            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-md">#Architecture</span>
            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-md">#Historic</span>
          </div>

          <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-3 flex gap-3">
            <Info className="w-4 h-4 text-[#4a6fa5] shrink-0 mt-0.5" />
            <p className="text-sm text-[#334155] leading-snug">
              The iconic lions out front, originally named Leo Astor and Leo Lenox, were renamed Patience and Fortitude during the Great Depression.
            </p>
          </div>

          <div className="flex justify-between items-center mt-1">
            <span className="text-xs font-medium text-slate-500">650m away</span>
            <button className="text-[#4a6fa5] text-sm font-medium flex items-center gap-1 hover:underline">
              View details <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Space for bottom padding */}
        <div className="h-6"></div>
      </main>

      {/* Bottom Tab Bar */}
      <nav className="absolute bottom-0 w-full bg-white border-t border-slate-200 px-6 py-3 pb-8 flex justify-around items-center">
        <button className="flex flex-col items-center gap-1.5 text-[#4a6fa5]">
          <Search className="w-6 h-6" />
          <span className="text-[10px] font-semibold tracking-wide uppercase">Explore</span>
        </button>
        <button className="flex flex-col items-center gap-1.5 text-slate-400 hover:text-slate-600 transition-colors">
          <BookmarkCheck className="w-6 h-6" />
          <span className="text-[10px] font-semibold tracking-wide uppercase">Saved</span>
        </button>
      </nav>
    </div>
  );
}
