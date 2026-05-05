import React from "react";
import {
  MapPin,
  Clock,
  ArrowRight,
  Building2,
  Coffee,
  Landmark,
} from "lucide-react";

export function SoftDepth() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-neutral-950 p-4 font-sans selection:bg-[#8A9A86]/30">
      {/* Mobile Device Container */}
      <div className="w-[390px] h-[844px] bg-[#242220] rounded-[40px] shadow-2xl overflow-hidden relative border-[8px] border-[#181716] flex flex-col">
        {/* Status Bar Area */}
        <div className="h-12 w-full flex items-center justify-between px-6 pt-2 text-[#E2DFD8] text-xs font-medium z-10">
          <span>9:41</span>
          <div className="flex gap-1.5 items-center">
            <div className="w-4 h-3 rounded-sm border border-[#E2DFD8]/50" />
            <div className="w-3 h-3 rounded-full border border-[#E2DFD8]/50" />
            <div className="w-5 h-2.5 rounded-sm bg-[#E2DFD8]" />
          </div>
        </div>

        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-2 text-[#9A968C] text-[10px] font-bold tracking-[0.2em] uppercase mb-2">
            <MapPin className="w-3.5 h-3.5" />
            <span>Lower East Side</span>
          </div>
          <h1 className="text-3xl font-normal tracking-tight text-[#E2DFD8]">
            Discover
          </h1>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-8 flex flex-col gap-6 hide-scrollbar">
          {/* Card 1 */}
          <div className="group relative bg-[#2C2A28] rounded-3xl p-7 border-2 border-white/[0.02] hover:border-white/[0.06] transition-all duration-500 cursor-pointer shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#8A9A86]/15 text-[#8A9A86]">
                  <Landmark className="w-4 h-4 stroke-[1.5]" />
                </div>
                <span className="text-[10px] font-semibold tracking-[0.15em] uppercase text-[#8A9A86]">
                  Historical
                </span>
              </div>
              <span className="text-[11px] font-mono tracking-wider text-[#858178]">
                120ft
              </span>
            </div>

            <h2 className="text-2xl font-normal text-[#E2DFD8] mb-3 leading-tight tracking-tight">
              Forward Building
            </h2>
            <p className="text-[14px] text-[#A6A298] leading-relaxed mb-8 font-light">
              Once the headquarters of the Jewish Daily Forward, this Beaux-Arts
              tower was a beacon for immigrants.
            </p>

            <div className="flex items-center justify-between mt-auto">
              <div className="flex gap-2.5">
                <span className="px-3.5 py-1.5 rounded-lg bg-[#242220] text-[#9A968C] text-[11px] font-medium tracking-wide">
                  1912
                </span>
                <span className="px-3.5 py-1.5 rounded-lg bg-[#242220] text-[#9A968C] text-[11px] font-medium tracking-wide">
                  Beaux-Arts
                </span>
              </div>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-[#E2DFD8]/40 group-hover:text-[#E2DFD8] transition-all duration-500 group-hover:translate-x-1">
                <ArrowRight className="w-4 h-4 stroke-[1.5]" />
              </div>
            </div>
          </div>

          {/* Card 2 */}
          <div className="group relative bg-[#2C2A28] rounded-3xl p-7 border-2 border-white/[0.02] hover:border-white/[0.06] transition-all duration-500 cursor-pointer shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#B4846C]/15 text-[#B4846C]">
                  <Building2 className="w-4 h-4 stroke-[1.5]" />
                </div>
                <span className="text-[10px] font-semibold tracking-[0.15em] uppercase text-[#B4846C]">
                  Tenement
                </span>
              </div>
              <span className="text-[11px] font-mono tracking-wider text-[#858178]">
                350ft
              </span>
            </div>

            <h2 className="text-2xl font-normal text-[#E2DFD8] mb-3 leading-tight tracking-tight">
              97 Orchard Street
            </h2>
            <p className="text-[14px] text-[#A6A298] leading-relaxed mb-8 font-light">
              A preserved 19th-century tenement building that housed
              working-class immigrants from over 20 nations.
            </p>

            <div className="flex items-center justify-between mt-auto">
              <div className="flex gap-2.5">
                <span className="px-3.5 py-1.5 rounded-lg bg-[#242220] text-[#9A968C] text-[11px] font-medium tracking-wide">
                  1863
                </span>
                <span className="px-3.5 py-1.5 rounded-lg bg-[#242220] text-[#9A968C] text-[11px] font-medium tracking-wide">
                  Vernacular
                </span>
              </div>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-[#E2DFD8]/40 group-hover:text-[#E2DFD8] transition-all duration-500 group-hover:translate-x-1">
                <ArrowRight className="w-4 h-4 stroke-[1.5]" />
              </div>
            </div>
          </div>

          {/* Card 3 */}
          <div className="group relative bg-[#2C2A28] rounded-3xl p-7 border-2 border-white/[0.02] hover:border-white/[0.06] transition-all duration-500 cursor-pointer shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#988496]/15 text-[#988496]">
                  <Coffee className="w-4 h-4 stroke-[1.5]" />
                </div>
                <span className="text-[10px] font-semibold tracking-[0.15em] uppercase text-[#988496]">
                  Culture
                </span>
              </div>
              <span className="text-[11px] font-mono tracking-wider text-[#858178]">
                0.2mi
              </span>
            </div>

            <h2 className="text-2xl font-normal text-[#E2DFD8] mb-3 leading-tight tracking-tight">
              Katz's Delicatessen
            </h2>
            <p className="text-[14px] text-[#A6A298] leading-relaxed mb-8 font-light">
              An institution of Jewish immigrant culture, surviving a century of
              neighborhood transformation.
            </p>

            <div className="flex items-center justify-between mt-auto">
              <div className="flex gap-2.5">
                <span className="px-3.5 py-1.5 rounded-lg bg-[#242220] text-[#9A968C] text-[11px] font-medium tracking-wide">
                  1888
                </span>
                <span className="px-3.5 py-1.5 rounded-lg bg-[#242220] text-[#9A968C] text-[11px] font-medium tracking-wide">
                  Commercial
                </span>
              </div>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-[#E2DFD8]/40 group-hover:text-[#E2DFD8] transition-all duration-500 group-hover:translate-x-1">
                <ArrowRight className="w-4 h-4 stroke-[1.5]" />
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Bar */}
        <div className="h-24 bg-gradient-to-t from-[#242220] via-[#242220] to-transparent absolute bottom-0 left-0 right-0 pointer-events-none" />
        <div className="h-20 bg-[#242220]/90 backdrop-blur-xl flex items-center justify-around px-6 pb-2 border-t border-white/[0.02] relative z-10">
          <div className="flex flex-col items-center gap-1.5 text-[#E2DFD8]">
            <MapPin className="w-5 h-5 stroke-[1.5]" />
            <span className="text-[10px] font-medium tracking-wide">
              Explore
            </span>
          </div>
          <div className="flex flex-col items-center gap-1.5 text-[#736E66] hover:text-[#E2DFD8] transition-colors">
            <Clock className="w-5 h-5 stroke-[1.5]" />
            <span className="text-[10px] font-medium tracking-wide">
              Timeline
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
