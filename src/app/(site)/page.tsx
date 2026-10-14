import { Suspense } from "react";
import { getStudents } from "@/lib/students";
import { HomeClient } from "@/components/HomeClient";
import { ErrorState } from "@/components/ErrorState";
import { StudentGridSkeleton } from "@/components/StudentGridSkeleton";

async function HomeContent() {
  let students;
  try {
    students = await getStudents();
  } catch (e) {
    console.error("Failed to load students", e);
    return (
      <div className="px-4 py-20">
        <ErrorState />
      </div>
    );
  }
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeClient students={students} />
    </Suspense>
  );
}

function HomeFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <StudentGridSkeleton />
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeContent />
    </Suspense>
  );
}
