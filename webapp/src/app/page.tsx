"use client";

import { useMemo, useState } from "react";

type FieldType =
  | "rich_text"
  | "select"
  | "multi_select"
  | "user"
  | "date"
  | "number"
  | "boolean";

type Field = {
  id: string;
  key: string;
  name: string;
  type: FieldType;
  config?: {
    options?: { id: string; label: string; color: string }[];
  };
};

type RecordValues = {
  title: string;
  status: "todo" | "in_progress" | "review" | "done";
  priority: "low" | "medium" | "high" | "critical";
  assignee: string;
  due_date: string;
  start_date: string;
  effort: number;
  tags: string[];
};

type ProjectRecord = {
  id: string;
  parentId: string | null;
  order: number;
  depth: number;
  values: RecordValues;
  comments: number;
  updatedAt: string;
};

type ViewType = "list" | "board" | "table" | "calendar" | "mind_map" | "gantt" | "org_chart";

const fields: Field[] = [
  { id: "field_title", key: "title", name: "Title", type: "rich_text" },
  {
    id: "field_status",
    key: "status",
    name: "Status",
    type: "select",
    config: {
      options: [
        { id: "todo", label: "To Do", color: "bg-slate-200 text-slate-800" },
        { id: "in_progress", label: "In Progress", color: "bg-blue-100 text-blue-800" },
        { id: "review", label: "Review", color: "bg-amber-100 text-amber-800" },
        { id: "done", label: "Done", color: "bg-emerald-100 text-emerald-800" },
      ],
    },
  },
  {
    id: "field_priority",
    key: "priority",
    name: "Priority",
    type: "select",
    config: {
      options: [
        { id: "low", label: "Low", color: "bg-stone-100 text-stone-700" },
        { id: "medium", label: "Medium", color: "bg-sky-100 text-sky-800" },
        { id: "high", label: "High", color: "bg-orange-100 text-orange-800" },
        { id: "critical", label: "Critical", color: "bg-rose-100 text-rose-800" },
      ],
    },
  },
  { id: "field_assignee", key: "assignee", name: "Assignee", type: "user" },
  { id: "field_due", key: "due_date", name: "Due Date", type: "date" },
  { id: "field_start", key: "start_date", name: "Start", type: "date" },
  { id: "field_effort", key: "effort", name: "Effort", type: "number" },
  { id: "field_tags", key: "tags", name: "Tags", type: "multi_select" },
];

const initialRecords: ProjectRecord[] = [
  {
    id: "rec-01",
    parentId: null,
    order: 1,
    depth: 0,
    values: {
      title: "Define canonical project schema",
      status: "done",
      priority: "critical",
      assignee: "Mara",
      due_date: "2026-05-22",
      start_date: "2026-05-18",
      effort: 8,
      tags: ["schema", "core"],
    },
    comments: 4,
    updatedAt: "10:42",
  },
  {
    id: "rec-02",
    parentId: "rec-01",
    order: 2,
    depth: 1,
    values: {
      title: "Normalize record values and typed fields",
      status: "review",
      priority: "high",
      assignee: "Jules",
      due_date: "2026-05-23",
      start_date: "2026-05-19",
      effort: 5,
      tags: ["fields"],
    },
    comments: 2,
    updatedAt: "11:05",
  },
  {
    id: "rec-03",
    parentId: null,
    order: 3,
    depth: 0,
    values: {
      title: "Build list, board, table, calendar renderers",
      status: "in_progress",
      priority: "critical",
      assignee: "Sol",
      due_date: "2026-05-28",
      start_date: "2026-05-20",
      effort: 13,
      tags: ["views", "frontend"],
    },
    comments: 7,
    updatedAt: "12:18",
  },
  {
    id: "rec-04",
    parentId: "rec-03",
    order: 4,
    depth: 1,
    values: {
      title: "Map board columns to Status field options",
      status: "in_progress",
      priority: "medium",
      assignee: "Sol",
      due_date: "2026-05-25",
      start_date: "2026-05-21",
      effort: 3,
      tags: ["kanban"],
    },
    comments: 1,
    updatedAt: "12:44",
  },
  {
    id: "rec-05",
    parentId: null,
    order: 5,
    depth: 0,
    values: {
      title: "Wire optimistic sync against VPS API contract",
      status: "todo",
      priority: "high",
      assignee: "Niko",
      due_date: "2026-06-01",
      start_date: "2026-05-24",
      effort: 8,
      tags: ["realtime", "api"],
    },
    comments: 3,
    updatedAt: "13:02",
  },
  {
    id: "rec-06",
    parentId: null,
    order: 6,
    depth: 0,
    values: {
      title: "Add permission matrix and project invites",
      status: "todo",
      priority: "medium",
      assignee: "Iris",
      due_date: "2026-06-04",
      start_date: "2026-05-26",
      effort: 5,
      tags: ["access"],
    },
    comments: 0,
    updatedAt: "13:21",
  },
];

const views: { id: ViewType; label: string; field: string }[] = [
  { id: "list", label: "List", field: "Hierarchy" },
  { id: "board", label: "Board", field: "Status" },
  { id: "table", label: "Table", field: "Fields" },
  { id: "calendar", label: "Calendar", field: "Due Date" },
  { id: "gantt", label: "Gantt", field: "Start + Due" },
  { id: "mind_map", label: "Mind Map", field: "Parent" },
  { id: "org_chart", label: "Org Chart", field: "Owner" },
];

const statusOptions = fields.find((field) => field.key === "status")?.config?.options ?? [];
const priorityOptions = fields.find((field) => field.key === "priority")?.config?.options ?? [];

function optionClass(options: { id: string; color: string }[], value: string) {
  return options.find((option) => option.id === value)?.color ?? "bg-slate-100 text-slate-700";
}

function optionLabel(options: { id: string; label: string }[], value: string) {
  return options.find((option) => option.id === value)?.label ?? value;
}

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex min-h-7 items-center rounded px-2 text-xs font-medium ${className}`}>{children}</span>;
}

function RecordLine({ record, compact = false }: { record: ProjectRecord; compact?: boolean }) {
  return (
    <div className="grid min-w-[720px] grid-cols-[minmax(280px,1fr)_120px_96px_96px_90px] items-center gap-3 border-b border-slate-200 px-4 py-3 text-sm last:border-b-0">
      <div className="flex items-center gap-3" style={{ paddingLeft: `${record.depth * 22}px` }}>
        <span className="grid size-6 shrink-0 place-items-center rounded border border-slate-300 bg-white text-xs text-slate-500">
          {record.depth ? "-" : "+"}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-950">{record.values.title}</p>
          {!compact && <p className="text-xs text-slate-500">Updated {record.updatedAt} · {record.comments} comments</p>}
        </div>
      </div>
      <Pill className={optionClass(statusOptions, record.values.status)}>{optionLabel(statusOptions, record.values.status)}</Pill>
      <Pill className={optionClass(priorityOptions, record.values.priority)}>{optionLabel(priorityOptions, record.values.priority)}</Pill>
      <span className="text-slate-700">{record.values.assignee}</span>
      <span className="font-mono text-xs text-slate-600">{record.values.due_date.slice(5)}</span>
    </div>
  );
}

export default function Home() {
  const [activeView, setActiveView] = useState<ViewType>("board");
  const [records, setRecords] = useState<ProjectRecord[]>(initialRecords);

  const groupedRecords = useMemo(() => {
    return statusOptions.map((status) => ({
      ...status,
      records: records.filter((record) => record.values.status === status.id),
    }));
  }, [records]);

  function advanceRecord(recordId: string) {
    const sequence: RecordValues["status"][] = ["todo", "in_progress", "review", "done"];
    setRecords((current) =>
      current.map((record) => {
        if (record.id !== recordId) return record;
        const currentIndex = sequence.indexOf(record.values.status);
        const nextStatus = sequence[(currentIndex + 1) % sequence.length];
        return {
          ...record,
          values: { ...record.values, status: nextStatus },
          updatedAt: "now",
        };
      }),
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f7f4] text-slate-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[264px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-[#20201d] text-white lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-white/45">Workspace</p>
              <h1 className="text-lg font-semibold">omniAEON</h1>
            </div>
            <button className="rounded border border-white/15 px-2 py-1 text-sm text-white/80">New</button>
          </div>
          <nav className="space-y-1 px-3 py-4 text-sm">
            {["Product Roadmap", "Agent Memory Layer", "VPS API Build", "Design System"].map((project, index) => (
              <button
                key={project}
                className={`flex w-full items-center justify-between rounded px-3 py-2 text-left ${index === 0 ? "bg-white text-slate-950" : "text-white/75 hover:bg-white/10"}`}
              >
                <span>{project}</span>
                <span className="text-xs opacity-60">{index === 0 ? "live" : ""}</span>
              </button>
            ))}
          </nav>
          <div className="mx-3 mb-4 border-t border-white/10 pt-4 text-xs text-white/55">
            <p>Frontend: Vercel Next.js</p>
            <p>Backend target: owned VPS API</p>
            <p>Realtime: WebSocket rooms</p>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="border-b border-slate-200 bg-white px-5 py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Project</p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-semibold tracking-tight">Product Roadmap</h2>
                  <Pill className="bg-emerald-100 text-emerald-800">Synced</Pill>
                  <Pill className="bg-slate-100 text-slate-700">6 records</Pill>
                  <Pill className="bg-slate-100 text-slate-700">8 fields</Pill>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">Invite</button>
                <button className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">Automate</button>
                <button className="rounded bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">Add record</button>
              </div>
            </div>
          </header>

          <div className="border-b border-slate-200 bg-white px-5">
            <div className="flex gap-1 overflow-x-auto py-2">
              {views.map((view) => (
                <button
                  key={view.id}
                  onClick={() => setActiveView(view.id)}
                  className={`shrink-0 rounded px-3 py-2 text-sm font-medium ${activeView === view.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  {view.label}
                  <span className="ml-2 text-xs opacity-60">{view.field}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 overflow-auto p-4">
              {activeView === "list" && (
                <div className="overflow-hidden rounded border border-slate-200 bg-white">
                  {records.map((record) => <RecordLine key={record.id} record={record} />)}
                </div>
              )}

              {activeView === "board" && (
                <div className="grid min-w-[980px] grid-cols-4 gap-3">
                  {groupedRecords.map((column) => (
                    <section key={column.id} className="rounded border border-slate-200 bg-white">
                      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3">
                        <Pill className={column.color}>{column.label}</Pill>
                        <span className="text-xs text-slate-500">{column.records.length}</span>
                      </div>
                      <div className="space-y-2 p-3">
                        {column.records.map((record) => (
                          <button
                            key={record.id}
                            onClick={() => advanceRecord(record.id)}
                            className="block w-full rounded border border-slate-200 bg-[#fbfbf9] p-3 text-left shadow-sm transition hover:border-slate-400"
                          >
                            <p className="text-sm font-semibold leading-5 text-slate-950">{record.values.title}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Pill className={optionClass(priorityOptions, record.values.priority)}>
                                {optionLabel(priorityOptions, record.values.priority)}
                              </Pill>
                              <Pill className="bg-white text-slate-700">{record.values.assignee}</Pill>
                              <Pill className="bg-white text-slate-700">{record.values.due_date.slice(5)}</Pill>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}

              {activeView === "table" && (
                <div className="overflow-hidden rounded border border-slate-200 bg-white">
                  <div className="grid min-w-[900px] grid-cols-[minmax(260px,1fr)_130px_120px_120px_110px_90px] border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span>Title</span><span>Status</span><span>Priority</span><span>Assignee</span><span>Due</span><span>Effort</span>
                  </div>
                  {records.map((record) => (
                    <div key={record.id} className="grid min-w-[900px] grid-cols-[minmax(260px,1fr)_130px_120px_120px_110px_90px] items-center border-b border-slate-200 px-4 py-3 text-sm last:border-b-0">
                      <span className="font-medium">{record.values.title}</span>
                      <Pill className={optionClass(statusOptions, record.values.status)}>{optionLabel(statusOptions, record.values.status)}</Pill>
                      <Pill className={optionClass(priorityOptions, record.values.priority)}>{optionLabel(priorityOptions, record.values.priority)}</Pill>
                      <span>{record.values.assignee}</span>
                      <span className="font-mono text-xs">{record.values.due_date}</span>
                      <span>{record.values.effort} pts</span>
                    </div>
                  ))}
                </div>
              )}

              {activeView === "calendar" && (
                <div className="grid min-w-[860px] grid-cols-7 gap-px overflow-hidden rounded border border-slate-200 bg-slate-200">
                  {Array.from({ length: 35 }, (_, index) => {
                    const day = index + 1;
                    const dayRecords = records.filter((record) => Number(record.values.due_date.slice(-2)) === day);
                    return (
                      <div key={day} className="min-h-32 bg-white p-2">
                        <p className="text-xs font-semibold text-slate-500">May {day}</p>
                        <div className="mt-2 space-y-1">
                          {dayRecords.map((record) => (
                            <div key={record.id} className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-900">
                              {record.values.title}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeView === "gantt" && (
                <div className="rounded border border-slate-200 bg-white p-4">
                  <div className="grid min-w-[900px] gap-3">
                    {records.map((record, index) => {
                      const width = Math.max(16, record.values.effort * 5);
                      return (
                        <div key={record.id} className="grid grid-cols-[240px_minmax(0,1fr)] items-center gap-4 text-sm">
                          <span className="truncate font-medium">{record.values.title}</span>
                          <div className="h-8 rounded bg-slate-100">
                            <div className="h-8 rounded bg-emerald-500" style={{ marginLeft: `${index * 7}%`, width: `${width}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeView === "mind_map" && (
                <div className="min-h-[560px] rounded border border-slate-200 bg-white p-6">
                  <div className="flex min-w-[860px] items-center gap-6">
                    <div className="rounded border-2 border-slate-950 bg-white px-5 py-4 font-semibold">Product Roadmap</div>
                    <div className="grid gap-4">
                      {records.filter((record) => !record.parentId).map((record) => (
                        <div key={record.id} className="flex items-center gap-4">
                          <div className="h-px w-10 bg-slate-300" />
                          <div className="rounded border border-slate-300 bg-[#fbfbf9] px-4 py-3 text-sm font-medium">{record.values.title}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeView === "org_chart" && (
                <div className="min-h-[560px] rounded border border-slate-200 bg-white p-6">
                  <div className="mx-auto w-fit rounded border-2 border-slate-950 px-5 py-3 text-center font-semibold">Workspace Owner</div>
                  <div className="mx-auto my-5 h-10 w-px bg-slate-300" />
                  <div className="grid min-w-[860px] grid-cols-4 gap-4">
                    {["Mara", "Sol", "Niko", "Iris"].map((person) => (
                      <div key={person} className="rounded border border-slate-300 bg-[#fbfbf9] p-4 text-center">
                        <p className="font-semibold">{person}</p>
                        <p className="mt-1 text-xs text-slate-500">{records.filter((record) => record.values.assignee === person).length} records</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <aside className="border-t border-slate-200 bg-white p-4 xl:border-l xl:border-t-0">
              <section className="rounded border border-slate-200">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h3 className="font-semibold">Project schema</h3>
                </div>
                <div className="divide-y divide-slate-200">
                  {fields.map((field) => (
                    <div key={field.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <span className="font-medium">{field.name}</span>
                      <span className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">{field.type}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-4 rounded border border-slate-200">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h3 className="font-semibold">Realtime channel</h3>
                </div>
                <div className="space-y-3 p-4 text-sm">
                  {[
                    "project:roadmap joined by Mara",
                    "record_updated rec-03 status=in_progress",
                    "comment_added rec-01 by Jules",
                    "presence_update Sol focused rec-04",
                  ].map((event) => (
                    <div key={event} className="rounded bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">{event}</div>
                  ))}
                </div>
              </section>

              <section className="mt-4 rounded border border-slate-200">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h3 className="font-semibold">Access</h3>
                </div>
                <div className="grid grid-cols-2 gap-2 p-4 text-sm">
                  {["Owner", "Admin", "Editor", "Commenter", "Viewer", "Agent token"].map((role) => (
                    <span key={role} className="rounded border border-slate-200 px-3 py-2 text-center">{role}</span>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
