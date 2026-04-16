import React from "react";
import { MapPin, Navigation, Activity, ChevronRight, Building2, Landmark, Church } from "lucide-react";

export function UrbanGlow() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-neutral-900 p-8">
      <div className="relative w-[390px] h-[844px] bg-slate-950 overflow-hidden rounded-[40px] shadow-2xl ring-8 ring-slate-900 font-sans">
        {/* Background Layer */}
        <div className="absolute inset-0 z-0">
          <img 
            src="/__mockup/images/curious-night-street.jpg" 
            alt="City street at night" 
            className="w-full h-full object-cover opacity-30 mix-blend-luminosity"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-900/90 to-slate-950"></div>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-teal-900/20 via-slate-950/0 to-slate-950/0"></div>
        </div>

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col">
          {/* Header */}
          <header className="px-6 pt-14 pb-4 backdrop-blur-xl bg-slate-950/50 border-b border-slate-800/50 sticky top-0 z-20">
            <div className="flex items-center gap-2 mb-4 text-teal-400">
              <MapPin className="w-4 h-4" />
              <span className="text-sm font-medium tracking-wide uppercase">Lower East Side</span>
            </div>
            <div className="flex justify-between items-end">
              <h1 className="text-3xl font-bold tracking-tight text-slate-50">Discover</h1>
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-900/50 px-2 py-1 rounded border border-slate-800">
                <Activity className="w-3 h-3 text-amber-400" />
                <span>Scanning</span>
              </div>
            </div>
          </header>

          {/* Scrollable Area */}
          <div className="flex-1 overflow-y-auto pb-24 px-4 pt-4 space-y-4">
            
            {/* Card 1 */}
            <div className="group relative bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-2xl p-5 hover:border-teal-500/50 transition-colors cursor-pointer">
              <div className="absolute -inset-px bg-gradient-to-b from-teal-500/10 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity"></div>
              
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-slate-800 rounded-md text-slate-300">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-mono uppercase tracking-wider text-teal-300">Industrial</span>
                </div>
                <div className="flex items-center gap-1 text-slate-400 font-mono text-xs">
                  <Navigation className="w-3 h-3" />
                  <span>120m</span>
                </div>
              </div>

              <h3 className="text-xl font-semibold text-slate-100 mb-2">The Forward Building</h3>
              <p className="text-sm text-slate-400 leading-relaxed mb-4">
                Originally the headquarters of the Jewish Daily Forward, a prominent Yiddish-language socialist newspaper. Its Beaux-Arts facade hides a history of radical labor organizing.
              </p>

              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <span className="px-2 py-1 rounded bg-slate-800/80 text-slate-300 text-xs font-medium border border-slate-700">Built 1912</span>
                  <span className="px-2 py-1 rounded bg-slate-800/80 text-slate-300 text-xs font-medium border border-slate-700">Beaux-Arts</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-teal-950 border border-teal-800/50 flex items-center justify-center text-teal-400 group-hover:bg-teal-900 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Card 2 */}
            <div className="group relative bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-2xl p-5 hover:border-amber-500/50 transition-colors cursor-pointer">
              <div className="absolute -inset-px bg-gradient-to-b from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity"></div>
              
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-slate-800 rounded-md text-slate-300">
                    <Landmark className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-mono uppercase tracking-wider text-amber-300">Commercial</span>
                </div>
                <div className="flex items-center gap-1 text-slate-400 font-mono text-xs">
                  <Navigation className="w-3 h-3" />
                  <span>340m</span>
                </div>
              </div>

              <h3 className="text-xl font-semibold text-slate-100 mb-2">Jarmulowsky Bank</h3>
              <p className="text-sm text-slate-400 leading-relaxed mb-4">
                Founded by Sender Jarmulowsky to serve Jewish immigrants. The 12-story Beaux-Arts tower was the tallest on the Lower East Side when completed.
              </p>

              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <span className="px-2 py-1 rounded bg-slate-800/80 text-slate-300 text-xs font-medium border border-slate-700">Built 1912</span>
                  <span className="px-2 py-1 rounded bg-slate-800/80 text-slate-300 text-xs font-medium border border-slate-700">Restored 2020</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-amber-950 border border-amber-800/50 flex items-center justify-center text-amber-400 group-hover:bg-amber-900 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Card 3 */}
            <div className="group relative bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-2xl p-5 hover:border-teal-500/50 transition-colors cursor-pointer">
              <div className="absolute -inset-px bg-gradient-to-b from-teal-500/10 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity"></div>
              
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-slate-800 rounded-md text-slate-300">
                    <Church className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-mono uppercase tracking-wider text-teal-300">Religious</span>
                </div>
                <div className="flex items-center gap-1 text-slate-400 font-mono text-xs">
                  <Navigation className="w-3 h-3" />
                  <span>450m</span>
                </div>
              </div>

              <h3 className="text-xl font-semibold text-slate-100 mb-2">Bialystoker Synagogue</h3>
              <p className="text-sm text-slate-400 leading-relaxed mb-4">
                Originally built as a Methodist Episcopal Church from fieldstone. It later became a synagogue and allegedly served as a stop on the Underground Railroad.
              </p>

              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <span className="px-2 py-1 rounded bg-slate-800/80 text-slate-300 text-xs font-medium border border-slate-700">Built 1826</span>
                  <span className="px-2 py-1 rounded bg-slate-800/80 text-slate-300 text-xs font-medium border border-slate-700">Federal Style</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-teal-950 border border-teal-800/50 flex items-center justify-center text-teal-400 group-hover:bg-teal-900 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>

          </div>

          {/* Bottom Fade */}
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none z-20"></div>
        </div>
      </div>
    </div>
  );
}
