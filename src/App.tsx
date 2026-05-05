import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { collection, doc, getDocs, onSnapshot, query, setDoc, updateDoc, where, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase.js";
import { AdminView } from "@/features/salon/AdminView";
import { ClientView } from "@/features/salon/ClientView";
import { LoginView, type EmailAuthPayload } from "@/features/salon/LoginView";
import type { Appointment, AppointmentStatus, BookingProfile, Service, View } from "@/features/salon/types";
import { parseFirebaseDate, todayISO, toLocalISODate } from "@/features/salon/utils";

export default function App() {
  const [view, setView] = useState<View>("client");
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<string[]>([`${todayISO()} 12:00`]);
  const [bookingProfile, setBookingProfile] = useState<BookingProfile | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      setBookingProfile(null);
      return;
    }
    const profileRef = doc(db, "PerfisCliente", firebaseUser.uid);
    return onSnapshot(
      profileRef,
      (snap) => {
        const current = auth.currentUser;
        if (!current || current.uid !== firebaseUser.uid) return;
        if (!snap.exists()) {
          setBookingProfile({ name: current.displayName ?? "", phone: "" });
          return;
        }
        const data = snap.data();
        setBookingProfile({
          name: String(data.displayName ?? data.name ?? current.displayName ?? ""),
          phone: String(data.phone ?? ""),
        });
      },
      (error) => console.error("Erro ao carregar perfil do cliente:", error),
    );
  }, [user?.uid]);

  useEffect(() => {
    return onSnapshot(
      collection(db, "Servicos"),
      (snapshot) => {
        setServices(
          snapshot.docs.map((serviceDoc) => {
            const data = serviceDoc.data();
            return {
              id: serviceDoc.id,
              name: String(data.name ?? ""),
              price: Number(data.price ?? 0),
              duration: Number(data.duracao ?? data.duration ?? 0),
              description: String(data.descricao ?? data.description ?? ""),
            };
          }),
        );
      },
      (error) => console.error("Erro ao carregar serviços do Firestore:", error),
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      collection(db, "Agendamento"),
      (snapshot) => {
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
      },
      (error) => console.error("Erro ao carregar agenda do Firestore:", error),
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      collection(db, "Bloqueios"),
      (snapshot) => {
        setBlockedSlots(
          snapshot.docs
            .map((blockDoc) => {
              const data = blockDoc.data();
              const date = String(data.date ?? "");
              const time = String(data.time ?? "");
              return String(data.value ?? (date && time ? `${date} ${time}` : date));
            })
            .filter(Boolean),
        );
      },
      (error) => console.error("Erro ao carregar bloqueios do Firestore:", error),
    );
  }, []);

  const handleGoogleSignIn = async () => {
    await signInWithPopup(auth, googleProvider);
    setView("client");
  };

  const handleGuestAccess = async () => {
    await signInAnonymously(auth);
    setView("client");
  };

  const handleEmailAuth = async (payload: EmailAuthPayload) => {
    if (payload.mode === "signup") {
      const credential = await createUserWithEmailAndPassword(auth, payload.email, payload.password);
      const name = payload.name.trim();
      const phoneDigits = payload.phone.replace(/\D/g, "");
      await updateProfile(credential.user, { displayName: name });
      await setDoc(doc(db, "PerfisCliente", credential.user.uid), {
        displayName: name,
        phone: phoneDigits,
        email: payload.email.trim(),
        dataAtualizacao: serverTimestamp(),
      });
    } else {
      await signInWithEmailAndPassword(auth, payload.email, payload.password);
    }
    setView("client");
  };

  const handleLogout = async () => {
    if (auth.currentUser) await signOut(auth);
    setUser(null);
    setView("client");
  };

  const handleUpgradeGuest = async (newUser: FirebaseUser, oldAnonymousUid: string) => {
    try {
      const qAg = query(collection(db, "Agendamento"), where("clienteId", "==", oldAnonymousUid));
      const snapAg = await getDocs(qAg);
      await Promise.all(snapAg.docs.map((d) => updateDoc(doc(db, "Agendamento", d.id), { clienteId: newUser.uid })));

      const qBook = query(collection(db, "agendamentos"), where("userId", "==", oldAnonymousUid));
      const snapBook = await getDocs(qBook);
      await Promise.all(snapBook.docs.map((d) => updateDoc(doc(db, "agendamentos", d.id), { userId: newUser.uid })));
    } catch (error) {
      console.error("Erro ao migrar agendamentos do convidado:", error);
    }
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

  if (view === "login") {
    return (
      <LoginView
        onClient={handleGoogleSignIn}
        onEmailAuth={handleEmailAuth}
        onAdmin={() => setView("admin")}
        onGuest={handleGuestAccess}
        onBackToBooking={() => setView("client")}
      />
    );
  }
  if (view === "client") {
    return (
      <ClientView
        services={services}
        appointments={appointments}
        setAppointments={setAppointments}
        isSlotAvailable={isSlotAvailable}
        onLogout={handleLogout}
        user={user}
        onUpgradeGuest={handleUpgradeGuest}
        bookingProfile={bookingProfile}
        onOpenLogin={() => setView("login")}
      />
    );
  }
  return (
    <AdminView
      services={services}
      appointments={appointments}
      blockedSlots={blockedSlots}
      setBlockedSlots={setBlockedSlots}
      onLogout={handleLogout}
    />
  );
}
