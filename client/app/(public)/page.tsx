import type { Metadata } from "next";
import HomeClientView, { HomeSummaryData } from "./HomeClientView";
import { clientConfig } from "@/lib/config";
import { siteConfig } from "@/lib/site-config";
import {
  buildWebSiteJsonLd,
  buildGameApplicationJsonLd,
  buildOrganizationJsonLd,
  buildHomepageFaqJsonLd,
} from "@/lib/json-ld";

export const revalidate = 180; // ISR: Pre-render and revalidate catalog every 3 minutes

export const metadata: Metadata = {
  title: "Quizzy World — Play Live Multiplayer Quiz Game & Real-Time Quiz Battles",
  description:
    "Play Quizzy World — the premier free online quiz game and live multiplayer quiz battle arena! Challenge friends in real-time quiz battles with room PINs, create custom AI quizzes, practice coding, aptitude, science, and GK, and rank on the global leaderboard.",
  alternates: {
    canonical: siteConfig.url,
  },
};

async function getHomeCatalogData(): Promise<HomeSummaryData> {
  try {
    const baseUrl = clientConfig.apiUrl.replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/categories/summary`, {
      next: { revalidate: 180 },
    });

    if (!res.ok) {
      return { categories: [], subjects: [], popularQuizzes: [] };
    }

    const json = await res.json();
    return json.data || { categories: [], subjects: [], popularQuizzes: [] };
  } catch {
    return { categories: [], subjects: [], popularQuizzes: [] };
  }
}

export default async function HomePage() {
  const initialData = await getHomeCatalogData();

  const websiteJsonLd = buildWebSiteJsonLd();
  const gameJsonLd = buildGameApplicationJsonLd();
  const organizationJsonLd = buildOrganizationJsonLd();
  const faqJsonLd = buildHomepageFaqJsonLd();

  return (
    <>
      {/* Schema.org JSON-LD Structured Data for Google Rich Results & Search Ranking */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(gameJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <HomeClientView initialData={initialData} />
    </>
  );
}
