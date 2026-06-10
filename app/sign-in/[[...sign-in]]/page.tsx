import { SignIn } from '@clerk/nextjs';

export default function Page() {
  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <SignIn signUpUrl="/sign-up" />
    </main>
  );
}
