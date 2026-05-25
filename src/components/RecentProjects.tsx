"use client";

import { FileText, Trash2, Clock } from "lucide-react";
import type { ProjectSummary } from "@/lib/storage";

type Props = {
  projects: ProjectSummary[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
};

export default function RecentProjects({ projects, onOpen, onDelete }: Props) {
  if (!projects.length) return null;

  return (
    <section className="mt-14 w-full max-w-3xl mx-auto">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        최근 작업
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {projects.map((p) => (
          <div
            key={p.id}
            className="group relative bg-white rounded-xl border border-gray-200 hover:border-brand-500 hover:shadow-md transition cursor-pointer p-4 text-left"
            onClick={() => onOpen(p.id)}
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
                <FileText size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-900 truncate" title={p.name}>
                  {p.name}
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                  <Clock size={12} />
                  <span>{formatRelative(p.updatedAt)}</span>
                  {p.numPages > 0 && <span>· {p.numPages} 페이지</span>}
                </div>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`"${p.name}"을(를) 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) {
                  onDelete(p.id);
                }
              }}
              className="absolute top-2 right-2 p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition"
              title="삭제"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-400 text-center">
        브라우저에 안전하게 저장됩니다. 서버로 전송되지 않으며, 같은 브라우저 프로필에서만 보입니다.
      </p>
    </section>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "방금 전";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(ts).toLocaleDateString("ko-KR");
}
