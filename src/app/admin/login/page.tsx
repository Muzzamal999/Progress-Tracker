import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Award, ShieldCheck, Users } from "lucide-react";
import { LoginForm } from "@/components/admin/LoginForm";
import { LogoMark } from "@/components/SiteLogo";

export const metadata: Metadata = { title: "Admin login", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-brand p-12 text-navy-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary/30 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-accent/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-center gap-2.5">
          <LogoMark />
          <span className="font-[family-name:var(--font-heading)] text-lg font-bold">Student Journey Atlas</span>
        </div>
        <div className="relative space-y-6">
          <h2 className="max-w-md text-4xl font-extrabold leading-tight text-white">Manage every student&apos;s journey in one place.</h2>
          <ul className="space-y-3 text-navy-muted">
            <li className="flex items-center gap-3"><Users className="h-5 w-5 text-indigo-300" aria-hidden="true" /> Add, edit and remove student records</li>
            <li className="flex items-center gap-3"><Award className="h-5 w-5 text-indigo-300" aria-hidden="true" /> Update badges, skills and projects</li>
            <li className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-indigo-300" aria-hidden="true" /> Access limited to approved admins</li>
          </ul>
        </div>
        <p className="relative text-sm text-navy-muted">Sign-ups are closed. Admin accounts are created by invitation only.</p>
      </aside>

      <main id="main" className="flex flex-col justify-center bg-background px-4 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm space-y-8">
          <div className="flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2.5">
              <LogoMark />
              <span className="font-[family-name:var(--font-heading)] font-bold">Student Journey Atlas</span>
            </div>
          </div>
          <LoginForm />
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to the website
          </Link>
        </div>
      </main>
    </div>
  );
}
