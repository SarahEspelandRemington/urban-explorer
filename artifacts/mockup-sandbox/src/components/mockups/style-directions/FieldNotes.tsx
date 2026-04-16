import React from 'react';
import { MapPin, ArrowUpRight, Clock, BookOpen, Compass } from 'lucide-react';

export function FieldNotes() {
  const places = [
    {
      id: 1,
      name: "The Jefferson Market Library",
      category: "Architecture",
      summary: "Originally built as a courthouse in 1877, this High Victorian Gothic structure was saved from demolition by community activists in the 1960s. Its clock tower once served as a fire watcher's lookout.",
      distance: "0.1 mi",
      date: "1877",
      image: "/__mockup/images/curious-night-building.jpg",
      tags: ["Gothic Revival", "Adaptive Reuse"]
    },
    {
      id: 2,
      name: "St. Luke in the Fields",
      category: "Sanctuary",
      summary: "One of the oldest active churches in Manhattan, standing since 1821. Beyond the brick facade lies a hidden garden that serves as a quiet sanctuary from the unrelenting city noise.",
      distance: "0.3 mi",
      date: "1821",
      image: "/__mockup/images/curious-night-church.jpg",
      tags: ["Federal Style", "Secret Garden"]
    },
    {
      id: 3,
      name: "Minetta Tavern",
      category: "Historic Venue",
      summary: "A Parisian-style steakhouse where Hemingway, Pound, and Cummings once drank. The original wooden bar, tin ceiling, and checkered tiled floor remain impeccably intact.",
      distance: "0.4 mi",
      date: "1937",
      image: "/__mockup/images/curious-night-alley.jpg",
      tags: ["Literary History", "Preserved Interior"]
    }
  ];

  return (
    <div className="w-[390px] h-[844px] bg-[#F4F3ED] text-[#111111] overflow-y-auto flex flex-col relative font-sans mx-auto overflow-x-hidden selection:bg-[#E83A14] selection:text-white">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');
        .font-editorial { font-family: 'Fraunces', serif; }
        .font-meta { font-family: 'Space Mono', monospace; }
        .text-accent { color: #E83A14; }
        .bg-accent { background-color: #E83A14; }
        .border-ink { border-color: #111111; }
      `}} />

      {/* Header */}
      <header className="px-6 pt-14 pb-8 border-b-[1.5px] border-ink bg-[#F4F3ED] sticky top-0 z-20">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2 text-xs font-meta uppercase tracking-widest text-black/60">
            <Compass className="w-4 h-4 text-accent" strokeWidth={2} />
            <span>Vol. 04</span>
          </div>
          <div className="text-xs font-meta uppercase tracking-widest bg-ink text-[#F4F3ED] px-3 py-1 rounded-full">
            Live
          </div>
        </div>
        
        <h1 className="font-editorial text-[3.5rem] leading-[0.9] tracking-tight mb-4">
          Discover
        </h1>
        
        <div className="flex items-center justify-between items-end border-t border-ink/20 pt-4 mt-6">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-accent" />
            <span className="font-editorial text-xl italic text-black/80">West Village</span>
          </div>
          <span className="font-meta text-xs uppercase tracking-wider text-black/50">
            3 Places Nearby
          </span>
        </div>
      </header>

      {/* Content Feed */}
      <main className="flex-1 pb-12">
        {places.map((place, index) => (
          <article 
            key={place.id} 
            className="border-b-[1.5px] border-ink group cursor-pointer hover:bg-black/[0.02] transition-colors"
          >
            <div className="px-6 py-8">
              {/* Meta Row */}
              <div className="flex items-center justify-between mb-4">
                <span className="font-meta text-[10px] uppercase tracking-[0.2em] text-accent font-bold">
                  {place.category}
                </span>
                <div className="flex items-center gap-3 font-meta text-[10px] uppercase tracking-wider text-black/50">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {place.date}
                  </span>
                  <span>•</span>
                  <span>{place.distance}</span>
                </div>
              </div>

              {/* Title */}
              <h2 className="font-editorial text-3xl leading-tight mb-4 group-hover:text-accent transition-colors pr-8">
                {place.name}
              </h2>

              {/* Image */}
              <div className="relative w-full aspect-[4/3] mb-5 overflow-hidden border border-ink/10 bg-black/5">
                <img 
                  src={place.image} 
                  alt={place.name}
                  className="w-full h-full object-cover filter contrast-[1.1] sepia-[0.1] saturate-[0.8]"
                />
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-t from-black/20 to-transparent mix-blend-multiply" />
              </div>

              {/* Summary */}
              <p className="text-[15px] leading-relaxed text-black/80 font-medium mb-6">
                {place.summary}
              </p>

              {/* Footer Row */}
              <div className="flex items-center justify-between mt-auto">
                <div className="flex flex-wrap gap-2">
                  {place.tags.map(tag => (
                    <span 
                      key={tag}
                      className="font-meta text-[9px] uppercase tracking-widest border border-ink/20 px-2 py-1 text-black/60"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <button className="w-10 h-10 rounded-full border border-ink flex items-center justify-center group-hover:bg-accent group-hover:border-accent group-hover:text-white transition-all">
                  <ArrowUpRight className="w-4 h-4" strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </main>

      {/* Floating Action Button */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <button className="bg-ink text-[#F4F3ED] font-meta text-xs uppercase tracking-widest px-6 py-4 rounded-full flex items-center gap-3 shadow-2xl hover:scale-105 active:scale-95 transition-transform">
          <BookOpen className="w-4 h-4" />
          <span>View Journal</span>
        </button>
      </div>
    </div>
  );
}
