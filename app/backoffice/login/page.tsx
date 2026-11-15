import Image from "next/image";
import { redirect } from "next/navigation";
import { getStaffUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getStaffUser()) redirect("/backoffice");
  return (
    <div className="flex min-h-screen items-center justify-center bg-steel px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6">
        <Image src="/brand/logo.jpeg" alt="Serve Pickleball Yard" width={1678} height={937} className="mx-auto h-20 w-auto" />
        <h1 className="mt-4 text-center font-display text-2xl font-semibold text-steel uppercase">Backoffice sign in</h1>
        <LoginForm />
      </div>
    </div>
  );
}
