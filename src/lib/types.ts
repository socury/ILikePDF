export type EditOp =
  | {
      id: string;
      type: "text";
      pageIndex: number;
      x: number; // PDF points, origin = top-left of page (we convert later)
      y: number;
      width: number;
      height: number;
      text: string;
      fontSize: number;
      color: string; // hex
    }
  | {
      id: string;
      type: "image";
      pageIndex: number;
      x: number;
      y: number;
      width: number;
      height: number;
      dataUrl: string; // PNG/JPEG data URL
    }
  | {
      id: string;
      type: "whiteout";
      pageIndex: number;
      x: number;
      y: number;
      width: number;
      height: number;
      color: string; // usually #ffffff
    };

export type EditorState = {
  ops: EditOp[];
  selectedId: string | null;
  currentPage: number;
  numPages: number;
  scale: number;
};
