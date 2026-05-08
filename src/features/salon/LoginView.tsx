import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/firebase";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Loader2,
  Lock,
  Shield,
  Sparkles,
} from "lucide-react";
import { Button, GoogleMark, inputClass, Panel } from "./salon-ui";

export type EmailAuthPayload =
  | { mode: "login"; email: string; password: string }
  | { mode: "signup"; email: string; password: string; name: string; phone: string };

type LoginViewProps = {
  onClient: () => Promise<void>;
  onEmailAuth: (payload: EmailAuthPayload) => Promise<void>;
  onAdmin: () => void;
  onGuest: () => Promise<void>;
  onBackToBooking?: () => void;
};

export const describeAuthError = (authError: unknown, mode: "login" | "signup" | "google") => {
  const code = (authError as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-email":
      return "Email inválido. Confere o endereço digitado.";
    case "auth/user-disabled":
      return "Esta conta foi desativada. Fala com o suporte.";
    case "auth/user-not-found":
      return "Este login não existe. Cria uma conta para continuar.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Login ou senha incorretos. Tenta novamente.";
    case "auth/missing-password":
      return "Escreve a tua senha para entrar.";
    case "auth/too-many-requests":
      return "Muitas tentativas seguidas. Aguarda alguns minutos e tenta de novo.";
    case "auth/network-request-failed":
      return "Sem conexão com a internet. Verifica a tua rede e tenta novamente.";
    case "auth/email-already-in-use":
      return "Este email já está cadastrado. Faz login em vez de criar conta.";
    case "auth/weak-password":
      return "Senha muito fraca. Usa pelo menos 6 caracteres.";
    case "auth/popup-closed-by-user":
      return "Janela do Google fechada antes de concluir o login.";
    case "auth/popup-blocked":
      return "O navegador bloqueou a janela do Google. Permite pop-ups e tenta de novo.";
    case "auth/cancelled-popup-request":
      return "Login com Google cancelado. Tenta novamente.";
    case "auth/account-exists-with-different-credential":
      return "Já existe uma conta com este email usando outro método de login.";
    case "auth/operation-not-allowed":
      return mode === "google"
        ? "Login com Google não está ativo no Firebase."
        : "Login por email/senha não está ativo no Firebase.";
    default:
      if (mode === "google") return "Não foi possível entrar com Google. Tenta novamente.";
      if (mode === "signup") return "Não foi possível cadastrar. Tenta novamente.";
      return "Não foi possível entrar. Tenta novamente.";
  }
};

export function LoginView({ onClient, onEmailAuth, onAdmin, onGuest, onBackToBooking }: LoginViewProps) {
  const [loading, setLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMode, setEmailMode] = useState<"login" | "signup">("login");
  const [signupName, setSignupName] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const handleResetPassword = async () => {
    setError("");
    setResetMessage("");
    const target = email.trim();
    if (!target) {
      setError("Digita teu email acima para receber o link de redefinição.");
      return;
    }
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, target);
      setResetMessage("Link enviado! Verifica teu email para redefinir a senha.");
    } catch (authError) {
      console.error("Erro ao enviar reset de senha:", authError);
      setError(describeAuthError(authError, "login"));
    } finally {
      setResetLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError("");
    try {
      await onClient();
    } catch (authError) {
      console.error("Erro no login com Google:", authError);
      setError(describeAuthError(authError, "google"));
    } finally {
      setLoading(false);
    }
  };

  const handleAdmin = () => {
    if (password === "admin123") {
      setError("");
      onAdmin();
      return;
    }
    setError("Senha incorreta. Tenta novamente.");
  };

  const handleEmail = async () => {
    setEmailLoading(true);
    setError("");
    try {
      if (emailMode === "signup") {
        const name = signupName.trim();
        const phoneDigits = signupPhone.replace(/\D/g, "");
        if (!name) {
          setError("Escreve o teu nome para cadastrar.");
          setEmailLoading(false);
          return;
        }
        if (phoneDigits.length < 10) {
          setError("Indica um telefone válido com DDD (mín. 10 dígitos).");
          setEmailLoading(false);
          return;
        }
        if (!email.trim()) {
          setError("Indica o teu email.");
          setEmailLoading(false);
          return;
        }
        await onEmailAuth({
          mode: "signup",
          email: email.trim(),
          password: emailPassword,
          name,
          phone: signupPhone,
        });
      } else {
        await onEmailAuth({ mode: "login", email: email.trim(), password: emailPassword });
      }
    } catch (authError) {
      console.error("Erro no login por email e senha:", authError);
      setError(describeAuthError(authError, emailMode));
    } finally {
      setEmailLoading(false);
    }
  };

  const emailFormValid =
    emailMode === "login"
      ? Boolean(email.trim() && emailPassword.length >= 6)
      : Boolean(
          signupName.trim() &&
            signupPhone.replace(/\D/g, "").length >= 10 &&
            email.trim() &&
            emailPassword.length >= 6,
        );

  return (
    <main className="salon-shell grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <Panel className="relative z-10 w-full max-w-md animate-fade-up p-8">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-3xl bg-rose-soft text-primary shadow-glow">
          <Sparkles className="h-8 w-8" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-primary">Ateliê Bella Nails</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground">Agendamentos com cuidado e elegância</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Escolhe teu serviço, horário e acompanha cada solicitação num ambiente simples e acolhedor.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          {onBackToBooking && (
            <Button variant="ghost" className="w-full" type="button" onClick={onBackToBooking}>
              ← Voltar ao agendamento
            </Button>
          )}
          <Button
            className="w-full"
            type="button"
            onClick={async () => {
              try {
                await onGuest();
              } catch (e) {
                console.error(e);
                setError("Não foi possível entrar como convidado. Verifica se o login anónimo está ativo no Firebase.");
              }
            }}
          >
            <Calendar className="h-5 w-5" />
            Agendar como Convidado
          </Button>

          <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>ou acesse sua conta:</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="secondary" className="w-full" onClick={handleGoogle} disabled={loading}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleMark />}
            Entrar com Google
          </Button>

          <div className="rounded-2xl bg-muted p-4 text-left">
            <div className="mb-3 grid grid-cols-2 gap-2">
              <Button
                variant={emailMode === "login" ? "primary" : "secondary"}
                onClick={() => {
                  setEmailMode("login");
                  setError("");
                }}
                type="button"
              >
                Entrar
              </Button>
              <Button
                variant={emailMode === "signup" ? "primary" : "secondary"}
                onClick={() => {
                  setEmailMode("signup");
                  setError("");
                }}
                type="button"
              >
                Cadastrar
              </Button>
            </div>
            <div className="space-y-3">
              {emailMode === "signup" && (
                <>
                  <input
                    className={inputClass}
                    type="text"
                    value={signupName}
                    onChange={(event) => setSignupName(event.target.value)}
                    placeholder="Nome completo"
                    autoComplete="name"
                  />
                  <input
                    className={inputClass}
                    type="tel"
                    value={signupPhone}
                    onChange={(event) => setSignupPhone(event.target.value)}
                    placeholder="Telefone com DDD"
                    autoComplete="tel"
                    inputMode="tel"
                  />
                </>
              )}
              <input
                className={inputClass}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                autoComplete="email"
              />
              <input
                className={inputClass}
                type="password"
                value={emailPassword}
                onChange={(event) => setEmailPassword(event.target.value)}
                placeholder="Senha"
                autoComplete={emailMode === "login" ? "current-password" : "new-password"}
              />
              <Button className="w-full" onClick={handleEmail} disabled={emailLoading || !emailFormValid}>
                {emailLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
                {emailMode === "login" ? "Entrar com email" : "Criar conta"}
              </Button>
            </div>
          </div>

          <Button variant="dark" className="w-full" onClick={() => setAdminOpen((open) => !open)}>
            <Shield className="h-5 w-5" />
            Acesso Admin
          </Button>
        </div>

        {adminOpen && (
          <div className="mt-5 animate-fade-up rounded-2xl bg-muted p-4">
            <label className="mb-2 block text-sm font-semibold text-foreground">Senha administrativa</label>
            <div className="flex gap-2">
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="admin123"
              />
              <Button onClick={handleAdmin} aria-label="Entrar como admin">
                <Lock className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p className="mt-4 flex items-center gap-2 text-sm font-medium text-danger">
            <AlertCircle className="h-4 w-4" /> {error}
          </p>
        )}
      </Panel>
    </main>
  );
}
