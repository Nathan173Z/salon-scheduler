import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { createUserWithEmailAndPassword, signInWithPopup, updateProfile } from "firebase/auth";
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
import { auth, db, googleProvider } from "@/firebase";
import type { Appointment, BookingProfile, ClientTab, FirebaseUser, Service } from "./types";
import { formatBRL, generateTimeSlots, todayISO } from "./utils";
import { Badge, Button, inputClass, Panel } from "./salon-ui";

type ClientViewProps = {
  services: Service[];
  appointments: Appointment[];
  setAppointments: Dispatch<SetStateAction<Appointment[]>>;
  isSlotAvailable: (date: string, time: string) => boolean;
  onLogout: () => void;
  /** Sessão Firebase (null = a navegar serviços/horários sem login). */
  user: FirebaseUser | null;
  onUpgradeGuest: (newUser: FirebaseUser, oldGuestId: string) => Promise<void>;
  /** Null quando não há sessão ou ainda sem dados em `PerfisCliente`. */
  bookingProfile: BookingProfile | null;
  onOpenLogin: () => void;
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
  onOpenLogin,
}: ClientViewProps) {
  const [tab, setTab] = useState<ClientTab>("new");
  const [serviceId, setServiceId] = useState<string | null>(services[0]?.id ?? null);
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [clientName, setClientName] = useState("");
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
  const selectionReady = Boolean(selectedService && date && time);
  const canConfirm = selectionReady && cleanPhone.length >= 10;
  const clientAppointments = user ? appointments.filter((appointment) => appointment.clientId === user.uid) : [];

  useEffect(() => {
    if (!serviceId && services[0]) setServiceId(services[0].id);
  }, [serviceId, services]);

  useEffect(() => {
    if (!user) {
      setClientName("");
      setPhone("");
      return;
    }
    if (bookingProfile === null) {
      const fallbackName = user.displayName?.trim() ? user.displayName : "";
      if (fallbackName) setClientName(fallbackName);
      return;
    }
    setClientName(bookingProfile.name);
    setPhone(bookingProfile.phone);
  }, [user?.uid, bookingProfile?.name, bookingProfile?.phone, user?.displayName]);

  /**
   * Confirma o agendamento: sem sessão Firebase abre o Google Sign-In; em seguida grava na coleção `agendamentos`
   * (e espelha em `Agendamento` para o painel existente). Um único clique — após o login o salvamento continua no mesmo fluxo.
   */
  const handleConfirmar = async () => {
    setSaveError("");
    setSaveMessage("");
    if (!selectionReady || !selectedService) {
      setSaveError("Escolhe serviço, data e horário.");
      return;
    }
    if (cleanPhone.length < 10) {
      setSaveError("Indica um telefone válido com DDD (mín. 10 dígitos).");
      return;
    }

    setSaving(true);
    try {
      let currentUser = auth.currentUser;
      if (!currentUser) {
        const { user: googleUser } = await signInWithPopup(auth, googleProvider);
        currentUser = googleUser;
      }

      const displayNameFromAuth = currentUser.displayName?.trim() ?? null;
      const emailFromAuth = currentUser.email;
      const resolvedName = (displayNameFromAuth || clientName.trim() || "Cliente").trim();
      if (!resolvedName || resolvedName === "Cliente") {
        setSaveError("Não foi possível obter o nome. Preenche o campo nome ou usa uma conta Google com nome público.");
        setSaving(false);
        return;
      }

      const scheduledAt = new Date(`${date}T${time}:00`);
      const serviceFromForm: Service = {
        id: selectedService.id,
        name: selectedService.name,
        price: selectedService.price,
        duration: selectedService.duration,
        description: selectedService.description,
      };

      await addDoc(collection(db, "agendamentos"), {
        userId: currentUser.uid,
        userDisplayName: resolvedName,
        userEmail: emailFromAuth ?? null,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        servicePrice: selectedService.price,
        serviceDuration: selectedService.duration,
        serviceDescription: selectedService.description,
        date,
        time,
        phone: cleanPhone,
        status: "pending",
        data_agendada: Timestamp.fromDate(scheduledAt),
        createdAt: serverTimestamp(),
      });

      const agRef = await addDoc(collection(db, "Agendamento"), {
        name: selectedService.name,
        price: selectedService.price,
        duracao: selectedService.duration,
        descricao: selectedService.description,
        clienteId: currentUser.uid,
        clientName: resolvedName,
        phone: cleanPhone,
        serviceId: selectedService.id,
        status: "pending",
        data_agendada: Timestamp.fromDate(scheduledAt),
        dataCriacao: serverTimestamp(),
      });

      const newAppointment: Appointment = {
        id: agRef.id,
        clientId: currentUser.uid,
        clientName: resolvedName,
        phone: cleanPhone,
        service: serviceFromForm,
        date,
        time,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      setAppointments((current) => [newAppointment, ...current]);

      setSaveMessage("Agendamento confirmado e guardado.");
      setTab("mine");
      setTime("");
      if (currentUser.isAnonymous) {
        setShowSavePrompt(true);
      }
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code ?? "";
      if (code === "auth/popup-closed-by-user") {
        setSaveError("Login cancelado. Tenta novamente quando quiseres confirmar.");
      } else {
        console.error("Erro ao confirmar agendamento:", error);
        setSaveError("Não foi possível guardar. Verifica rede, regras do Firestore e se o Google Sign-In está ativo.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSignupAfterBooking = async () => {
    if (!user) return;
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
            {user?.photoURL ? (
              <img src={user.photoURL} alt={user.displayName ?? "Foto do usuário"} className="h-12 w-12 rounded-2xl object-cover" />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-soft text-primary">
                <User className="h-6 w-6" />
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">
                {user ? `Olá, ${user.displayName ?? "cliente"}` : "Estás a navegar como visitante"}
              </p>
              <h1 className="text-2xl font-extrabold text-foreground">Teu salão de unhas</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={tab === "new" ? "primary" : "secondary"} onClick={() => setTab("new")}>
              Novo agendamento
            </Button>
            <Button variant={tab === "mine" ? "primary" : "secondary"} onClick={() => setTab("mine")} disabled={!user}>
              Meus agendamentos
            </Button>
            {user ? (
              <Button variant="ghost" onClick={onLogout}>
                Sair
              </Button>
            ) : (
              <Button variant="secondary" onClick={onOpenLogin}>
                Entrar na conta
              </Button>
            )}
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
                  placeholder="Nome (ou usa o nome da conta Google ao confirmar)"
                />
                <input
                  className="h-12 w-full rounded-xl border border-surface-muted/20 bg-surface-muted/10 px-4 text-sm text-surface-dark-foreground outline-none placeholder:text-surface-muted focus:border-primary"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Telefone com DDD (obrigatório)"
                  inputMode="tel"
                  required
                />
                <Button className="w-full" onClick={handleConfirmar} disabled={!canConfirm || saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                  Confirmar agendamento
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
                <h2 className="mt-4 text-xl font-bold">{user ? "Ainda não há agendamentos" : "Inicia sessão para ver os teus agendamentos"}</h2>
                {!user && (
                  <Button className="mt-4" variant="secondary" onClick={onOpenLogin}>
                    Entrar
                  </Button>
                )}
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
