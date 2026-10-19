"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  Share2,
  CheckCircle2,
  ArrowRight,
  Loader2,
  Lock,
  Trophy,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApiClient } from "@/hooks/useApiClient";
import { UserQuiz } from "./QuizCreatorClient";
import { cn } from "@/lib/utils";

interface SharedQuizClientProps {
  shareId: string;
}

export function SharedQuizClient({ shareId }: SharedQuizClientProps) {
  const api = useApiClient();
  const [quiz, setQuiz] = useState<UserQuiz | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [expandedQuestions, setExpandedQuestions] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const fetchSharedQuiz = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await api.get<{ success: boolean; data: UserQuiz }>(
          `/quizzes/share/${shareId}`
        );
        if (isMounted && res?.data) {
          setQuiz(res.data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(
            err?.message ||
              "This quiz could not be found or has not been published yet."
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchSharedQuiz();
    return () => {
      isMounted = false;
    };
  }, [api, shareId]);

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (loading) {
    return (
      <div className="w-full min-h-[60vh] flex flex-col items-center justify-center p-8 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-[#7C3AED]" />
        <p className="text-sm font-black text-stone-600">Loading Quiz...</p>
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="w-full max-w-lg mx-auto py-12 px-4">
        <div className="bg-[#FAF7EE] border-[2.5px] border-black rounded-[28px] p-6 sm:p-8 shadow-[5px_5px_0px_#000] text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-200 border-2 border-black mx-auto flex items-center justify-center shadow-[2px_2px_0px_#000]">
            <Lock className="w-6 h-6 text-black" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-black">
            Quiz Unavailable
          </h1>
          <p className="text-xs sm:text-sm font-bold text-stone-600 leading-relaxed">
            {error || "This quiz is private or does not exist."}
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#FFE600] text-black font-black text-xs uppercase tracking-wider border-2 border-black shadow-[2px_2px_0px_#000]"
            >
              Browse Public Quizzes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto py-4 sm:py-8 px-4 select-none space-y-6">
      {/* Quiz Hero Card */}
      <div className="bg-white border-[2.5px] border-black rounded-[28px] p-5 sm:p-8 shadow-[5px_5px_0px_#000] space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6">
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-2 border-black overflow-hidden shrink-0 bg-stone-100 shadow-[3px_3px_0px_#000]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={quiz.thumbnailUrl}
              alt={quiz.title}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full bg-[#FFE600] border border-black shadow-[1px_1px_0px_#000]">
                {quiz.categoryName}
              </span>
              <span className="text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#DCFCE7] text-[#15803D] border border-black">
                Published Quiz
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-black">
              {quiz.title}
            </h1>

            <p className="text-xs sm:text-sm font-bold text-stone-600">
              20 Beginner-Friendly Questions • Created by QUIZZY Community Player
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row items-center gap-3 border-t-2 border-black/10">
          <Link
            href={`/lobby?customQuiz=${quiz._id}`}
            className="w-full sm:w-auto flex-1 h-12 rounded-xl bg-[#FFE600] hover:bg-[#FACC15] text-black font-black text-sm uppercase tracking-wider border-2 border-black shadow-[3px_3px_0px_#000] flex items-center justify-center gap-2"
          >
            <Trophy className="w-4 h-4 stroke-[2.5]" />
            <span>Challenge Friends in Live Lobby</span>
            <ArrowRight className="w-4 h-4 stroke-[3]" />
          </Link>

          <Button
            type="button"
            variant="outline"
            onClick={handleCopyLink}
            className="w-full sm:w-auto h-12 px-5 rounded-xl border-2 border-black font-black text-xs uppercase bg-white hover:bg-stone-50 text-stone-800 shadow-[2px_2px_0px_#000] flex items-center justify-center gap-2"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-[#15803D]" />
                <span className="text-[#15803D]">Link Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                <span>Share Quiz Link</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Question Preview Toggle */}
      <div className="bg-[#FAF7EE] border-[2px] border-black rounded-[24px] p-5 shadow-[3px_3px_0px_#000] space-y-4">
        <button
          type="button"
          onClick={() => setExpandedQuestions((prev) => !prev)}
          className="w-full flex items-center justify-between font-black text-sm sm:text-base text-black cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#7C3AED]" />
            <span>
              {expandedQuestions
                ? "Hide Questions Preview (20 Questions)"
                : "Preview Questions (20 Questions)"}
            </span>
          </span>
          {expandedQuestions ? (
            <ChevronUp className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </button>

        {expandedQuestions && (
          <div className="space-y-3 pt-3 border-t border-black/10">
            {quiz.questions.map((q, idx) => (
              <div
                key={q.questionId || idx}
                className="p-3.5 rounded-xl bg-white border border-black/30 space-y-2 text-xs font-bold"
              >
                <div className="font-black text-black">
                  #{idx + 1}. {q.question}
                </div>
                <div className="grid grid-cols-2 gap-2 text-stone-700">
                  {q.options.map((opt, optIdx) => (
                    <div
                      key={optIdx}
                      className={cn(
                        "p-1.5 rounded-lg border",
                        optIdx === q.correctAnswer
                          ? "bg-[#DCFCE7] border-[#15803D] text-[#15803D] font-black"
                          : "bg-stone-50 border-stone-200"
                      )}
                    >
                      {String.fromCharCode(65 + optIdx)}. {opt}
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-stone-500 italic pt-1">
                  Explanation: {q.explanation}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SharedQuizClient;
