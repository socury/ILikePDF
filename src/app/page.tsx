"use client";

import { useEffect, useState } from "react";
import { Upload, ShieldCheck, Zap, FileText } from "lucide-react";
import Editor from "@/components/Editor";
import RecentProjects from "@/components/RecentProjects";
import {
  deleteProject,
  listProjects,
  loadProject,
  saveProject,
  type ProjectSummary,
} from "@/lib/storage";
import type { EditOp } from "@/lib/types";

type EditingState = {
  pdfBytes: ArrayBuffer;
  fileName: string;
  projectId: string;
  initialOps: EditOp[];
  initialPageOrder: number[];
};

export default function Home() {
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  const refresh = async () => {
    try {
      setProjects(await listProjects());
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[home] listProjects failed", err);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const startNewProject = async (file: File) => {
    const bytes = await file.arrayBuffer();
    const id = crypto.randomUUID();
    // Persist the PDF blob and project metadata up front so it shows in "recent"
    // immediately and survives an accidental refresh before the first autosave.
    await saveProject({
      id,
      name: file.name,
      originalFileName: file.name,
      createdAt: Date.now(),
      pdfBlob: file,
      ops: [],
      pageOrder: [],
      numPages: 0,
    });
    setEditing({
      pdfBytes: bytes,
      fileName: file.name,
      projectId: id,
      initialOps: [],
      initialPageOrder: [],
    });
  };

  const resumeProject = async (id: string) => {
    const proj = await loadProject(id);
    if (!proj) {
      alert("프로젝트를 찾을 수 없습니다.");
      refresh();
      return;
    }
    const bytes = await proj.pdfBlob.arrayBuffer();
    setEditing({
      pdfBytes: bytes,
      fileName: proj.name,
      projectId: proj.id,
      initialOps: proj.ops ?? [],
      initialPageOrder: proj.pageOrder ?? [],
    });
  };

  const onDeleteProject = async (id: string) => {
    await deleteProject(id);
    refresh();
  };

  if (editing) {
    return (
      <Editor
        pdfBytes={editing.pdfBytes}
        fileName={editing.fileName}
        projectId={editing.projectId}
        initialOps={editing.initialOps}
        initialPageOrder={editing.initialPageOrder}
        onClose={() => {
          setEditing(null);
          refresh();
        }}
      />
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-16">
      <div className="max-w-2xl w-full text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-sm font-medium mb-6">
          <ShieldCheck size={16} /> 파일이 서버로 전송되지 않습니다
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900">
          브라우저에서 바로 편집하는 PDF
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          텍스트·이미지 추가, 가리기, 페이지 정리. 100% 클라이언트 처리.
        </p>

        <label className="mt-10 block cursor-pointer">
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) startNewProject(f);
            }}
          />
          <div className="border-2 border-dashed border-gray-300 hover:border-brand-500 hover:bg-white transition rounded-2xl p-12 flex flex-col items-center gap-3">
            <Upload className="text-brand-500" size={40} />
            <div className="text-lg font-medium text-gray-800">PDF 파일을 선택하거나 끌어다 놓으세요</div>
            <div className="text-sm text-gray-500">최대 권장 50MB · PDF만 지원</div>
          </div>
        </label>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
          <Feature icon={<ShieldCheck />} title="프라이버시" desc="파일은 브라우저 메모리에서만 처리됩니다." />
          <Feature icon={<Zap />} title="자동 저장" desc="편집 내용이 브라우저에 자동 저장됩니다." />
          <Feature icon={<FileText />} title="한글 지원" desc="NanumGothic 임베드, 한글 워크플로우." />
        </div>
      </div>

      <RecentProjects projects={projects} onOpen={resumeProject} onDelete={onDeleteProject} />
    </main>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100">
      <div className="text-brand-500 mb-2">{icon}</div>
      <div className="font-semibold text-gray-900">{title}</div>
      <div className="text-sm text-gray-600 mt-1">{desc}</div>
    </div>
  );
}
