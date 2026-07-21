import { SiteHeader } from '@/components/site-header'
import { Hero } from '@/components/hero'
import { FeaturedResources } from '@/components/featured-resources'
import { ArchitectureSection } from '@/components/architecture-section'
import { PartnersStrip } from '@/components/partners-strip'
import { DataEngine } from '@/components/data-engine'
import { PlatformSection } from '@/components/platform-section'
import { CaseStudies } from '@/components/case-studies'
import { Testimonials } from '@/components/testimonials'
import { CtaSection } from '@/components/cta-section'
import { SiteFooter } from '@/components/site-footer'

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <PartnersStrip />
        <DataEngine />
        <ArchitectureSection />
        <PlatformSection />
        <Testimonials />
        <CtaSection />
      </main>
      <SiteFooter />
    </>
  )
}
