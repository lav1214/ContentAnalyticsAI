import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Save, FolderOpen, Trash2, Clock, X } from "lucide-react";
import { toast } from "sonner";

interface SavedDraft {
  id: string;
  title: string;
  format: string;
  content: string;
  image_url: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface SavedDraftsPanelProps {
  currentContent: string;
  currentFormat: string;
  currentImage?: string | null;
  onLoadDraft: (content: string, format: string, imageUrl?: string | null) => void;
  onClose: () => void;
}

export function SavedDraftsPanel({ currentContent, currentFormat, currentImage, onLoadDraft, onClose }: SavedDraftsPanelProps) {
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveTitle, setSaveTitle] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("saved_drafts")
      .select("*")
      .order("updated_at", { ascending: false });
    if (!error && data) setDrafts(data as SavedDraft[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchDrafts(); }, [fetchDrafts]);

  const handleSave = async () => {
    if (!currentContent.trim()) {
      toast.error("Nothing to save — draft is empty");
      return;
    }
    const title = saveTitle.trim() || `Draft — ${new Date().toLocaleDateString()}`;
    const { error } = await supabase.from("saved_drafts").insert({
      title,
      format: currentFormat,
      content: currentContent,
      image_url: currentImage || null,
    });
    if (error) {
      toast.error("Failed to save draft");
    } else {
      toast.success("Draft saved!");
      setSaveTitle("");
      setShowSaveForm(false);
      fetchDrafts();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("saved_drafts").delete().eq("id", id);
    if (!error) {
      toast.success("Draft deleted");
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    }
  };

  const formatLabels: Record<string, string> = {
    linkedinLong: "Long-Form",
    linkedinShort: "Short-Form",
    sponsoredAds: "Ads",
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FolderOpen className="w-4 h-4" /> Saved Drafts
        </h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Save current */}
      <div className="px-4 py-3 border-b border-border">
        {showSaveForm ? (
          <div className="space-y-2">
            <input
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              placeholder="Draft title (optional)"
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="flex-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setShowSaveForm(false)}
                className="px-3 py-1.5 rounded-md bg-muted text-muted-foreground text-xs hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowSaveForm(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors border border-primary/20"
          >
            <Save className="w-3.5 h-3.5" /> Save Current Draft
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="p-4 text-center text-xs text-muted-foreground">Loading…</div>
        ) : drafts.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No saved drafts yet
          </div>
        ) : (
          <div className="divide-y divide-border">
            {drafts.map((draft) => (
              <div key={draft.id} className="px-4 py-3 hover:bg-muted/30 transition-colors group">
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => onLoadDraft(draft.content, draft.format, draft.image_url)}
                    className="text-left flex-1 min-w-0"
                  >
                    <p className="text-sm font-medium text-foreground truncate">{draft.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {formatLabels[draft.format] || draft.format}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(draft.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {draft.content.slice(0, 120)}…
                    </p>
                  </button>
                  <button
                    onClick={() => handleDelete(draft.id)}
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
