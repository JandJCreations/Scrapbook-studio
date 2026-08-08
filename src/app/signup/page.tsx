import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      description="Start building scrapbooks in the cloud."
    >
      <SignupForm />
    </AuthShell>
  );
}
