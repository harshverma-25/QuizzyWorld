import { siteConfig, getAbsoluteUrl, VerifiedCategoryData } from "./site-config";

/**
 * Technical SEO JSON-LD Structured Data Generators
 *
 * Implements strictly verified Schema.org objects according to Google's structured-data guidelines.
 * - No unsupported Quiz rich result hacks that trigger Google Search Console errors.
 * - No fake ratings, fake aggregate reviews, or fake FAQs.
 * - Real BreadcrumbList only on pages with actual visual breadcrumbs.
 */

export function buildWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Quizzy World",
    alternateName: ["QuizzyWorld", "Quizzy World", "QUIZZY", "Quizzy World Game", "Quizzy Arena"],
    url: siteConfig.url,
    description: siteConfig.defaultDescription,
    inLanguage: "en-US",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteConfig.url}/categories?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildGameApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": ["WebApplication", "SoftwareApplication"],
    name: "Quizzy World — Real-Time Multiplayer Quiz Game & Quiz Battles",
    alternateName: "Quizzy World",
    url: siteConfig.url,
    applicationCategory: "GameApplication",
    genre: ["Quiz Game", "Trivia Game", "Multiplayer Game", "Educational Game"],
    operatingSystem: "Web Browser (All Devices)",
    browserRequirements: "Requires JavaScript and modern HTML5 WebSockets",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      category: "FreeToPlay",
    },
    description:
      "Play Quizzy World: the premier real-time multiplayer quiz game and quiz battle arena. Enter a 6-digit room PIN, challenge friends in live trivia battles, test programming and aptitude skills, or create custom AI quizzes.",
    featureList: [
      "Real-time 1v1 and multiplayer quiz battles with instant room PIN",
      "AI Quiz Creator powered by Gemini for custom topics and auto-generated thumbnails",
      "Solo timed speed practice across programming, aptitude, science, and GK",
      "Dynamic speed scoring and live interactive leaderboard",
      "Guest mode with instant play and zero registration barrier",
    ],
    screenshot: getAbsoluteUrl("/images/quizzy-hero-logo.jpg"),
    image: getAbsoluteUrl("/images/quizzy-hero-logo.jpg"),
  };
}

export function buildHomepageFaqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is Quizzy World?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Quizzy World is a free, real-time multiplayer quiz game and quiz battle platform where players challenge friends with a 6-digit room PIN, test their knowledge across thousands of trivia questions, or build custom quizzes with AI.",
        },
      },
      {
        "@type": "Question",
        name: "How do I play a multiplayer quiz battle on Quizzy World?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "To join a quiz battle, simply enter the 6-digit room PIN provided by the host in the 'Join a Room' bar, or choose any category and subject to host your own multiplayer room and invite opponents.",
        },
      },
      {
        "@type": "Question",
        name: "Can I generate custom quiz games using AI?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes! Quizzy World includes an AI Quiz Creator that automatically drafts 20 curriculum-aligned questions on any topic in seconds, complete with customizable options, difficulty levels, and AI-generated cover art.",
        },
      },
      {
        "@type": "Question",
        name: "Is Quizzy World free to play?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes, Quizzy World is 100% free to play. You can play solo trivia games, join live multiplayer quiz battles as a guest or registered user, and access daily AI quiz generation with no upfront cost.",
        },
      },
      {
        "@type": "Question",
        name: "What subjects and quiz categories are available in Quizzy World?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Quizzy World offers extensive quiz games covering Programming (DSA, JavaScript, Python, React, DBMS), Quantitative Aptitude & Logical Reasoning, Science (Physics, Chemistry, Biology), and General Knowledge & World Trivia.",
        },
      },
    ],
  };
}

export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    url: siteConfig.url,
    logo: getAbsoluteUrl("/quizzy-wordmark.svg"),
    sameAs: [],
  };
}

export function buildBreadcrumbJsonLd(
  items: Array<{ name: string; url?: string }>
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.url ? { item: item.url } : {}),
    })),
  };
}

export function buildCategoryCollectionJsonLd(
  categories: Array<{ name: string; slug: string; description?: string }>
) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "All Quiz Categories | QUIZZY",
    description:
      "Explore comprehensive quiz categories covering programming, quantitative aptitude, general knowledge, and science.",
    url: getAbsoluteUrl("/categories"),
    inLanguage: "en-US",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: categories.map((cat, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        name: cat.name,
        url: getAbsoluteUrl(`/categories/${cat.slug}`),
        description: cat.description,
      })),
    },
  };
}

export function buildCategoryDetailJsonLd(category: VerifiedCategoryData) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemPage",
    name: category.seoTitle,
    description: category.seoDescription,
    url: getAbsoluteUrl(`/categories/${category.slug}`),
    inLanguage: "en-US",
    about: {
      "@type": "Thing",
      name: category.name,
      description: category.description,
    },
    mainEntity: {
      "@type": "ItemList",
      name: `${category.name} Curriculum Topics`,
      description: `Comprehensive practice modules available in the ${category.name} quiz track.`,
      itemListElement: category.subjects.map((sub, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        name: sub.name,
        description: sub.focus,
      })),
    },
  };
}
