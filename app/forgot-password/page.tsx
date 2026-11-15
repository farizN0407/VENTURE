import ForgotPasswordForm from "@/app/components/ForgotPasswordForm";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const query = await searchParams;
  return <ForgotPasswordForm error={query.error} message={query.message} />;
}
