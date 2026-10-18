import AuthForm from "@/app/components/AuthForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; next?: string }> }) {
  const query = await searchParams;
  return <AuthForm mode="login" error={query.error} message={query.message} next={query.next ?? "/account"} />;
}
