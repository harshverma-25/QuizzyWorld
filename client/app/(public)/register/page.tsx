"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Shield, ArrowRight, Lock, Mail, User as UserIcon, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiClient } from "@/hooks/useApiClient";
import { setNativeSession } from "@/features/auth/nativeAuth";
import { setGuestSession } from "@/features/auth/guestAuth";
import { GoogleSignInButton } from "@/features/auth/components/GoogleSignInButton";

export default function RegisterPage() {
  const router = useRouter();
  const api = useApiClient();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !username || !password) {
      setError("Please fill in all required fields.");
      return;
    }
    if (username.length < 3) {
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
        email,
        username,
        displayName: displayName || username,
        password,
      });

      if (res?.data?.accessToken) {
        setNativeSession(res.data.accessToken, res.data.user, res.data.expiresIn);
        router.push("/");
      } else {
        throw new Error("Invalid response from server.");
      }
    } catch (err: any) {
      setError(err?.message || "Registration failed. Email or username may already be in use.");
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
        setGuestSession(res.data.token, res.data.user, res.data.user.expiresIn || 86400);
        router.push("/");
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
    <div className="min-h-[calc(100vh-12rem)] flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 bg-background relative overflow-hidden">
      {/* Background Decorator Gradients */}
      <div className="absolute top-1/4 -right-32 w-96 h-96 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -left-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center z-10 mb-6">
        <Link href="/" className="inline-flex items-center justify-center mb-4 group hover:scale-105 transition-transform" title="Back to Quizzy Home">
          <Image
            src="/quizzy-wordmark.svg"
            alt="Quizzy"
            width={144}
            height={48}
            priority
            className="h-10 w-auto object-contain"
          />
        </Link>
        <h2 className="text-2xl font-bold tracking-tight text-[#1d1b16]">
          Create your Quizzy Account
        </h2>
        <p className="mt-1 text-sm text-[#3f4944]">
          Join live 1–4 player quiz battles and test your speed & knowledge
        </p>
      </div>

      <Card className="w-full max-w-md border-border/60 bg-card/80 backdrop-blur-xl shadow-2xl z-10">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-lg font-bold">Register</CardTitle>
          <CardDescription>Enter your details to create a persistent profile</CardDescription>
        </CardHeader>

        <div className="px-6 pb-2">
          {error && (
            <div className="mb-4 p-3 text-xs font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
              {error}
            </div>
          )}

          <GoogleSignInButton
            label="Sign up with Google"
            redirectPath="/"
            onError={(msg) => setError(msg)}
            disabled={loading || guestLoading}
          />

          <div className="relative flex py-4 items-center">
            <div className="flex-grow border-t border-border"></div>
            <span className="flex-shrink mx-4 text-[11px] font-mono uppercase text-muted-foreground">OR EMAIL</span>
            <div className="flex-grow border-t border-border"></div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-0">

            <div className="space-y-2">
              <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Email Address</label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  placeholder="alex@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Username</label>
              <div className="relative">
                <Input
                  id="username"
                  type="text"
                  placeholder="alex_dev"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10"
                  required
                />
                <UserIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="displayName" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Display Name (Optional)</label>
              <Input
                id="displayName"
                type="text"
                placeholder="Alex Rivers"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">Password</label>
              <div className="relative">
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-10 font-semibold cursor-pointer"
              disabled={loading || guestLoading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                <>
                  Create Account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </CardContent>
        </form>

        <div className="px-6 py-2">
          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-border"></div>
            <span className="flex-shrink mx-4 text-xs font-mono uppercase text-muted-foreground">OR</span>
            <div className="flex-grow border-t border-border"></div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-10 font-semibold border-amber-500/30 hover:bg-amber-500/10 text-amber-500 hover:text-amber-400 cursor-pointer transition-colors"
            onClick={handleGuestLogin}
            disabled={loading || guestLoading}
          >
            {guestLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating guest identity...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Play Immediately as Guest
              </>
            )}
          </Button>
        </div>

        <CardFooter className="flex justify-center pt-4 border-t border-border/40 text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="ml-1 font-semibold text-primary hover:underline">
            Log in
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
