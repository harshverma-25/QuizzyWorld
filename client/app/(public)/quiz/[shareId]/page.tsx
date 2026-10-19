import React from "react";
import type { Metadata } from "next";
import { SharedQuizClient } from "@/components/create/SharedQuizClient";

interface PageProps {
  params: Promise<{ shareId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { shareId } = await params;
  return {
    title: `Play Quiz (${shareId}) | QUIZZY`,
    description: "Challenge your knowledge with this 20-question custom quiz created on QUIZZY.",
  };
}

export default async function SharedQuizPage({ params }: PageProps) {
  const { shareId } = await params;
  return <SharedQuizClient shareId={shareId} />;
}
