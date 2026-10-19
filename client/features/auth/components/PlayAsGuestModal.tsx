"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Zap, Shield, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setGuestSession } from "../guestAuth";
import { useApiClient } from "@/hooks/useApiClient";
import { GoogleSignInButton } from "./GoogleSignInButton";

interface PlayAsGuestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PlayAsGuestModal({ isOpen, onClose, onSuccess }: PlayAsGuestModalProps) {
  const router = useRouter();
  const api = useApiClient();
  const [displayName, setDisplayName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGuestLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await api.post<{
        success: boolean;
        data: {
          token: string;
          user: any;
        };
        message?: string;
      }>("/auth/guest", {
        displayName: displayName.trim() || undefined,
      });

      if (!res?.data?.token) {
        throw new Error(res?.message || "Failed to create guest session.");
      }

      const { token, user } = res.data;
      setGuestSession(token, user, user.expiresIn || 86400);

      onClose();
      if (onSuccess) {
        onSuccess();
      } else {
        router.refresh();
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card p-6 md:p-8 shadow-2xl backdrop-blur-md">
        {/* Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary to-orange-400" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/40 p-1.5 transition-colors cursor-pointer"
          aria-label="Close dialog"
        >
          <X className="h-4.5 w-4.5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Play as Guest
            </h2>
            <p className="text-xs text-muted-foreground">
              Quick access without an account
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
          Jump straight into multiplayer quizzes and practice questions. You can upgrade to a permanent account at any time.
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleGuestLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Player Handle <span className="text-muted-foreground font-normal">(Optional)</span>
            </label>
            <Input
              type="text"
              placeholder="e.g. SpeedDemon (or leave blank)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={25}
              disabled={isLoading}
              className="h-10 text-xs bg-background/50 border-border"
            />
            <p className="text-[10px] text-muted-foreground">
              Leave blank to automatically assign a randomized player name.
            </p>
          </div>

          <div className="pt-2 space-y-2">
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs uppercase tracking-wider gap-2 cursor-pointer shadow-lg shadow-primary/20"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating Guest Session...
                </>
              ) : (
                <>
                  Continue as Guest
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isLoading}
              className="w-full h-9 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 cursor-pointer"
            >
              Cancel
            </Button>
          </div>
        </form>

        <div className="my-4 relative flex items-center">
          <div className="flex-grow border-t border-border/60"></div>
          <span className="flex-shrink mx-3 text-[10px] font-mono uppercase text-muted-foreground">OR PERMANENT ACCOUNT</span>
          <div className="flex-grow border-t border-border/60"></div>
        </div>

        <GoogleSignInButton
          label="Sign in with Google"
          onSuccess={() => {
            onClose();
            if (onSuccess) onSuccess();
            else router.refresh();
          }}
          onError={(msg) => setError(msg)}
          disabled={isLoading}
        />

        <div className="mt-5 pt-4 border-t border-border/50 text-center">
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
            <Shield className="h-3 w-3 text-primary" />
            <span>24-hour temporary session with quiz history</span>
          </div>
        </div>
      </div>
    </div>
  );
}
export default PlayAsGuestModal;
