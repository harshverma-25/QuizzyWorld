/**
 * QUIZZY Technical SEO & Canonical Domain Configuration
 *
 * Production domain verified from server CORS configuration and Vercel deployment:
 * https://quizzyworld.vercel.app
 */

export const PRODUCTION_DOMAIN = "https://quizzyworld.vercel.app";

function resolveSiteUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, "");
  }

  // Vercel deployment environment variable
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelUrl && vercelUrl.trim().length > 0) {
    const cleanUrl = vercelUrl.trim().replace(/\/+$/, "");
    return cleanUrl.startsWith("http") ? cleanUrl : `https://${cleanUrl}`;
  }

  return PRODUCTION_DOMAIN;
}

export const siteConfig = {
  name: "Quizzy World",
  brandName: "Quizzy World",
  url: resolveSiteUrl(),
  productionDomain: PRODUCTION_DOMAIN,
  tagline: "Real-Time Multiplayer Quiz Battles & Free Online Quiz Game Arena",
  defaultTitle: "Quizzy World — Play Live Multiplayer Quiz Game & Real-Time Quiz Battles",
  titleTemplate: "%s | Quizzy World",
  defaultDescription:
    "Play Quizzy World — the premier free online quiz game and live multiplayer quiz battle arena! Challenge friends in real-time quiz battles with room PINs, create custom AI quizzes, practice coding, aptitude, science, and GK, and rank on the global leaderboard.",
  keywords: [
    "quizzy world",
    "quizzyworld",
    "quizzy",
    "quiz game",
    "quiz battle",
    "quiz battles",
    "online quiz game",
    "multiplayer quiz battle",
    "real time quiz battle",
    "live quiz battle",
    "play quiz online",
    "free quiz game",
    "quiz battle online",
    "trivia battle",
    "trivia game",
    "multiplayer quiz game",
    "ai quiz generator",
    "quiz with room pin",
    "programming quiz",
    "coding mcqs",
    "aptitude practice",
    "science quiz",
    "general knowledge trivia",
  ],
  ogImage: "/images/quizzy-hero-logo.jpg",
  locale: "en_US",
};

export function getAbsoluteUrl(path: string = ""): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${siteConfig.url}${cleanPath}`;
}

export interface VerifiedCategoryData {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  keywords: string[];
  subjects: Array<{ name: string; slug: string; focus: string }>;
  iconName: "code" | "brain" | "globe" | "flask";
}

export const VERIFIED_CATEGORIES: Record<string, VerifiedCategoryData> = {
  programming: {
    name: "Programming",
    slug: "programming",
    tagline: "Software Engineering, Algorithms & Core Computer Science",
    description:
      "Practice programming quizzes and coding MCQs across Data Structures & Algorithms, Database Systems, Operating Systems, Web Development, and Core Languages.",
    seoTitle: "Programming Quizzes & Coding Practice",
    seoDescription:
      "Practice coding MCQs and programming quizzes. Test skills in Data Structures, Algorithms, JavaScript, Python, TypeScript, React, DBMS, and Operating Systems with instant scoring.",
    keywords: [
      "programming quiz",
      "coding mcqs",
      "data structures quiz",
      "algorithms practice",
      "javascript mcqs",
      "python quiz",
      "react quiz",
      "dbms questions",
      "operating systems mcq",
    ],
    subjects: [
      { name: "Data Structures & Algorithms", slug: "dsa", focus: "Arrays, trees, graphs, sorting, and dynamic programming" },
      { name: "Database Management Systems", slug: "dbms", focus: "Relational queries, SQL, ACID properties, and normalization" },
      { name: "Operating Systems", slug: "operating-systems", focus: "Process scheduling, virtual memory, threads, and concurrency" },
      { name: "Computer Networks", slug: "computer-networks", focus: "TCP/IP layers, routing protocols, DNS, and HTTP/HTTPS" },
      { name: "Object-Oriented Programming", slug: "oop", focus: "Encapsulation, inheritance, polymorphism, and design patterns" },
      { name: "JavaScript", slug: "javascript", focus: "ES6+, event loop, closures, promises, and async programming" },
      { name: "TypeScript", slug: "typescript", focus: "Static typing, generics, utility types, and strict checking" },
      { name: "Python", slug: "python", focus: "Data types, list comprehensions, decorators, and paradigms" },
      { name: "React", slug: "react", focus: "Hooks, reconciliation, state management, and component architecture" },
      { name: "Pseudocode", slug: "pseudocode", focus: "Algorithmic logic, dry-runs, and problem-solving evaluation" },
    ],
    iconName: "code",
  },
  aptitude: {
    name: "Aptitude",
    slug: "aptitude",
    tagline: "Quantitative Analysis, Logical Deduction & Verbal Ability",
    description:
      "Sharpen quantitative aptitude, logical reasoning puzzles, verbal skills, and data interpretation with timed speed drills and multiplayer challenges.",
    seoTitle: "Aptitude Tests & Logical Reasoning Practice",
    seoDescription:
      "Sharpen quantitative aptitude, logical reasoning, verbal ability, and data interpretation with interactive timed quizzes and dynamic speed scoring.",
    keywords: [
      "aptitude practice",
      "logical reasoning quiz",
      "quantitative aptitude mcq",
      "verbal ability test",
      "data interpretation practice",
      "competitive exam aptitude",
    ],
    subjects: [
      { name: "Logical Reasoning", slug: "logical-reasoning", focus: "Puzzles, number & letter series, syllogisms, and deduction" },
      { name: "Quantitative Aptitude", slug: "quantitative-aptitude", focus: "Percentages, ratios, arithmetic, algebra, and geometry" },
      { name: "Verbal Ability", slug: "verbal-ability", focus: "Vocabulary, grammar correction, analogies, and comprehension" },
      { name: "Data Interpretation", slug: "data-interpretation", focus: "Bar charts, pie charts, tabular analysis, and caselets" },
    ],
    iconName: "brain",
  },
  "general-knowledge": {
    name: "General Knowledge",
    slug: "general-knowledge",
    tagline: "World History, Global Geography & Trivia",
    description:
      "Explore trivia covering world civilizations, physical geography, landmark scientific discoveries, current affairs, and global culture.",
    seoTitle: "General Knowledge Quizzes & World Trivia",
    seoDescription:
      "Test your general knowledge with trivia covering world history, global geography, scientific discoveries, current affairs, and general facts.",
    keywords: [
      "general knowledge quiz",
      "world history trivia",
      "geography quiz",
      "current affairs mcq",
      "gk quiz questions",
      "trivia battles",
    ],
    subjects: [
      { name: "History", slug: "history", focus: "Ancient civilizations, modern revolutions, and major global milestones" },
      { name: "Geography", slug: "geography", focus: "Continents, capital cities, topography, climate, and cartography" },
      { name: "Science", slug: "science", focus: "Inventions, scientific discoveries, space exploration, and Nobel laureates" },
      { name: "Current Affairs", slug: "current-affairs", focus: "Contemporary international affairs, economy, and world events" },
      { name: "General Trivia", slug: "general-trivia", focus: "Art, architecture, literature, pop culture, and curious facts" },
    ],
    iconName: "globe",
  },
  science: {
    name: "Science",
    slug: "science",
    tagline: "Physics Mechanics, Chemical Reactions & Biological Systems",
    description:
      "Test your science knowledge across classical mechanics, thermodynamics, chemical bonding, organic compounds, and human biology.",
    seoTitle: "Science Quizzes — Physics, Chemistry & Biology",
    seoDescription:
      "Practice science quizzes covering fundamental physics mechanics, chemical reactions, cell biology, and natural science laws.",
    keywords: [
      "science quiz",
      "physics mcq",
      "chemistry questions",
      "biology quiz",
      "natural science test",
      "science trivia",
    ],
    subjects: [
      { name: "Physics", slug: "physics", focus: "Newtonian mechanics, electromagnetism, optics, and thermodynamics" },
      { name: "Chemistry", slug: "chemistry", focus: "Periodic trends, organic reactions, stoichiometry, and bonding" },
      { name: "Biology", slug: "biology", focus: "Cellular structures, genetics, human physiology, and ecology" },
    ],
    iconName: "flask",
  },
};
