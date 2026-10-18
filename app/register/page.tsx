import AuthForm from "@/app/components/AuthForm";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const query = await searchParams;
  return <AuthForm mode="register" error={query.error} message={query.message} />;
}
