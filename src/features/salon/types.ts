import type { User as FirebaseUser } from "firebase/auth";

export type View = "login" | "client" | "admin";
export type AppointmentStatus = "pending" | "confirmed" | "rejected";
export type AdminTab = "agenda" | "availability" | "services" | "financeiro";
export type ClientTab = "new" | "mine";

export type Service = {
  id: string;
  name: string;
  price: number;
  duration: number;
  description: string;
};

export type Appointment = {
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

/** Nome e telefone guardados em Firestore (`PerfisCliente`) para pré-preencher agendamentos. */
export type BookingProfile = {
  name: string;
  phone: string;
};

export type { FirebaseUser };
