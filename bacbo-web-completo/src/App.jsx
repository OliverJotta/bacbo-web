import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Upload, RefreshCw, Plus, Scissors, Eraser, Link2, TrendingUp, ListFilter } from "lucide-react";

/**
 * Bac Bo – Rastreador de Padrões
 * --------------------------------
 * O que faz:
 * - Permite registrar resultados (Red/Blue/Tie) rapidamente
 * - Mostra últimas ocorrências, streaks, alternâncias de cor, viés recente
 * - Detecta “padrões” comuns (zebra/alternância, sequência longa, viés por cor)
 * - Gráfico de distribuição de streaks por cor
 * - Importar/Exportar histórico (JSON) e colar lista bruta
 * - Modo "pull" opcional: busca JSON de uma URL (formato simples) a cada X segundos
 *
 * IMPORTANT:
 * - Não faz scraping automático de casas: respeite os Termos de Uso e leis locais.
 * - Se quiser automatizar, crie uma API própria ou use um export oficial do provedor.
 */

// Tipos simplificados
const COLORS = {
  RED: "R",
  BLUE: "B",
  TIE: "T",
} as const;

type ColorKey = typeof COLORS[keyof typeof COLORS]; // "R" | "B" | "T"

type Result = {
  id: string; // unique
  v: ColorKey; // winner color
  ts: number; // timestamp (ms)
};

// Utilidades
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const colorLabel = (v: ColorKey) => (v === "R" ? "Red" : v === "B" ? "Blue" : "Tie");

const pillClass = (v: ColorKey) =>
  `px-2 py-1 rounded-full text-xs font-medium ${
    v === "R"
      ? "bg-red-100 text-red-700"
      : v === "B"
      ? "bg-blue-100 text-blue-700"
      : "bg-zinc-100 text-zinc-700"
  }`;

const dotClass = (v: ColorKey) =>
  `w-3 h-3 rounded-full ${v === "R" ? "bg-red-500" : v === "B" ? "bg-blue-500" : "bg-zinc-400"}`;

// Parsing de entrada bruta: aceita R/B/T ou palavras
function parseBulk(text: string): ColorKey[] {
  return text
    .toUpperCase()
    .replaceAll(/[^RBTREDLUEI\s,;\-\|]/g, " ") // limpa
    .split(/[\s,;\\-|]+/)
    .map((t) => {
      if (!t) return null as any;
      if (["R", "RED"].includes(t)) return "R";
      if (["B", "BLUE"].includes(t)) return "B";
      if (["T", "TIE"].includes(t)) return "T";
      return null as any;
    })
    .filter(Boolean) as ColorKey[];
}

// Cálculos de padrões
function computeStats(history: Result[]) {
  const lastN = (n: number) => history.slice(-n);
  const seq = history.map((r) => r.v);

  // Alternâncias (mudanças de cor entre R/B) — T não conta para alternância
  let alternations = 0;
  let lastColor: ColorKey | null = null;
  for (const v of seq) {
    if (v === "T") continue;
    if (lastColor && v !== lastColor) alternations++;
    lastColor = v;
  }

  // Streak atual (ignora T para streak por cor)
  let currentStreak = 0;
  let currentColor: ColorKey | null = null;
  for (let i = seq.length - 1; i >= 0; i--) {
    const v = seq[i];
    if (v === "T") break; // interrompe streak por presença de tie
    if (currentColor === null) {
      currentColor = v;
      currentStreak = 1;
    } else if (v === currentColor) {
      currentStreak++;
    } else {
      break;
    }
  }

  // Longest streak por cor
  const longest: Record<ColorKey, number> = { R: 0, B: 0, T: 0 };
  let runColor: ColorKey | null = null;
  let runLen = 0;
  for (const v of seq) {
    if (runColor === v) runLen++;
    else {
      if (runColor) longest[runColor] = Math.max(longest[runColor], runLen);
      runColor = v;
      runLen = 1;
    }
  }
  if (runColor) longest[runColor] = Math.max(longest[runColor], runLen);

  // Distribuição de streaks por cor (cap 6+)
  const dist = {
    R: { 1: 0, 2: 0, 3: 0, 4: 0, "5": 0, "6+": 0 },
    B: { 1: 0, 2: 0, 3: 0, 4: 0, "5": 0, "6+": 0 },
  } as any;
  runColor = null;
  runLen = 0;
  for (const v of seq) {
    if (v === "T") {
      if (runColor && (runColor === "R" || runColor === "B")) {
        const bucket = runLen >= 6 ? "6+" : (runLen as any);
        dist[runColor][bucket]++;
      }
      runColor = null;
      runLen = 0;
      continue;
    }
    if (runColor === v) runLen++;
    else {
      if (runColor && (runColor === "R" || runColor === "B")) {
        const bucket = runLen >= 6 ? "6+" : (runLen as any);
        dist[runColor][bucket]++;
      }
      runColor = v;
      runLen = 1;
    }
  }
  if (runColor && (runColor === "R" || runColor === "B")) {
    const bucket = runLen >= 6 ? "6+" : (runLen as any);
    dist[runColor][bucket]++;
  }

  // Janela recente (últimos 20)
  const last20 = lastN(20).map((r) => r.v);
  const count20 = { R: 0, B: 0, T: 0 } as Record<ColorKey, number>;
  last20.forEach((v) => (count20[v]++));

  // Zebra: maior sequência de alternância perfeita R/B/R/B…
  let zebraMax = 0;
  let zebraCur = 0;
  lastColor = null;
  for (const v of seq) {
    if (v === "T") {
      zebraMax = Math.max(zebraMax, zebraCur);
      zebraCur = 0;
      lastColor = null;
      continue;
    }
    if (lastColor && v !== lastColor) zebraCur++;
    else if (!lastColor) zebraCur = 1; // inicia
    else zebraCur = 1; // reset começa novo
    lastColor = v;
    zebraMax = Math.max(zebraMax, zebraCur);
  }

  return {
    total: history.length,
    alternations,
    currentStreak,
    currentColor,
    longest,
    dist,
    last20: count20,
    zebraMax,
  };
}

function useInterval(callback: () => void, delay: number | null) {
  const saved = useRef<() => void>();
  useEffect(() => {
    saved.current = callback;
  }, [callback]);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => saved.current && saved.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

export default function BacBoPatternTracker() {
  const [history, setHistory] = useState<Result[]>(() => {
    const saved = localStorage.getItem("bacbo-history");
    if (saved) return JSON.parse(saved);
    return [];
  });
  const [bulk, setBulk] = useState("");
  const [pollUrl, setPollUrl] = useState("");
  const [pollSec, setPollSec] = useState(0);

  useEffect(() => {
    localStorage.setItem("bacbo-history", JSON.stringify(history));
  }, [history]);

  const stats = useMemo(() => computeStats(history), [history]);

  // Modo "pull" simples: espera um JSON { results: ["R","B","T", ...] }
  useInterval(
    async () => {
      if (!pollUrl) return;
      try {
        const res = await fetch(pollUrl);
        const data = await res.json();
        if (Array.isArray(data?.results)) {
          const sanitized = (data.results as string[])
            .map((x) => (x || "").toUpperCase())
            .filter((x) => ["R", "B", "T"].includes(x)) as ColorKey[];
          // Se os novos já incluem os antigos, só substitui; caso contrário, concatena de forma única.
          const next: Result[] = sanitized.map((v: ColorKey) => ({ id: uid(), v, ts: Date.now() }));
          if (next.length) setHistory(next);
        }
      } catch (e) {
        console.warn("Falha ao buscar:", e);
      }
    },
    pollSec > 0 ? pollSec * 1000 : null
  );

  function push(v: ColorKey) {
    setHistory((h) => [...h, { id: uid(), v, ts: Date.now() }]);
  }

  function undo() {
    setHistory((h) => h.slice(0, -1));
  }

  function clearAll() {
    if (confirm("Limpar todo o histórico?")) setHistory([]);
  }

  function handleBulkAdd() {
    const arr = parseBulk(bulk);
    if (!arr.length) return;
    setHistory((h) => [...h, ...arr.map((v) => ({ id: uid(), v, ts: Date.now() }))]);
    setBulk("");
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bacbo-history-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (Array.isArray(parsed)) {
          const valid = parsed
            .filter((r: any) => r && ["R", "B", "T"].includes(r.v))
            .map((r: any) => ({ id: r.id || uid(), v: r.v as ColorKey, ts: r.ts || Date.now() }));
          setHistory(valid);
        } else if (Array.isArray(parsed.results)) {
          const valid = (parsed.results as any[])
            .filter((v) => ["R", "B", "T"].includes(v))
            .map((v) => ({ id: uid(), v, ts: Date.now() }));
          setHistory(valid);
        } else {
          alert("JSON inválido");
        }
      } catch (e) {
        alert("Falha ao ler JSON");
      }
    };
    reader.readAsText(file);
  }

  // Dados do gráfico: distribuição de streaks
  const chartData = useMemo(() => {
    const rows: any[] = [];
    const buckets = ["1", "2", "3", "4", "5", "6+"];
    for (const b of buckets) {
      rows.push({ bucket: b, Red: stats.dist.R[b] || 0, Blue: stats.dist.B[b] || 0 });
    }
    return rows;
  }, [stats]);

  // Sinais/Heurísticas simples (não são predição nem garantia!)
  const signals = useMemo(() => {
    const list: { id: string; title: string; desc: string; on?: boolean }[] = [];
    const total20 = stats.last20.R + stats.last20.B + stats.last20.T;
    const redBias = total20 > 0 ? stats.last20.R / total20 : 0;
    const blueBias = total20 > 0 ? stats.last20.B / total20 : 0;

    list.push({
      id: "zebra",
      title: "Zebra / Alternância",
      desc: `Maior alternância consecutiva observada: ${stats.zebraMax}`,
      on: stats.zebraMax >= 5,
    });

    list.push({
      id: "streaklong",
      title: "Sequência Longa",
      desc: `Maior streak: R=${stats.longest.R}, B=${stats.longest.B}`,
      on: stats.longest.R >= 5 || stats.longest.B >= 5,
    });

    list.push({
      id: "bias",
      title: "Viés nas últimas 20",
      desc: `Últimos 20 → R=${stats.last20.R}, B=${stats.last20.B}, T=${stats.last20.T}`,
      on: redBias >= 0.6 || blueBias >= 0.6,
    });

    list.push({
      id: "ties",
      title: "Ties frequentes",
      desc: `Últimos 20 tiveram ${stats.last20.T} ties`,
      on: stats.last20.T >= 3,
    });

    return list;
  }, [stats]);

  return (
    <div className="min-h-screen w-full bg-white text-zinc-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto grid gap-4">
        <motion.h1 className="text-2xl md:text-3xl font-bold" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          Bac Bo – Rastreador de Padrões
        </motion.h1>
        <p className="text-sm text-zinc-600 -mt-2">
          Ferramenta educacional para monitorar tendências. Não é conselho financeiro nem garantia de resultados. Jogue com responsabilidade.
        </p>

        <Tabs defaultValue="painel" className="mt-2">
          <TabsList>
            <TabsTrigger value="painel"><TrendingUp className="w-4 h-4 mr-1"/>Painel</TabsTrigger>
            <TabsTrigger value="historico"><ListFilter className="w-4 h-4 mr-1"/>Histórico</TabsTrigger>
            <TabsTrigger value="dados"><Link2 className="w-4 h-4 mr-1"/>Dados/Integração</TabsTrigger>
          </TabsList>

          <TabsContent value="painel">
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="col-span-2">
                <CardHeader>
                  <CardTitle>Adicionar resultado</CardTitle>
                  <CardDescription>Registre rapidamente o vencedor da rodada.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={() => push("R")} className="rounded-2xl">Red</Button>
                    <Button onClick={() => push("B")} className="rounded-2xl" variant="secondary">Blue</Button>
                    <Button onClick={() => push("T")} className="rounded-2xl" variant="outline">Tie</Button>
                    <Button onClick={undo} className="rounded-2xl" variant="outline"><Scissors className="w-4 h-4 mr-2"/>Desfazer</Button>
                    <Button onClick={clearAll} className="rounded-2xl" variant="ghost"><Eraser className="w-4 h-4 mr-2"/>Limpar</Button>
                  </div>
                  <div className="grid md:grid-cols-3 gap-3 items-end">
                    <div className="md:col-span-2 grid gap-2">
                      <label className="text-sm text-zinc-600">Colar lista (R/B/T ou Red/Blue/Tie)</label>
                      <Input value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="Ex: R B R R T B ..." />
                    </div>
                    <Button onClick={handleBulkAdd} className="rounded-2xl">
                      <Plus className="w-4 h-4 mr-2"/>Adicionar em lote
                    </Button>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center gap-2 mb-2 text-sm text-zinc-600">Últimos 50</div>
                    <div className="flex flex-wrap gap-2">
                      {history.slice(-50).map((r) => (
                        <div key={r.id} className="flex items-center gap-1">
                          <span className={dotClass(r.v)} />
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Resumo</CardTitle>
                  <CardDescription>Estatísticas rápidas</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm">
                  <div className="flex justify-between"><span>Total de rodadas</span><span className="font-medium">{stats.total}</span></div>
                  <div className="flex justify-between"><span>Alternâncias R↔B</span><span className="font-medium">{stats.alternations}</span></div>
                  <div className="flex justify-between"><span>Streak atual</span><span className={pillClass((stats.currentColor as any) || "T")}>{stats.currentStreak}× {stats.currentColor ? colorLabel(stats.currentColor) : "—"}</span></div>
                  <div className="flex justify-between"><span>Maior streak Red</span><span className="font-medium">{stats.longest.R}</span></div>
                  <div className="flex justify-between"><span>Maior streak Blue</span><span className="font-medium">{stats.longest.B}</span></div>
                  <div className="flex justify-between"><span>Maior alternância ("zebra")</span><span className="font-medium">{stats.zebraMax}</span></div>
                  <div className="flex justify-between"><span>Últimos 20</span>
                    <span className="font-medium flex gap-2">
                      <span className={pillClass("R" as any)}>R {stats.last20.R}</span>
                      <span className={pillClass("B" as any)}>B {stats.last20.B}</span>
                      <span className={pillClass("T" as any)}>T {stats.last20.T}</span>
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="md:col-span-3">
                <CardHeader>
                  <CardTitle>Distribuição de streaks (R e B)</CardTitle>
                  <CardDescription>Quantas vezes apareceram streaks de 1, 2, 3…</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="bucket" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="Red" />
                        <Bar dataKey="Blue" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="md:col-span-3">
                <CardHeader>
                  <CardTitle>Leituras/Heurísticas</CardTitle>
                  <CardDescription>Regras simples baseadas no histórico recente (apenas informativas).</CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-4 gap-3">
                  {signals.map((s) => (
                    <div key={s.id} className={`p-3 rounded-2xl border ${s.on ? "border-emerald-400 bg-emerald-50" : "border-zinc-200"}`}>
                      <div className="font-medium mb-1">{s.title}</div>
                      <div className="text-xs text-zinc-600">{s.desc}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="historico">
            <Card>
              <CardHeader>
                <CardTitle>Histórico detalhado</CardTitle>
                <CardDescription>Clique para remover um item específico.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {history.map((r, idx) => (
                    <button key={r.id} onClick={() => setHistory((h) => h.filter((x) => x.id !== r.id))} className="flex items-center gap-2 px-2 py-1 rounded-xl border hover:bg-zinc-50">
                      <span className={dotClass(r.v)} />
                      <span className="text-xs text-zinc-600">#{idx + 1}</span>
                      <span className="text-xs font-medium">{colorLabel(r.v)}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dados">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Importar / Exportar</CardTitle>
                  <CardDescription>Faça backup ou mova para outro dispositivo.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={exportJson} className="rounded-2xl"><Download className="w-4 h-4 mr-2"/>Exportar JSON</Button>
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl border cursor-pointer">
                      <Upload className="w-4 h-4"/>
                      <span className="text-sm">Importar JSON</span>
                      <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files && importJson(e.target.files[0])} />
                    </label>
                  </div>
                  <p className="text-xs text-zinc-600">Formato aceito: lista de objetos [{"{ v: \"R|B|T\" }"}] ou {"{ results: [\"R\",\"B\",...] }" }.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Integração por URL (pull)</CardTitle>
                  <CardDescription>Opcional: buscar periodicamente resultados em JSON.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="grid gap-2">
                    <label className="text-sm text-zinc-600">URL</label>
                    <Input value={pollUrl} onChange={(e) => setPollUrl(e.target.value)} placeholder="https://suaapi.exemplo/results.json" />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm text-zinc-600">Intervalo (segundos, 0 = desligado)</label>
                    <Input type="number" min={0} value={pollSec} onChange={(e) => setPollSec(parseInt(e.target.value || "0"))} />
                  </div>
                  <Button onClick={() => { /* apenas feedback visual */}} className="rounded-2xl"><RefreshCw className="w-4 h-4 mr-2"/>Aplicar</Button>
                  <p className="text-xs text-zinc-600">A URL deve retornar {"{ results: ["}R{" , "}B{" , "}T{" ] }"}. Evite scraping de sites que proíbem.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
