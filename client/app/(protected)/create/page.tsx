import React from "react";
import type { Metadata } from "next";
import { QuizCreatorClient } from "@/components/create/QuizCreatorClient";

export const metadata: Metadata = {
  title: "Create Quiz with AI — 20-Question Generator | QUIZZY",
  description:
    "Generate custom 20-question trivia quizzes powered by AI from any category and topic. Get beginner-friendly questions, an authentic cover thumbnail, and challenge players in live matches.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CreateQuizPage() {
  return <QuizCreatorClient />;
}
