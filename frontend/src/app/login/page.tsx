import { AuthForm } from "@/components/auth/AuthForm";
export default function Login() {
  return (
    <>
      <AuthForm />
      <p className="text-center pb-8">
        <a className="subtle-link" href="/device">
          Use a private offline ledger
        </a>
      </p>
    </>
  );
}
