import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User as FirebaseUser } from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
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
import { auth, db, googleProvider } from "./firebase";

type View = "login" | "client" | "admin";
type AppointmentStatus = "pending" | "confirmed" | "rejected";
type AdminTab = "agenda" | "availability" | "services";
type ClientTab = "new" | "mine";

type Service = {
  id: number;
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

const initialServices: Service[] = [
  { id: 1, name: "Manicure clássica", price: 45, duration: 60, description: "Cutilagem, lixamento e esmaltação tradicional." },
  { id: 2, name: "Pedicure spa", price: 65, duration: 75, description: "Tratamento relaxante para pés com acabamento impecável." },
  { id: 3, name: "Alongamento em gel", price: 140, duration: 120, description: "Extensão em gel com construção resistente e natural." },
  { id: 4, name: "Esmaltação em gel", price: 80, duration: 90, description: "Esmaltação de alta durabilidade com brilho intenso." },
];

const initialAppointments: Appointment[] = [
  {
    id: 101,
    clientId: "client-maria",
    clientName: "Maria Eduarda",
    phone: "11987654321",
    service: initialServices[1],
    date: todayISO(),
    time: "09:00",
    status: "confirmed",
    createdAt: new Date().toISOString(),
  },
  {
    id: 102,
    clientId: "client-ana",
    clientName: "Ana Clara",
    phone: "21988887777",
    service: initialServices[2],
    date: todayISO(),
    time: "14:30",
    status: "pending",
    createdAt: new Date().toISOString(),
  },
];

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

function LoginView({ onClient, onAdmin }: { onClient: () => Promise<void>; onAdmin: () => void }) {
  const [loading, setLoading] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleGoogle = async () => {
    setLoading(true);
    setError("");
    try {
      await onClient();
    } catch {
      setError("Não foi possível entrar com Google. Verifica se o login está ativo no Firebase.");
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

        <div className="mt-8 space-y-3">
          <Button variant="secondary" className="w-full" onClick={handleGoogle} disabled={loading}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleMark />}
            Entrar com Google
          </Button>
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
            {error && (
              <p className="mt-3 flex items-center gap-2 text-sm font-medium text-danger">
                <AlertCircle className="h-4 w-4" /> {error}
              </p>
            )}
          </div>
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
}: {
  services: Service[];
  appointments: Appointment[];
  setAppointments: React.Dispatch<React.SetStateAction<Appointment[]>>;
  isSlotAvailable: (date: string, time: string) => boolean;
  onLogout: () => void;
  user: FirebaseUser;
}) {
  const [tab, setTab] = useState<ClientTab>("new");
  const [serviceId, setServiceId] = useState<number | null>(services[0]?.id ?? null);
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [clientName, setClientName] = useState(user.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState("");
  const selectedService = services.find((service) => service.id === serviceId) ?? null;
  const slots = useMemo(generateTimeSlots, []);
  const cleanPhone = phone.replace(/\D/g, "");
  const canSubmit = Boolean(selectedService && date && time && clientName.trim() && cleanPhone.length >= 10);
  const clientAppointments = appointments.filter((appointment) => appointment.clientId === user.uid);

  const schedule = async () => {
    if (!selectedService || !canSubmit) return;
    setSaving(true);
    const newAppointment: Appointment = {
      id: Date.now(),
      clientId: user.uid,
      clientName: clientName.trim(),
      phone: cleanPhone,
      service: selectedService,
      date,
      time,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    try {
      const docRef = await addDoc(collection(db, "Agendamento"), {
        name: selectedService.name,
        price: selectedService.price,
        duracao: selectedService.duration,
        descricao: selectedService.description,
        uid: user.uid,
        clientName: clientName.trim(),
        phone: cleanPhone,
        date,
        time,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      setAppointments((current) => [{ ...newAppointment, id: docRef.id }, ...current]);
      setTab("mine");
      setTime("");
      setPhone("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-soft text-primary">
              <Scissors className="h-6 w-6" />
            </div>
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
                <input className="h-12 w-full rounded-xl border border-surface-muted/20 bg-surface-muted/10 px-4 text-sm text-surface-dark-foreground outline-none placeholder:text-surface-muted focus:border-primary" value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Nome" />
                <input className="h-12 w-full rounded-xl border border-surface-muted/20 bg-surface-muted/10 px-4 text-sm text-surface-dark-foreground outline-none placeholder:text-surface-muted focus:border-primary" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="WhatsApp" />
                <Button className="w-full" onClick={schedule} disabled={!canSubmit || saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                  Solicitar Agendamento
                </Button>
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

  const updateStatus = (appointment: Appointment, status: AppointmentStatus) => {
    setAppointments((current) => current.map((item) => (item.id === appointment.id ? { ...item, status } : item)));
    if (status === "confirmed" || status === "rejected") openWhatsApp(appointment, status);
  };

  const addBlock = (withTime: boolean) => {
    const value = withTime && blockTime ? `${blockDate} ${blockTime}` : blockDate;
    setBlockedSlots((current) => (current.includes(value) ? current : [value, ...current]));
  };

  const addService = () => {
    const price = Number(newService.price);
    const duration = Number(newService.duration);
    if (!newService.name.trim() || !price || !duration) return;
    setServices((current) => [{ id: Date.now(), name: newService.name.trim(), price, duration, description: newService.description.trim() }, ...current]);
    setNewService({ name: "", price: "", duration: "", description: "" });
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
                    <button className="rounded-full p-2 text-danger transition hover:bg-danger/10" onClick={() => setBlockedSlots((current) => current.filter((item) => item !== slot))}>
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
                    <button className="rounded-full p-2 text-danger transition hover:bg-danger/10" onClick={() => setServices((current) => current.filter((item) => item.id !== service.id))}>
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
  const [services, setServices] = useState<Service[]>(initialServices);
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [blockedSlots, setBlockedSlots] = useState<string[]>([`${todayISO()} 12:00`]);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  const handleGoogleSignIn = async () => {
    await signInWithPopup(auth, googleProvider);
    setView("client");
  };

  const handleLogout = async () => {
    if (auth.currentUser) await signOut(auth);
    setView("login");
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

  if (view === "login") return <LoginView onClient={handleGoogleSignIn} onAdmin={() => setView("admin")} />;
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
  if (view === "client" && !user) return <LoginView onClient={handleGoogleSignIn} onAdmin={() => setView("admin")} />;
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
