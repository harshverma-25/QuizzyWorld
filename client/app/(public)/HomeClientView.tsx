"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Play,
  Users,
  Flame,
  X,
  SlidersHorizontal,
  ChevronRight,
  ChevronLeft,
  Gamepad2,
  Film,
  Trophy,
  LayoutGrid,
  Sparkles,
  Crown,
  Layers,
  Edit3,
  Image as ImageIcon,
  CheckCircle2,
} from "lucide-react";

import {
  ArcadeBrainIcon,
  ArcadeLightbulbIcon,
  ArcadeCodeIcon,
  ArcadeFlaskIcon,
  ArcadeGlobeIcon,
  ArcadeCrownIcon,
  ArcadeLightningIcon,
  ArcadeFlameIcon,
  ArcadeStarIcon,
} from "@/components/ui/ArcadeIcons";

import { CompactQuizCard } from "@/components/shared/CompactQuizCard";
import { isGuestSessionActive, PlayAsGuestModal, useCurrentUser } from "@/features/auth";
import { useApiClient } from "@/hooks/useApiClient";
import { Category, PopularQuiz, Subject } from "@/types";
import { cn } from "@/lib/utils";

// Dynamic pastel palette for subject cards
const CARD_THEMES = [
  {
    bgColor: "bg-[#DCFCE7]", // Pastel mint green
    hoverBg: "hover:bg-[#BBF7D0]",
    buttonColor: "bg-[#0D9488]",
    buttonHover: "hover:bg-[#0F766E]",
  },
  {
    bgColor: "bg-[#FEF9C3]", // Pastel yellow
    hoverBg: "hover:bg-[#FEF08A]",
    buttonColor: "bg-[#F59E0B]",
    buttonHover: "hover:bg-[#D97706]",
  },
  {
    bgColor: "bg-[#EDE9FE]", // Pastel lavender
    hoverBg: "hover:bg-[#DDD6FE]",
    buttonColor: "bg-[#7C3AED]",
    buttonHover: "hover:bg-[#6D28D9]",
  },
  {
    bgColor: "bg-[#FFE4E6]", // Pastel pink
    hoverBg: "hover:bg-[#FECDD3]",
    buttonColor: "bg-[#EC4899]",
    buttonHover: "hover:bg-[#DB2777]",
  },
  {
    bgColor: "bg-[#CFFAFE]", // Pastel sky blue
    hoverBg: "hover:bg-[#BAE6FD]",
    buttonColor: "bg-[#0284C7]",
    buttonHover: "hover:bg-[#0369A1]",
  },
  {
    bgColor: "bg-[#FFEDD5]", // Pastel peach orange
    hoverBg: "hover:bg-[#FED7AA]",
    buttonColor: "bg-[#EA580C]",
    buttonHover: "hover:bg-[#C2410C]",
  },
];

const RANK_BADGE_COLORS = [
  "bg-[#FFE600] text-black", // Rank 1: Yellow
  "bg-[#2DD4BF] text-black", // Rank 2: Teal
  "bg-[#FB923C] text-black", // Rank 3: Orange
  "bg-[#F472B6] text-black", // Rank 4: Pink
  "bg-[#38BDF8] text-black", // Rank 5: Sky blue
];

export interface DynamicSubject extends Subject {
  categorySlug: string;
  categoryName: string;
  playedCount?: number;
}

export interface HomeSummaryData {
  categories: Category[];
  subjects: DynamicSubject[];
  popularQuizzes: PopularQuiz[];
}

function getCategoryIcon(slug: string, className = "w-4 h-4 shrink-0") {
  const s = (slug || "").toLowerCase();
  if (s === "all") return <LayoutGrid className={className} />;
  if (s.includes("code") || s.includes("program") || s.includes("computer")) return <ArcadeCodeIcon className={className} />;
  if (s.includes("brain") || s.includes("aptitude")) return <ArcadeBrainIcon className={className} />;
  if (s.includes("flask") || s.includes("science") || s.includes("space")) return <ArcadeFlaskIcon className={className} />;
  if (s.includes("globe") || s.includes("general") || s.includes("gk") || s.includes("india")) return <ArcadeGlobeIcon className={className} />;
  if (s.includes("anime") || s.includes("manga")) {
    return <Gamepad2 className={`${className} text-rose-500`} />;
  }
  if (s.includes("entertainment") || s.includes("movie") || s.includes("film") || s.includes("marvel") || s.includes("series")) {
    return <Film className={`${className} text-purple-600`} />;
  }
  if (s.includes("sport") || s.includes("cricket") || s.includes("football")) {
    return <Trophy className={`${className} text-emerald-600`} />;
  }
  return <ArcadeLightbulbIcon className={className} />;
}

function getSubjectIcon(slug: string, categorySlug: string, className = "w-8 h-8") {
  const s = (slug || "").toLowerCase();
  const c = (categorySlug || "").toLowerCase();

  if (
    s.includes("code") ||
    s.includes("program") ||
    s.includes("dsa") ||
    s.includes("dbms") ||
    s.includes("os") ||
    s.includes("oop") ||
    s.includes("network") ||
    c === "programming"
  ) {
    return <ArcadeCodeIcon className={className} />;
  }
  if (
    s.includes("flask") ||
    s.includes("science") ||
    s.includes("physics") ||
    s.includes("chemistry") ||
    s.includes("biology") ||
    c === "science"
  ) {
    return <ArcadeFlaskIcon className={className} />;
  }
  if (
    s.includes("globe") ||
    s.includes("general") ||
    s.includes("history") ||
    s.includes("geography") ||
    s.includes("polity") ||
    s.includes("current") ||
    c === "general-knowledge"
  ) {
    return <ArcadeGlobeIcon className={className} />;
  }
  if (
    s.includes("brain") ||
    s.includes("aptitude") ||
    s.includes("reasoning") ||
    s.includes("quant") ||
    c === "aptitude"
  ) {
    return <ArcadeBrainIcon className={className} />;
  }
  if (
    s.includes("anime") ||
    s.includes("bollywood") ||
    s.includes("marvel") ||
    s.includes("dc") ||
    s.includes("movie") ||
    c === "entertainment"
  ) {
    return <Film className={`${className} text-purple-600`} />;
  }
  if (
    s.includes("cricket") ||
    s.includes("football") ||
    s.includes("sport") ||
    c === "sports"
  ) {
    return <Trophy className={`${className} text-emerald-600`} />;
  }
  return <ArcadeLightbulbIcon className={className} />;
}

function renderQuizIcon(icon?: string, categorySlug?: string) {
  const target = (icon || categorySlug || "").toLowerCase();
  if (target.includes("brain") || target.includes("aptitude")) {
    return <ArcadeBrainIcon className="w-5 h-5" />;
  }
  if (
    target.includes("code") ||
    target.includes("program") ||
    target.includes("dsa") ||
    target.includes("javascript") ||
    target.includes("python")
  ) {
    return <ArcadeCodeIcon className="w-5 h-5" />;
  }
  if (target.includes("flask") || target.includes("science") || target.includes("physics")) {
    return <ArcadeFlaskIcon className="w-5 h-5" />;
  }
  if (target.includes("globe") || target.includes("gk") || target.includes("general")) {
    return <ArcadeGlobeIcon className="w-5 h-5" />;
  }
  if (target.includes("movie") || target.includes("film") || target.includes("entertainment") || target.includes("anime")) {
    return <Film className="w-5 h-5 text-purple-600" />;
  }
  if (target.includes("trophy") || target.includes("sport") || target.includes("cricket") || target.includes("football")) {
    return <Trophy className="w-5 h-5 text-emerald-600" />;
  }
  return <ArcadeLightbulbIcon className="w-5 h-5" />;
}

interface CategoryScrollRowProps {
  category: Category;
  subjects: DynamicSubject[];
  onPlay: (quiz: {
    title: string;
    categorySlug: string;
    subjectSlug?: string | null;
    isMixedCategory?: boolean;
    description?: string;
    questionCount?: number;
  }) => void;
}

function CategoryScrollRow({ category, subjects, onPlay }: CategoryScrollRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 8);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 8);
    }
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll, { passive: true });
      window.addEventListener("resize", checkScroll);
      return () => {
        el.removeEventListener("scroll", checkScroll);
        window.removeEventListener("resize", checkScroll);
      };
    }
  }, [subjects]);

  const handleScroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 380;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <section className="w-full space-y-3 pt-1">
      {/* Category Row Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="shrink-0">{getCategoryIcon(category.slug, "w-5 h-5")}</span>
          <h2 className="font-black text-lg sm:text-xl text-black uppercase tracking-tight">
            {category.name}
          </h2>
          <span className="text-xs font-bold text-stone-500">
            ({subjects.length})
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Desktop Left/Right Scroll Arrows */}
          <div className="hidden sm:flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleScroll("left")}
              disabled={!canScrollLeft}
              aria-label={`Scroll ${category.name} left`}
              className={cn(
                "w-7 h-7 rounded-full bg-white border-2 border-black flex items-center justify-center transition-all shadow-[1.5px_1.5px_0px_#000] active:translate-x-[1px] active:translate-y-[1px]",
                canScrollLeft
                  ? "hover:bg-[#FFE600] cursor-pointer"
                  : "opacity-30 cursor-not-allowed"
              )}
            >
              <ChevronLeft className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
            <button
              type="button"
              onClick={() => handleScroll("right")}
              disabled={!canScrollRight}
              aria-label={`Scroll ${category.name} right`}
              className={cn(
                "w-7 h-7 rounded-full bg-white border-2 border-black flex items-center justify-center transition-all shadow-[1.5px_1.5px_0px_#000] active:translate-x-[1px] active:translate-y-[1px]",
                canScrollRight
                  ? "hover:bg-[#FFE600] cursor-pointer"
                  : "opacity-30 cursor-not-allowed"
              )}
            >
              <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>

          <Link
            href={`/categories/${category.slug}`}
            className="inline-flex items-center gap-1 text-xs font-black text-stone-800 hover:text-black hover:underline"
          >
            <span>View All</span>
            <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
          </Link>
        </div>
      </div>

      {/* Horizontal Sideways Scrolling Strip */}
      <div
        ref={scrollRef}
        className="w-full overflow-x-auto pb-3 pt-1 scrollbar-none flex gap-2.5 sm:gap-3 snap-x scroll-smooth"
      >
        {subjects.map((sub) => (
          <div
            key={sub.id || sub.slug}
            className="w-[145px] sm:w-[170px] md:w-[190px] shrink-0 snap-start"
          >
            <CompactQuizCard
              id={sub.id || sub.slug}
              title={sub.name}
              categorySlug={sub.categorySlug}
              subjectSlug={sub.slug}
              isMixedCategory={false}
              thumbnailUrl={sub.thumbnailUrl}
              questionCount={sub.questionCount}
              playedCount={sub.playedCount}
              onPlay={() =>
                onPlay({
                  title: sub.name,
                  categorySlug: sub.categorySlug,
                  subjectSlug: sub.slug,
                  isMixedCategory: false,
                  description: sub.description || `Play live matches in ${sub.name}.`,
                  questionCount: sub.questionCount,
                })
              }
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function HomeClientView({
  initialData,
}: {
  initialData?: HomeSummaryData;
}) {
  const router = useRouter();
  const api = useApiClient();
  const { data: currentUser } = useCurrentUser();
  const isUserAuthenticated = Boolean(currentUser);

  // Active Category State
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>("all");

  // Hero PIN join input state
  const [heroPinValue, setHeroPinValue] = useState<string>("");
  const [heroPinError, setHeroPinError] = useState<string | null>(null);

  // Dynamic Backend Data States (Hydrated from Server Component ISR with client fallback)
  const [categories, setCategories] = useState<Category[]>(initialData?.categories || []);
  const [subjects, setSubjects] = useState<DynamicSubject[]>(initialData?.subjects || []);
  const [loadingCategories, setLoadingCategories] = useState<boolean>(!initialData?.categories?.length);
  const [loadingSubjects, setLoadingSubjects] = useState<boolean>(!initialData?.subjects?.length);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const [popularQuizzes, setPopularQuizzes] = useState<PopularQuiz[]>(initialData?.popularQuizzes || []);
  const [loadingPopular, setLoadingPopular] = useState<boolean>(!initialData?.popularQuizzes?.length);
  const [popularError, setPopularError] = useState<string | null>(null);

  // Interactive Quiz Configuration Modal State
  const [selectedQuestionCount, setSelectedQuestionCount] = useState<number>(10);
  const [activePlayModalQuiz, setActivePlayModalQuiz] = useState<{
    title: string;
    categorySlug: string;
    subjectSlug?: string | null;
    isMixedCategory: boolean;
    description: string;
    availableQuestions?: number;
  } | null>(null);

  const [startingSoloCardId, setStartingSoloCardId] = useState<string | null>(null);
  const [creatingRoomCardId, setCreatingRoomCardId] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);

  // Auth and Guest State
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const [guestActive, setGuestActive] = useState<boolean>(false);
  const [pendingJoinPin, setPendingJoinPin] = useState<string | null>(null);
  const [pendingPlayAction, setPendingPlayAction] = useState<{
    type: "solo" | "multiplayer";
    quiz: {
      categorySlug: string;
      subjectSlug?: string | null;
      isMixedCategory?: boolean;
      questionCount?: number;
    };
  } | null>(null);

  // Search state (synced with Navbar inline search)
  const [searchQuery, setSearchQuery] = useState("");

  const mostPlayedSectionRef = useRef<HTMLDivElement>(null);

  // Synchronize guest auth
  useEffect(() => {
    const updateGuest = () => {
      const active = isGuestSessionActive();
      setGuestActive(active);
    };
    updateGuest();
    window.addEventListener("codearena:guest-auth-change", updateGuest);
    return () => {
      window.removeEventListener("codearena:guest-auth-change", updateGuest);
    };
  }, []);

  // Listen for Navbar search events
  useEffect(() => {
    const handleNavbarSearch = (e: any) => {
      setSearchQuery(e.detail || "");
    };
    window.addEventListener("quizzy:search", handleNavbarSearch as EventListener);
    return () => {
      window.removeEventListener("quizzy:search", handleNavbarSearch as EventListener);
    };
  }, []);

  const hasAccess = Boolean(isUserAuthenticated || guestActive);

  // If user completed guest login while attempting to join room, resume join
  useEffect(() => {
    if (hasAccess && pendingJoinPin) {
      const pin = pendingJoinPin;
      setPendingJoinPin(null);
      router.push(`/lobby/${pin}`);
    }
  }, [hasAccess, pendingJoinPin, router]);

  // If user completed guest login while attempting to play a quiz, resume quiz play immediately
  useEffect(() => {
    if (hasAccess && pendingPlayAction) {
      const action = pendingPlayAction;
      setPendingPlayAction(null);
      if (action.type === "solo") {
        handlePlaySolo(action.quiz);
      } else {
        handlePlayMultiplayer(action.quiz);
      }
    }
  }, [hasAccess, pendingPlayAction]);

  // If initialData is missing (e.g. client navigation or failed SSR), fetch in a single aggregated request
  useEffect(() => {
    if (initialData?.categories?.length && initialData?.subjects?.length) {
      return;
    }

    let isMounted = true;

    const fetchSummary = async () => {
      try {
        setLoadingCategories(true);
        setLoadingSubjects(true);
        setLoadingPopular(true);
        setCategoriesError(null);
        setPopularError(null);

        // Single aggregated request to /categories/summary replacing 8 waterfall requests
        const res = await api.get<{
          success: boolean;
          data: HomeSummaryData;
        }>("/categories/summary");

        if (isMounted && res.data) {
          if (Array.isArray(res.data.categories)) setCategories(res.data.categories);
          if (Array.isArray(res.data.subjects)) setSubjects(res.data.subjects);
          if (Array.isArray(res.data.popularQuizzes)) setPopularQuizzes(res.data.popularQuizzes);
        }
      } catch (err: any) {
        if (isMounted) {
          setCategoriesError(err?.message || "Could not fetch dynamic catalog from server.");
        }
      } finally {
        if (isMounted) {
          setLoadingCategories(false);
          setLoadingSubjects(false);
          setLoadingPopular(false);
        }
      }
    };

    fetchSummary();

    return () => {
      isMounted = false;
    };
  }, [initialData, api]);

  // Update play counts on subjects based on popular quizzes data from MongoDB
  const enrichedSubjects = useMemo(() => {
    if (!subjects.length) return [];
    if (!popularQuizzes.length) return subjects;

    const playMap: Record<string, number> = {};
    popularQuizzes.forEach((pq) => {
      if (pq.subjectSlug) {
        playMap[`${pq.categorySlug}-${pq.subjectSlug}`] = pq.playedCount;
      }
    });

    return subjects.map((sub) => {
      const key = `${sub.categorySlug}-${sub.slug}`;
      return {
        ...sub,
        playedCount: playMap[key] ?? sub.playedCount ?? 0,
      };
    });
  }, [subjects, popularQuizzes]);

  // Handle Hero Banner PIN Join
  const handleHeroJoinPin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = heroPinValue.trim().toUpperCase();
    if (!cleanPin) {
      setHeroPinError("Please enter a 6-digit room PIN");
      setTimeout(() => setHeroPinError(null), 3500);
      return;
    }

    if (cleanPin.length !== 6 || !/^[A-Z0-9]{6}$/.test(cleanPin)) {
      setHeroPinError("PIN must be exactly 6 alphanumeric characters");
      setTimeout(() => setHeroPinError(null), 3500);
      return;
    }

    if (!hasAccess) {
      setPendingJoinPin(cleanPin);
      setIsGuestModalOpen(true);
      return;
    }

    setHeroPinError(null);
    router.push(`/lobby/${cleanPin}`);
  };

  // Handle "Create Quiz with AI" CTA navigation
  const handleCreateQuizClick = () => {
    if (isUserAuthenticated) {
      router.push("/create");
    } else {
      router.push("/login?redirect=%2Fcreate");
    }
  };


  // Launch Solo Quiz Session
  const handlePlaySolo = async (quiz: {
    categorySlug: string;
    subjectSlug?: string | null;
    isMixedCategory?: boolean;
    questionCount?: number;
  }) => {
    if (!hasAccess) {
      setPendingPlayAction({ type: "solo", quiz });
      setIsGuestModalOpen(true);
      return;
    }

    const key = `${quiz.categorySlug}-${quiz.subjectSlug || "mixed"}`;
    setStartingSoloCardId(key);
    setRoomError(null);

    try {
      const res = await api.post<{ success: boolean; data: { roomCode: string; battleId: string } }>("/rooms/solo", {
        categoryId: quiz.categorySlug,
        subjectId: quiz.isMixedCategory ? null : quiz.subjectSlug,
        isMixedCategory: Boolean(quiz.isMixedCategory),
        questionCount: quiz.questionCount || selectedQuestionCount,
      });

      if (res.data?.roomCode) {
        router.push(`/battle/${res.data.roomCode}`);
      } else {
        throw new Error("Could not initialize solo battle.");
      }
    } catch (err: any) {
      setRoomError(err.message || "Failed to start solo quiz session.");
    } finally {
      setStartingSoloCardId(null);
    }
  };

  // Launch Multiplayer Quiz Room
  const handlePlayMultiplayer = async (quiz: {
    categorySlug: string;
    subjectSlug?: string | null;
    isMixedCategory?: boolean;
    questionCount?: number;
  }) => {
    if (!hasAccess) {
      setPendingPlayAction({ type: "multiplayer", quiz });
      setIsGuestModalOpen(true);
      return;
    }

    const key = `${quiz.categorySlug}-${quiz.subjectSlug || "mixed"}`;
    setCreatingRoomCardId(key);
    setRoomError(null);

    try {
      const res = await api.post<{ success: boolean; data: { roomCode: string } }>("/rooms", {
        categoryId: quiz.categorySlug,
        subjectId: quiz.isMixedCategory ? null : quiz.subjectSlug,
        isMixedCategory: Boolean(quiz.isMixedCategory),
        questionCount: quiz.questionCount || selectedQuestionCount,
      });

      if (res.data?.roomCode) {
        router.push(`/lobby/${res.data.roomCode}`);
      } else {
        throw new Error("Could not create multiplayer lobby.");
      }
    } catch (err: any) {
      setRoomError(err.message || "Failed to create multiplayer room.");
    } finally {
      setCreatingRoomCardId(null);
    }
  };

  // Currently Selected Category Object (if not "all")
  const activeCategory = useMemo(() => {
    if (selectedCategorySlug === "all") return null;
    return categories.find((c) => c.slug === selectedCategorySlug) || null;
  }, [categories, selectedCategorySlug]);

  // Dynamically Filtered Subjects based on selected Category and Navbar Search
  const displayedSubjects = useMemo(() => {
    let items = enrichedSubjects;

    if (selectedCategorySlug !== "all") {
      items = items.filter((sub) => sub.categorySlug === selectedCategorySlug);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(
        (sub) =>
          sub.name.toLowerCase().includes(q) ||
          (sub.description && sub.description.toLowerCase().includes(q)) ||
          sub.categoryName.toLowerCase().includes(q)
      );
    }

    return items;
  }, [enrichedSubjects, selectedCategorySlug, searchQuery]);

  // Group enriched subjects by categorySlug
  const subjectsByCategory = useMemo(() => {
    const map: Record<string, DynamicSubject[]> = {};
    enrichedSubjects.forEach((sub) => {
      const slug = sub.categorySlug;
      if (!map[slug]) {
        map[slug] = [];
      }
      map[slug].push(sub);
    });
    return map;
  }, [enrichedSubjects]);

  // Priority order for categories on homepage (Anime & Manga, Computer Science, Sports first)
  const categoriesWithSubjects = useMemo(() => {
    const priorityOrder = [
      "anime-manga",
      "computer-science-programming",
      "sports",
      "movies-web-series",
      "general-knowledge-india",
      "science-space",
      "programming",
      "aptitude",
    ];

    return [...categories]
      .filter((cat) => (subjectsByCategory[cat.slug] || []).length > 0)
      .sort((a, b) => {
        const indexA = priorityOrder.indexOf(a.slug);
        const indexB = priorityOrder.indexOf(b.slug);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [categories, subjectsByCategory]);

  // Top 6 Most Played Quizzes (only top 6 with View All)
  const mostPlayedQuizzes = useMemo(() => {
    if (popularQuizzes && popularQuizzes.length > 0) {
      return popularQuizzes.slice(0, 6);
    }
    return [...enrichedSubjects]
      .sort((a, b) => (b.playedCount || 0) - (a.playedCount || 0))
      .slice(0, 6)
      .map((sub) => ({
        id: sub.id || sub.slug,
        title: sub.name,
        categorySlug: sub.categorySlug,
        subjectSlug: sub.slug,
        isMixedCategory: false,
        thumbnailUrl: sub.thumbnailUrl,
        questionCount: sub.questionCount,
        playedCount: sub.playedCount,
        description: sub.description || `Play live matches in ${sub.name}.`,
      }));
  }, [popularQuizzes, enrichedSubjects]);

  const handlePlayQuiz = (quiz: {
    title: string;
    categorySlug: string;
    subjectSlug?: string | null;
    isMixedCategory?: boolean;
    description?: string;
    questionCount?: number;
  }) => {
    setActivePlayModalQuiz({
      title: quiz.title,
      categorySlug: quiz.categorySlug,
      subjectSlug: quiz.subjectSlug,
      isMixedCategory: Boolean(quiz.isMixedCategory),
      description: quiz.description || `Play live matches in ${quiz.title}.`,
      availableQuestions: quiz.questionCount,
    });
  };

  return (
    <div className="w-full min-h-screen bg-[#FAF7EE] text-stone-900 pb-20 select-none overflow-x-hidden">
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 space-y-6 sm:space-y-8 pt-4">

        {/* Room / Global Action Error notification */}
        {(roomError || categoriesError) && (
          <div className="p-4 rounded-2xl bg-red-100 border-[2.5px] border-black text-red-900 shadow-[4px_4px_0px_#000] flex items-center justify-between">
            <span className="font-extrabold text-sm sm:text-base">{roomError || categoriesError}</span>
            <button
              onClick={() => {
                setRoomError(null);
                setCategoriesError(null);
              }}
              className="bg-red-200 hover:bg-red-300 border-2 border-black rounded-lg px-3 py-1 font-black text-xs cursor-pointer shadow-[2px_2px_0px_#000]"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 1. JOIN ROOM WITH PIN (SLEEK RETRO-ARCADE THEME) */}
        {/* ========================================================================= */}
        <section className="w-full bg-white border-[2.5px] border-black rounded-[22px] sm:rounded-[26px] p-3.5 sm:px-6 sm:py-3.5 shadow-[4px_4px_0px_#000] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Icon & Punchy Title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#EDE9FE] border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_#000] shrink-0">
              <Gamepad2 className="w-5 h-5 text-[#7C3AED]" />
            </div>
            <div>
              <h2 className="font-black text-sm sm:text-base text-black uppercase tracking-tight leading-tight">
                Join a Room
              </h2>
              <p className="text-[11px] font-bold text-stone-500 leading-tight">
                Enter 6-digit PIN to play with friends
              </p>
            </div>
          </div>

          {/* Right: 6-Digit PIN Form */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <form
              onSubmit={handleHeroJoinPin}
              className="flex items-center bg-[#FAF7EE] border-2 border-black rounded-full p-1 shadow-[2px_2px_0px_#000] focus-within:ring-2 focus-within:ring-black"
            >
              <input
                type="text"
                maxLength={6}
                value={heroPinValue}
                onChange={(e) => {
                  setHeroPinValue(e.target.value.toUpperCase());
                  if (heroPinError) setHeroPinError(null);
                }}
                placeholder="ENTER PIN"
                className={cn(
                  "w-28 sm:w-36 px-3 py-1 bg-transparent text-xs sm:text-sm font-black text-black placeholder:text-stone-400 text-center tracking-widest uppercase focus:outline-none",
                  heroPinError && "text-red-600 placeholder:text-red-400"
                )}
              />
              <button
                type="submit"
                aria-label="Join Room with PIN"
                className="w-8 h-8 rounded-full bg-[#0D9488] hover:bg-[#0F766E] text-white border-2 border-black flex items-center justify-center transition-all shadow-[1px_1px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer shrink-0"
              >
                <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
              </button>
            </form>

            {heroPinError && (
              <span className="text-[11px] font-black text-red-600">
                {heroPinError}
              </span>
            )}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 1.5. CREATE YOUR OWN QUIZ WITH AI (PROMOTIONAL NEO-BRUTALIST SECTION) */}
        {/* ========================================================================= */}
        <section
          aria-labelledby="ai-quiz-promo-heading"
          className="w-full relative overflow-hidden bg-gradient-to-br from-[#FEF9C3] via-[#FAF7EE] to-[#EDE9FE] border-[2.5px] border-black rounded-[24px] sm:rounded-[28px] p-4.5 sm:p-6 lg:p-7 shadow-[4px_4px_0px_#000]"
        >
          {/* Subtle Decorative Background Dots */}
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage: "radial-gradient(#000 1px, transparent 1px)",
              backgroundSize: "16px 16px",
            }}
          />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Left Content Column (Heading, Details, Feature Indicators, Quota, CTA) */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col items-start gap-4">

              {/* Heading & Description */}
              <div>
                <h2
                  id="ai-quiz-promo-heading"
                  className="text-xl sm:text-2xl md:text-3xl font-black text-black tracking-tight leading-tight"
                >
                  Your Ideas. Your Quiz.
                </h2>
                <p className="text-xs sm:text-sm font-bold text-stone-700 mt-1.5 max-w-xl leading-relaxed">
                  Generate an instant quiz from your chosen category and topic. Tweak questions to your liking, get an instant cover thumbnail, and launch into solo or multiplayer challenges.
                </p>
              </div>

              {/* 4 Feature Indicators */}
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border-2 border-black text-xs font-black text-black shadow-[1.5px_1.5px_0px_#000]">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#0D9488]" />
                  <span>Easy / Medium / Hard</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border-2 border-black text-xs font-black text-black shadow-[1.5px_1.5px_0px_#000]">
                  <Edit3 className="w-3.5 h-3.5 text-[#EA580C]" />
                  <span>Editable Questions</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border-2 border-black text-xs font-black text-black shadow-[1.5px_1.5px_0px_#000]">
                  <ImageIcon className="w-3.5 h-3.5 text-[#DB2777]" />
                  <span>AI-Generated Thumbnail</span>
                </div>
              </div>

             
              {/* Prominent CTA Button */}
              <div className="pt-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleCreateQuizClick}
                  className="w-full sm:w-auto px-6 py-3 rounded-full bg-[#FFE600] hover:bg-[#FACC15] text-black font-black text-sm uppercase tracking-wider border-2 border-black shadow-[3px_3px_0px_#000] hover:shadow-[4px_4px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center justify-center gap-2.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
                >
                  <Sparkles className="w-4 h-4 fill-black" />
                  <span>Create Quiz with AI</span>
                  <ArrowRight className="w-4 h-4 stroke-[3]" />
                </button>
              </div>
            </div>

            {/* Right Neo-Brutalist Visual Card Mockup (Visible on sm and up) */}
            <div className="lg:col-span-5 xl:col-span-4 hidden sm:block">
              <div className="relative mx-auto max-w-sm rounded-[22px] bg-white border-[2.5px] border-black p-4 shadow-[4px_4px_0px_#000] rotate-1 hover:rotate-0 transition-transform">
                {/* Mock Card Header */}
                <div className="flex items-center justify-between pb-3 border-b-2 border-black mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#CCFBF1] border-2 border-black flex items-center justify-center">
                      <ArcadeBrainIcon className="w-4 h-4 text-[#0D9488]" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-wide text-black">
                      AI Generated Quiz
                    </span>
                  </div>
                  <span className="text-[10px] font-black bg-[#DCFCE7] text-[#15803D] px-2 py-0.5 rounded-full border border-black shadow-[1px_1px_0px_#000]">
                    20 Questions
                  </span>
                </div>

                {/* Mock Quiz Topic Body */}
                <div className="space-y-2.5">
                  <div className="p-2.5 rounded-xl bg-[#FAF7EE] border-2 border-black">
                    <div className="text-[10px] font-black uppercase text-stone-500">Selected Topic</div>
                    <div className="text-xs font-black text-black">Quantum Physics & Black Holes</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="p-2 rounded-lg bg-[#EDE9FE] border-2 border-black">
                      <div className="text-[9px] font-black uppercase text-stone-500">Difficulty</div>
                      <div className="text-[11px] font-black text-[#6D28D9]">Easy • Med • Hard</div>
                    </div>
                    <div className="p-2 rounded-lg bg-[#FFE4E6] border-2 border-black">
                      <div className="text-[9px] font-black uppercase text-stone-500">Thumbnail</div>
                      <div className="text-[11px] font-black text-[#BE123C]">AI Cover Art ✨</div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#DCFCE7] border-2 border-black flex items-center justify-between">
                    <span className="text-[11px] font-black text-black">Ready to Edit & Play</span>
                    <span className="text-xs font-black">⚡ Instant</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 2. HORIZONTAL CATEGORY STRIP ("Explore Categories" - 100% Dynamic) */}
        {/* ========================================================================= */}
        <section className="w-full space-y-3">
          {/* Section Header Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArcadeLightningIcon className="w-5 h-5 text-[#F59E0B]" />
              <span className="font-black text-sm uppercase text-stone-700 tracking-wider">
                Explore Categories
              </span>
            </div>
            <Link
              href="/categories"
              className="text-xs font-black text-stone-800 hover:text-black flex items-center gap-1 hover:underline"
            >
              <span>View All Categories</span>
              <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </Link>
          </div>

          {/* Horizontal Scrollable Category Pills Strip (No outer wrapper box) */}
          <div className="w-full overflow-x-auto pb-2 scrollbar-none flex items-center gap-2.5 sm:gap-3">
            {/* Pill 1: All */}
            <button
              type="button"
              onClick={() => setSelectedCategorySlug("all")}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-full border-2 border-black font-black text-xs sm:text-sm whitespace-nowrap cursor-pointer transition-all shrink-0 active:translate-x-[1px] active:translate-y-[1px]",
                selectedCategorySlug === "all"
                  ? "bg-[#FFE600] text-black shadow-[3px_3px_0px_#000] scale-[1.02]"
                  : "bg-white text-stone-800 hover:bg-[#FFFDF5] shadow-[2px_2px_0px_#000] hover:-translate-y-0.5"
              )}
            >
              <LayoutGrid className="w-4 h-4 text-black shrink-0" />
              <span>All</span>
            </button>

            {/* Dynamic Category Pills from MongoDB */}
            {categories.map((cat) => {
              const isActive = selectedCategorySlug === cat.slug;
              return (
                <button
                  key={cat.id || cat.slug}
                  type="button"
                  onClick={() => setSelectedCategorySlug(cat.slug)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-full border-2 border-black font-black text-xs sm:text-sm whitespace-nowrap cursor-pointer transition-all shrink-0 active:translate-x-[1px] active:translate-y-[1px]",
                    isActive
                      ? "bg-[#FFE600] text-black shadow-[3px_3px_0px_#000] scale-[1.02]"
                      : "bg-white text-stone-800 hover:bg-[#FFFDF5] shadow-[2px_2px_0px_#000] hover:-translate-y-0.5"
                  )}
                >
                  {getCategoryIcon(cat.slug)}
                  <span>{cat.name}</span>
                </button>
              );
            })}

            {/* Category Skeletons while loading */}
            {loadingCategories && (
              <div className="flex items-center gap-2.5">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-10 w-28 rounded-full border-2 border-stone-300 bg-stone-100 animate-pulse shrink-0"
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 3. DYNAMIC CONTENT: EITHER FILTERED/SEARCH GRID OR (MOST PLAYED + CATEGORY ROWS) */}
        {/* ========================================================================= */}
        {(selectedCategorySlug !== "all" || searchQuery.trim() !== "") ? (
          /* ======================================================================= */
          /* FILTERED CATEGORY / SEARCH RESULTS VIEW                                 */
          /* ======================================================================= */
          <section className="w-full space-y-3">
            {/* Header with Title and Reset / Curriculum Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                <span className="shrink-0">{getCategoryIcon(selectedCategorySlug, "w-5 h-5")}</span>
                <h2 className="font-black text-lg sm:text-xl text-black uppercase tracking-tight">
                  {searchQuery ? `Search Results: "${searchQuery}"` : activeCategory ? `${activeCategory.name} Quizzes` : "Quizzes"}
                </h2>
                <span className="text-xs font-bold text-stone-500">
                  ({displayedSubjects.length})
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {selectedCategorySlug !== "all" && (
                  <Link
                    href={`/categories/${selectedCategorySlug}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white hover:bg-stone-50 text-black font-black text-xs border-2 border-black shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer whitespace-nowrap"
                  >
                    <span>Curriculum</span>
                    <ArrowRight className="w-3 h-3 stroke-[2.5]" />
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategorySlug("all");
                    setSearchQuery("");
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#FFE600] hover:bg-[#FACC15] text-black font-black text-xs border-2 border-black shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer whitespace-nowrap"
                >
                  <span>Show All Categories</span>
                </button>
              </div>
            </div>

            {/* Skeletons while loading */}
            {loadingSubjects && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="rounded-xl sm:rounded-2xl border-[1.5px] sm:border-2 border-black bg-white p-1.5 sm:p-2 shadow-[2px_2px_0px_#000] animate-pulse space-y-1.5"
                  >
                    <div className="w-full aspect-square rounded-lg sm:rounded-xl bg-stone-200" />
                    <div className="h-3 sm:h-3.5 w-4/5 bg-stone-200 rounded mt-1" />
                    <div className="flex justify-between items-center pt-1 border-t border-stone-100">
                      <div className="h-2.5 w-6 bg-stone-200 rounded" />
                      <div className="h-2.5 w-10 bg-stone-200 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state if search or category returns 0 */}
            {!loadingSubjects && displayedSubjects.length === 0 && (
              <div className="w-full bg-white border-2 border-black rounded-2xl p-6 text-center shadow-[3px_3px_0px_#000] space-y-2">
                <p className="font-black text-sm sm:text-base text-black uppercase">
                  {searchQuery ? `No quizzes found for "${searchQuery}"` : "No quizzes available in this category yet"}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategorySlug("all");
                    setSearchQuery("");
                  }}
                  className="mt-1 inline-flex items-center px-4 py-1.5 bg-[#FFE600] border-2 border-black rounded-full font-black text-xs text-black shadow-[2px_2px_0px_#000] cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            )}

            {/* Filtered Grid */}
            {!loadingSubjects && displayedSubjects.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
                {displayedSubjects.map((sub) => (
                  <CompactQuizCard
                    key={sub.id || sub.slug}
                    id={sub.id || sub.slug}
                    title={sub.name}
                    categorySlug={sub.categorySlug}
                    subjectSlug={sub.slug}
                    isMixedCategory={false}
                    thumbnailUrl={sub.thumbnailUrl}
                    questionCount={sub.questionCount}
                    playedCount={sub.playedCount}
                    onPlay={() =>
                      handlePlayQuiz({
                        title: sub.name,
                        categorySlug: sub.categorySlug,
                        subjectSlug: sub.slug,
                        isMixedCategory: false,
                        description: sub.description || `Play live matches in ${sub.name}.`,
                        questionCount: sub.questionCount,
                      })
                    }
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          /* ======================================================================= */
          /* DEFAULT VIEW: TOP 6 MOST PLAYED + SIDEWAYS SCROLLING CATEGORY ROWS     */
          /* ======================================================================= */
          <>
            {/* 3. MOST PLAYED (ONLY TOP 6 WITH VIEW ALL LINK) */}
            <section
              id="quizzes"
              ref={mostPlayedSectionRef}
              className="w-full space-y-3 pt-1"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArcadeFlameIcon className="w-5 h-5 text-[#F97316] shrink-0" />
                  <h2 className="font-black text-lg sm:text-xl text-black tracking-wide uppercase">
                    Most Played
                  </h2>
                </div>

                <Link
                  href="/categories"
                  className="inline-flex items-center gap-1 text-xs font-black text-stone-800 hover:text-black hover:underline"
                >
                  <span>View All</span>
                  <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
                </Link>
              </div>

              {/* Skeletons while loading */}
              {(loadingPopular || loadingSubjects) && mostPlayedQuizzes.length === 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className="rounded-xl sm:rounded-2xl border-[1.5px] sm:border-2 border-black bg-white p-1.5 sm:p-2 shadow-[2px_2px_0px_#000] animate-pulse space-y-1.5"
                    >
                      <div className="w-full aspect-square rounded-lg sm:rounded-xl bg-stone-200" />
                      <div className="h-3 sm:h-3.5 w-4/5 bg-stone-200 rounded mt-1" />
                      <div className="flex justify-between items-center pt-1 border-t border-stone-100">
                        <div className="h-2.5 w-6 bg-stone-200 rounded" />
                        <div className="h-2.5 w-10 bg-stone-200 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Real Top 6 Most Played Quizzes (Compact Square Cards) */}
              {mostPlayedQuizzes.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
                  {mostPlayedQuizzes.map((quiz) => (
                    <CompactQuizCard
                      key={quiz.id}
                      id={quiz.id}
                      title={quiz.title}
                      categorySlug={quiz.categorySlug}
                      subjectSlug={quiz.subjectSlug}
                      isMixedCategory={quiz.isMixedCategory}
                      thumbnailUrl={quiz.thumbnailUrl}
                      questionCount={quiz.questionCount}
                      playedCount={quiz.playedCount}
                      onPlay={() =>
                        handlePlayQuiz({
                          title: quiz.title,
                          categorySlug: quiz.categorySlug,
                          subjectSlug: quiz.subjectSlug,
                          isMixedCategory: quiz.isMixedCategory,
                          description: quiz.description,
                          questionCount: quiz.questionCount,
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </section>

            {/* 4. ONE ROW PER CATEGORY (SCROLLING SIDEWAYS WITH ITS OWN VIEW ALL) */}
            {categoriesWithSubjects.map((cat) => (
              <CategoryScrollRow
                key={cat.id || cat.slug}
                category={cat}
                subjects={subjectsByCategory[cat.slug] || []}
                onPlay={handlePlayQuiz}
              />
            ))}
          </>
        )}

      </div>

      {/* ========================================================================= */}
      {/* QUICK LAUNCH & MATCH CONFIGURATION MODAL */}
      {/* ========================================================================= */}
      {activePlayModalQuiz && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-[#FAF7EE] border-[3px] border-black rounded-[28px] p-6 shadow-[8px_8px_0px_#000] relative">
            
            {/* Close Button */}
            <button
              onClick={() => setActivePlayModalQuiz(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white border-2 border-black flex items-center justify-center text-black hover:bg-stone-100 shadow-[2px_2px_0px_#000] cursor-pointer"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-[#FFE600] border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_#000]">
                <ArcadeCrownIcon className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                  Quiz Configuration
                </span>
                <h3 className="text-xl font-black text-black leading-tight mt-0.5">
                  {activePlayModalQuiz.title}
                </h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm font-bold text-stone-700 mb-5 leading-relaxed">
              {activePlayModalQuiz.description}
            </p>

            {/* Quiz Length Selector (10, 15, 20 questions) */}
            <div className="mb-6 bg-white border-2 border-black rounded-2xl p-4 shadow-[3px_3px_0px_#000]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black uppercase text-stone-900 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Select Questions Count
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[10, 15, 20].map((count) => {
                  const isSelected = selectedQuestionCount === count;
                  return (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setSelectedQuestionCount(count)}
                      className={`py-2 px-3 rounded-xl border-2 font-black text-xs sm:text-sm transition-all cursor-pointer ${
                        isSelected
                          ? "bg-[#FFE600] text-black border-black shadow-[2px_2px_0px_#000]"
                          : "bg-[#FAF7EE] text-stone-800 border-stone-300 hover:border-black"
                      }`}
                    >
                      {count} Questions
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons: Play Solo or Play Multiplayer */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  handlePlaySolo({
                    categorySlug: activePlayModalQuiz.categorySlug,
                    subjectSlug: activePlayModalQuiz.subjectSlug,
                    isMixedCategory: activePlayModalQuiz.isMixedCategory,
                    questionCount: selectedQuestionCount,
                  });
                  setActivePlayModalQuiz(null);
                }}
                className="w-full bg-[#FFE600] hover:bg-[#FACC15] active:translate-x-[1px] active:translate-y-[1px] text-black font-black text-sm py-3 px-4 rounded-full border-2 border-black shadow-[3px_3px_0px_#000] flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Play className="w-4 h-4 fill-black text-black" />
                <span>Play Solo Now</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handlePlayMultiplayer({
                    categorySlug: activePlayModalQuiz.categorySlug,
                    subjectSlug: activePlayModalQuiz.subjectSlug,
                    isMixedCategory: activePlayModalQuiz.isMixedCategory,
                    questionCount: selectedQuestionCount,
                  });
                  setActivePlayModalQuiz(null);
                }}
                className="w-full bg-[#FF4D85] hover:bg-[#F43F5E] active:translate-x-[1px] active:translate-y-[1px] text-white font-black text-sm py-3 px-4 rounded-full border-2 border-black shadow-[3px_3px_0px_#000] flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Users className="w-4 h-4 text-white" />
                <span>Host Multiplayer</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Guest Authentication Modal integration */}
      <PlayAsGuestModal
        isOpen={isGuestModalOpen}
        onClose={() => setIsGuestModalOpen(false)}
        onSuccess={() => {
          setIsGuestModalOpen(false);
          setGuestActive(isGuestSessionActive());
        }}
      />
    </div>
  );
}
