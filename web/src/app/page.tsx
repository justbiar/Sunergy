"use client";

import { Nav, Footer } from "@/components/SharedUI";
import { HeroOrb, TickerStrip, StatsSection, HowSection, ArchSection, CtaSection } from "@/components/LandingUI";

export default function Home() {
  return (
    <div className="page">
      {/* Banner can go here if needed, but it's optional */}
      <Nav view="landing" />
      <main style={{ flex: 1 }}>
        <HeroOrb />
        <TickerStrip />
        <StatsSection />
        <HowSection />
        <ArchSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
