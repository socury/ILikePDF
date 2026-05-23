"use client";

import { Type, Image as ImageIcon, Eraser, Trash2, Undo2, Redo2, Download, ZoomIn, ZoomOut, X } from "lucide-react";
import { useEditor } from "@/lib/store";

type Props = {
  onExport: () => void;
  onClose: () => void;
};

export default function Toolbar({ onExport, onClose }: Props) {
  const { undo, redo, scale, setScale } = useEditor();

  const api = () => (window as any).__overlayApi;

  const onImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => api()?.addImage(reader.result as string);
      reader.readAsDataURL(f);
    };
    input.click();
  };

  return (
    <div className="h-14 flex items-center gap-2 px-4 border-b border-gray-200 bg-white">
      <button onClick={onClose} className="btn-ghost" title="새 파일">
        <X size={18} />
      </button>
      <div className="w-px h-6 bg-gray-200 mx-1" />
      <button className="btn" onClick={() => api()?.addText()}>
        <Type size={16} /> 텍스트
      </button>
      <button className="btn" onClick={onImage}>
        <ImageIcon size={16} /> 이미지
      </button>
      <button className="btn" onClick={() => api()?.addWhiteout()}>
        <Eraser size={16} /> 가리기
      </button>
      <button className="btn-ghost" onClick={() => api()?.deleteSelected()} title="선택 삭제">
        <Trash2 size={16} />
      </button>
      <div className="w-px h-6 bg-gray-200 mx-1" />
      <button className="btn-ghost" onClick={undo} title="실행 취소">
        <Undo2 size={16} />
      </button>
      <button className="btn-ghost" onClick={redo} title="다시 실행">
        <Redo2 size={16} />
      </button>
      <div className="w-px h-6 bg-gray-200 mx-1" />
      <button className="btn-ghost" onClick={() => setScale(Math.max(0.5, scale - 0.25))}>
        <ZoomOut size={16} />
      </button>
      <span className="text-sm tabular-nums w-12 text-center">{Math.round(scale * 100)}%</span>
      <button className="btn-ghost" onClick={() => setScale(Math.min(3, scale + 0.25))}>
        <ZoomIn size={16} />
      </button>

      <div className="flex-1" />
      <button onClick={onExport} className="btn-primary">
        <Download size={16} /> 다운로드
      </button>
      <style jsx>{`
        .btn,
        .btn-ghost,
        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
        }
        .btn {
          background: #f3f4f6;
          color: #111827;
        }
        .btn:hover {
          background: #e5e7eb;
        }
        .btn-ghost {
          color: #4b5563;
        }
        .btn-ghost:hover {
          background: #f3f4f6;
        }
        .btn-primary {
          background: #3b6cff;
          color: white;
        }
        .btn-primary:hover {
          background: #2c52d6;
        }
      `}</style>
    </div>
  );
}
