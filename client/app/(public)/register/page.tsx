"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Lock,
  Mail,
  User as UserIcon,
  Loader2,
  Sparkles,
  Gamepad2,
  Eye,
  EyeOff,
  CheckCircle2,
} from "lucide-react";
import { useApiClient } from "@/hooks/useApiClient";
import { setNativeSession } from "@/features/auth/nativeAuth";
import { setGuestSession } from "@/features/auth/guestAuth";
import { GoogleSignInButton } from "@/features/auth/components/GoogleSignInButton";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/";
  const api = useApiClient();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !username.trim() || !password) {
      setError("Please fill in all required fields.");
      return;
    }
    if (username.trim().length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await api.post<{
        data: {
          accessToken: string;
          refreshToken?: string;
          user: any;
          expiresIn?: number;
        };
      }>("/auth/register", {
        email: email.trim().toLowerCase(),
        username: username.trim(),
        displayName: displayName.trim() || username.trim(),
        password,
      });

      if (res?.data?.accessToken) {
        setNativeSession(res.data.accessToken, res.data.user, res.data.expiresIn);
        router.push(redirectPath);
      } else {
        throw new Error("Invalid response from server.");
      }
    } catch (err: any) {
      setError(
        err?.message ||
          "Registration failed. That email or username may already be taken."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError(null);
    setGuestLoading(true);

    try {
      const res = await api.post<{
        data: {
          token: string;
          user: any;
        };
      }>("/auth/guest");

      if (res?.data?.token) {
        setGuestSession(
          res.data.token,
          res.data.user,
          res.data.user.expiresIn || 86400
        );
        router.push(redirectPath);
      } else {
        throw new Error("Failed to create guest session.");
      }
    } catch (err: any) {
      setError(err?.message || "Could not start guest session.");
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white border-[3px] border-black rounded-[28px] p-6 sm:p-8 shadow-[6px_6px_0px_#000] relative z-10 transition-all">
      {/* Card Header Badge & Title */}
      <div className="text-center space-y-1.5 pb-5">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DCFCE7] border-2 border-black text-[11px] font-black uppercase tracking-wider text-[#15803D] shadow-[1.5px_1.5px_0px_#000]">
          <Gamepad2 className="w-3.5 h-3.5" />
          <span>Join the Arena</span>
        </div>
        <h1 className="text-2xl font-black text-black tracking-tight pt-1">
          Create Quizzy Account
        </h1>
        <p className="text-xs font-bold text-stone-600">
          Save your high scores, battle friends & build AI quizzes
        </p>
      </div>

      {/* Error notification banner */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-100 border-2 border-black text-red-900 font-black text-xs shadow-[2px_2px_0px_#000] flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-stone-700 hover:text-black font-black text-sm px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Quick 1-Click Access Buttons: Google + Guest Login */}
      <div className="space-y-2.5 pb-4">
        {/* Google Sign In Button */}
        <GoogleSignInButton
          label="Sign up with Google"
          redirectPath={redirectPath}
          onError={(msg) => setError(msg)}
          disabled={loading || guestLoading}
        />

        {/* 1-Click Guest Login Button */}
        <button
          type="button"
          onClick={handleGuestLogin}
          disabled={loading || guestLoading}
          className="w-full h-11 bg-[#FFE600] hover:bg-[#FACC15] disabled:opacity-60 border-2 border-black rounded-xl font-black text-xs sm:text-sm text-black cursor-pointer transition-all flex items-center justify-center gap-2.5 shadow-[2px_2px_0px_#000] hover:shadow-[3px_3px_0px_#000] active:translate-x-[1px] active:translate-y-[1px]"
        >
          {guestLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-black" />
              <span>Creating Guest Identity...</span>
            </>
          ) : (
            <>
              <Gamepad2 className="w-4 h-4 text-black" />
              <span>Play as Guest (Instant)</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-700 fill-amber-500" />
            </>
          )}
        </button>
      </div>

      {/* Neo-brutalist Divider */}
      <div className="relative flex py-3 items-center">
        <div className="flex-grow border-t-2 border-black"></div>
        <span className="flex-shrink mx-3 px-2 py-0.5 rounded-md bg-[#FAF7EE] border border-black text-[10px] font-black uppercase tracking-wider text-stone-600 shadow-[1px_1px_0px_#000]">
          Or with Email
        </span>
        <div className="flex-grow border-t-2 border-black"></div>
      </div>

      {/* Native Credential Form */}
      <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
        <div className="space-y-1 text-left">
          <label
            htmlFor="email"
            className="text-[11px] font-black uppercase tracking-wider text-stone-800 block"
          >
            Email Address
          </label>
          <div className="relative">
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="alex@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-11 pl-10 pr-3 rounded-xl bg-[#FAF7EE] border-2 border-black font-bold text-xs sm:text-sm text-black placeholder:text-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black shadow-[1.5px_1.5px_0px_#000]"
              required
            />
            <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-stone-600" />
          </div>
        </div>

        <div className="space-y-1 text-left">
          <label
            htmlFor="username"
            className="text-[11px] font-black uppercase tracking-wider text-stone-800 block"
          >
            Username
          </label>
          <div className="relative">
            <input
              id="username"
              type="text"
              autoComplete="username"
              placeholder="e.g. alex_quizzer"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full h-11 pl-10 pr-3 rounded-xl bg-[#FAF7EE] border-2 border-black font-bold text-xs sm:text-sm text-black placeholder:text-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black shadow-[1.5px_1.5px_0px_#000]"
              required
            />
            <UserIcon className="absolute left-3.5 top-3.5 h-4 w-4 text-stone-600" />
          </div>
        </div>

        <div className="space-y-1 text-left">
          <label
            htmlFor="displayName"
            className="text-[11px] font-black uppercase tracking-wider text-stone-800 block"
          >
            Display Name <span className="text-stone-400 font-semibold">(Optional)</span>
          </label>
          <input
            id="displayName"
            type="text"
            placeholder="Alex Rivers"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full h-11 px-3 rounded-xl bg-[#FAF7EE] border-2 border-black font-bold text-xs sm:text-sm text-black placeholder:text-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black shadow-[1.5px_1.5px_0px_#000]"
          />
        </div>

        <div className="space-y-1 text-left">
          <label
            htmlFor="password"
            className="text-[11px] font-black uppercase tracking-wider text-stone-800 block"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-11 pl-10 pr-10 rounded-xl bg-[#FAF7EE] border-2 border-black font-bold text-xs sm:text-sm text-black placeholder:text-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black shadow-[1.5px_1.5px_0px_#000]"
              required
            />
            <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-stone-600" />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-3 h-5 w-5 text-stone-500 hover:text-black flex items-center justify-center cursor-pointer"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || guestLoading}
          className="w-full h-12 mt-2 bg-[#FF4D85] hover:bg-[#F43F5E] disabled:opacity-60 text-white border-2 border-black rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[3px_3px_0px_#000] hover:shadow-[4px_4px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>Creating Account...</span>
            </>
          ) : (
            <>
              <span>Create Free Account</span>
              <ArrowRight className="w-4 h-4 stroke-[3]" />
            </>
          )}
        </button>
      </form>

      {/* Switch to Login */}
      <div className="pt-6 border-t-2 border-black/10 mt-5 text-center text-xs font-bold text-stone-600">
        Already have an account?{" "}
        <Link
          href={`/login${redirectPath !== "/" ? `?redirect=${encodeURIComponent(redirectPath)}` : ""}`}
          className="font-black text-black underline underline-offset-4 hover:text-[#0D9488] transition-colors"
        >
          Sign in here →
        </Link>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-[calc(100vh-8rem)] w-full flex flex-col justify-center items-center py-10 px-4 sm:px-6 bg-[#FAF7EE] relative select-none overflow-hidden">
      {/* Playful background decorative dots */}
      <div
        className="absolute inset-0 pointer-events-none opacity-25"
        style={{
          backgroundImage: "radial-gradient(#000 1.2px, transparent 1.2px)",
          backgroundSize: "20px 20px",
        }}
      />

      {/* Top Header Logo */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center z-10 mb-6">
        <Link
          href="/"
          className="inline-flex items-center justify-center mb-3 group hover:scale-105 transition-transform"
          title="Back to Quizzy Home"
        >
          <Image
            src="/quizzy-wordmark.svg"
            alt="Quizzy World"
            width={150}
            height={50}
            priority
            className="h-10 w-auto object-contain drop-shadow-[2px_2px_0px_rgba(0,0,0,0.8)]"
          />
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="w-full max-w-md bg-white border-[3px] border-black rounded-[28px] p-8 shadow-[6px_6px_0px_#000] text-center font-black text-stone-600">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-black" />
            Loading registration form...
          </div>
        }
      >
        <RegisterForm />
      </Suspense>

      {/* Trust pill features */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-[11px] font-black text-stone-700 z-10">
        <span className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-black shadow-[1px_1px_0px_#000]">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#0D9488]" />
          Instant PIN Join
        </span>
        <span className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-black shadow-[1px_1px_0px_#000]">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#F59E0B]" />
          Custom AI Quizzes
        </span>
        <span className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-black shadow-[1px_1px_0px_#000]">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#DB2777]" />
          100% Free Forever
        </span>
      </div>
    </div>
  );
}
