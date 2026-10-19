"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Crown,
  ArrowRight,
  Loader2,
  Info,
  Lock,
  Film,
  Trophy,
  HelpCircle,
  Check,
  Link as LinkIcon,
  UploadCloud,
  ImageIcon,
  Edit3,
  Trash2,
  Globe,
  Copy,
  ExternalLink,
  Eye,
  RefreshCw,
  X,
  BookOpen,
  Search,
} from "lucide-react";
import {
  ArcadeBrainIcon,
  ArcadeLightbulbIcon,
  ArcadeCodeIcon,
  ArcadeFlaskIcon,
  ArcadeGlobeIcon,
} from "@/components/ui/ArcadeIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/features/auth";
import { useApiClient } from "@/hooks/useApiClient";
import { Category } from "@/types";
import { cn } from "@/lib/utils";

export interface GeneratedQuestion {
  questionId: string;
  question: string;
  options: [string, string, string, string];
  correctAnswer: number;
  explanation: string;
}

export interface UserQuiz {
  _id: string;
  title: string;
  topic: string;
  categoryName: string;
  categoryId?: string | null;
  categorySlug?: string;
  description?: string;
  thumbnailUrl: string;
  thumbnailSource: "ai" | "url" | "upload" | "default";
  storageMetadata?: Record<string, any>;
  isPrivate: boolean;
  isPublished: boolean;
  shareId: string;
  playedCount: number;
  questions: GeneratedQuestion[];
  createdAt: string;
}

export interface QuotaStatus {
  allowed: boolean;
  generationsToday: number;
  dailyLimit: number;
  remainingToday: number;
  isPro: boolean;
  proExpiresAt?: string | null;
  resetsAt: string;
}

function getCategoryIcon(slug: string, className = "w-4 h-4 shrink-0") {
  const s = (slug || "").toLowerCase();
  if (s.includes("anime") || s.includes("manga")) return <Film className={className} />;
  if (s.includes("computer") || s.includes("code") || s.includes("programming"))
    return <ArcadeCodeIcon className={className} />;
  if (s.includes("sport") || s.includes("cricket") || s.includes("football"))
    return <Trophy className={className} />;
  if (s.includes("movie") || s.includes("film") || s.includes("series") || s.includes("cinema"))
    return <Film className={className} />;
  if (s.includes("science") || s.includes("space") || s.includes("physics"))
    return <ArcadeFlaskIcon className={className} />;
  if (s.includes("gk") || s.includes("general") || s.includes("india"))
    return <ArcadeGlobeIcon className={className} />;
  if (s.includes("aptitude") || s.includes("reasoning") || s.includes("logic"))
    return <ArcadeBrainIcon className={className} />;
  if (s === "other") return <HelpCircle className={className} />;
  return <ArcadeLightbulbIcon className={className} />;
}

export function QuizCreatorClient() {
  const router = useRouter();
  const api = useApiClient();
  const { data: currentUser, isLoading: isUserLoading } = useCurrentUser();

  // Navigation tab
  const [activeTab, setActiveTab] = useState<"create" | "my-quizzes">("create");

  // Form State
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState<boolean>(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [customCategoryName, setCustomCategoryName] = useState<string>("");
  const [topic, setTopic] = useState<string>("");

  // Thumbnail State: 'ai' | 'url' | 'upload'
  const [thumbnailMode, setThumbnailMode] = useState<"ai" | "url" | "upload">("ai");
  const [imageUrlInput, setImageUrlInput] = useState<string>("");
  const [imageUrlPreview, setImageUrlPreview] = useState<string | null>(null);
  const [uploadedBase64, setUploadedBase64] = useState<string | null>(null);
  const [uploadedMimeType, setUploadedMimeType] = useState<string>("image/jpeg");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quota State
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [loadingQuota, setLoadingQuota] = useState<boolean>(false);

  // Validation & Submission State
  const [fieldErrors, setFieldErrors] = useState<{
    category?: string;
    customCategory?: string;
    topic?: string;
    thumbnail?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitNotice, setSubmitNotice] = useState<{
    type: "info" | "error" | "warning";
    title: string;
    message: string;
    details?: string;
  } | null>(null);

  // Success celebration banner
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Preview / Editor State
  const [editingQuiz, setEditingQuiz] = useState<{
    isNew: boolean;
    quizId?: string;
    topic: string;
    categoryName: string;
    categoryId?: string;
    categorySlug?: string;
    thumbnailUrl: string;
    thumbnailSource: "ai" | "url" | "upload" | "default";
    storageMetadata?: Record<string, any>;
    questions: GeneratedQuestion[];
  } | null>(null);
  const [isSavingQuiz, setIsSavingQuiz] = useState<boolean>(false);

  // Thumbnail changer state inside preview editor
  const [showThumbEditor, setShowThumbEditor] = useState<boolean>(false);
  const [thumbEditorMode, setThumbEditorMode] = useState<"ai" | "url" | "upload">("url");
  const [thumbEditorUrl, setThumbEditorUrl] = useState<string>("");
  const [isUpdatingThumb, setIsUpdatingThumb] = useState<boolean>(false);
  const [thumbUpdateError, setThumbUpdateError] = useState<string | null>(null);
  const changeThumbFileInputRef = useRef<HTMLInputElement>(null);

  // My Quizzes Dashboard State
  const [myQuizzes, setMyQuizzes] = useState<UserQuiz[]>([]);
  const [loadingMyQuizzes, setLoadingMyQuizzes] = useState<boolean>(false);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<"all" | "published" | "private">("all");

  // Razorpay Pro Payment State
  const [isPaymentLoading, setIsPaymentLoading] = useState<boolean>(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState<boolean>(false);

  const isGuestOrAnonymous = !currentUser || Boolean(currentUser.isGuest);

  // Dynamic Razorpay Checkout script loader
  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window !== "undefined" && (window as any).Razorpay) {
        return resolve(true);
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  // Initiate Quizzy Pro ₹19 Purchase Flow via Razorpay Checkout
  const handleInitiateProUpgrade = async () => {
    if (isGuestOrAnonymous) {
      router.push("/login?redirect=%2Fcreate");
      return;
    }
    if (isPaymentLoading || isVerifyingPayment) return;

    setIsPaymentLoading(true);
    try {
      const isScriptLoaded = await loadRazorpayScript();
      if (!isScriptLoaded) {
        alert(
          "Could not load Razorpay payment checkout. Please verify your internet connection or disable ad-blockers and try again."
        );
        setIsPaymentLoading(false);
        return;
      }

      const orderRes = await api.post<{
        success: boolean;
        data: {
          orderId: string;
          amount: number;
          currency: string;
          keyId: string;
          plan: {
            id: string;
            name: string;
            price: number;
            durationDays: number;
            dailyLimit: number;
          };
        };
      }>("/payments/create-order");

      if (!orderRes?.data?.orderId) {
        throw new Error("Unable to create payment order. Please try again.");
      }

      const { orderId, amount, currency, keyId } = orderRes.data;

      const options = {
        key: keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_placeholder",
        amount,
        currency,
        name: "QUIZZY",
        description: "Quizzy Pro Pass — 7 Days (10 Quizzes/Day)",
        order_id: orderId,
        prefill: {
          name: currentUser?.displayName || currentUser?.username || "",
          email: currentUser?.email || "",
        },
        theme: {
          color: "#7C3AED",
        },
        modal: {
          ondismiss: () => {
            setIsPaymentLoading(false);
          },
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            setIsVerifyingPayment(true);
            const verifyRes = await api.post<{
              success: boolean;
              message: string;
              data: {
                quota: QuotaStatus;
              };
            }>("/payments/verify", response);

            if (verifyRes?.data?.quota) {
              setQuota(verifyRes.data.quota);
              setSuccessBanner("🎉 Quizzy Pro activated for 7 days! You now have 10 quiz generations per day.");
              setSubmitNotice(null);
              fetchQuota();
            }
          } catch (err: any) {
            alert(err?.message || "Payment verification failed. Please contact support.");
          } finally {
            setIsVerifyingPayment(false);
            setIsPaymentLoading(false);
          }
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", (errResp: any) => {
        setIsPaymentLoading(false);
        alert(`Payment failed: ${errResp?.error?.description || "Payment was rejected."}`);
      });
      rzp.open();
    } catch (err: any) {
      alert(err?.message || "Failed to initialize checkout. Please try again.");
      setIsPaymentLoading(false);
    }
  };

  // Fetch Quota
  const fetchQuota = useCallback(async () => {
    if (isGuestOrAnonymous) return;
    try {
      setLoadingQuota(true);
      const res = await api.get<{ success: boolean; data: QuotaStatus }>("/quizzes/quota");
      if (res?.data) {
        setQuota(res.data);
      }
    } catch {
      // Non-critical, fallback to defaults
    } finally {
      setLoadingQuota(false);
    }
  }, [api, isGuestOrAnonymous]);

  // Fetch Categories
  useEffect(() => {
    let isMounted = true;
    const fetchCategories = async () => {
      try {
        setLoadingCategories(true);
        setCategoriesError(null);
        const res = await api.get<{ success: boolean; data: Category[] }>("/categories");
        if (isMounted && res?.data) {
          const activeCats = Array.isArray(res.data)
            ? res.data.filter(
                (c) =>
                  c.isActive !== false &&
                  (c.questionCount === undefined || c.questionCount > 0)
              )
            : [];

          const otherCategory: Category = {
            id: "other",
            slug: "other",
            name: "Other",
            description: "Custom topic or custom category",
            isActive: true,
            questionCount: 0,
          };

          setCategories([...activeCats, otherCategory]);
        }
      } catch (err: any) {
        if (isMounted) {
          setCategoriesError(err?.message || "Failed to load categories from server.");
        }
      } finally {
        if (isMounted) {
          setLoadingCategories(false);
        }
      }
    };

    fetchCategories();
    return () => {
      isMounted = false;
    };
  }, [api]);

  // Fetch Quota on mount
  useEffect(() => {
    fetchQuota();
  }, [fetchQuota]);

  // Fetch My Quizzes
  const fetchMyQuizzes = useCallback(async () => {
    if (isGuestOrAnonymous) return;
    try {
      setLoadingMyQuizzes(true);
      const res = await api.get<{ success: boolean; data: UserQuiz[] }>("/quizzes/my");
      if (res?.data) {
        setMyQuizzes(res.data);
      }
    } catch (err: any) {
      console.error("Failed to load user quizzes:", err);
    } finally {
      setLoadingMyQuizzes(false);
    }
  }, [api, isGuestOrAnonymous]);

  useEffect(() => {
    if (activeTab === "my-quizzes") {
      fetchMyQuizzes();
    }
  }, [activeTab, fetchMyQuizzes]);

  // Filtered and Sorted Quizzes for Dashboard
  const filteredQuizzes = useMemo(() => {
    return myQuizzes
      .filter((q) => {
        if (filterStatus === "published" && !q.isPublished) return false;
        if (filterStatus === "private" && q.isPublished) return false;
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase().trim();
          const matchTitle = q.title?.toLowerCase().includes(query);
          const matchTopic = q.topic?.toLowerCase().includes(query);
          const matchCategory = q.categoryName?.toLowerCase().includes(query);
          return matchTitle || matchTopic || matchCategory;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [myQuizzes, filterStatus, searchQuery]);

  const publishedCount = useMemo(() => myQuizzes.filter((q) => q.isPublished).length, [myQuizzes]);
  const privateCount = useMemo(() => myQuizzes.filter((q) => !q.isPublished).length, [myQuizzes]);

  // Handle URL thumbnail change in creation form
  const handleUrlChange = (val: string) => {
    setImageUrlInput(val);
    if (!val.trim()) {
      setImageUrlPreview(null);
      return;
    }
    if (val.startsWith("https://")) {
      setImageUrlPreview(val.trim());
      setFieldErrors((prev) => ({ ...prev, thumbnail: undefined }));
    } else {
      setImageUrlPreview(null);
      setFieldErrors((prev) => ({
        ...prev,
        thumbnail: "Image URL must use secure HTTPS protocol.",
      }));
    }
  };

  // Handle File Upload in creation form
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setFieldErrors((prev) => ({
        ...prev,
        thumbnail: "Only JPEG, PNG, and WebP images are supported.",
      }));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFieldErrors((prev) => ({
        ...prev,
        thumbnail: "File size exceeds the 5MB maximum limit.",
      }));
      return;
    }

    setFieldErrors((prev) => ({ ...prev, thumbnail: undefined }));
    setUploadedFileName(file.name);
    setUploadedMimeType(file.type);

    const reader = new FileReader();
    reader.onload = () => {
      setUploadedBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleClearUpload = () => {
    setUploadedBase64(null);
    setUploadedFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Change Cover Thumbnail inside Preview Editor
  const handleChangeThumbnail = async (mode: "ai" | "url" | "upload") => {
    if (!editingQuiz || isUpdatingThumb) return;
    setIsUpdatingThumb(true);
    setThumbUpdateError(null);

    try {
      const payload: any = {
        mode,
        topic: editingQuiz.topic,
        categoryName: editingQuiz.categoryName,
        categorySlug: editingQuiz.categorySlug,
      };

      if (mode === "url") {
        if (!thumbEditorUrl.trim() || !thumbEditorUrl.startsWith("https://")) {
          setThumbUpdateError("Please provide a valid HTTPS image URL.");
          setIsUpdatingThumb(false);
          return;
        }
        payload.url = thumbEditorUrl.trim();
      }

      const res = await api.post<{
        success: boolean;
        data: {
          url: string;
          source: "ai" | "url" | "upload" | "default";
          metadata: Record<string, any>;
        };
      }>("/quizzes/thumbnail", payload);

      if (res?.data?.url) {
        setEditingQuiz((prev) =>
          prev
            ? {
                ...prev,
                thumbnailUrl: res.data.url,
                thumbnailSource: res.data.source,
                storageMetadata: res.data.metadata,
              }
            : null
        );
        setShowThumbEditor(false);
        setThumbEditorUrl("");
      }
    } catch (err: any) {
      setThumbUpdateError(err?.message || "Failed to update thumbnail cover.");
    } finally {
      setIsUpdatingThumb(false);
    }
  };

  const handleUploadEditorThumbnail = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingQuiz) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setThumbUpdateError("Only JPEG, PNG, and WebP images are supported.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setThumbUpdateError("Image file exceeds the 5MB size limit.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setIsUpdatingThumb(true);
      setThumbUpdateError(null);
      try {
        const res = await api.post<{
          success: boolean;
          data: {
            url: string;
            source: "ai" | "url" | "upload" | "default";
            metadata: Record<string, any>;
          };
        }>("/quizzes/thumbnail", {
          mode: "upload",
          topic: editingQuiz.topic,
          upload: { base64, mimeType: file.type, fileName: file.name },
        });

        if (res?.data?.url) {
          setEditingQuiz((prev) =>
            prev
              ? {
                  ...prev,
                  thumbnailUrl: res.data.url,
                  thumbnailSource: res.data.source,
                  storageMetadata: res.data.metadata,
                }
              : null
          );
          setShowThumbEditor(false);
        }
      } catch (err: any) {
        setThumbUpdateError(err?.message || "Failed to upload image file.");
      } finally {
        setIsUpdatingThumb(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Validation
  const validateForm = () => {
    const errors: { category?: string; customCategory?: string; topic?: string; thumbnail?: string } = {};

    if (!selectedCategoryId) {
      errors.category = "Please select a category.";
    }

    if (
      selectedCategoryId === "other" &&
      customCategoryName.trim().length > 0 &&
      customCategoryName.trim().length < 2
    ) {
      errors.customCategory = "Category name must be at least 2 characters.";
    }

    if (!topic || topic.trim().length < 2) {
      errors.topic = "Please enter a specific topic (minimum 2 characters).";
    } else if (topic.trim().length > 100) {
      errors.topic = "Topic must not exceed 100 characters.";
    }

    if (thumbnailMode === "url") {
      if (!imageUrlInput.trim()) {
        errors.thumbnail = "Please enter an image URL or switch to AI mode.";
      } else if (!imageUrlInput.startsWith("https://")) {
        errors.thumbnail = "Image URL must start with https://";
      }
    } else if (thumbnailMode === "upload") {
      if (!uploadedBase64) {
        errors.thumbnail = "Please choose an image file to upload or switch to AI mode.";
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Form Submission -> Generates 20 Questions
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitNotice(null);

    if (isGuestOrAnonymous) {
      router.push("/login?redirect=%2Fcreate");
      return;
    }

    if (isSubmitting) return;

    if (!validateForm()) {
      return;
    }

    if (quota && !quota.allowed) {
      setSubmitNotice({
        type: "warning",
        title: "Daily Allowance Exhausted",
        message: quota.isPro
          ? "You have used all 10 generations for today. Daily quota resets at midnight IST (00:00 IST)."
          : "You have used your 1 free generation today. Daily quota resets at midnight IST (00:00 IST). Upgrade to Quizzy Pro (₹19/7 days) for 10 daily generations.",
      });
      return;
    }

    const selectedCategory = categories.find((c) => (c.id || c.slug) === selectedCategoryId);
    const categoryName =
      selectedCategoryId === "other"
        ? customCategoryName.trim() || "Other"
        : selectedCategory?.name || selectedCategoryId;

    setIsSubmitting(true);

    try {
      const payload: any = {
        categoryId: selectedCategoryId === "other" ? undefined : selectedCategoryId,
        categorySlug: selectedCategory?.slug,
        categoryName,
        topic: topic.trim(),
        thumbnailMode,
      };

      if (thumbnailMode === "url" && imageUrlInput.trim()) {
        payload.thumbnailUrl = imageUrlInput.trim();
      } else if (thumbnailMode === "upload" && uploadedBase64) {
        payload.thumbnailUploadData = {
          base64: uploadedBase64,
          mimeType: uploadedMimeType,
          fileName: uploadedFileName || "upload.jpg",
        };
      }

      const response = await api.post<{
        success: boolean;
        message: string;
        data: {
          topic: string;
          categoryName: string;
          categoryId?: string;
          categorySlug?: string;
          thumbnailUrl: string;
          thumbnailSource: "ai" | "url" | "upload" | "default";
          storageMetadata?: Record<string, any>;
          questions: GeneratedQuestion[];
          quota: QuotaStatus;
        };
      }>("/quizzes/generate", payload);

      if (response?.data?.questions && response.data.questions.length === 20) {
        // Transition to Interactive Preview & Editor
        setEditingQuiz({
          isNew: true,
          topic: response.data.topic,
          categoryName: response.data.categoryName,
          categoryId: response.data.categoryId,
          categorySlug: response.data.categorySlug,
          thumbnailUrl: response.data.thumbnailUrl,
          thumbnailSource: response.data.thumbnailSource,
          storageMetadata: response.data.storageMetadata,
          questions: response.data.questions,
        });

        if (response.data.quota) {
          setQuota(response.data.quota);
        }
      }
    } catch (err: any) {
      const statusCode = err?.statusCode || err?.status;
      let message = err?.message || "An unexpected error occurred while generating the quiz.";

      if (statusCode === 401) {
        router.push("/login?redirect=%2Fcreate");
        return;
      }

      if (statusCode === 429) {
        message = quota?.isPro
          ? "Daily Pro quota reached (10/10 quizzes). Quota resets at midnight IST (00:00 IST)."
          : "Daily Free quota reached (1/1 quiz). Quota resets at midnight IST (00:00 IST). Upgrade to Pro for 10 daily quizzes.";
        fetchQuota();
      } else if (statusCode === 502) {
        message = "The AI generation provider is temporarily busy. Please wait a moment and click Generate again.";
      }

      setSubmitNotice({
        type: statusCode === 429 ? "warning" : "error",
        title: statusCode === 429 ? "Daily Quota Limit Reached" : "Generation Request Failed",
        message,
        details: err?.data?.message || undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Client-side Validation Before Saving
  const validateDraftBeforeSave = (): boolean => {
    if (!editingQuiz) return false;

    if (!editingQuiz.topic || editingQuiz.topic.trim().length < 2) {
      alert("Quiz title/topic must be at least 2 characters long.");
      return false;
    }

    if (editingQuiz.topic.trim().length > 100) {
      alert("Quiz title/topic cannot exceed 100 characters.");
      return false;
    }

    for (let i = 0; i < editingQuiz.questions.length; i++) {
      const q = editingQuiz.questions[i];
      if (!q.question || q.question.trim().length < 5) {
        alert(`Question #${i + 1} must be at least 5 characters long.`);
        return false;
      }
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        alert(`Question #${i + 1} must have exactly 4 options.`);
        return false;
      }
      for (let j = 0; j < 4; j++) {
        if (!q.options[j] || q.options[j].trim().length < 1) {
          alert(`Question #${i + 1}, option ${String.fromCharCode(65 + j)} cannot be empty.`);
          return false;
        }
      }
      if (typeof q.correctAnswer !== "number" || q.correctAnswer < 0 || q.correctAnswer > 3) {
        alert(`Question #${i + 1} must have a valid correct answer option selected.`);
        return false;
      }
    }

    return true;
  };

  // Save Quiz (Private by Default)
  const handleSaveQuiz = async () => {
    if (!editingQuiz || isSavingQuiz) return;

    if (!validateDraftBeforeSave()) {
      return;
    }

    setIsSavingQuiz(true);

    try {
      if (editingQuiz.isNew) {
        await api.post("/quizzes", {
          title: editingQuiz.topic.trim(),
          topic: editingQuiz.topic.trim(),
          categoryName: editingQuiz.categoryName,
          categoryId: editingQuiz.categoryId || undefined,
          categorySlug: editingQuiz.categorySlug || undefined,
          thumbnailUrl: editingQuiz.thumbnailUrl,
          thumbnailSource: editingQuiz.thumbnailSource,
          storageMetadata: editingQuiz.storageMetadata || {},
          questions: editingQuiz.questions.map((q, idx) => ({
            questionId: q.questionId || `q_${Date.now()}_${idx + 1}`,
            question: q.question.trim(),
            options: [
              q.options[0].trim(),
              q.options[1].trim(),
              q.options[2].trim(),
              q.options[3].trim(),
            ],
            correctAnswer: q.correctAnswer,
            explanation: q.explanation?.trim() || `Key fact about ${editingQuiz.topic}`,
            difficulty: "easy",
          })),
          isPrivate: true,
          isPublished: false,
        });
        setSuccessBanner(`Quiz "${editingQuiz.topic}" saved privately to My Quizzes!`);
      } else if (editingQuiz.quizId) {
        await api.patch(`/quizzes/${editingQuiz.quizId}`, {
          title: editingQuiz.topic.trim(),
          topic: editingQuiz.topic.trim(),
          thumbnailUrl: editingQuiz.thumbnailUrl,
          thumbnailSource: editingQuiz.thumbnailSource,
          storageMetadata: editingQuiz.storageMetadata,
          questions: editingQuiz.questions,
        });
        setSuccessBanner(`Quiz "${editingQuiz.topic}" updated successfully!`);
      }

      setEditingQuiz(null);
      setActiveTab("my-quizzes");
      fetchMyQuizzes();
    } catch (err: any) {
      alert(err?.message || "Failed to save quiz. Please try again.");
    } finally {
      setIsSavingQuiz(false);
    }
  };

  // Toggle Publish Status
  const handleTogglePublish = async (quiz: UserQuiz) => {
    try {
      const nextPublishState = !quiz.isPublished;
      await api.patch(`/quizzes/${quiz._id}/publish`, {
        publish: nextPublishState,
      });
      setMyQuizzes((prev) =>
        prev.map((q) =>
          q._id === quiz._id
            ? { ...q, isPublished: nextPublishState, isPrivate: !nextPublishState }
            : q
        )
      );
      setSuccessBanner(
        nextPublishState
          ? `Quiz "${quiz.title}" is now published and available via share link!`
          : `Quiz "${quiz.title}" is now set to private.`
      );
    } catch (err: any) {
      alert(err?.message || "Failed to update quiz visibility.");
    }
  };

  // Delete Quiz
  const handleDeleteQuiz = async (quizId: string) => {
    try {
      await api.delete(`/quizzes/${quizId}`);
      setMyQuizzes((prev) => prev.filter((q) => q._id !== quizId));
      setDeleteConfirmId(null);
      setSuccessBanner("Quiz deleted successfully.");
    } catch (err: any) {
      alert(err?.message || "Failed to delete quiz.");
    }
  };

  // Copy Direct Link
  const handleCopyLink = (shareId: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const directUrl = `${origin}/quiz/${shareId}`;
    navigator.clipboard.writeText(directUrl);
    setCopiedShareId(shareId);
    setTimeout(() => setCopiedShareId(null), 2500);
  };

  // Loading State
  if (isUserLoading) {
    return (
      <div className="w-full min-h-[50vh] flex flex-col items-center justify-center p-8 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-[#7C3AED]" />
        <p className="text-sm font-black text-stone-600">Loading AI Quiz Creator...</p>
      </div>
    );
  }

  // Unauthenticated State
  if (isGuestOrAnonymous) {
    return (
      <div className="w-full max-w-2xl mx-auto py-8 sm:py-12">
        <div className="bg-[#FAF7EE] border-[2.5px] border-black rounded-[28px] p-6 sm:p-8 shadow-[5px_5px_0px_#000] text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-[#FFE600] border-2 border-black mx-auto flex items-center justify-center shadow-[2px_2px_0px_#000]">
            <Lock className="w-7 h-7 text-black stroke-[2.5]" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-black">
              Sign In to Create Quizzes with AI
            </h1>
            <p className="text-xs sm:text-sm font-bold text-stone-600 max-w-md mx-auto leading-relaxed">
              To generate, customize, and save 20-question AI quizzes with custom thumbnails, please log in with your persistent account.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/login?redirect=%2Fcreate"
              className="w-full sm:w-auto px-6 py-3 rounded-full bg-[#FFE600] hover:bg-[#FACC15] text-black font-black text-sm uppercase tracking-wider border-2 border-black shadow-[3px_3px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Log In to Continue</span>
              <ArrowRight className="w-4 h-4 stroke-[3]" />
            </Link>
            <Link
              href="/"
              className="w-full sm:w-auto px-5 py-3 rounded-full bg-white hover:bg-stone-50 text-stone-800 font-black text-sm border-2 border-black shadow-[2px_2px_0px_#000] transition-all"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: INTERACTIVE QUESTION PREVIEW & EDITOR (STEP 2)
  // =========================================================================
  if (editingQuiz) {
    return (
      <div className="w-full max-w-5xl mx-auto py-2 sm:py-4 select-none space-y-6">
        {/* Editor Top Bar with Editable Title & Thumbnail */}
        <div className="bg-[#FAF7EE] border-[2.5px] border-black rounded-[24px] p-4 sm:p-6 shadow-[4px_4px_0px_#000] flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 w-full sm:w-auto">
              {/* Thumbnail with Hover "Change" Trigger */}
              <div className="relative group w-18 h-18 sm:w-20 sm:h-20 rounded-2xl border-2 border-black overflow-hidden shrink-0 bg-stone-100 shadow-[2px_2px_0px_#000]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={editingQuiz.thumbnailUrl}
                  alt={editingQuiz.topic}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setShowThumbEditor((prev) => !prev)}
                  className="absolute inset-0 bg-black/70 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-black uppercase tracking-wider cursor-pointer"
                  title="Change cover thumbnail"
                >
                  <ImageIcon className="w-4 h-4 mb-0.5" />
                  <span>Change</span>
                </button>
              </div>

              {/* Editable Quiz Title & Category */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#FFE600] border border-black">
                    {editingQuiz.categoryName}
                  </span>
                  <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-black">
                    Saved Privately by Default
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowThumbEditor((prev) => !prev)}
                    className="text-[11px] font-black text-[#7C3AED] hover:underline flex items-center gap-1 cursor-pointer ml-1"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Change Cover</span>
                  </button>
                </div>

                <div className="relative pt-1">
                  <Input
                    value={editingQuiz.topic}
                    maxLength={100}
                    onChange={(e) =>
                      setEditingQuiz((prev) =>
                        prev ? { ...prev, topic: e.target.value } : null
                      )
                    }
                    placeholder="Enter quiz title or topic..."
                    className="h-10 text-base sm:text-lg font-black border-2 border-black rounded-xl bg-white focus:bg-stone-50 shadow-[2px_2px_0px_#000]"
                  />
                </div>
              </div>
            </div>

            {/* Editor Action Buttons */}
            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingQuiz(null)}
                className="h-11 px-4 rounded-xl border-2 border-black font-black text-xs uppercase bg-white hover:bg-stone-50 text-stone-800 cursor-pointer"
              >
                Back to Creator
              </Button>
              <Button
                type="button"
                disabled={isSavingQuiz}
                onClick={handleSaveQuiz}
                className="h-11 px-6 rounded-xl border-2 border-black font-black text-xs uppercase bg-[#FFE600] hover:bg-[#FACC15] text-black shadow-[3px_3px_0px_#000] flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSavingQuiz ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Save Quiz to My Quizzes</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* INLINE THUMBNAIL CHANGER PANEL */}
          {showThumbEditor && (
            <div className="p-4 rounded-2xl bg-white border-2 border-black shadow-[3px_3px_0px_#000] space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-black flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-[#7C3AED]" />
                  <span>Update Cover Thumbnail</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowThumbEditor(false)}
                  className="p-1 rounded-lg text-stone-400 hover:text-black cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {thumbUpdateError && (
                <div className="p-2.5 rounded-xl bg-red-100 border border-red-300 text-red-900 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{thumbUpdateError}</span>
                </div>
              )}

              {/* Mode Selector Tabs */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setThumbEditorMode("ai")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border transition-all cursor-pointer",
                    thumbEditorMode === "ai"
                      ? "bg-[#FFE600] text-black border-black shadow-[1.5px_1.5px_0px_#000]"
                      : "bg-stone-100 text-stone-700 border-stone-300"
                  )}
                >
                  Regenerate with AI
                </button>
                <button
                  type="button"
                  onClick={() => setThumbEditorMode("url")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border transition-all cursor-pointer",
                    thumbEditorMode === "url"
                      ? "bg-[#FFE600] text-black border-black shadow-[1.5px_1.5px_0px_#000]"
                      : "bg-stone-100 text-stone-700 border-stone-300"
                  )}
                >
                  Image URL
                </button>
                <button
                  type="button"
                  onClick={() => setThumbEditorMode("upload")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border transition-all cursor-pointer",
                    thumbEditorMode === "upload"
                      ? "bg-[#FFE600] text-black border-black shadow-[1.5px_1.5px_0px_#000]"
                      : "bg-stone-100 text-stone-700 border-stone-300"
                  )}
                >
                  Upload File
                </button>
              </div>

              {/* Mode-specific actions */}
              {thumbEditorMode === "ai" && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200">
                  <span className="text-xs font-bold text-stone-600">
                    Regenerate custom cover artwork for &quot;{editingQuiz.topic}&quot;
                  </span>
                  <Button
                    type="button"
                    disabled={isUpdatingThumb}
                    onClick={() => handleChangeThumbnail("ai")}
                    className="h-9 px-4 rounded-xl border border-black bg-[#FFE600] hover:bg-[#FACC15] text-black font-black text-xs uppercase cursor-pointer"
                  >
                    {isUpdatingThumb ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                        <span>Generate New AI Art</span>
                      </>
                    )}
                  </Button>
                </div>
              )}

              {thumbEditorMode === "url" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="url"
                    value={thumbEditorUrl}
                    onChange={(e) => setThumbEditorUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/... or any public HTTPS image URL"
                    className="h-10 text-xs font-bold border-2 border-black rounded-xl bg-[#FAF7EE] focus:bg-white"
                  />
                  <Button
                    type="button"
                    disabled={isUpdatingThumb || !thumbEditorUrl.trim()}
                    onClick={() => handleChangeThumbnail("url")}
                    className="h-10 px-4 rounded-xl border-2 border-black bg-[#FFE600] text-black font-black text-xs uppercase cursor-pointer shrink-0"
                  >
                    {isUpdatingThumb ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Apply URL"
                    )}
                  </Button>
                </div>
              )}

              {thumbEditorMode === "upload" && (
                <div>
                  <input
                    ref={changeThumbFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleUploadEditorThumbnail}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    disabled={isUpdatingThumb}
                    onClick={() => changeThumbFileInputRef.current?.click()}
                    className="w-full h-10 rounded-xl border-2 border-dashed border-black bg-stone-50 hover:bg-white text-black font-black text-xs uppercase flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isUpdatingThumb ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Uploading & Optimizing...</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4" />
                        <span>Select Image from Computer (JPEG, PNG, WebP)</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* List of 20 Editable Questions */}
        <div className="space-y-4">
          {editingQuiz.questions.map((q, qIndex) => (
            <div
              key={q.questionId || qIndex}
              className="bg-white border-[2.5px] border-black rounded-[20px] p-5 shadow-[3px_3px_0px_#000] space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-black flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#7C3AED] text-white text-xs flex items-center justify-center font-black">
                    {qIndex + 1}
                  </span>
                  <span>Question #{qIndex + 1}</span>
                </span>
                <span className="text-xs font-bold text-stone-400">
                  Click option to set as correct answer
                </span>
              </div>

              {/* Editable Question Text */}
              <Input
                value={q.question}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditingQuiz((prev) => {
                    if (!prev) return null;
                    const updated = [...prev.questions];
                    updated[qIndex] = { ...updated[qIndex], question: val };
                    return { ...prev, questions: updated };
                  });
                }}
                className="h-11 font-black text-sm sm:text-base border-2 border-black rounded-xl bg-[#FAF7EE] focus:bg-white"
              />

              {/* 4 Options with Radio Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {q.options.map((opt, optIndex) => {
                  const isCorrect = q.correctAnswer === optIndex;
                  return (
                    <div
                      key={optIndex}
                      onClick={() => {
                        setEditingQuiz((prev) => {
                          if (!prev) return null;
                          const updated = [...prev.questions];
                          updated[qIndex] = { ...updated[qIndex], correctAnswer: optIndex };
                          return { ...prev, questions: updated };
                        });
                      }}
                      className={cn(
                        "flex items-center gap-2.5 p-2 rounded-xl border-2 transition-all cursor-pointer",
                        isCorrect
                          ? "bg-[#DCFCE7] border-[#15803D] text-black shadow-[2px_2px_0px_#15803D]"
                          : "bg-white border-black/30 hover:border-black text-stone-800"
                      )}
                    >
                      <div
                        className={cn(
                          "w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 border border-black",
                          isCorrect ? "bg-[#15803D] text-white" : "bg-stone-100 text-stone-600"
                        )}
                      >
                        {String.fromCharCode(65 + optIndex)}
                      </div>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditingQuiz((prev) => {
                            if (!prev) return null;
                            const updated = [...prev.questions];
                            const newOptions = [...updated[qIndex].options] as [
                              string,
                              string,
                              string,
                              string
                            ];
                            newOptions[optIndex] = val;
                            updated[qIndex] = { ...updated[qIndex], options: newOptions };
                            return { ...prev, questions: updated };
                          });
                        }}
                        className="w-full bg-transparent border-none text-xs sm:text-sm font-bold focus:outline-none"
                      />
                      {isCorrect && (
                        <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Explanation Field */}
              <div className="pt-2 border-t border-black/10 flex items-center gap-2 text-xs font-bold text-stone-700">
                <span className="font-black uppercase text-stone-500 shrink-0">Explanation:</span>
                <input
                  type="text"
                  value={q.explanation}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditingQuiz((prev) => {
                      if (!prev) return null;
                      const updated = [...prev.questions];
                      updated[qIndex] = { ...updated[qIndex], explanation: val };
                      return { ...prev, questions: updated };
                    });
                  }}
                  className="w-full bg-[#FAF7EE] border border-stone-300 rounded-lg px-2.5 py-1 text-xs font-bold text-stone-800 focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Save Action */}
        <div className="flex items-center justify-end gap-3 pt-2 pb-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditingQuiz(null)}
            className="h-12 px-5 rounded-xl border-2 border-black font-black text-sm uppercase bg-white hover:bg-stone-50 text-stone-800 cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isSavingQuiz}
            onClick={handleSaveQuiz}
            className="h-12 px-8 rounded-xl border-2 border-black font-black text-sm uppercase bg-[#FFE600] hover:bg-[#FACC15] text-black shadow-[4px_4px_0px_#000] flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSavingQuiz ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Saving Quiz...</span>
              </>
            ) : (
              <>
                <Check className="w-5 h-5 stroke-[3]" />
                <span>Save Quiz to My Quizzes</span>
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MAIN VIEW: CREATOR FORM + SIDEBAR OR MY QUIZZES TAB
  // =========================================================================
  return (
    <div className="w-full max-w-6xl mx-auto py-2 sm:py-4 select-none space-y-6">
      {/* GLOBAL CELEBRATION / SUCCESS BANNER */}
      {successBanner && (
        <div className="p-4 rounded-2xl bg-[#DCFCE7] border-[2.5px] border-black shadow-[4px_4px_0px_#000] flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-[#15803D] shrink-0" />
            <span className="text-sm font-black text-[#15803D]">{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="p-1 rounded-lg text-stone-500 hover:text-black cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* NAVIGATION TABS: CREATE VS MY QUIZZES */}
      <div className="flex items-center justify-start gap-2.5 border-b-2 border-black/10 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("create")}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-black uppercase tracking-wider border-2 transition-all cursor-pointer",
            activeTab === "create"
              ? "bg-[#FFE600] text-black border-black shadow-[3px_3px_0px_#000]"
              : "bg-white text-stone-600 border-black/30 hover:border-black"
          )}
        >
          <Sparkles className="w-4 h-4" />
          <span>AI Quiz Creator</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("my-quizzes")}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-black uppercase tracking-wider border-2 transition-all cursor-pointer",
            activeTab === "my-quizzes"
              ? "bg-[#FFE600] text-black border-black shadow-[3px_3px_0px_#000]"
              : "bg-white text-stone-600 border-black/30 hover:border-black"
          )}
        >
          <BookOpen className="w-4 h-4" />
          <span>My Quizzes</span>
          {myQuizzes.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-black text-white text-xs flex items-center justify-center font-black">
              {myQuizzes.length}
            </span>
          )}
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 2: MY QUIZZES DASHBOARD */}
      {/* ===================================================================== */}
      {activeTab === "my-quizzes" ? (
        <div className="space-y-6">
          {/* Top Heading & Action */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-black">My Created Quizzes</h2>
              <p className="text-xs sm:text-sm font-bold text-stone-600">
                Manage, publish, share, and review quizzes created with AI.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => setActiveTab("create")}
              className="h-10 px-4 rounded-xl border-2 border-black font-black text-xs uppercase bg-[#FFE600] hover:bg-[#FACC15] text-black shadow-[2px_2px_0px_#000] cursor-pointer"
            >
              + Create New Quiz
            </Button>
          </div>

          {/* Summary Statistics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white border-2 border-black rounded-2xl p-4 shadow-[3px_3px_0px_#000]">
              <div className="text-[11px] font-black uppercase tracking-wider text-stone-500">
                Total Owned Quizzes
              </div>
              <div className="text-2xl font-black text-black mt-0.5">{myQuizzes.length}</div>
            </div>
            <div className="bg-[#DCFCE7] border-2 border-black rounded-2xl p-4 shadow-[3px_3px_0px_#000]">
              <div className="text-[11px] font-black uppercase tracking-wider text-[#15803D]">
                Public / Published
              </div>
              <div className="text-2xl font-black text-[#15803D] mt-0.5">{publishedCount}</div>
            </div>
            <div className="bg-[#FAF7EE] border-2 border-black rounded-2xl p-4 shadow-[3px_3px_0px_#000]">
              <div className="text-[11px] font-black uppercase tracking-wider text-stone-700">
                Private Drafts
              </div>
              <div className="text-2xl font-black text-stone-800 mt-0.5">{privateCount}</div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Status Pills */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              {(["all", "published", "private"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFilterStatus(status)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border-2 transition-all cursor-pointer",
                    filterStatus === status
                      ? "bg-[#FFE600] text-black border-black shadow-[2px_2px_0px_#000]"
                      : "bg-white text-stone-600 border-black/30 hover:border-black"
                  )}
                >
                  {status === "all"
                    ? `All (${myQuizzes.length})`
                    : status === "published"
                    ? `Public (${publishedCount})`
                    : `Private (${privateCount})`}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title or category..."
                className="h-10 pl-9 pr-3 text-xs font-bold border-2 border-black rounded-xl bg-white shadow-[2px_2px_0px_#000]"
              />
            </div>
          </div>

          {/* Dashboard List */}
          {loadingMyQuizzes ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-7 h-7 animate-spin text-[#7C3AED]" />
              <p className="text-xs font-black text-stone-500">Loading your quizzes...</p>
            </div>
          ) : myQuizzes.length === 0 ? (
            <div className="bg-white border-2 border-black rounded-[24px] p-8 text-center space-y-4 shadow-[4px_4px_0px_#000]">
              <div className="w-12 h-12 rounded-2xl bg-[#EDE9FE] border-2 border-black mx-auto flex items-center justify-center shadow-[2px_2px_0px_#000]">
                <BookOpen className="w-6 h-6 text-[#7C3AED]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-black">No Quizzes Created Yet</h3>
                <p className="text-xs sm:text-sm font-bold text-stone-600 max-w-sm mx-auto">
                  You haven&apos;t generated any quizzes yet. Use the AI Quiz Creator to generate a 20-question quiz in seconds!
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setActiveTab("create")}
                className="h-11 px-6 rounded-xl border-2 border-black font-black text-xs uppercase bg-[#FFE600] text-black shadow-[3px_3px_0px_#000] cursor-pointer"
              >
                Create Your First Quiz
              </Button>
            </div>
          ) : filteredQuizzes.length === 0 ? (
            <div className="bg-white border-2 border-black rounded-2xl p-6 text-center space-y-2 shadow-[2px_2px_0px_#000]">
              <p className="text-sm font-bold text-stone-600">
                No quizzes match &quot;{searchQuery}&quot; under the &quot;{filterStatus}&quot; filter.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setFilterStatus("all");
                }}
                className="text-xs font-black text-[#7C3AED] hover:underline cursor-pointer"
              >
                Clear Search & Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredQuizzes.map((quiz) => (
                <div
                  key={quiz._id}
                  className="bg-white border-[2.5px] border-black rounded-[20px] p-4 sm:p-5 shadow-[3px_3px_0px_#000] flex flex-col justify-between space-y-4"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-16 h-16 rounded-xl border-2 border-black overflow-hidden shrink-0 bg-stone-100 shadow-[2px_2px_0px_#000]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={quiz.thumbnailUrl}
                        alt={quiz.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FFE600] border border-black">
                          {quiz.categoryName}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                            quiz.isPublished
                              ? "bg-[#DCFCE7] text-[#15803D] border-[#15803D]"
                              : "bg-stone-100 text-stone-600 border-black/40"
                          )}
                        >
                          {quiz.isPublished ? "Public" : "Private"}
                        </span>
                      </div>
                      <h3 className="text-base font-black text-black truncate mt-1">
                        {quiz.title}
                      </h3>
                      <p className="text-xs font-bold text-stone-500">
                        {quiz.questions?.length || 20} Questions • Created{" "}
                        {new Date(quiz.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-2 border-t border-black/10 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditingQuiz({
                            isNew: false,
                            quizId: quiz._id,
                            topic: quiz.title,
                            categoryName: quiz.categoryName,
                            categoryId: quiz.categoryId || undefined,
                            categorySlug: quiz.categorySlug,
                            thumbnailUrl: quiz.thumbnailUrl,
                            thumbnailSource: quiz.thumbnailSource,
                            storageMetadata: quiz.storageMetadata,
                            questions: quiz.questions,
                          })
                        }
                        className="h-8 px-2.5 text-xs font-black rounded-lg border border-black bg-stone-50 hover:bg-stone-100 text-black flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleTogglePublish(quiz)}
                        className={cn(
                          "h-8 px-2.5 text-xs font-black rounded-lg border border-black flex items-center gap-1 cursor-pointer",
                          quiz.isPublished
                            ? "bg-[#DCFCE7] text-[#15803D] hover:bg-[#bbf7d0]"
                            : "bg-white text-stone-800 hover:bg-stone-50"
                        )}
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>{quiz.isPublished ? "Unpublish" : "Publish"}</span>
                      </Button>

                      {quiz.isPublished && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopyLink(quiz.shareId)}
                          className="h-8 px-2.5 text-xs font-black rounded-lg border border-black bg-white hover:bg-stone-50 text-black flex items-center gap-1 cursor-pointer"
                        >
                          {copiedShareId === quiz.shareId ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-[#15803D]" />
                              <span className="text-[#15803D]">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Link</span>
                            </>
                          )}
                        </Button>
                      )}
                    </div>

                    {/* Delete with Confirmation */}
                    {deleteConfirmId === quiz._id ? (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleDeleteQuiz(quiz._id)}
                          className="h-8 px-2 text-xs font-black rounded-lg bg-red-600 text-white border border-black hover:bg-red-700 cursor-pointer"
                        >
                          Confirm
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setDeleteConfirmId(null)}
                          className="h-8 px-2 text-xs font-black rounded-lg border border-black bg-stone-100 cursor-pointer"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteConfirmId(quiz._id)}
                        className="h-8 px-2 text-xs text-stone-400 hover:text-red-600 rounded-lg cursor-pointer"
                        title="Delete quiz"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* =================================================================== */
        /* TAB 1: CREATOR FORM + SIDEBAR */
        /* =================================================================== */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ================================================================= */}
          {/* LEFT COLUMN: THE CREATION FORM */}
          {/* ================================================================= */}
          <div className="lg:col-span-7 xl:col-span-8">
            <form onSubmit={handleGenerate} className="space-y-6">
              <div className="bg-white border-[2.5px] border-black rounded-[24px] p-5 sm:p-7 shadow-[4px_4px_0px_#000] space-y-6">
                {/* STEP 1: CATEGORY SELECTOR */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm sm:text-base font-black uppercase tracking-wider text-black flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-full bg-black text-white text-xs flex items-center justify-center font-black">
                        1
                      </span>
                      <span>Choose Category</span>
                    </label>
                    {fieldErrors.category && (
                      <span className="text-xs sm:text-sm font-black text-red-600 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {fieldErrors.category}
                      </span>
                    )}
                  </div>

                  {loadingCategories ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div
                          key={i}
                          className="h-12 rounded-xl bg-stone-100 border-2 border-stone-200 animate-pulse"
                        />
                      ))}
                    </div>
                  ) : categoriesError ? (
                    <div className="p-3 rounded-xl bg-red-50 border-2 border-red-300 text-red-800 text-xs font-bold flex items-center justify-between">
                      <span>{categoriesError}</span>
                      <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="px-2 py-1 rounded bg-red-200 text-xs font-black cursor-pointer"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {categories.map((cat) => {
                        const id = cat.id || cat.slug;
                        const isSelected = selectedCategoryId === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => {
                              setSelectedCategoryId(id);
                              if (fieldErrors.category) {
                                setFieldErrors((prev) => ({ ...prev, category: undefined }));
                              }
                            }}
                            className={cn(
                              "flex items-center gap-2.5 px-3.5 py-3 rounded-xl border-2 text-left transition-all cursor-pointer",
                              isSelected
                                ? "bg-[#FFE600] text-black border-black shadow-[3px_3px_0px_#000] scale-[1.02]"
                                : "bg-[#FAF7EE] hover:bg-white text-stone-800 border-black/70 hover:border-black shadow-[2px_2px_0px_rgba(0,0,0,0.08)]"
                            )}
                          >
                            <div
                              className={cn(
                                "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border border-black",
                                isSelected ? "bg-white text-black" : "bg-stone-100 text-stone-700"
                              )}
                            >
                              {getCategoryIcon(cat.slug, "w-4 h-4")}
                            </div>
                            <span className="text-sm font-black truncate">{cat.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Optional Custom Category Name when "Other" is picked */}
                  {selectedCategoryId === "other" && (
                    <div className="pt-1.5 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                      <label
                        htmlFor="custom-category-input"
                        className="text-xs font-black uppercase tracking-wide text-stone-700 block"
                      >
                        Custom Category Name <span className="text-stone-400 font-bold">(Optional)</span>
                      </label>
                      <Input
                        id="custom-category-input"
                        type="text"
                        maxLength={40}
                        value={customCategoryName}
                        onChange={(e) => setCustomCategoryName(e.target.value)}
                        placeholder="e.g. History, Philosophy, Psychology, K-Pop"
                        className="h-11 px-4 bg-[#FAF7EE] border-2 border-black rounded-xl text-sm font-black text-black placeholder:text-stone-400 focus:bg-white shadow-[2px_2px_0px_#000]"
                      />
                    </div>
                  )}
                </div>

                {/* STEP 2: TOPIC / SUBJECT INPUT */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="topic-input"
                      className="text-sm sm:text-base font-black uppercase tracking-wider text-black flex items-center gap-2.5"
                    >
                      <span className="w-6 h-6 rounded-full bg-black text-white text-xs flex items-center justify-center font-black">
                        2
                      </span>
                      <span>Enter Quiz Topic or Focus</span>
                    </label>
                    {fieldErrors.topic && (
                      <span className="text-xs sm:text-sm font-black text-red-600 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {fieldErrors.topic}
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <Input
                      id="topic-input"
                      type="text"
                      maxLength={100}
                      value={topic}
                      onChange={(e) => {
                        setTopic(e.target.value);
                        if (fieldErrors.topic) {
                          setFieldErrors((prev) => ({ ...prev, topic: undefined }));
                        }
                      }}
                      placeholder="e.g. Inception (2010 Film), Cricket World Cup 2011, Python Async/Await, Naruto Shippuden"
                      className="h-13 px-4 bg-[#FAF7EE] border-2 border-black rounded-xl text-base font-black text-black placeholder:text-sm placeholder:text-stone-400 placeholder:font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-black shadow-[2px_2px_0px_#000]"
                    />
                    <span className="absolute right-3.5 top-4 text-xs font-bold text-stone-400">
                      {topic.length}/100
                    </span>
                  </div>
                  <p className="text-xs font-bold text-stone-600">
                    Be specific! The AI generates 20 beginner-friendly multiple-choice questions with 4 options and explanations.
                  </p>
                </div>

                {/* STEP 3: OPTIONAL THUMBNAIL SECTION (BEFORE GENERATE BUTTON) */}
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-sm sm:text-base font-black uppercase tracking-wider text-black flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-full bg-black text-white text-xs flex items-center justify-center font-black">
                        3
                      </span>
                      <span>Quiz Cover Thumbnail <span className="text-stone-400 font-bold lowercase">(optional)</span></span>
                    </label>
                    {fieldErrors.thumbnail && (
                      <span className="text-xs sm:text-sm font-black text-red-600 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {fieldErrors.thumbnail}
                      </span>
                    )}
                  </div>

                  {/* 3 Choices: AI, Image URL, Upload */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setThumbnailMode("ai")}
                      className={cn(
                        "p-3 rounded-xl border-2 text-left transition-all cursor-pointer flex items-center gap-2.5",
                        thumbnailMode === "ai"
                          ? "bg-[#FFE600] text-black border-black shadow-[3px_3px_0px_#000] scale-[1.01]"
                          : "bg-[#FAF7EE] hover:bg-white text-stone-800 border-black/70 hover:border-black"
                      )}
                    >
                      <Sparkles className="w-4 h-4 shrink-0 text-black" />
                      <div>
                        <div className="text-xs font-black uppercase">Generate with AI</div>
                        <div className="text-[10px] font-bold text-stone-600">Default choice</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setThumbnailMode("url")}
                      className={cn(
                        "p-3 rounded-xl border-2 text-left transition-all cursor-pointer flex items-center gap-2.5",
                        thumbnailMode === "url"
                          ? "bg-[#FFE600] text-black border-black shadow-[3px_3px_0px_#000] scale-[1.01]"
                          : "bg-[#FAF7EE] hover:bg-white text-stone-800 border-black/70 hover:border-black"
                      )}
                    >
                      <LinkIcon className="w-4 h-4 shrink-0 text-black" />
                      <div>
                        <div className="text-xs font-black uppercase">Use an Image URL</div>
                        <div className="text-[10px] font-bold text-stone-600">Secure HTTPS link</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setThumbnailMode("upload")}
                      className={cn(
                        "p-3 rounded-xl border-2 text-left transition-all cursor-pointer flex items-center gap-2.5",
                        thumbnailMode === "upload"
                          ? "bg-[#FFE600] text-black border-black shadow-[3px_3px_0px_#000] scale-[1.01]"
                          : "bg-[#FAF7EE] hover:bg-white text-stone-800 border-black/70 hover:border-black"
                      )}
                    >
                      <UploadCloud className="w-4 h-4 shrink-0 text-black" />
                      <div>
                        <div className="text-xs font-black uppercase">Upload an Image</div>
                        <div className="text-[10px] font-bold text-stone-600">JPEG, PNG, WebP</div>
                      </div>
                    </button>
                  </div>

                  {/* Mode-Specific Sub-Panels */}
                  {thumbnailMode === "ai" && (
                    <div className="p-3 rounded-xl bg-[#FAF7EE] border border-black/20 text-xs font-bold text-stone-700 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#7C3AED] shrink-0" />
                      <span>
                        AI generates a tailored cover artwork for your topic. If the image provider is busy, a default fallback thumbnail is automatically applied without failing the quiz!
                      </span>
                    </div>
                  )}

                  {thumbnailMode === "url" && (
                    <div className="space-y-2 pt-1 animate-in fade-in duration-150">
                      <div className="relative">
                        <Input
                          type="url"
                          value={imageUrlInput}
                          onChange={(e) => handleUrlChange(e.target.value)}
                          placeholder="https://images.unsplash.com/... or any public HTTPS image link"
                          className="h-11 px-4 bg-[#FAF7EE] border-2 border-black rounded-xl text-xs sm:text-sm font-bold text-black focus:bg-white"
                        />
                      </div>
                      <p className="text-[11px] font-bold text-stone-500">
                        URLs are validated securely against SSRF, internal network hops, and content types before saving to Cloudinary.
                      </p>
                      {imageUrlPreview && (
                        <div className="flex items-center gap-3 p-2 bg-stone-50 border border-black/30 rounded-xl">
                          <div className="w-12 h-12 rounded-lg border border-black overflow-hidden bg-stone-200 shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imageUrlPreview}
                              alt="URL Preview"
                              className="w-full h-full object-cover"
                              onError={() => setImageUrlPreview(null)}
                            />
                          </div>
                          <span className="text-xs font-bold text-stone-700 truncate">
                            Valid HTTPS Image Preview Ready
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {thumbnailMode === "upload" && (
                    <div className="space-y-2 pt-1 animate-in fade-in duration-150">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="image-file-upload"
                      />

                      {uploadedBase64 ? (
                        <div className="flex items-center justify-between p-3 bg-stone-50 border-2 border-black rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg border border-black overflow-hidden bg-stone-200 shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={uploadedBase64}
                                alt="Upload Preview"
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div>
                              <p className="text-xs font-black text-black truncate max-w-xs">
                                {uploadedFileName || "Uploaded image"}
                              </p>
                              <p className="text-[10px] font-bold text-stone-500">
                                Ready to upload to Cloudinary (Max 5MB)
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleClearUpload}
                            className="p-1 rounded-lg text-stone-400 hover:text-red-600 hover:bg-stone-200 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label
                          htmlFor="image-file-upload"
                          className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-black/50 hover:border-black rounded-xl bg-[#FAF7EE] hover:bg-white transition-all cursor-pointer text-center space-y-1.5"
                        >
                          <UploadCloud className="w-6 h-6 text-stone-600" />
                          <span className="text-xs font-black text-black uppercase">
                            Click to Select Image File
                          </span>
                          <span className="text-[10px] font-bold text-stone-500">
                            JPEG, PNG, or WebP up to 5MB
                          </span>
                        </label>
                      )}
                    </div>
                  )}
                </div>

                {/* SUBMISSION STATUS NOTICE */}
                {submitNotice && (
                  <div
                    className={cn(
                      "p-4 rounded-2xl border-2 border-black shadow-[3px_3px_0px_#000] space-y-2",
                      submitNotice.type === "error"
                        ? "bg-red-100 text-red-950"
                        : submitNotice.type === "warning"
                        ? "bg-amber-100 text-amber-950"
                        : "bg-[#CFFAFE] text-[#0C4A6E]"
                    )}
                  >
                    <div className="flex items-center gap-2 font-black text-sm sm:text-base">
                      <Info className="w-4 h-4 shrink-0" />
                      <span>{submitNotice.title}</span>
                    </div>
                    <p className="text-xs sm:text-sm font-bold leading-relaxed">{submitNotice.message}</p>
                    {submitNotice.details && (
                      <p className="text-xs font-medium opacity-90 leading-normal pt-1.5 border-t border-black/10">
                        {submitNotice.details}
                      </p>
                    )}
                    {submitNotice.type === "warning" && !quota?.isPro && (
                      <div className="pt-1.5">
                        <button
                          type="button"
                          onClick={handleInitiateProUpgrade}
                          disabled={isPaymentLoading || isVerifyingPayment}
                          className="px-4 py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-black uppercase tracking-wider border-2 border-black shadow-[2px_2px_0px_#000] hover:shadow-[3px_3px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          {isPaymentLoading || isVerifyingPayment ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                              <span>Connecting to Checkout...</span>
                            </>
                          ) : (
                            <>
                              <Crown className="w-3.5 h-3.5 fill-white" />
                              <span>Upgrade to Quizzy Pro (₹19) — Get 10 Quizzes/Day</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* GENERATE BUTTON */}
                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={isSubmitting || (quota !== null && !quota.allowed)}
                    className="w-full h-13 sm:h-14 rounded-2xl bg-[#FFE600] hover:bg-[#FACC15] text-black font-black text-base sm:text-lg uppercase tracking-wider border-2 border-black shadow-[4px_4px_0px_#000] hover:shadow-[5px_5px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Generating 20 Questions with AI...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 fill-black" />
                        <span>Generate 20-Question Quiz with AI</span>
                        <ArrowRight className="w-5 h-5 stroke-[3]" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>

          {/* ================================================================= */}
          {/* RIGHT COLUMN: USER PROFILE & DAILY ALLOWANCE SIDEBAR */}
          {/* ================================================================= */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-4">
            <div className="bg-[#FAF7EE] border-[2.5px] border-black rounded-[24px] p-5 sm:p-6 shadow-[4px_4px_0px_#000] space-y-5">
              {/* User Profile Bar */}
              <div className="flex items-center justify-between border-b-2 border-black/10 pb-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#EDE9FE] border-2 border-black flex items-center justify-center font-black text-sm text-[#7C3AED]">
                    {currentUser?.displayName?.slice(0, 2).toUpperCase() || "ME"}
                  </div>
                  <div>
                    <span className="text-sm sm:text-base font-black text-black block leading-tight">
                      {currentUser?.displayName || currentUser?.username}
                    </span>
                    <span className="text-xs font-bold text-stone-500 block leading-tight mt-0.5">
                      Authenticated Player
                    </span>
                  </div>
                </div>
                <span
                  className={cn(
                    "text-xs font-black uppercase tracking-wider border-2 border-black px-2.5 py-1 rounded-lg shadow-[1.5px_1.5px_0px_#000]",
                    quota?.isPro ? "bg-[#EDE9FE] text-[#6D28D9]" : "bg-white text-stone-700"
                  )}
                >
                  {quota?.isPro ? "Quizzy Pro" : "Free Tier"}
                </span>
              </div>

              {/* Daily Allowance Cards */}
              <div className="space-y-3.5">
                {/* Free Tier Card */}
                <div className="p-4 rounded-2xl bg-white border-2 border-black shadow-[2px_2px_0px_#000] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[#DCFCE7] border border-black flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                      </div>
                      <span className="text-sm font-black text-black uppercase tracking-wide">
                        Free Daily Allowance
                      </span>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-black px-2.5 py-0.5 rounded-full border border-black",
                        quota && quota.remainingToday > 0 && !quota.isPro
                          ? "bg-[#DCFCE7] text-[#15803D]"
                          : "bg-stone-100 text-stone-600"
                      )}
                    >
                      {loadingQuota
                        ? "Checking..."
                        : quota?.isPro
                        ? "Pro Active"
                        : quota
                        ? `${quota.remainingToday}/1 Left`
                        : "1 / Day"}
                    </span>
                  </div>
                  <div className="pt-0.5 text-base font-black text-black">
                    1 successful generation / day
                  </div>
                  <p className="text-xs font-bold text-stone-600 leading-snug">
                    Free daily quota resets every day at midnight IST (00:00 IST).
                  </p>
                </div>

                {/* Quizzy Pro Pass Card */}
                <div className="p-4 rounded-2xl bg-[#EDE9FE] border-2 border-black shadow-[2px_2px_0px_#000] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[#FFE600] border border-black flex items-center justify-center shrink-0">
                        <Crown className="w-4 h-4 text-black fill-black" />
                      </div>
                      <span className="text-sm font-black text-[#5B21B6] uppercase tracking-wide">
                        Quizzy Pro Pass
                      </span>
                    </div>
                    <span className="text-xs font-black bg-[#7C3AED] text-white px-2 py-0.5 rounded-full border border-black shadow-[1px_1px_0px_#000]">
                      {quota?.isPro ? `${quota.remainingToday}/10 Left` : "₹19 / 7 days"}
                    </span>
                  </div>
                  <div className="pt-0.5 text-base font-black text-[#4C1D95]">
                    10 successful generations / day
                  </div>
                  <p className="text-xs font-bold text-[#6D28D9] leading-snug">
                    10x daily generation allowance resetting at midnight IST. Access lasts 7 days from payment.
                  </p>

                  {/* Interactive Upgrade / Extend Pro Button */}
                  <div className="pt-1">
                    {quota?.isPro ? (
                      <div className="space-y-2">
                        <div className="text-[11px] font-black text-[#5B21B6] flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 fill-[#5B21B6]" />
                          <span>
                            {quota.proExpiresAt
                              ? `Active until ${new Date(quota.proExpiresAt).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}`
                              : "Pro Active"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleInitiateProUpgrade}
                          disabled={isPaymentLoading || isVerifyingPayment}
                          className="w-full py-2 px-3 rounded-xl bg-white hover:bg-stone-50 text-[#5B21B6] border-2 border-black text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          {isPaymentLoading || isVerifyingPayment ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Processing...</span>
                            </>
                          ) : (
                            <>
                              <Crown className="w-3.5 h-3.5" />
                              <span>Extend Pro (+7 Days for ₹19)</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleInitiateProUpgrade}
                        disabled={isPaymentLoading || isVerifyingPayment}
                        className="w-full py-2.5 px-3 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white border-2 border-black text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_#000] hover:shadow-[3px_3px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {isPaymentLoading || isVerifyingPayment ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                            <span>Connecting to Checkout...</span>
                          </>
                        ) : (
                          <>
                            <Crown className="w-4 h-4 fill-white" />
                            <span>Upgrade to Pro — ₹19</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Quiz Perks Checklist */}
              <div className="pt-2 border-t-2 border-black/10 space-y-2.5">
                <div className="text-xs sm:text-sm font-black uppercase text-stone-800 tracking-wider">
                  What every quiz includes
                </div>
                <ul className="space-y-2 text-xs sm:text-sm font-bold text-stone-800">
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-[#15803D] stroke-[3] shrink-0" />
                    <span>20 beginner-friendly questions</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-[#15803D] stroke-[3] shrink-0" />
                    <span>4 options per question with 1 correct answer</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-[#15803D] stroke-[3] shrink-0" />
                    <span>Detailed educational explanations</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-[#15803D] stroke-[3] shrink-0" />
                    <span>Optional AI, URL, or uploaded cover thumbnail</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-[#15803D] stroke-[3] shrink-0" />
                    <span>Interactive preview & edit before saving</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-[#15803D] stroke-[3] shrink-0" />
                    <span>Saved privately by default, shareable with link</span>
                  </li>
                </ul>
              </div>

              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/80 border border-stone-300 text-stone-600 text-xs font-bold">
                <Info className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <span>
                  Quota tracking and secure image processing are enforced server-side.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuizCreatorClient;
