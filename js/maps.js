<!-- VIEW: MAP -->
      <div id="view-map" class="space-y-6 hidden">
        <!-- Unboxed Faded Battleground Header (Title Top-Left, Golden Hero Portraits Bottom-Right) -->
        <div class="relative min-h-[15rem] md:min-h-[19rem] overflow-hidden">
          <img
            id="map-portrait"
            src=""
            alt="Battleground backdrop"
            class="w-full h-64 md:h-80 object-cover object-center opacity-55 select-none pointer-events-none"
          />
          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#070412]/35 via-[#070412]/55 to-[#070412]"
          ></div>
          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#070412]/80 via-[#070412]/30 to-transparent"
          ></div>

          <!-- Top-Left: Map Title & Theme -->
          <div class="absolute inset-x-0 top-0 p-5 md:p-6 flex flex-col items-start justify-start z-10 pointer-events-none">
            <span class="hots-label text-[#f5d89a]">Battleground</span>
            <h2 id="map-name" class="hots-display text-3xl md:text-4xl font-bold uppercase tracking-wide mt-1"></h2>
            <p id="map-theme" class="text-xs sm:text-sm text-[#9cb6ff]/90 mt-1 max-w-xl"></p>
          </div>

          <!-- Bottom-Right: Compact Single-Row Golden Hero Portraits -->
          <div
            aria-label="Top 5 Golden Heroes"
            class="absolute bottom-4 right-5 md:bottom-5 md:right-6 z-10 flex flex-col items-end gap-1.5"
          >
            <span class="hots-label text-[10px] text-[#f5d89a]/90">Golden Heroes</span>
            <div id="map-heroes-list" class="flex items-center justify-end gap-2 flex-nowrap"></div>
          </div>
        </div>

        <!-- Battleground Data-Sheet: Left Spec Table | Narrower Narrative Column | Mercenary Camps Rail -->
        <div class="grid grid-cols-1 lg:grid-cols-[17.5rem_minmax(0,1fr)_18.5rem] gap-7 items-start px-1 md:px-2">
          <!-- Left Data-Table (First Objective, Objective Locations / Pattern, Lanes, Bosses, etc.) -->
          <aside aria-label="Battleground specifications" class="w-full min-w-0">
            <div class="hots-label text-[#58baff] pb-2 border-b border-[#38247a]/80">Map Data</div>
            <table class="w-full border-collapse text-left">
              <tbody id="map-spec-table" class="divide-y divide-[#2b1a61]/80 text-xs"></tbody>
            </table>
          </aside>

          <!-- Center Narrative Column: Narrowed (~1/3+ slimmer) & Taller -->
          <div class="min-w-0 max-w-xl w-full divide-y divide-[#38247a]/70 border-t border-b border-[#38247a]/70">
            <section class="py-4 space-y-1.5">
              <h3 class="hots-label text-[#58baff]">Map Objective</h3>
              <div id="map-mechanic" class="text-sm text-[#e6ecff]/90 leading-relaxed"></div>
            </section>

            <section class="py-4 space-y-1.5">
              <h3 class="hots-label text-[#f5d89a]">Strategic Overview</h3>
              <div id="map-strategy" class="text-sm text-[#e6ecff]/90 leading-relaxed"></div>
            </section>

            <section class="py-4 space-y-1.5">
              <h3 class="hots-label text-[#58baff]">Good to Know &amp; Tips</h3>
              <div id="map-notes" class="text-sm text-[#e6ecff]/90 leading-relaxed"></div>
            </section>
          </div>

          <!-- Right Rail (Moved Up): Mercenary Camps -->
          <aside aria-label="Mercenary camps" class="w-full min-w-0 border-t border-b border-[#38247a]/70 py-4 space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <h3 class="hots-label text-[#f5d89a]">Mercenary Camps</h3>
              <span class="text-[10px] font-mono uppercase tracking-wider text-[#8c83a2]">Timings</span>
            </div>
            <div id="map-camps-stack" class="divide-y divide-[#2b1a61]/80"></div>
          </aside>
        </div>
      </div>
