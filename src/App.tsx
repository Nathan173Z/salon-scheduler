import { useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { Timestamp, addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import {
  AlertCircle,
  Ban,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  Lock,
  MessageCircle,
  Plus,
  Scissors,
  Shield,
  Sparkles,
  Trash2,
  User,
  X,
  XCircle,
} from "lucide-react";
import { auth, db, googleProvider } from "./firebase.js";

type View = "login" | "client" | "admin";
type AppointmentStatus = "pending" | "confirmed" | "rejected";
type AdminTab = "agenda" | "availability" | "services";
type ClientTab = "new" | "mine";

type Service = {
  id: string;
  name: string;
  price: number;
  duration: number;
  description: string;
};

type Appointment = {
  id: number | string;
  clientId: string;
  clientName: string;
  phone: string;
  service: Service;
  date: string;
  time: string;
  status: AppointmentStatus;
  createdAt: string;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const toLocalISODate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseFirebaseDate = (value: unknown) => {
  if (value instanceof Timestamp) return value.toDate();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate();
  return null;
};

const generateTimeSlots = () => {
  const slots: string[] = [];
  for (let minutes = 8 * 60; minutes < 18 * 60; minutes += 30) {
    const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
    const minute = String(minutes % 60).padStart(2, "0");
    slots.push(`${hour}:${minute}`);
  }
  return slots;
};

const formatBRL = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const blockDocId = (value: string) => encodeURIComponent(value);

const statusMeta: Record<AppointmentStatus, { label: string; icon: typeof Clock; className: string }> = {
  pending: { label: "Pendente", icon: Clock, className: "bg-warning/15 text-warning border-warning/25" },
  confirmed: { label: "Confirmado", icon: CheckCircle2, className: "bg-success/15 text-success border-success/25" },
  rejected: { label: "Recusado", icon: XCircle, className: "bg-danger/15 text-danger border-danger/25" },
};

const inputClass =
  "h-12 w-full rounded-xl border border-border bg-card px-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10";

function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "success" | "danger" | "dark";
}) {
  const styles = {
    primary: "bg-primary text-primary-foreground shadow-glow hover:bg-primary/90",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "bg-transparent text-foreground hover:bg-muted",
    success: "bg-success text-success-foreground hover:bg-success/90",
    danger: "bg-danger text-danger-foreground hover:bg-danger/90",
    dark: "bg-surface-dark text-surface-dark-foreground hover:bg-surface-dark/90",
  };

  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-ring/20 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-border bg-card shadow-soft ${className}`}>{children}</section>;
}

function Badge({ status }: { status: AppointmentStatus }) {
  const meta = statusMeta[status];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${meta.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

function Modal({
  title,
  description,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-surface-dark/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-scale-in rounded-3xl border border-border bg-card p-6 shadow-float">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="rounded-2xl bg-danger/10 p-3 text-danger">
            <AlertCircle className="h-6 w-6" />
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <h3 className="text-xl font-bold text-foreground">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Voltar</Button>
          <Button variant="danger" onClick={onConfirm}>Recusar e avisar</Button>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function LoginView({
  onClient,
  onEmailAuth,
  onAdmin,
  onGuest,
}: {
  onClient: () => Promise<void>;
  onEmailAuth: (email: string, password: string, mode: "login" | "signup") => Promise<void>;
  onAdmin: () => void;
  onGuest: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMode, setEmailMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const describeAuthError = (authError: unknown, mode: "login" | "signup" | "google") => {
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
      await onEmailAuth(email.trim(), emailPassword, emailMode);
    } catch (authError) {
      console.error("Erro no login por email e senha:", authError);
      setError(describeAuthError(authError, emailMode));
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <main className="salon-shell grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <Panel className="relative z-10 w-full max-w-md animate-fade-up p-8">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-3xl bg-rose-soft text-primary shadow-glow">
          <Sparkles className="h-8 w-8" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-primary">Ateliê Bella Nails</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground">Agendamentos com cuidado e elegância</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Escolhe teu serviço, horário e acompanha cada solicitação num ambiente simples e acolhedor.</p>
        </div>

        <div className="mt-8 space-y-4">
          <Button className="w-full" onClick={onGuest}>
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
              <Button variant={emailMode === "login" ? "primary" : "secondary"} onClick={() => setEmailMode("login")} type="button">
                Entrar
              </Button>
              <Button variant={emailMode === "signup" ? "primary" : "secondary"} onClick={() => setEmailMode("signup")} type="button">
                Cadastrar
              </Button>
            </div>
            <div className="space-y-3">
              <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" autoComplete="email" />
              <input className={inputClass} type="password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} placeholder="Senha" autoComplete={emailMode === "login" ? "current-password" : "new-password"} />
              <Button className="w-full" onClick={handleEmail} disabled={emailLoading || !email.trim() || emailPassword.length < 6}>
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
              <input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="admin123" />
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

function ClientView({
  services,
  appointments,
  setAppointments,
  isSlotAvailable,
  onLogout,
  user,
  onUpgradeGuest,
}: {
  services: Service[];
  appointments: Appointment[];
  setAppointments: React.Dispatch<React.SetStateAction<Appointment[]>>;
  isSlotAvailable: (date: string, time: string) => boolean;
  onLogout: () => void;
  user: FirebaseUser;
  onUpgradeGuest: (newUser: FirebaseUser, oldGuestId: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<ClientTab>("new");
  const [serviceId, setServiceId] = useState<string | null>(services[0]?.id ?? null);
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [clientName, setClientName] = useState(user.displayName && user.displayName !== "Convidado" ? user.displayName : "");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [phone, setPhone] = useState("");
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const selectedService = services.find((service) => service.id === serviceId) ?? null;
  const slots = useMemo(generateTimeSlots, []);
  const cleanPhone = phone.replace(/\D/g, "");
  const canSubmit = Boolean(
    user.uid &&
    selectedService &&
    date &&
    time &&
    clientName.trim() &&
    cleanPhone.length >= 10,
  );
  const clientAppointments = appointments.filter((appointment) => appointment.clientId === user.uid);

  useEffect(() => {
    if (!serviceId && services[0]) setServiceId(services[0].id);
  }, [serviceId, services]);

  const schedule = async () => {
    if (!user.uid) {
      setSaveError("Entra com Google antes de salvar o agendamento.");
      return;
    }
    if (!clientName.trim()) {
      setSaveError("Escreve teu nome para solicitar o agendamento.");
      return;
    }
    if (cleanPhone.length < 10) {
      setSaveError("Escreve um telefone válido com DDD para solicitar o agendamento.");
      return;
    }
    if (!canSubmit) return;
    setSaving(true);
    setSaveMessage("");
    setSaveError("");
    const scheduledAt = new Date(`${date}T${time}:00`);
    const serviceFromForm: Service = {
      id: selectedService?.id ?? "manual-service",
      name: selectedService?.name ?? "",
      price: selectedService?.price ?? 0,
      duration: selectedService?.duration ?? 0,
      description: selectedService?.description ?? "",
    };
    const newAppointment: Appointment = {
      id: Date.now(),
      clientId: user.uid,
      clientName: clientName.trim(),
      phone: cleanPhone,
      service: serviceFromForm,
      date,
      time,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    try {
      const docRef = await addDoc(collection(db, "Agendamento"), {
        name: selectedService?.name ?? "",
        price: selectedService?.price ?? 0,
        duracao: selectedService?.duration ?? 0,
        descricao: selectedService?.description ?? "",
        clienteId: user.uid,
        clientName: clientName.trim() || user.displayName || "Cliente",
        phone: cleanPhone,
        serviceId: selectedService?.id ?? null,
        status: "pending",
        data_agendada: Timestamp.fromDate(scheduledAt),
        dataCriacao: serverTimestamp(),
      });
      setAppointments((current) => [{ ...newAppointment, id: docRef.id }, ...current]);
      setSaveMessage("Agendamento salvo no Firebase com sucesso.");
      setTab("mine");
      setTime("");
      setPhone("");
      if (user.isAnonymous) {
        setShowSavePrompt(true);
      }
    } catch (error) {
      console.error("Erro ao salvar agendamento no Firestore:", error);
      setSaveError("Não foi possível salvar. Verifica se o Firestore está criado e se as regras permitem escrita para usuário logado.");
    } finally {
      setSaving(false);
    }
  };

  const handleSignupAfterBooking = async () => {
    setSignupError("");
    if (!signupEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail.trim())) {
      setSignupError("Escreve um email válido.");
      return;
    }
    if (signupPassword.length < 6) {
      setSignupError("A senha precisa de pelo menos 6 caracteres.");
      return;
    }
    setSignupLoading(true);
    try {
      const oldGuestId = user.uid;
      const credential = await createUserWithEmailAndPassword(auth, signupEmail.trim(), signupPassword);
      await onUpgradeGuest(credential.user, oldGuestId);
      setShowSavePrompt(false);
      setSignupEmail("");
      setSignupPassword("");
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code ?? "";
      if (code === "auth/email-already-in-use") setSignupError("Esse email já está cadastrado. Faz login na próxima vez.");
      else if (code === "auth/invalid-email") setSignupError("Email inválido.");
      else if (code === "auth/weak-password") setSignupError("Senha muito fraca. Usa pelo menos 6 caracteres.");
      else setSignupError("Não foi possível criar a conta. Tenta novamente.");
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName ?? "Foto do usuário"} className="h-12 w-12 rounded-2xl object-cover" />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-soft text-primary">
                <User className="h-6 w-6" />
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Olá, {user.displayName ?? "cliente"}</p>
              <h1 className="text-2xl font-extrabold text-foreground">Teu salão de unhas</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant={tab === "new" ? "primary" : "secondary"} onClick={() => setTab("new")}>Novo agendamento</Button>
            <Button variant={tab === "mine" ? "primary" : "secondary"} onClick={() => setTab("mine")}>Meus agendamentos</Button>
            <Button variant="ghost" onClick={onLogout}>Sair</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        {tab === "new" ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="space-y-6">
              <Panel className="p-6">
                <div className="mb-5 flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground font-bold">1</span>
                  <h2 className="text-xl font-bold text-foreground">Escolhe o serviço</h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {services.map((service) => (
                    <button
                      key={service.id}
                      onClick={() => setServiceId(service.id)}
                      className={`rounded-2xl border p-5 text-left transition-all hover:-translate-y-1 hover:shadow-soft ${serviceId === service.id ? "border-primary bg-rose-soft shadow-glow" : "border-border bg-card hover:border-primary/40"}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-bold text-foreground">{service.name}</h3>
                          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" /> {service.duration} min</p>
                        </div>
                        <span className="rounded-full bg-success/10 px-3 py-1 text-sm font-bold text-success">{formatBRL(service.price)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </Panel>

              <Panel className="p-6">
                <div className="mb-5 flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground font-bold">2</span>
                  <h2 className="text-xl font-bold text-foreground">Data e horário</h2>
                </div>
                <input className={`${inputClass} max-w-xs`} type="date" value={date} min={todayISO()} onChange={(event) => { setDate(event.target.value); setTime(""); }} />
                <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {slots.map((slot) => {
                    const available = isSlotAvailable(date, slot);
                    return (
                      <button
                        key={slot}
                        disabled={!available}
                        onClick={() => setTime(slot)}
                        className={`rounded-xl border px-3 py-3 text-sm font-bold transition ${time === slot ? "border-primary bg-primary text-primary-foreground shadow-glow" : "border-border bg-card text-foreground hover:border-primary hover:bg-rose-soft"} disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:line-through`}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              </Panel>
            </div>

            <aside className="h-fit rounded-3xl bg-surface-dark p-6 text-surface-dark-foreground shadow-float lg:sticky lg:top-6">
              <div className="mb-6 flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/20 text-primary-glow">
                  <CalendarCheck className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-surface-muted">Resumo</p>
                  <h2 className="text-xl font-bold">Solicitação</h2>
                </div>
              </div>
              <div className="space-y-3 rounded-2xl bg-surface-muted/10 p-4 text-sm">
                <div className="flex justify-between gap-4"><span className="text-surface-muted">Serviço</span><strong>{selectedService?.name ?? "—"}</strong></div>
                <div className="flex justify-between gap-4"><span className="text-surface-muted">Valor</span><strong>{selectedService ? formatBRL(selectedService.price) : "—"}</strong></div>
                <div className="flex justify-between gap-4"><span className="text-surface-muted">Data</span><strong>{date || "—"}</strong></div>
                <div className="flex justify-between gap-4"><span className="text-surface-muted">Horário</span><strong>{time || "—"}</strong></div>
              </div>
              <div className="mt-5 space-y-3">
                <input className="h-12 w-full rounded-xl border border-surface-muted/20 bg-surface-muted/10 px-4 text-sm text-surface-dark-foreground outline-none placeholder:text-surface-muted focus:border-primary" value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Nome obrigatório" required />
                <input className="h-12 w-full rounded-xl border border-surface-muted/20 bg-surface-muted/10 px-4 text-sm text-surface-dark-foreground outline-none placeholder:text-surface-muted focus:border-primary" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Telefone obrigatório" inputMode="tel" required />
                <Button className="w-full" onClick={schedule} disabled={!canSubmit || saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                  Solicitar Agendamento
                </Button>
                {saveError && <p className="text-sm font-semibold text-danger">{saveError}</p>}
                {saveMessage && <p className="text-sm font-semibold text-success">{saveMessage}</p>}
              </div>
            </aside>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {clientAppointments.length ? clientAppointments.map((appointment) => (
              <Panel key={appointment.id} className="p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-foreground">{appointment.service.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{appointment.date} às {appointment.time}</p>
                  </div>
                  <Badge status={appointment.status} />
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-muted p-4 text-sm">
                  <span className="text-muted-foreground">Valor</span>
                  <strong>{formatBRL(appointment.service.price)}</strong>
                </div>
              </Panel>
            )) : (
              <Panel className="col-span-full p-10 text-center">
                <Sparkles className="mx-auto h-10 w-10 text-primary" />
                <h2 className="mt-4 text-xl font-bold">Ainda não há agendamentos</h2>
              </Panel>
            )}
          </div>
        )}
      </div>

      {showSavePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-float">
            <div className="mb-4 flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-soft text-primary">
                <Lock className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-foreground">Quer salvar seus dados?</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Quer salvar seus dados para o seu próximo agendamento ser mais rápido? Crie uma senha de acesso.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSavePrompt(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                className={inputClass}
                type="email"
                placeholder="Email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                autoComplete="email"
              />
              <input
                className={inputClass}
                type="password"
                placeholder="Senha (mín. 6 caracteres)"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                autoComplete="new-password"
              />
              {signupError && (
                <p className="flex items-center gap-2 text-sm font-medium text-danger">
                  <AlertCircle className="h-4 w-4" /> {signupError}
                </p>
              )}
              <Button className="w-full" onClick={handleSignupAfterBooking} disabled={signupLoading}>
                {signupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                Criar conta
              </Button>
              <button
                type="button"
                onClick={() => setShowSavePrompt(false)}
                className="w-full text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Agora não, obrigada
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function AdminView({
  services,
  setServices,
  appointments,
  setAppointments,
  blockedSlots,
  setBlockedSlots,
  onLogout,
}: {
  services: Service[];
  setServices: React.Dispatch<React.SetStateAction<Service[]>>;
  appointments: Appointment[];
  setAppointments: React.Dispatch<React.SetStateAction<Appointment[]>>;
  blockedSlots: string[];
  setBlockedSlots: React.Dispatch<React.SetStateAction<string[]>>;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<AdminTab>("agenda");
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [rejecting, setRejecting] = useState<Appointment | null>(null);
  const [blockDate, setBlockDate] = useState(todayISO());
  const [blockTime, setBlockTime] = useState("");
  const [newService, setNewService] = useState({ name: "", price: "", duration: "", description: "" });
  const slots = useMemo(generateTimeSlots, []);
  const pendingCount = appointments.filter((appointment) => appointment.status === "pending").length;
  const dayAppointments = appointments.filter((appointment) => appointment.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time));
  const dayPending = dayAppointments.filter((appointment) => appointment.status === "pending").length;

  const openWhatsApp = (appointment: Appointment, type: "confirmed" | "rejected") => {
    const digits = appointment.phone.replace(/\D/g, "");
    const text = type === "confirmed"
      ? `Olá, ${appointment.clientName}! Teu agendamento de ${appointment.service.name} para ${appointment.date} às ${appointment.time} foi confirmado. Até breve!`
      : `Olá, ${appointment.clientName}. Infelizmente não conseguiremos manter teu agendamento de ${appointment.service.name} em ${appointment.date} às ${appointment.time}. Podemos encontrar outro horário?`;
    window.open(`https://wa.me/55${digits}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const updateStatus = async (appointment: Appointment, status: AppointmentStatus) => {
    try {
      await updateDoc(doc(db, "Agendamento", String(appointment.id)), { status });
      if (status === "confirmed" || status === "rejected") openWhatsApp(appointment, status);
    } catch (error) {
      console.error("Erro ao atualizar agendamento no Firestore:", error);
    }
  };

  const addBlock = async (withTime: boolean) => {
    const value = withTime && blockTime ? `${blockDate} ${blockTime}` : blockDate;
    try {
      await setDoc(doc(db, "Bloqueios", blockDocId(value)), {
        value,
        date: blockDate,
        time: withTime && blockTime ? blockTime : "",
        wholeDay: !withTime || !blockTime,
        dataCriacao: serverTimestamp(),
      });
      setBlockedSlots((current) => (current.includes(value) ? current : [value, ...current]));
    } catch (error) {
      console.error("Erro ao salvar bloqueio no Firestore:", error);
    }
  };

  const removeBlock = async (value: string) => {
    try {
      await deleteDoc(doc(db, "Bloqueios", blockDocId(value)));
      setBlockedSlots((current) => current.filter((item) => item !== value));
    } catch (error) {
      console.error("Erro ao excluir bloqueio no Firestore:", error);
    }
  };

  const addService = async () => {
    const price = Number(newService.price);
    const duration = Number(newService.duration);
    if (!newService.name.trim() || !price || !duration) return;
    try {
      await addDoc(collection(db, "Servicos"), {
        name: newService.name.trim(),
        price,
        duracao: duration,
        descricao: newService.description.trim(),
        dataCriacao: serverTimestamp(),
      });
      setNewService({ name: "", price: "", duration: "", description: "" });
    } catch (error) {
      console.error("Erro ao salvar serviço no Firestore:", error);
    }
  };

  const deleteService = async (serviceId: string) => {
    try {
      await deleteDoc(doc(db, "Servicos", serviceId));
    } catch (error) {
      console.error("Erro ao excluir serviço no Firestore:", error);
    }
  };

  const sidebarItems: { id: AdminTab; label: string; icon: typeof Calendar }[] = [
    { id: "agenda", label: "Agenda", icon: Calendar },
    { id: "availability", label: "Disponibilidade", icon: Ban },
    { id: "services", label: "Serviços", icon: Scissors },
  ];

  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="border-b border-border bg-surface-dark p-4 text-surface-dark-foreground lg:min-h-screen lg:border-b-0 lg:border-r lg:border-surface-muted/15">
        <div className="mb-8 flex items-center justify-between gap-3 lg:block">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/20 text-primary-glow"><Shield className="h-6 w-6" /></div>
            <div>
              <p className="text-sm text-surface-muted">Admin</p>
              <h1 className="text-xl font-extrabold">Bella Nails</h1>
            </div>
          </div>
          <Button variant="ghost" className="text-surface-dark-foreground hover:bg-surface-muted/10" onClick={onLogout}>Sair</Button>
        </div>
        <nav className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left font-semibold transition ${tab === item.id ? "bg-primary text-primary-foreground shadow-glow" : "text-surface-dark-foreground hover:bg-surface-muted/10"}`}
              >
                <span className="flex items-center gap-3"><Icon className="h-5 w-5" /> {item.label}</span>
                {item.id === "agenda" && pendingCount > 0 && <span className="rounded-full bg-warning px-2 py-0.5 text-xs font-black text-warning-foreground">{pendingCount}</span>}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="p-4 sm:p-6 lg:p-8">
        {tab === "agenda" && (
          <div className="space-y-6">
            <Panel className="p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-primary">Resumo do dia</p>
                  <h2 className="mt-2 text-2xl font-extrabold text-foreground">Tens {dayAppointments.length} agendamentos para hoje, sendo {dayPending} pendentes</h2>
                </div>
                <input className={`${inputClass} lg:max-w-xs`} type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
              </div>
            </Panel>
            <Panel className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] text-left text-sm">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-5 py-4">Horário</th>
                      <th className="px-5 py-4">Cliente</th>
                      <th className="px-5 py-4">Serviço</th>
                      <th className="px-5 py-4">Valor</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {dayAppointments.map((appointment) => (
                      <tr key={appointment.id} className="bg-card">
                        <td className="px-5 py-4 font-black text-foreground">{appointment.time}</td>
                        <td className="px-5 py-4"><strong>{appointment.clientName}</strong><p className="mt-1 text-muted-foreground">{appointment.phone}</p></td>
                        <td className="px-5 py-4">{appointment.service.name}</td>
                        <td className="px-5 py-4 font-bold">{formatBRL(appointment.service.price)}</td>
                        <td className="px-5 py-4"><Badge status={appointment.status} /></td>
                        <td className="px-5 py-4">
                          {appointment.status === "pending" ? (
                            <div className="flex gap-2">
                              <Button variant="success" onClick={() => updateStatus(appointment, "confirmed")}><CheckCircle2 className="h-4 w-4" /> Confirmar</Button>
                              <Button variant="danger" onClick={() => setRejecting(appointment)}><XCircle className="h-4 w-4" /> Recusar</Button>
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!dayAppointments.length && <div className="p-10 text-center text-muted-foreground">Nenhum agendamento para esta data.</div>}
              </div>
            </Panel>
          </div>
        )}

        {tab === "availability" && (
          <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
            <Panel className="p-6">
              <h2 className="text-2xl font-extrabold">Bloquear disponibilidade</h2>
              <div className="mt-5 space-y-3">
                <input className={inputClass} type="date" value={blockDate} onChange={(event) => setBlockDate(event.target.value)} />
                <select className={inputClass} value={blockTime} onChange={(event) => setBlockTime(event.target.value)}>
                  <option value="">Dia inteiro</option>
                  {slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                </select>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button onClick={() => addBlock(false)}><Ban className="h-4 w-4" /> Bloquear dia</Button>
                  <Button variant="secondary" onClick={() => addBlock(true)} disabled={!blockTime}><Clock className="h-4 w-4" /> Bloquear horário</Button>
                </div>
              </div>
            </Panel>
            <Panel className="p-6">
              <h2 className="text-2xl font-extrabold">Bloqueios ativos</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {blockedSlots.map((slot) => (
                  <div key={slot} className="flex items-center justify-between rounded-2xl bg-muted p-4">
                    <span className="font-semibold">{slot.includes(" ") ? slot : `${slot} • dia inteiro`}</span>
                    <button className="rounded-full p-2 text-danger transition hover:bg-danger/10" onClick={() => removeBlock(slot)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {!blockedSlots.length && <p className="text-muted-foreground">Nenhum bloqueio ativo.</p>}
              </div>
            </Panel>
          </div>
        )}

        {tab === "services" && (
          <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
            <Panel className="p-6">
              <h2 className="text-2xl font-extrabold">Novo serviço</h2>
              <div className="mt-5 space-y-3">
                <input className={inputClass} value={newService.name} onChange={(event) => setNewService((current) => ({ ...current, name: event.target.value }))} placeholder="Nome do serviço" />
                <input className={inputClass} type="number" value={newService.price} onChange={(event) => setNewService((current) => ({ ...current, price: event.target.value }))} placeholder="Preço" />
                <input className={inputClass} type="number" value={newService.duration} onChange={(event) => setNewService((current) => ({ ...current, duration: event.target.value }))} placeholder="Duração em minutos" />
                <input className={inputClass} value={newService.description} onChange={(event) => setNewService((current) => ({ ...current, description: event.target.value }))} placeholder="Descrição" />
                <Button className="w-full" onClick={addService}><Plus className="h-4 w-4" /> Adicionar serviço</Button>
              </div>
            </Panel>
            <div className="grid gap-4 md:grid-cols-2">
              {services.map((service) => (
                <Panel key={service.id} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold">{service.name}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">{service.duration} min • {formatBRL(service.price)}</p>
                    </div>
                    <button className="rounded-full p-2 text-danger transition hover:bg-danger/10" onClick={() => deleteService(service.id)}>
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </Panel>
              ))}
            </div>
          </div>
        )}
      </section>

      {rejecting && (
        <Modal
          title="Recusar solicitação?"
          description={`Isto irá marcar o agendamento de ${rejecting.clientName} como recusado e abrir uma mensagem no WhatsApp para avisar a cliente.`}
          onClose={() => setRejecting(null)}
          onConfirm={() => {
            updateStatus(rejecting, "rejected");
            setRejecting(null);
          }}
        />
      )}
    </main>
  );
}

export default function App() {
  const [view, setView] = useState<View>("login");
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<string[]>([`${todayISO()} 12:00`]);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    return onSnapshot(collection(db, "Servicos"), (snapshot) => {
      setServices(snapshot.docs.map((serviceDoc) => {
        const data = serviceDoc.data();
        return {
          id: serviceDoc.id,
          name: String(data.name ?? ""),
          price: Number(data.price ?? 0),
          duration: Number(data.duracao ?? data.duration ?? 0),
          description: String(data.descricao ?? data.description ?? ""),
        };
      }));
    }, (error) => console.error("Erro ao carregar serviços do Firestore:", error));
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "Agendamento"), (snapshot) => {
      const loadedAppointments = snapshot.docs.map((appointmentDoc) => {
        const data = appointmentDoc.data();
        const scheduledAt = parseFirebaseDate(data.data_agendada);
        const fallbackName = String(data.name ?? "");
        const service: Service = {
          id: String(data.serviceId ?? appointmentDoc.id),
          name: fallbackName,
          price: Number(data.price ?? 0),
          duration: Number(data.duracao ?? 0),
          description: String(data.descricao ?? ""),
        };
        return {
          id: appointmentDoc.id,
          clientId: String(data.clienteId ?? data.clientId ?? ""),
          clientName: String(data.clientName ?? "Cliente"),
          phone: String(data.phone ?? ""),
          service,
          date: scheduledAt ? toLocalISODate(scheduledAt) : todayISO(),
          time: scheduledAt ? scheduledAt.toTimeString().slice(0, 5) : "",
          status: (data.status as AppointmentStatus) ?? "pending",
          createdAt: parseFirebaseDate(data.dataCriacao)?.toISOString() ?? "",
        };
      });
      setAppointments(loadedAppointments.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)));
    }, (error) => console.error("Erro ao carregar agenda do Firestore:", error));
  }, []);

  useEffect(() => {
    return onSnapshot(collection(db, "Bloqueios"), (snapshot) => {
      setBlockedSlots(snapshot.docs.map((blockDoc) => {
        const data = blockDoc.data();
        const date = String(data.date ?? "");
        const time = String(data.time ?? "");
        return String(data.value ?? (date && time ? `${date} ${time}` : date));
      }).filter(Boolean));
    }, (error) => console.error("Erro ao carregar bloqueios do Firestore:", error));
  }, []);

  const handleGoogleSignIn = async () => {
    await signInWithPopup(auth, googleProvider);
    setView("client");
  };

  const handleGuestAccess = () => {
    let guestId = localStorage.getItem("bella-guest-id");
    if (!guestId) {
      guestId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem("bella-guest-id", guestId);
    }
    const guestUser = {
      uid: guestId,
      displayName: "Convidado",
      email: null,
      photoURL: null,
      isAnonymous: true,
    } as unknown as FirebaseUser;
    setUser(guestUser);
    setView("client");
  };

  const handleEmailAuth = async (email: string, password: string, mode: "login" | "signup") => {
    if (mode === "signup") {
      await createUserWithEmailAndPassword(auth, email, password);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    setView("client");
  };

  const handleLogout = async () => {
    if (auth.currentUser) await signOut(auth);
    setUser(null);
    setView("login");
  };

  const handleUpgradeGuest = async (newUser: FirebaseUser, oldGuestId: string) => {
    try {
      const q = query(collection(db, "Agendamento"), where("clienteId", "==", oldGuestId));
      const snap = await getDocs(q);
      await Promise.all(
        snap.docs.map((d) => updateDoc(doc(db, "Agendamento", d.id), { clienteId: newUser.uid })),
      );
    } catch (error) {
      console.error("Erro ao migrar agendamentos do convidado:", error);
    }
    localStorage.removeItem("bella-guest-id");
    setUser(newUser);
  };

  const isSlotAvailable = (date: string, time: string) => {
    if (!date || !time) return false;
    if (blockedSlots.includes(date)) return false;
    if (blockedSlots.includes(`${date} ${time}`)) return false;
    return !appointments.some(
      (appointment) =>
        appointment.date === date &&
        appointment.time === time &&
        (appointment.status === "pending" || appointment.status === "confirmed"),
    );
  };

  if (view === "login") return <LoginView onClient={handleGoogleSignIn} onEmailAuth={handleEmailAuth} onAdmin={() => setView("admin")} onGuest={handleGuestAccess} />;
  if (view === "client" && user) {
    return (
      <ClientView
        services={services}
        appointments={appointments}
        setAppointments={setAppointments}
        isSlotAvailable={isSlotAvailable}
        onLogout={handleLogout}
        user={user}
      />
    );
  }
  if (view === "client" && !user) return <LoginView onClient={handleGoogleSignIn} onEmailAuth={handleEmailAuth} onAdmin={() => setView("admin")} onGuest={handleGuestAccess} />;
  return (
    <AdminView
      services={services}
      setServices={setServices}
      appointments={appointments}
      setAppointments={setAppointments}
      blockedSlots={blockedSlots}
      setBlockedSlots={setBlockedSlots}
      onLogout={handleLogout}
    />
  );
}
