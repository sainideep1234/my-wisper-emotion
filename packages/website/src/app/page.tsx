import { Navbar } from "@/components/sections/Navbar";
import { Hero } from "@/components/sections/Hero";
import { Steps } from "@/components/sections/Steps";
import { Models } from "@/components/sections/Models";
import { GatekeeperCard } from "@/components/sections/GatekeeperCard";
import { CapabilitiesMockup } from "@/components/sections/CapabilitiesMockup";
import { Faq } from "@/components/sections/Faq";
import { Footer } from "@/components/sections/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="flex-1 bg-black">
        <Hero />
        <Steps />
        <Models />
        <GatekeeperCard />
        <CapabilitiesMockup />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
