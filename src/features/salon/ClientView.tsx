import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { Timestamp, addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  AlertCircle,
  CalendarCheck,
  ChevronRight,
  Clock,
  Loader2,
  Lock,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { auth, db } from "@/firebase";
import type { Appointment, BookingProfile, ClientTab, FirebaseUser, Service } from "./types";
import { formatBRL, generateTimeSlots, todayISO } from "./utils";
import { Badge, Button, inputClass, Panel } from "./salon-ui";

type ClientViewProps = {
  services: Service[];
  appointments: Appointment[];
  setAppointments: Dispatch<SetStateAction<Appointment[]>>;
  isSlotAvailable: (date: string, time: string) => boolean;
  onLogout: () => void;
  user: FirebaseUser;
  onUpgradeGuest: (newUser: FirebaseUser, oldGuestId: string) => Promise<void>;
  /** Null quando não há sessão Firebase (ex.: convidado) ou ainda sem dados em `PerfisCliente`. */
  bookingProfile: BookingProfile | null;
};

export function ClientView({
  services,
  appointments,
  setAppointments,
  isSlotAvailable,
  onLogout,
  user,
  onUpgradeGuest,
  bookingProfile,
}: ClientViewProps) {
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
    user.uid && selectedService && date && time && clientName.trim() && cleanPhone.length >= 10,
  );
  const clientAppointments = appointments.filter((appointment) => appointment.clientId === user.uid);

  useEffect(() => {
    if (!serviceId && services[0]) setServiceId(services[0].id);
  }, [serviceId, services]);

  useEffect(() => {
    if (bookingProfile === null) {
      const fallbackName = user.displayName && user.displayName !== "Convidado" ? user.displayName : "";
      setClientName(fallbackName);
      setPhone("");
      return;
    }
    setClientName(bookingProfile.name);
    setPhone(bookingProfile.phone);
  }, [bookingProfile?.name, bookingProfile?.phone, user.displayName, user.uid]);

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
      if (user.isAnonymous || user.uid.startsWith("guest-")) {
        setPhone("");
      }
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
      const display = clientName.trim() || credential.user.displayName || "Cliente";
      await updateProfile(credential.user, { displayName: display });
      await setDoc(doc(db, "PerfisCliente", credential.user.uid), {
        displayName: display,
        phone: cleanPhone,
        email: signupEmail.trim(),
        dataAtualizacao: serverTimestamp(),
      });
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
            <Button variant={tab === "new" ? "primary" : "secondary"} onClick={() => setTab("new")}>
              Novo agendamento
            </Button>
            <Button variant={tab === "mine" ? "primary" : "secondary"} onClick={() => setTab("mine")}>
              Meus agendamentos
            </Button>
            <Button variant="ghost" onClick={onLogout}>
              Sair
            </Button>
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
                      type="button"
                      onClick={() => setServiceId(service.id)}
                      className={`rounded-2xl border p-5 text-left transition-all hover:-translate-y-1 hover:shadow-soft ${serviceId === service.id ? "border-primary bg-rose-soft shadow-glow" : "border-border bg-card hover:border-primary/40"}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-bold text-foreground">{service.name}</h3>
                          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4" /> {service.duration} min
                          </p>
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
                <input
                  className={`${inputClass} max-w-xs`}
                  type="date"
                  value={date}
                  min={todayISO()}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setTime("");
                  }}
                />
                <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {slots.map((slot) => {
                    const available = isSlotAvailable(date, slot);
                    return (
                      <button
                        key={slot}
                        type="button"
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
                <div className="flex justify-between gap-4">
                  <span className="text-surface-muted">Serviço</span>
                  <strong>{selectedService?.name ?? "—"}</strong>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-surface-muted">Valor</span>
                  <strong>{selectedService ? formatBRL(selectedService.price) : "—"}</strong>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-surface-muted">Data</span>
                  <strong>{date || "—"}</strong>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-surface-muted">Horário</span>
                  <strong>{time || "—"}</strong>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                <input
                  className="h-12 w-full rounded-xl border border-surface-muted/20 bg-surface-muted/10 px-4 text-sm text-surface-dark-foreground outline-none placeholder:text-surface-muted focus:border-primary"
                  value={clientName}
                  onChange={(event) => setClientName(event.target.value)}
                  placeholder="Nome obrigatório"
                  required
                />
                <input
                  className="h-12 w-full rounded-xl border border-surface-muted/20 bg-surface-muted/10 px-4 text-sm text-surface-dark-foreground outline-none placeholder:text-surface-muted focus:border-primary"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Telefone obrigatório"
                  inputMode="tel"
                  required
                />
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
            {clientAppointments.length ? (
              clientAppointments.map((appointment) => (
                <Panel key={appointment.id} className="p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-foreground">{appointment.service.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {appointment.date} às {appointment.time}
                      </p>
                    </div>
                    <Badge status={appointment.status} />
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-muted p-4 text-sm">
                    <span className="text-muted-foreground">Valor</span>
                    <strong>{formatBRL(appointment.service.price)}</strong>
                  </div>
                </Panel>
              ))
            ) : (
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
