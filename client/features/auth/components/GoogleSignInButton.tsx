"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApiClient } from "@/hooks/useApiClient";
import { setNativeSession } from "../nativeAuth";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: (momentListener?: (notification: any) => void) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              logo_alignment?: "left" | "center";
              width?: number | string;
              locale?: string;
            }
          ) => void;
        };
      };
    };
  }
}

export function GoogleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

export interface GoogleSignInButtonProps {
  label?: string;
  redirectPath?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
}

export function GoogleSignInButton({
  label = "Continue with Google",
  redirectPath = "/",
  onSuccess,
  onError,
  disabled = false,
  className = "",
}: GoogleSignInButtonProps) {
  const router = useRouter();
  const api = useApiClient();
  const [loading, setLoading] = useState(false);
  const hiddenGsiRef = useRef<HTMLDivElement>(null);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const customAuthUrl = process.env.NEXT_PUBLIC_GOOGLE_AUTH_URL;

  const handleCredentialResponse = async (response: { credential: string }) => {
    if (!response.credential) {
      onError?.("Google sign-in did not return valid credentials.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{
        data: {
          accessToken: string;
          refreshToken?: string;
          user: any;
          expiresIn?: number;
        };
      }>("/auth/google", {
        credential: response.credential,
      });

      if (res?.data?.accessToken) {
        setNativeSession(res.data.accessToken, res.data.user, res.data.expiresIn);
        if (onSuccess) {
          onSuccess();
        } else {
          router.push(redirectPath);
        }
      } else {
        throw new Error("Invalid response from authentication server.");
      }
    } catch (err: any) {
      const msg = err?.message || "Google authentication failed. Please try again.";
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!clientId || typeof window === "undefined") return;

    const initGoogleIdentity = () => {
      if (window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredentialResponse,
            cancel_on_tap_outside: true,
          });

          // Render hidden or fallback GSI button if ref is present
          if (hiddenGsiRef.current) {
            window.google.accounts.id.renderButton(hiddenGsiRef.current, {
              theme: "outline",
              size: "large",
              text: "continue_with",
              width: "100%",
            });
          }
        } catch (e) {
          console.error("Failed to initialize Google Identity Services:", e);
        }
      }
    };

    if (window.google?.accounts?.id) {
      initGoogleIdentity();
      return;
    }

    // Load GIS script dynamically
    const scriptId = "google-jssdk-gsi";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = initGoogleIdentity;
      document.body.appendChild(script);
    }
  }, [clientId]);

  const handleClick = () => {
    if (loading || disabled) return;

    // 1. If custom auth URL is configured, navigate to it
    if (customAuthUrl && customAuthUrl.trim().length > 0) {
      window.location.href = customAuthUrl;
      return;
    }

    // 2. If Google Client ID is configured, trigger Google prompt or click rendered button
    if (clientId && clientId.trim().length > 0 && clientId !== "your_google_client_id_here.apps.googleusercontent.com") {
      if (hiddenGsiRef.current) {
        const nativeGoogleBtn = hiddenGsiRef.current.querySelector("div[role=button]") as HTMLElement;
        if (nativeGoogleBtn) {
          nativeGoogleBtn.click();
          return;
        }
      }

      if (window.google?.accounts?.id) {
        window.google.accounts.id.prompt();
        return;
      }
    }

    // 3. Fallback warning if credentials are not configured yet
    onError?.(
      "Google Client ID is not configured yet. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your client/.env file."
    );
  };

  return (
    <div className="w-full relative">
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={loading || disabled}
        className={`w-full h-10 font-semibold border-border hover:bg-secondary/60 text-foreground cursor-pointer transition-all flex items-center justify-center gap-2.5 shadow-sm ${className}`}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span>Signing in with Google...</span>
          </>
        ) : (
          <>
            <GoogleIcon className="h-4 w-4 shrink-0" />
            <span>{label}</span>
          </>
        )}
      </Button>

      {/* Hidden container for Google Identity Services official iframe rendering */}
      <div ref={hiddenGsiRef} className="hidden" aria-hidden="true" />
    </div>
  );
}

export default GoogleSignInButton;
