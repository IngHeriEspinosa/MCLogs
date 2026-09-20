import type { Metadata } from "next";
import { Audience } from "@/components/landing/Audience";
import { Benefits } from "@/components/landing/Benefits";
import { Examples } from "@/components/landing/Examples";
import { Features } from "@/components/landing/Features";
import { Hero } from "@/components/landing/Hero";
import { Install } from "@/components/landing/Install";
import { Privacy } from "@/components/landing/Privacy";
import { GITHUB_REPO, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** Datos estructurados: ayudan a que Google entienda que esto es software libre. */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "MCLog",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Linux, macOS, Windows (Docker)",
  description:
    "Servicio de logs centralizados, open source y autoalojado, para aplicaciones Node.js, Python, NetSuite y cualquier sistema capaz de hacer una peticion HTTP.",
  url: SITE_URL,
  codeRepository: GITHUB_REPO,
  license: "https://opensource.org/licenses/MIT",
  author: { "@type": "Person", name: "Heri Espinosa" },
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Hero />
      <Benefits />
      <Audience />
      <Examples />
      <Features />
      <Install />
      <Privacy />
    </>
  );
}
