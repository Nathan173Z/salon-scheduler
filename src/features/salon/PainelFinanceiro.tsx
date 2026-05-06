import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownCircle, ArrowUpCircle, FileText, PlusCircle, Wallet } from "lucide-react";
import { db } from "@/firebase";

/** Paleta */
const BRAND = {
  bg: "#FBF7F4",
  card: "#FFFFFF",
  ink: "#3B2630",
  inkSoft: "#6B5560",
  primary: "#693E4D",
  primaryLight: "#9B5A70",
  accent: "#C98AA0",
  success: "#3F8F6B",
  successSoft: "#DCEFE5",
  border: "#EFE6E0",
};

const DESPESA_COLORS = ["#693E4D", "#9B5A70", "#C98AA0", "#E0B7C2", "#F2D6DD"];

type Agendamento = {
  id: string;
  valor: number;
  status: string;
  data: Date | null;
};

type Despesa = {
  id: string;
  valor: number;
  categoria: string;
  descricao?: string;
  data: Date | null;
};

const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "object" && v !== null && "seconds" in (v as Record<string, unknown>)) {
    const seconds = Number((v as { seconds: number }).seconds);
    return new Date(seconds * 1000);
  }
  return null;
};

const isSameDay = (a: Date | null, b: Date) =>
  !!a && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

export function PainelFinanceiro() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [showNovaDespesa, setShowNovaDespesa] = useState(false);
  const [novaDespesa, setNovaDespesa] = useState({ valor: "", categoria: "Materiais", descricao: "" });

  // Firestore: agendamentos
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "agendamentos"),
      (snap) => {
        setAgendamentos(
          snap.docs.map((d) => {
            const data = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              valor: Number(data.valor ?? data.price ?? data.servicePrice ?? 0),
              status: String(data.status ?? "").toLowerCase(),
              data: toDate(data.data ?? data.data_agendada ?? data.date),
            };
          }),
        );
      },
      (err) => console.error("PainelFinanceiro - agendamentos:", err),
    );
    return () => unsub();
  }, []);

  // Firestore: despesas
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "despesas"),
      (snap) => {
        setDespesas(
          snap.docs.map((d) => {
            const data = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              valor: Number(data.valor ?? 0),
              categoria: String(data.categoria ?? "Outros"),
              descricao: data.descricao ? String(data.descricao) : undefined,
              data: toDate(data.data),
            };
          }),
        );
      },
      (err) => console.error("PainelFinanceiro - despesas:", err),
    );
    return () => unsub();
  }, []);

  const hoje = useMemo(() => new Date(), []);

  // Cálculos derivados
  const {
    faturamentoBruto,
    aReceber,
    ticketMedio,
    receitaHoje,
    despesaHoje,
    sparkline,
    categoriasDespesa,
    transacoes,
  } = useMemo(() => {
    const concluidos = ["concluido", "concluído", "completed", "pago", "finalizado"];
    const pendentes = ["pendente", "pending", "agendado"];

    const ags = agendamentos.filter((a) => isSameDay(a.data, hoje));
    const faturamento = ags.filter((a) => concluidos.includes(a.status)).reduce((s, a) => s + a.valor, 0);
    const pendente = ags.filter((a) => pendentes.includes(a.status)).reduce((s, a) => s + a.valor, 0);
    const atendidos = ags.filter((a) => concluidos.includes(a.status)).length;
    const ticket = atendidos > 0 ? faturamento / atendidos : 0;

    const desp = despesas.filter((d) => isSameDay(d.data, hoje));
    const despTotal = desp.reduce((s, d) => s + d.valor, 0);

    // Sparkline: últimos 7 dias de faturamento
    const spark: { dia: string; valor: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dia = new Date(hoje);
      dia.setDate(hoje.getDate() - i);
      const total = agendamentos
        .filter((a) => concluidos.includes(a.status) && isSameDay(a.data, dia))
        .reduce((s, a) => s + a.valor, 0);
      spark.push({ dia: dia.toLocaleDateString("pt-BR", { weekday: "short" }), valor: total });
    }

    // Categorias de despesa (hoje, fallback total)
    const baseCat = desp.length > 0 ? desp : despesas;
    const catMap = new Map<string, number>();
    baseCat.forEach((d) => catMap.set(d.categoria, (catMap.get(d.categoria) ?? 0) + d.valor));
    const cats = Array.from(catMap.entries()).map(([name, value]) => ({ name, value }));

    // Últimas transações (entradas + saídas, ordenadas)
    const entradas = agendamentos
      .filter((a) => concluidos.includes(a.status))
      .map((a) => ({
        id: `in-${a.id}`,
        tipo: "entrada" as const,
        descricao: "Serviço concluído",
        valor: a.valor,
        data: a.data,
      }));
    const saidas = despesas.map((d) => ({
      id: `out-${d.id}`,
      tipo: "saida" as const,
      descricao: d.descricao ?? d.categoria,
      valor: d.valor,
      data: d.data,
    }));
    const trans = [...entradas, ...saidas]
      .filter((t) => t.data)
      .sort((a, b) => (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0))
      .slice(0, 8);

    return {
      faturamentoBruto: faturamento,
      aReceber: pendente,
      ticketMedio: ticket,
      receitaHoje: faturamento,
      despesaHoje: despTotal,
      sparkline: spark,
      categoriasDespesa: cats,
      transacoes: trans,
    };
  }, [agendamentos, despesas, hoje]);

  const registrarDespesa = async () => {
    const valor = Number(novaDespesa.valor.replace(",", "."));
    if (!valor || valor <= 0) return;
    try {
      await addDoc(collection(db, "despesas"), {
        valor,
        categoria: novaDespesa.categoria,
        descricao: novaDespesa.descricao,
        data: serverTimestamp(),
      });
      setNovaDespesa({ valor: "", categoria: "Materiais", descricao: "" });
      setShowNovaDespesa(false);
    } catch (e) {
      console.error("Erro ao registrar despesa:", e);
    }
  };

  const gerarRelatorio = () => {
    const linhas = [
      ["Tipo", "Descrição", "Valor", "Data"],
      ...transacoes.map((t) => [
        t.tipo,
        t.descricao,
        String(t.valor),
        t.data?.toISOString() ?? "",
      ]),
    ];
    const csv = linhas.map((l) => l.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-financeiro-${hoje.toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const barData = [
    { nome: "Receita", valor: receitaHoje },
    { nome: "Despesa", valor: despesaHoje },
  ];

  return (
    <div style={{ background: BRAND.bg }} className="min-h-screen p-6 lg:p-8">
      {/* Cabeçalho */}
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: BRAND.primaryLight }}>
          Bella Nails
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight" style={{ color: BRAND.ink }}>
          PAINEL DE CONTROLE FINANCEIRO
        </h1>
      </header>

      {/* Linha 1: KPIs */}
      <div className="grid gap-5 md:grid-cols-3">
        <KpiCard
          titulo="Faturamento Bruto (Hoje)"
          valor={brl(faturamentoBruto)}
          icone={<Wallet className="h-5 w-5" />}
        >
          <ResponsiveContainer width="100%" height={56}>
            <LineChart data={sparkline}>
              <Line
                type="monotone"
                dataKey="valor"
                stroke={BRAND.primary}
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </KpiCard>

        <KpiCard
          titulo="A Receber (Pendentes)"
          valor={brl(aReceber)}
          icone={<ArrowDownCircle className="h-5 w-5" />}
          destaque={BRAND.primaryLight}
        >
          <p className="text-xs" style={{ color: BRAND.inkSoft }}>
            Soma de agendamentos pendentes de hoje.
          </p>
        </KpiCard>

        <KpiCard
          titulo="Ticket Médio (Hoje)"
          valor={brl(ticketMedio)}
          icone={<ArrowUpCircle className="h-5 w-5" />}
        >
          <p className="text-xs" style={{ color: BRAND.inkSoft }}>
            Faturamento ÷ clientes atendidas.
          </p>
        </KpiCard>
      </div>

      {/* Linha 2: 3 blocos */}
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {/* Receita vs Despesa */}
        <Bloco titulo="Receita vs. Despesa (Hoje)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData}>
              <XAxis dataKey="nome" stroke={BRAND.inkSoft} fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke={BRAND.inkSoft} fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: "rgba(105,62,77,0.06)" }}
                formatter={(v: number) => brl(v)}
                contentStyle={{ borderRadius: 12, border: `1px solid ${BRAND.border}` }}
              />
              <Bar dataKey="valor" radius={[8, 8, 0, 0]}>
                <Cell fill={BRAND.primary} />
                <Cell fill={BRAND.accent} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Bloco>

        {/* Categorias de Despesa */}
        <Bloco titulo="Categorias de Despesa">
          {categoriasDespesa.length === 0 ? (
            <EmptyMsg texto="Sem despesas registradas." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={categoriasDespesa}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {categoriasDespesa.map((_, i) => (
                    <Cell key={i} fill={DESPESA_COLORS[i % DESPESA_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => brl(v)}
                  contentStyle={{ borderRadius: 12, border: `1px solid ${BRAND.border}` }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          <ul className="mt-3 space-y-1.5">
            {categoriasDespesa.map((c, i) => (
              <li key={c.name} className="flex items-center justify-between text-xs" style={{ color: BRAND.inkSoft }}>
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: DESPESA_COLORS[i % DESPESA_COLORS.length] }}
                  />
                  {c.name}
                </span>
                <span className="font-semibold" style={{ color: BRAND.ink }}>
                  {brl(c.value)}
                </span>
              </li>
            ))}
          </ul>
        </Bloco>

        {/* Últimas Transações */}
        <Bloco titulo="Últimas Transações">
          <div className="flex-1 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: 240 }}>
            {transacoes.length === 0 ? (
              <EmptyMsg texto="Sem movimentações ainda." />
            ) : (
              transacoes.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-xl px-3 py-2"
                  style={{ background: BRAND.bg }}
                >
                  <div className="flex items-center gap-2">
                    {t.tipo === "entrada" ? (
                      <ArrowUpCircle className="h-4 w-4" style={{ color: BRAND.success }} />
                    ) : (
                      <ArrowDownCircle className="h-4 w-4" style={{ color: BRAND.primaryLight }} />
                    )}
                    <span className="text-sm" style={{ color: BRAND.ink }}>
                      {t.descricao}
                    </span>
                  </div>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: t.tipo === "entrada" ? BRAND.success : BRAND.primary }}
                  >
                    {t.tipo === "entrada" ? "+" : "−"} {brl(t.valor)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowNovaDespesa(true)}
              className="flex items-center justify-center gap-2 rounded-xl border-2 bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-[#FBF7F4]"
              style={{ borderColor: BRAND.primaryLight, color: BRAND.primary }}
            >
              <PlusCircle className="h-4 w-4" />
              Registrar Nova Despesa
            </button>
            <button
              type="button"
              onClick={gerarRelatorio}
              className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ background: BRAND.success }}
            >
              <FileText className="h-4 w-4" />
              Gerar Relatório Completo
            </button>
          </div>
        </Bloco>
      </div>

      {/* Modal nova despesa */}
      {showNovaDespesa && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => setShowNovaDespesa(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold" style={{ color: BRAND.ink }}>
              Registrar Nova Despesa
            </h3>
            <div className="mt-4 space-y-3">
              <Field label="Valor (R$)">
                <input
                  type="number"
                  step="0.01"
                  value={novaDespesa.valor}
                  onChange={(e) => setNovaDespesa({ ...novaDespesa, valor: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                  style={{ borderColor: BRAND.border }}
                />
              </Field>
              <Field label="Categoria">
                <select
                  value={novaDespesa.categoria}
                  onChange={(e) => setNovaDespesa({ ...novaDespesa, categoria: e.target.value })}
                  className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none"
                  style={{ borderColor: BRAND.border }}
                >
                  <option>Materiais</option>
                  <option>Aluguel</option>
                  <option>Marketing</option>
                  <option>Salários</option>
                  <option>Outros</option>
                </select>
              </Field>
              <Field label="Descrição (opcional)">
                <input
                  type="text"
                  value={novaDespesa.descricao}
                  onChange={(e) => setNovaDespesa({ ...novaDespesa, descricao: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: BRAND.border }}
                />
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNovaDespesa(false)}
                className="rounded-lg px-4 py-2 text-sm font-semibold"
                style={{ color: BRAND.inkSoft }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={registrarDespesa}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ background: BRAND.primary }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========== Subcomponentes ========== */

function KpiCard({
  titulo,
  valor,
  icone,
  destaque = BRAND.primary,
  children,
}: {
  titulo: string;
  valor: string;
  icone: React.ReactNode;
  destaque?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(105,62,77,0.06)]"
      style={{ border: `1px solid ${BRAND.border}` }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: BRAND.inkSoft }}>
          {titulo}
        </p>
        <span
          className="grid h-8 w-8 place-items-center rounded-full"
          style={{ background: `${destaque}15`, color: destaque }}
        >
          {icone}
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold" style={{ color: BRAND.ink }}>
        {valor}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(105,62,77,0.06)]"
      style={{ border: `1px solid ${BRAND.border}` }}
    >
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wider" style={{ color: BRAND.ink }}>
        {titulo}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold" style={{ color: BRAND.inkSoft }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function EmptyMsg({ texto }: { texto: string }) {
  return (
    <div className="grid h-[200px] place-items-center text-sm" style={{ color: BRAND.inkSoft }}>
      {texto}
    </div>
  );
}

export default PainelFinanceiro;
