"use client";

import { useFormStatus } from "react-dom";

export default function AdminSubmitButton({ children, pendingText }: { children: string; pendingText: string }) {
  const { pending } = useFormStatus();
  return <button className="btn btn-main" type="submit" disabled={pending} aria-live="polite">
    {pending ? pendingText : children}
  </button>;
}
