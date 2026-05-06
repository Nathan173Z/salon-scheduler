import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  Ban,
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  Scissors,
  Shield,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react";
import { PainelFinanceiro } from "./PainelFinanceiro";
import { db } from "@/firebase";
import type { AdminTab, Appointment, AppointmentStatus, Service } from "./types";
import { blockDocId, formatBRL, generateTimeSlots, todayISO } from "./utils";
import { Badge, Button, inputClass, Modal, Panel } from "./salon-ui";

type AdminViewProps = {
  services: Service[];
  appointments: Appointment[];
  blockedSlots: string[];
  setBlockedSlots: Dispatch<SetStateAction<string[]>>;
  onLogout: () => void;
};

export function AdminView({ services, appointments, blockedSlots, setBlockedSlots, onLogout }: AdminViewProps) {
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
    const text =
      type === "confirmed"
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
    { id: "financeiro", label: "Financeiro", icon: Wallet },
  ];

  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="border-b border-border bg-surface-dark p-4 text-surface-dark-foreground lg:min-h-screen lg:border-b-0 lg:border-r lg:border-surface-muted/15">
        <div className="mb-8 flex items-center justify-between gap-3 lg:block">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/20 text-primary-glow">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-surface-muted">Admin</p>
              <h1 className="text-xl font-extrabold">Bella Nails</h1>
            </div>
          </div>
          <Button variant="ghost" className="text-surface-dark-foreground hover:bg-surface-muted/10" onClick={onLogout}>
            Sair
          </Button>
        </div>
        <nav className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left font-semibold transition ${tab === item.id ? "bg-primary text-primary-foreground shadow-glow" : "text-surface-dark-foreground hover:bg-surface-muted/10"}`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-5 w-5" /> {item.label}
                </span>
                {item.id === "agenda" && pendingCount > 0 && (
                  <span className="rounded-full bg-warning px-2 py-0.5 text-xs font-black text-warning-foreground">{pendingCount}</span>
                )}
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
                  <h2 className="mt-2 text-2xl font-extrabold text-foreground">
                    Tens {dayAppointments.length} agendamentos para hoje, sendo {dayPending} pendentes
                  </h2>
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
                        <td className="px-5 py-4">
                          <strong>{appointment.clientName}</strong>
                          <p className="mt-1 text-muted-foreground">{appointment.phone}</p>
                        </td>
                        <td className="px-5 py-4">{appointment.service.name}</td>
                        <td className="px-5 py-4 font-bold">{formatBRL(appointment.service.price)}</td>
                        <td className="px-5 py-4">
                          <Badge status={appointment.status} />
                        </td>
                        <td className="px-5 py-4">
                          {appointment.status === "pending" ? (
                            <div className="flex gap-2">
                              <Button variant="success" onClick={() => updateStatus(appointment, "confirmed")}>
                                <CheckCircle2 className="h-4 w-4" /> Confirmar
                              </Button>
                              <Button variant="danger" onClick={() => setRejecting(appointment)}>
                                <XCircle className="h-4 w-4" /> Recusar
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
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
                  {slots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button onClick={() => addBlock(false)}>
                    <Ban className="h-4 w-4" /> Bloquear dia
                  </Button>
                  <Button variant="secondary" onClick={() => addBlock(true)} disabled={!blockTime}>
                    <Clock className="h-4 w-4" /> Bloquear horário
                  </Button>
                </div>
              </div>
            </Panel>
            <Panel className="p-6">
              <h2 className="text-2xl font-extrabold">Bloqueios ativos</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {blockedSlots.map((slot) => (
                  <div key={slot} className="flex items-center justify-between rounded-2xl bg-muted p-4">
                    <span className="font-semibold">{slot.includes(" ") ? slot : `${slot} • dia inteiro`}</span>
                    <button type="button" className="rounded-full p-2 text-danger transition hover:bg-danger/10" onClick={() => removeBlock(slot)}>
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
                <input
                  className={inputClass}
                  value={newService.name}
                  onChange={(event) => setNewService((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Nome do serviço"
                />
                <input
                  className={inputClass}
                  type="number"
                  value={newService.price}
                  onChange={(event) => setNewService((current) => ({ ...current, price: event.target.value }))}
                  placeholder="Preço"
                />
                <input
                  className={inputClass}
                  type="number"
                  value={newService.duration}
                  onChange={(event) => setNewService((current) => ({ ...current, duration: event.target.value }))}
                  placeholder="Duração em minutos"
                />
                <input
                  className={inputClass}
                  value={newService.description}
                  onChange={(event) => setNewService((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Descrição"
                />
                <Button className="w-full" onClick={addService}>
                  <Plus className="h-4 w-4" /> Adicionar serviço
                </Button>
              </div>
            </Panel>
            <div className="grid gap-4 md:grid-cols-2">
              {services.map((service) => (
                <Panel key={service.id} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold">{service.name}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {service.duration} min • {formatBRL(service.price)}
                      </p>
                    </div>
                    <button type="button" className="rounded-full p-2 text-danger transition hover:bg-danger/10" onClick={() => deleteService(service.id)}>
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </Panel>
              ))}
            </div>
          </div>
        {tab === "financeiro" && <PainelFinanceiro />}
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
